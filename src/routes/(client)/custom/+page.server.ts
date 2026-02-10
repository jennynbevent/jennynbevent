import { error, fail } from '@sveltejs/kit';
import { message, superValidate, setError } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types';
import { createLocalDynamicSchema } from './schema';
import { EmailService } from '$lib/services/email-service';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { getShopColorFromShopId } from '$lib/emails/helpers';

export const load: PageServerLoad = async ({ locals, parent }) => {
	try {
		const { shopId } = await parent();
		if (!shopId) throw error(404, 'Boutique non trouvée');

		const { data: shopRow } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('slug')
			.eq('id', shopId)
			.single();
		if (!shopRow?.slug) throw error(404, 'Boutique non trouvée');

		const { data: customOrderData, error: dbError } = await (locals.supabaseServiceRole as any).rpc(
			'get_order_data',
			{ p_slug: shopRow.slug }
		);

		if (dbError) throw error(500, 'Erreur serveur lors du chargement de la boutique');
		if (!customOrderData) throw error(404, 'Boutique non trouvée');

		const { shop, customForm, customFields, availabilities, unavailabilities, datesWithLimitReached } =
			customOrderData;
		if (!shop) throw error(404, 'Boutique non trouvée');
		if (!shop.is_visible) throw error(404, 'Boutique non trouvée');
		if (!shop.is_custom_accepted) throw error(404, 'Demandes personnalisées non disponibles');

		const dynamicSchema = createLocalDynamicSchema(customFields || []);
		return {
			shop,
			customForm,
			customFields: customFields || [],
			availabilities: availabilities || [],
			unavailabilities: unavailabilities || [],
			datesWithLimitReached: datesWithLimitReached || [],
			orderLimitStats: null,
			form: await superValidate(zod(dynamicSchema))
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur inattendue lors du chargement de la page');
	}
};

export const actions: Actions = {
	createCustomOrder: async ({ request, locals }) => {
		try {
			const formData = await request.formData();
			const shopId = formData.get('shopId') as string;
			if (!shopId) throw error(400, 'Données de boutique manquantes');

			const { data: shop, error: shopError } = await (locals.supabaseServiceRole as any)
				.from('shops')
				.select('id, name, logo_url, profile_id')
				.eq('id', shopId)
				.eq('is_active', true)
				.single();
			if (shopError || !shop) throw error(404, 'Boutique non trouvée');

			const { data: customForm } = await (locals.supabaseServiceRole as any)
				.from('forms')
				.select('id')
				.eq('shop_id', shop.id)
				.eq('is_custom_form', true)
				.single();

			let customFields: any[] = [];
			if (customForm) {
				const { data: formFields } = await (locals.supabaseServiceRole as any)
					.from('form_fields')
					.select('*')
					.eq('form_id', customForm.id)
					.order('order');
				customFields = formFields || [];
			}

			const inspirationFiles = formData.getAll('inspiration_photos') as File[];
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
				additional_information,
				customization_data
			} = form.data;

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

			if (availability?.daily_order_limit) {
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

			const transformedCustomizationData: Record<string, any> = {};
			if (customization_data && Object.keys(customization_data).length > 0) {
				Object.entries(customization_data).forEach(([fieldId, value]) => {
					const field = customFields.find((f: any) => f.id === fieldId);
					if (field) transformedCustomizationData[field.label] = value;
				});
			}

			let uploadedInspirationPhotos: string[] = [];
			if (inspirationFiles.length > 0) {
				const tempOrderId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
				const { uploadInspirationPhoto } = await import('$lib/cloudinary');
				for (let i = 0; i < inspirationFiles.length; i++) {
					const photoFile = inspirationFiles[i];
					if (photoFile?.size > 0) {
						try {
							const { secure_url } = await uploadInspirationPhoto(photoFile, shop.id, tempOrderId, i + 1);
							uploadedInspirationPhotos.push(secure_url);
						} catch {
							// continue
						}
					}
				}
			}

			const { data: order, error: orderError } = await (locals.supabaseServiceRole as any)
				.from('orders')
				.insert({
					shop_id: shop.id,
					customer_name,
					customer_email,
					customer_phone,
					customer_instagram,
					pickup_date: selectedDate,
					pickup_time,
					additional_information,
					customization_data: transformedCustomizationData,
					inspiration_photos: uploadedInspirationPhotos,
					total_amount: 0,
					product_name: 'Demande personnalisée',
					status: 'pending'
				})
				.select()
				.single();
			if (orderError) throw error(500, 'Erreur lors de la création de la commande');

			try {
				const { data: ownerEmailData } = await (locals.supabaseServiceRole as any).rpc('get_shop_owner_email', {
					shop_uuid: shop.id
				});
				const pastryEmail = ownerEmailData || null;
				const shopColor = await getShopColorFromShopId(locals.supabaseServiceRole, shop.id);
				await EmailService.sendCustomRequestConfirmation({
					customerEmail: customer_email,
					customerName: customer_name,
					shopName: shop.name,
					shopLogo: shop.logo_url || undefined,
					requestId: order.id.slice(0, 8),
					orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
					date: new Date().toLocaleDateString('fr-FR'),
					shopColor
				});
				if (pastryEmail) {
					await EmailService.sendCustomRequestNotification({
						pastryEmail,
						customerName: customer_name,
						customerEmail: customer_email,
						customerInstagram: customer_instagram,
						pickupDate: pickup_date,
						pickupTime: pickup_time,
						requestId: order.id.slice(0, 8),
						dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/orders/${order.id}`,
						date: new Date().toLocaleDateString('fr-FR')
					});
				}
			} catch (e) {
				console.error('Email error:', e);
			}

			return message(form, { redirectTo: `/order/${order.id}` });
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) throw err;
			const tempSchema = createLocalDynamicSchema([]);
			const form = await superValidate(request, zod(tempSchema));
			setError(form, '', 'Erreur serveur inattendue. Veuillez réessayer.');
			return { form };
		}
	}
};
