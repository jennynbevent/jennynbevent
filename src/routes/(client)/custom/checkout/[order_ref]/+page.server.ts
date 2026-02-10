import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { EmailService } from '$lib/services/email-service';
import { getShopColorFromShopId } from '$lib/emails/helpers';
import { PUBLIC_SITE_URL } from '$env/static/public';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	const { order_ref } = params;
	try {
		const { hasPolicies } = await parent();
		const { data: order, error: orderError } = await (locals.supabaseServiceRole as any)
			.from('orders')
			.select('*, shops!inner(id, name, logo_url, profile_id, instagram, tiktok, website)')
			.eq('order_ref', order_ref)
			.eq('status', 'quoted')
			.single();

		if (orderError || !order) throw error(404, 'Devis non trouvé');
		const shop = order.shops;

		const { data: paymentLinks, error: paymentLinkError } = await (locals.supabaseServiceRole as any)
			.from('payment_links')
			.select('provider_type, payment_identifier')
			.eq('profile_id', shop.profile_id)
			.eq('is_active', true)
			.order('provider_type', { ascending: true });

		const allPaymentLinks = [...(paymentLinks || [])];
		allPaymentLinks.sort((a, b) => {
			const orderMap = { stripe: 0, wero: 1, paypal: 2, revolut: 3 };
			const aOrder = orderMap[a.provider_type as keyof typeof orderMap] ?? 99;
			const bOrder = orderMap[b.provider_type as keyof typeof orderMap] ?? 99;
			return aOrder - bOrder;
		});

		if ((paymentLinkError && paymentLinkError.code !== 'PGRST116') || allPaymentLinks.length === 0) {
			throw error(500, 'Erreur lors du chargement des informations de paiement');
		}

		const paypalLink = allPaymentLinks.find((pl: any) => pl.provider_type === 'paypal');
		const paymentLink = paypalLink || allPaymentLinks[0];
		const { shops, ...orderWithoutShops } = order;

		return {
			order: orderWithoutShops,
			paypalMe: paymentLink.payment_identifier,
			paymentLinks: allPaymentLinks,
			shop,
			hasPolicies: hasPolicies || false
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur lors du chargement de la commande');
	}
};

export const actions: Actions = {
	openPayPal: async () => ({ success: true }),
	confirmPayment: async ({ params, request, locals }) => {
		const { order_ref } = params;
		try {
			const formData = await request.formData();
			const orderId = formData.get('orderId') as string;
			const paymentProvider = formData.get('paymentProvider') as string | null;

			const orderQuery = (locals.supabaseServiceRole as any)
				.from('orders')
				.select('*, shops(id, logo_url, name, profile_id)')
				.eq('status', 'quoted');
			if (orderId) orderQuery.eq('id', orderId);
			else orderQuery.eq('order_ref', order_ref);
			const { data: order, error: orderError } = await orderQuery.single();

			if (orderError || !order) throw error(404, 'Devis non trouvé');

			let pastryEmail: string | null = null;
			if (order.shops?.profile_id) {
				const { data: profile } = await (locals.supabaseServiceRole as any)
					.from('profiles')
					.select('email')
					.eq('id', order.shops.profile_id)
					.single();
				pastryEmail = profile?.email || null;
			}

			const totalAmount = order.total_amount;
			const paidAmount = totalAmount / 2;
			const remainingAmount = totalAmount - paidAmount;
			const orderStatus = 'to_verify';

			const { data: updatedOrder, error: updateError } = await (locals.supabaseServiceRole as any)
				.from('orders')
				.update({
					status: orderStatus,
					paid_amount: paidAmount,
					payment_provider: paymentProvider || null
				})
				.eq('id', order.id)
				.select()
				.single();

			if (updateError || !updatedOrder) throw error(500, 'Erreur lors de la confirmation du paiement');

			try {
				const shopColor = await getShopColorFromShopId(locals.supabaseServiceRole, order.shops.id);
				if (paymentProvider === 'stripe') {
					await EmailService.sendOrderConfirmation({
						customerEmail: order.customer_email,
						customerName: order.customer_name,
						shopName: order.shops.name,
						shopLogo: order.shops.logo_url,
						productName: 'Commande personnalisée',
						pickupDate: order.pickup_date,
						pickupTime: order.pickup_time,
						totalAmount,
						paidAmount,
						orderId: order.id,
						orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
						date: new Date().toLocaleDateString('fr-FR'),
						shopColor
					});
				} else {
					await EmailService.sendOrderPendingVerificationClient({
						customerEmail: order.customer_email,
						customerName: order.customer_name,
						shopName: order.shops.name,
						shopLogo: order.shops.logo_url,
						productName: 'Commande personnalisée',
						pickupDate: order.pickup_date,
						pickupTime: order.pickup_time,
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
							customerName: order.customer_name,
							customerEmail: order.customer_email,
							customerInstagram: order.customer_instagram,
							productName: 'Commande personnalisée',
							pickupDate: order.pickup_date,
							pickupTime: order.pickup_time,
							totalAmount,
							paidAmount,
							remainingAmount,
							orderId: order.id,
							orderRef: order_ref,
							dashboardUrl: `${PUBLIC_SITE_URL}/dashboard/orders/${order.id}`,
							date: new Date().toLocaleDateString('fr-FR')
						});
					}
				}
			} catch (emailError) {
				console.error('Email error:', emailError);
			}

			throw redirect(303, `/order/${order.id}`);
		} catch (err) {
			if (err && typeof err === 'object' && 'status' in err) throw err;
			throw error(500, 'Erreur lors de la confirmation du paiement');
		}
	}
};
