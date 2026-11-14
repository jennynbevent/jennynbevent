import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { optionLines } from '$lib/cart/options';
import { getDeliveryMode } from '$lib/utils/delivery';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw error(404, 'Commande non trouvée');
	const { data: first } = await (locals.supabaseServiceRole as any)
		.from('orders')
		.select('id, cart_ref, shop_id')
		.eq('id', params.id)
		.maybeSingle();
	if (!first) throw error(404, 'Commande non trouvée');

	let query = (locals.supabaseServiceRole as any)
		.from('orders')
		.select('id, product_id, product_name, total_amount, status, payment_provider, customer_name, pickup_date, pickup_time, customization_data, inspiration_photos, cart_ref, order_ref, created_at')
		.order('created_at', { ascending: true });
	query = first.cart_ref ? query.eq('cart_ref', first.cart_ref) : query.eq('id', first.id);
	const { data: orders } = await query;

	const productIds = [...new Set((orders || []).map((o: any) => o.product_id).filter(Boolean))];
	const { data: products } = productIds.length
		? await (locals.supabaseServiceRole as any).from('products').select('id, image_url').in('id', productIds)
		: { data: [] };
	const images = new Map((products || []).map((p: any) => [p.id, p.image_url]));
	const { data: shop } = await (locals.supabaseServiceRole as any).from('shops').select('name, logo_url').eq('id', first.shop_id).single();

	const list = (orders || []).map((o: any) => ({
		id: o.id,
		name: o.product_name,
		price: Number(o.total_amount) || 0,
		image: images.get(o.product_id) || null,
		mode: getDeliveryMode(o.customization_data) === 'email' ? 'email' : 'print',
		lines: optionLines(o.customization_data || {}),
		status: o.status,
	}));
	const printOrder = (orders || []).find((o: any) => getDeliveryMode(o.customization_data) !== 'email');
	return {
		shop,
		ref: first.cart_ref || orders?.[0]?.order_ref || '',
		customerName: orders?.[0]?.customer_name || '',
		paidByCard: orders?.[0]?.payment_provider === 'stripe',
		items: list,
		total: Math.round(list.reduce((s: number, i: any) => s + i.price, 0) * 100) / 100,
		pickupDate: printOrder?.pickup_date || null,
		pickupTime: printOrder?.pickup_time || null,
	};
};
