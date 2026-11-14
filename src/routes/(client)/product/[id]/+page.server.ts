import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate, fail, message, setError } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createLocalDynamicSchema, createCartSchema } from './schema';
import { buildSelectedOptions, totalWithOptions, optionLines, REMISE_EMAIL } from '$lib/cart/options';
import { ErrorLogger } from '$lib/services/error-logging';

export const load: PageServerLoad = async ({ params, locals, url, parent }) => {
	try {
		const { id } = params;
		const { shopId } = await parent();
		if (!shopId) throw error(404, 'Boutique non trouvée');

		const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		if (!uuidRegex.test(id)) {
			throw error(404, 'Produit non trouvé');
		}

		const { data: shopRow } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('slug')
			.eq('id', shopId)
			.single();
		if (!shopRow?.slug) throw error(404, 'Boutique non trouvée');

		const { data: productData, error: dbError } = await (locals.supabaseServiceRole as any).rpc(
			'get_order_data',
			{ p_slug: shopRow.slug, p_product_id: id }
		);

		if (dbError || !productData) {
			throw error(productData ? 500 : 404, productData ? 'Erreur serveur' : 'Boutique non trouvée');
		}

		const { shop, product, customForm, customFields, availabilities, unavailabilities, datesWithLimitReached } =
			productData;

		let productImages: Array<{ image_url: string; display_order: number }> = [];
		if (product?.id) {
			const { data: images, error: imagesError } = await locals.supabase
				.from('product_images')
				.select('image_url, display_order')
				.eq('product_id', product.id)
				.order('display_order', { ascending: true });
			if (!imagesError && images) productImages = images;
			else if (product.image_url) productImages = [{ image_url: product.image_url, display_order: 0 }];
		}

		if (!shop || !product) throw error(404, !shop ? 'Boutique non trouvée' : 'Produit non trouvé');
		if (!shop.is_visible && !url.searchParams.get('preview')) throw error(404, 'Boutique non trouvée');

		// Plages déjà réservées pour ce produit (réservations actives avec pickup_date_end)
		let reservedRanges: Array<{ start_date: string; end_date: string }> = [];
		const { data: reservedOrders } = await (locals.supabaseServiceRole as any)
			.from('orders')
			.select('pickup_date, pickup_date_end')
			.eq('product_id', product.id)
			.not('pickup_date_end', 'is', null)
			.in('status', ['pending', 'quoted', 'confirmed', 'to_verify']);
		if (reservedOrders?.length) {
			reservedRanges = reservedOrders.map((row: { pickup_date: string; pickup_date_end: string }) => {
				const start = row.pickup_date;
				const end = row.pickup_date_end;
				return {
					start_date: typeof start === 'string' ? start.slice(0, 10) : (start as any)?.toISOString?.()?.slice(0, 10) ?? '',
					end_date: typeof end === 'string' ? end.slice(0, 10) : (end as any)?.toISOString?.()?.slice(0, 10) ?? ''
				};
			}).filter((r: { start_date: string; end_date: string }) => r.start_date && r.end_date);
		}

		// Option « mode de remise + QR code » (colonne ajoutée séparément : ignorée si absente)
		let showDeliveryOptions = false;
		{
			const { data: opt, error: optError } = await (locals.supabaseServiceRole as any)
				.from('products')
				.select('show_delivery_options')
				.eq('id', product.id)
				.single();
			if (!optError && opt) showDeliveryOptions = !!opt.show_delivery_options;
		}

		const dynamicSchema = createLocalDynamicSchema(customFields || []);
		return {
			shop,
			product: { ...product, images: productImages, show_delivery_options: showDeliveryOptions },
			productImages,
			customForm,
			customFields: customFields || [],
			availabilities: availabilities || [],
			unavailabilities: unavailabilities || [],
			datesWithLimitReached: datesWithLimitReached || [],
			reservedRanges,
			orderLimitStats: null,
			form: await superValidate(zod(dynamicSchema)),
			cartForm: await superValidate(zod(createCartSchema(customFields || [])), { id: 'cart' })
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur inattendue lors du chargement du produit');
	}
};

export const actions: Actions = {
	// Panier : enregistre l'article tel que le client l'a personnalisé (prix calculé ici)
	addToCart: async ({ request, params, locals }) => {
		const formData = await request.formData();
		const shopId = formData.get('shopId') as string;
		const productId = params.id;
		const uuid = /^[0-9a-f-]{36}$/i;
		if (!shopId || !uuid.test(shopId) || !uuid.test(productId)) {
			const form = await superValidate(formData, zod(createCartSchema([])), { id: 'cart' });
			return fail(400, { form, error: 'Données manquantes' });
		}

		const { data: product } = await (locals.supabaseServiceRole as any)
			.from('products')
			.select('id, name, base_price, image_url, form_id, booking_type, min_days_notice, show_delivery_options, parcel_size, shop_id')
			.eq('id', productId)
			.eq('shop_id', shopId)
			.eq('is_active', true)
			.maybeSingle();
		if (!product || product.booking_type === 'reservation') {
			const form = await superValidate(formData, zod(createCartSchema([])), { id: 'cart' });
			return fail(400, { form, error: 'Cet article ne peut pas être ajouté au panier.' });
		}

		let customFields: any[] = [];
		if (product.form_id) {
			const { data: formFields } = await (locals.supabaseServiceRole as any)
				.from('form_fields')
				.select('*')
				.eq('form_id', product.form_id)
				.order('order');
			customFields = formFields || [];
		}

		const form = await superValidate(formData, zod(createCartSchema(customFields)), { id: 'cart' });
		if (!form.valid) return fail(400, { form });

		const showDeliveryOptions = !!product.show_delivery_options; // = afficher « Votre QR code »
		// Article « Fichier par e-mail » : rien à expédier
		const mode: 'print' | 'email' = product.parcel_size === 'email' ? 'email' : 'print';
		const qrCodeUrl = showDeliveryOptions ? form.data.qr_code_url || '' : '';

		const selectedOptions = buildSelectedOptions(customFields, form.data.customization_data);
		const total = totalWithOptions(product.base_price || 0, selectedOptions);
		if (mode === 'email') {
			selectedOptions['Mode de remise'] = { value: REMISE_EMAIL, type: 'short-text', price: 0, fieldId: 'delivery_mode', fieldType: 'short-text' };
		}

		const { data: ref, error: refError } = await (locals.supabaseServiceRole as any).rpc('generate_order_ref');
		if (refError || !ref) return fail(500, { form, error: 'Erreur, merci de réessayer.' });

		const lineData = {
			kind: 'cart_item',
			shop_id: shopId,
			product_id: product.id,
			product_name: product.name,
			product_base_price: product.base_price || 0,
			image_url: product.image_url || null,
			customization_data: selectedOptions,
			total_amount: total,
			delivery_mode: mode,
			min_days_notice: product.min_days_notice || 0,
			inspiration_photos: qrCodeUrl ? [qrCodeUrl] : [],
		};
		const { error: insertError } = await (locals.supabaseServiceRole as any)
			.from('pending_orders')
			.insert({ order_ref: ref, order_data: lineData });
		if (insertError) return fail(500, { form, error: 'Erreur, merci de réessayer.' });

		const lines = optionLines(selectedOptions);
		if (qrCodeUrl) lines.push('QR code ajouté ✓');
		return message(form, {
			cartItem: {
				ref,
				productId: product.id,
				name: product.name,
				image: product.image_url || null,
				price: total,
				mode,
				lines,
				minDaysNotice: product.min_days_notice || 0,
				addedAt: Date.now(),
			},
		});
	},

	createProductOrder: async ({ request, params, locals }) => {
		const rateLimitExceeded = request.headers.get('x-rate-limit-exceeded');
		if (rateLimitExceeded === 'true') {
			const rateLimitMessage =
				request.headers.get('x-rate-limit-message') || 'Trop de tentatives. Veuillez patienter.';
			const tempSchema = createLocalDynamicSchema([]);
			const form = await superValidate(request, zod(tempSchema));
			setError(form, '', rateLimitMessage);
			return { form };
		}

		try {
			const { id } = params;
			if (!id) throw error(400, 'Paramètre produit manquant');

			const formData = await request.formData();
			const shopId = formData.get('shopId') as string;
			const productId = (formData.get('productId') as string) || id;
			if (!shopId || !productId) throw error(400, 'Données manquantes');

			const { data: shop, error: shopError } = await (locals.supabaseServiceRole as any)
				.from('shops')
				.select('id, name, profile_id')
				.eq('id', shopId)
				.eq('is_active', true)
				.single();

			if (shopError || !shop) throw error(404, 'Boutique non trouvée');

			const { data: product, error: productError } = await (locals.supabaseServiceRole as any)
				.from('products')
				.select('id, name, description, base_price, form_id, booking_type, min_days_notice, min_reservation_days')
				.eq('id', productId)
				.eq('shop_id', shop.id)
				.eq('is_active', true)
				.single();

			if (productError || !product) throw error(404, 'Produit non trouvé');

			const bookingType = product.booking_type || 'pickup';

			let showDeliveryOptions = false;
			{
				const { data: opt, error: optError } = await (locals.supabaseServiceRole as any)
					.from('products')
					.select('show_delivery_options')
					.eq('id', product.id)
					.single();
				if (!optError && opt) showDeliveryOptions = !!opt.show_delivery_options && bookingType !== 'reservation';
			}

			let customFields: any[] = [];
			if (product.form_id) {
				const { data: formFields } = await (locals.supabaseServiceRole as any)
					.from('form_fields')
					.select('*')
					.eq('form_id', product.form_id)
					.order('order');
				customFields = formFields || [];
			}

			const dynamicSchema = createLocalDynamicSchema(customFields);
			const form = await superValidate(formData, zod(dynamicSchema));
			if (!form.valid) return fail(400, { form });

			const {
				customer_name,
				customer_email,
				customer_phone,
				customer_instagram,
				pickup_date,
				pickup_time,
				pickup_date_end,
				additional_information,
				customization_data,
				delivery_mode,
				qr_code_url
			} = form.data;
			const isEmailDelivery = showDeliveryOptions && delivery_mode === 'email';
			const qrCodeUrl = showDeliveryOptions ? qr_code_url : '';

			if (bookingType === 'reservation') {
				if (!pickup_date_end) {
					return fail(400, { form, error: 'Veuillez sélectionner une date de fin pour la plage de réservation.' });
				}
				const startStr = `${new Date(pickup_date).getFullYear()}-${String(new Date(pickup_date).getMonth() + 1).padStart(2, '0')}-${String(new Date(pickup_date).getDate()).padStart(2, '0')}`;
				const endStr = `${new Date(pickup_date_end).getFullYear()}-${String(new Date(pickup_date_end).getMonth() + 1).padStart(2, '0')}-${String(new Date(pickup_date_end).getDate()).padStart(2, '0')}`;
				if (endStr < startStr) {
					return fail(400, { form, error: 'La date de fin doit être après la date de début.' });
				}
				const minStart = new Date();
				minStart.setDate(minStart.getDate() + (product.min_days_notice || 0));
				minStart.setHours(0, 0, 0, 0);
				if (new Date(pickup_date + 'T12:00:00Z') < minStart) {
					return fail(400, { form, error: `La réservation doit commencer au moins ${product.min_days_notice || 0} jour(s) à l'avance.` });
				}
				const minDays = (product as any).min_reservation_days ?? 0;
				if (minDays > 0 && pickup_date && pickup_date_end) {
					const durationDays = 1 + Math.round((new Date(pickup_date_end).getTime() - new Date(pickup_date).getTime()) / (24 * 60 * 60 * 1000));
					if (durationDays < minDays) {
						return fail(400, {
							form,
							error: `La réservation doit couvrir au moins ${minDays} jour(s). Vous avez choisi ${durationDays} jour(s).`
						});
					}
				}
			} else if (!isEmailDelivery) {
				if (!pickup_time) {
					return fail(400, { form, error: 'Veuillez sélectionner un créneau horaire de récupération.' });
				}
			}

			let selectedDate: string;
			let selectedDateObj: Date;
			try {
				// Envoi par e-mail : pas de date à choisir, fichier envoyé sous 48 h
				selectedDateObj = isEmailDelivery ? new Date(Date.now() + 2 * 24 * 60 * 60 * 1000) : new Date(pickup_date);
				selectedDate = `${selectedDateObj.getFullYear()}-${String(selectedDateObj.getMonth() + 1).padStart(2, '0')}-${String(selectedDateObj.getDate()).padStart(2, '0')}`;
			} catch {
				return fail(400, { form, error: 'Date de retrait invalide' });
			}

			const pickupDay = selectedDateObj.getDay();
			const { data: availability } = await (locals.supabaseServiceRole as any)
				.from('availabilities')
				.select('daily_order_limit')
				.eq('shop_id', shop.id)
				.eq('day', pickupDay)
				.single();

			if (bookingType === 'pickup' && !isEmailDelivery && availability?.daily_order_limit) {
				const { data: existingOrders } = await (locals.supabaseServiceRole as any)
					.from('orders')
					.select('id')
					.eq('shop_id', shop.id)
					.eq('pickup_date', selectedDate)
					.in('status', ['pending', 'quoted', 'confirmed', 'to_verify']);
				if (existingOrders && existingOrders.length >= availability.daily_order_limit) {
					return fail(400, {
						form,
						error: `Limite quotidienne atteinte (${availability.daily_order_limit} commandes maximum ce jour)`
					});
				}
			}

			const selectedOptions: Record<string, any> = {};
			Object.entries(customization_data || {}).forEach(([fieldId, value]) => {
				const field = customFields.find((f: any) => f.id === fieldId);
				if (!field) return;
				const key = field.label;
				if (['short-text', 'long-text', 'number'].includes(field.type)) {
					selectedOptions[key] = { value, type: field.type, price: 0, fieldId, fieldType: field.type };
				} else if (field.type === 'single-select' && Array.isArray(field.options)) {
					const option = field.options.find((opt: any) => opt.label === value);
					if (option)
						selectedOptions[key] = {
							value: option.label,
							type: field.type,
							price: option.price || 0,
							fieldId,
							fieldType: field.type
						};
				} else if (
					field.type === 'multi-select' &&
					Array.isArray(value) &&
					Array.isArray(field.options)
				) {
					selectedOptions[key] = {
						values: value
							.map((optionLabel: string) => {
								const option = field.options.find((opt: any) => opt.label === optionLabel);
								return option ? { label: option.label, price: option.price || 0 } : null;
							})
							.filter(Boolean),
						type: field.type,
						price: value.reduce((sum: number, optionLabel: string) => {
							const option = field.options.find((opt: any) => opt.label === optionLabel);
							return sum + (option?.price || 0);
						}, 0),
						fieldId,
						fieldType: field.type
					};
				}
			});

			// Mode de remise, visible dans le tableau de bord et les e-mails
			if (showDeliveryOptions) {
				selectedOptions['Mode de remise'] = {
					value: isEmailDelivery ? 'Par e-mail (fichier à imprimer, sous 48 h)' : 'Retrait à Andrésy (78)',
					type: 'short-text',
					price: 0,
					fieldId: 'delivery_mode',
					fieldType: 'short-text'
				};
			}

			let totalPrice = product.base_price || 0;
			Object.values(selectedOptions).forEach((val: any) => {
				if (val?.price !== undefined) totalPrice += val.price || 0;
			});

			const { data: orderRefData, error: orderRefError } = await (locals.supabaseServiceRole as any).rpc(
				'generate_order_ref'
			);
			if (orderRefError || !orderRefData) {
				await ErrorLogger.logCritical(
					orderRefError || new Error('Failed to generate order_ref'),
					{ shopId: shop.id, productId: id },
					{ action: 'createPendingOrder', step: 'generate_order_ref' }
				);
				return fail(500, { form, error: 'Erreur lors de la génération de la référence' });
			}
			const order_ref = orderRefData;

			const orderData: Record<string, any> = {
				shop_id: shop.id,
				product_id: id,
				customer_name,
				customer_email,
				customer_phone,
				customer_instagram,
				pickup_date: selectedDate,
				pickup_time: bookingType === 'reservation' || isEmailDelivery ? null : pickup_time,
				additional_information,
				customization_data: selectedOptions,
				total_amount: totalPrice,
				product_name: product.name,
				order_ref,
				inspiration_photos: qrCodeUrl ? [qrCodeUrl] : []
			};
			if (bookingType === 'reservation' && pickup_date_end) {
				const endStr = `${new Date(pickup_date_end).getFullYear()}-${String(new Date(pickup_date_end).getMonth() + 1).padStart(2, '0')}-${String(new Date(pickup_date_end).getDate()).padStart(2, '0')}`;
				orderData.pickup_date_end = endStr;
			}

			const { error: pendingOrderError } = await (locals.supabaseServiceRole as any)
				.from('pending_orders')
				.insert({ order_data: orderData, order_ref });

			if (pendingOrderError) {
				return fail(500, { form, error: 'Erreur lors de la création de la commande' });
			}

			return message(form, {
				success: true,
				redirectTo: `/product/${id}/checkout/${order_ref}`
			});
		} catch (err) {
			const tempSchema = createLocalDynamicSchema([]);
			const form = await superValidate(request, zod(tempSchema));
			setError(form, '', 'Erreur serveur inattendue. Veuillez réessayer.');
			return { form };
		}
	}
};
