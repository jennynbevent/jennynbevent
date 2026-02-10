import { error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { superValidate, fail, message, setError } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createLocalDynamicSchema } from './schema';
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

		const dynamicSchema = createLocalDynamicSchema(customFields || []);
		return {
			shop,
			product: { ...product, images: productImages },
			productImages,
			customForm,
			customFields: customFields || [],
			availabilities: availabilities || [],
			unavailabilities: unavailabilities || [],
			datesWithLimitReached: datesWithLimitReached || [],
			reservedRanges,
			orderLimitStats: null,
			form: await superValidate(zod(dynamicSchema))
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur inattendue lors du chargement du produit');
	}
};

export const actions: Actions = {
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
				customization_data
			} = form.data;

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
			} else {
				if (!pickup_time) {
					return fail(400, { form, error: 'Veuillez sélectionner un créneau horaire de récupération.' });
				}
			}

			let selectedDate: string;
			let selectedDateObj: Date;
			try {
				selectedDateObj = new Date(pickup_date);
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

			if (bookingType === 'pickup' && availability?.daily_order_limit) {
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
				pickup_time: bookingType === 'reservation' ? null : pickup_time,
				additional_information,
				customization_data: selectedOptions,
				total_amount: totalPrice,
				product_name: product.name,
				order_ref
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
