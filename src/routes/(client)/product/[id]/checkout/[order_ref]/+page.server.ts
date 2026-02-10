import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { EmailService } from '$lib/services/email-service';
import { ErrorLogger } from '$lib/services/error-logging';
import { getShopColorFromShopId } from '$lib/emails/helpers';
import { PUBLIC_SITE_URL } from '$env/static/public';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { order_ref } = params;
	try {
		const { hasPolicies } = await parent();
		const { data: pendingOrder, error: pendingOrderError } = await (locals.supabaseServiceRole as any)
			.from('pending_orders')
			.select('*')
			.eq('order_ref', order_ref)
			.maybeSingle();

		if (pendingOrderError || !pendingOrder) {
			const { data: existingOrder } = await (locals.supabaseServiceRole as any)
				.from('orders')
				.select('id')
				.eq('order_ref', order_ref)
				.maybeSingle();
			if (existingOrder) {
				throw redirect(303, `/order/${existingOrder.id}`);
			}
			throw error(404, 'Commande non trouvée');
		}

		const orderData = pendingOrder.order_data as any;
		const { data: shop, error: shopError } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('id, name, logo_url, profile_id, instagram, tiktok, website')
			.eq('id', orderData.shop_id)
			.single();

		if (shopError || !shop) throw error(404, 'Boutique non trouvée');

		const { data: product, error: productError } = await (locals.supabaseServiceRole as any)
			.from('products')
			.select('id, name, description, image_url, base_price, deposit_percentage')
			.eq('id', orderData.product_id)
			.single();

		if (productError || !product) throw error(404, 'Produit non trouvé');

		const { data: paymentLinks, error: paymentLinkError } = await (locals.supabaseServiceRole as any)
			.from('payment_links')
			.select('provider_type, payment_identifier')
			.eq('profile_id', shop.profile_id)
			.eq('is_active', true)
			.order('provider_type', { ascending: true });

		const allPaymentLinks = [...(paymentLinks || [])];
		allPaymentLinks.sort((a, b) => {
			const order = { stripe: 0, wero: 1, paypal: 2, revolut: 3 };
			const aOrder = order[a.provider_type as keyof typeof order] ?? 99;
			const bOrder = order[b.provider_type as keyof typeof order] ?? 99;
			return aOrder - bOrder;
		});

		if ((paymentLinkError && paymentLinkError.code !== 'PGRST116') || allPaymentLinks.length === 0) {
			throw error(500, 'Erreur lors du chargement des informations de paiement');
		}

		const paypalLink = allPaymentLinks.find((pl: any) => pl.provider_type === 'paypal');
		const paymentLink = paypalLink || allPaymentLinks[0];

		return {
			orderData,
			paypalMe: paymentLink.payment_identifier,
			paymentLinks: allPaymentLinks,
			shop,
			product,
			hasPolicies: hasPolicies || false
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur lors du chargement de la commande');
	}
};

export const actions: Actions = {
	confirmPayment: async ({ params, request, locals }) => {
		const { order_ref } = params;
		try {
			const formData = await request.formData();
			const shopId = formData.get('shopId') as string;
			const productId = formData.get('productId') as string;
			const orderRefFromForm = (formData.get('orderRef') as string) || order_ref;
			const paymentProvider = formData.get('paymentProvider') as string | null;

			const { data: pendingOrder, error: pendingOrderError } = await (locals.supabaseServiceRole as any)
				.from('pending_orders')
				.select('*')
				.eq('order_ref', orderRefFromForm)
				.single();

			if (pendingOrderError || !pendingOrder) {
				await ErrorLogger.logCritical(
					pendingOrderError || new Error('Pending order not found'),
					{ orderRef: orderRefFromForm, shopId, productId },
					{ action: 'confirmPayment', step: 'fetch_pending_order' }
				);
				throw error(404, 'Commande non trouvée');
			}

			const orderData = pendingOrder.order_data;
			if (shopId && orderData.shop_id !== shopId) throw error(403, 'Données de boutique invalides');
			if (productId && orderData.product_id !== productId) throw error(403, 'Données de produit invalides');

			const finalShopId = shopId || orderData.shop_id;
			const finalProductId = productId || orderData.product_id;

			const { data: product, error: productError } = await (locals.supabaseServiceRole as any)
				.from('products')
				.select('base_price, deposit_percentage, shops(logo_url, name, profile_id)')
				.eq('id', finalProductId)
				.single();

			if (productError || !product) {
				await ErrorLogger.logCritical(
					productError || new Error('Product not found'),
					{ orderRef: orderRefFromForm, shopId: finalShopId, productId: finalProductId },
					{ action: 'confirmPayment', step: 'fetch_product' }
				);
				throw error(500, 'Produit non trouvé');
			}

			let pastryEmail: string | null = null;
			if (product.shops?.profile_id) {
				const { data: profile } = await (locals.supabaseServiceRole as any)
					.from('profiles')
					.select('email')
					.eq('id', product.shops.profile_id)
					.single();
				pastryEmail = profile?.email || null;
			}

			const totalAmount = orderData.total_amount;
			const depositPercentage = product.deposit_percentage ?? 50;
			const paidAmount = (totalAmount * depositPercentage) / 100;
			const remainingAmount = totalAmount - paidAmount;

			const { data: order, error: orderError } = await (locals.supabaseServiceRole as any)
				.from('orders')
				.insert({
					shop_id: orderData.shop_id,
					product_id: orderData.product_id,
					customer_name: orderData.customer_name,
					customer_email: orderData.customer_email,
					customer_phone: orderData.customer_phone || null,
					customer_instagram: orderData.customer_instagram || null,
					pickup_date: orderData.pickup_date,
					pickup_time: orderData.pickup_time || null,
					pickup_date_end: orderData.pickup_date_end || null,
					additional_information: orderData.additional_information || null,
					customization_data: orderData.customization_data || null,
					status: 'to_verify',
					total_amount: totalAmount,
					paid_amount: paidAmount,
					product_name: orderData.product_name,
					product_base_price: product.base_price || 0,
					order_ref: order_ref,
					payment_provider: paymentProvider || null
				})
				.select()
				.single();

			if (orderError || !order) throw error(500, 'Erreur lors de la création de la commande');

			const { logEventAsync, Events } = await import('$lib/utils/analytics');
			logEventAsync(
				locals.supabaseServiceRole,
				Events.ORDER_RECEIVED,
				{
					order_id: order.id,
					order_ref,
					shop_id: orderData.shop_id,
					product_id: orderData.product_id,
					total_amount: totalAmount,
					order_type: 'product_order'
				},
				null,
				`/product/${orderData.product_id}/checkout/${order_ref}`
			);

			try {
				const shopColor = await getShopColorFromShopId(locals.supabaseServiceRole, orderData.shop_id);
				await EmailService.sendOrderPendingVerificationClient({
					customerEmail: orderData.customer_email,
					customerName: orderData.customer_name,
					shopName: product.shops.name,
					shopLogo: product.shops.logo_url,
					productName: orderData.product_name,
					pickupDate: orderData.pickup_date,
					pickupTime: orderData.pickup_time,
					pickupDateEnd: orderData.pickup_date_end ?? undefined,
					totalAmount,
					paidAmount,
					remainingAmount,
					orderId: order.id,
					orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
					orderRef: order_ref,
					date: new Date().toLocaleDateString('fr-FR'),
					shopColor
				});
				if (pastryEmail) {
					await EmailService.sendOrderPendingVerificationPastry({
						pastryEmail,
						customerName: orderData.customer_name,
						customerEmail: orderData.customer_email,
						customerInstagram: orderData.customer_instagram,
						productName: orderData.product_name,
						pickupDate: orderData.pickup_date,
						pickupTime: orderData.pickup_time,
						pickupDateEnd: orderData.pickup_date_end ?? undefined,
						totalAmount,
						paidAmount,
						remainingAmount,
						orderId: order.id,
						orderRef: order_ref,
						dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/orders/${order.id}`,
						date: new Date().toLocaleDateString('fr-FR')
					});
				}
			} catch (emailError) {
				console.error('Email error:', emailError);
			}

			await (locals.supabaseServiceRole as any)
				.from('pending_orders')
				.delete()
				.eq('order_ref', order_ref);

			throw redirect(303, `/order/${order.id}`);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) throw err;
			throw error(500, 'Erreur lors de la confirmation du paiement');
		}
	}
};
