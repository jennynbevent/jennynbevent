import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { CartData, CartLine } from '$lib/cart/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

async function shopData(locals: App.Locals, shopId: string | null) {
	if (!shopId) return null;
	const { data: shopRow } = await (locals.supabaseServiceRole as any).from('shops').select('slug').eq('id', shopId).single();
	if (!shopRow?.slug) return null;
	const { data } = await (locals.supabaseServiceRole as any).rpc('get_order_data', { p_slug: shopRow.slug });
	return data as any;
}

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { shopId } = await parent();
	const data = await shopData(locals, shopId);
	if (!data?.shop) throw error(404, 'Boutique non trouvée');
	return {
		shop: data.shop,
		availabilities: data.availabilities || [],
		unavailabilities: data.unavailabilities || [],
		datesWithLimitReached: data.datesWithLimitReached || [],
	};
};

function todayParis(): string {
	return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}

function addDays(iso: string, days: number) {
	const d = new Date(iso + 'T12:00:00Z');
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

export const actions: Actions = {
	checkout: async ({ request, locals }) => {
		const fd = await request.formData();
		const shopId = String(fd.get('shopId') || '');
		let refs: string[] = [];
		try {
			refs = JSON.parse(String(fd.get('refs') || '[]'));
		} catch {
			refs = [];
		}
		refs = [...new Set(refs.filter((r) => typeof r === 'string' && /^[0-9A-Za-z]{6,12}$/.test(r)))].slice(0, 20);

		const name = String(fd.get('customer_name') || '').trim().slice(0, 120);
		const email = String(fd.get('customer_email') || '').trim().toLowerCase().slice(0, 200);
		const phone = String(fd.get('customer_phone') || '').trim().slice(0, 40);
		const info = String(fd.get('additional_information') || '').trim().slice(0, 2000);
		const pickupDate = String(fd.get('pickup_date') || '').trim();
		const pickupTime = String(fd.get('pickup_time') || '').trim();

		if (!refs.length) return fail(400, { error: 'Votre panier est vide.' });
		if (!name) return fail(400, { error: 'Merci d’indiquer votre nom.' });
		if (!EMAIL_RE.test(email)) return fail(400, { error: 'Merci d’indiquer une adresse e-mail valide.' });

		// Articles enregistrés au moment de l'ajout au panier (prix de confiance)
		const { data: rows } = await (locals.supabaseServiceRole as any)
			.from('pending_orders')
			.select('order_ref, order_data')
			.in('order_ref', refs);
		const found = new Map((rows || []).map((r: any) => [r.order_ref, r.order_data]));
		const missing = refs.filter((r) => {
			const d: any = found.get(r);
			return !d || d.kind !== 'cart_item' || d.shop_id !== shopId;
		});
		if (missing.length) {
			return fail(400, {
				missing,
				error: 'Certains articles de votre panier ne sont plus disponibles. Ils ont été retirés, merci de vérifier votre panier.',
			});
		}

		const lines: CartLine[] = refs.map((r) => {
			const d: any = found.get(r);
			return {
				ref: r,
				product_id: d.product_id,
				product_name: d.product_name,
				product_base_price: d.product_base_price || 0,
				image_url: d.image_url || null,
				customization_data: d.customization_data || {},
				total_amount: Number(d.total_amount) || 0,
				delivery_mode: d.delivery_mode === 'email' ? 'email' : 'print',
				inspiration_photos: Array.isArray(d.inspiration_photos) ? d.inspiration_photos : [],
				min_days_notice: Number(d.min_days_notice) || 0,
			};
		});

		// Les articles doivent toujours être en vente
		const { data: activeProducts } = await (locals.supabaseServiceRole as any)
			.from('products')
			.select('id')
			.eq('shop_id', shopId)
			.eq('is_active', true)
			.in('id', [...new Set(lines.map((l) => l.product_id))]);
		const activeIds = new Set((activeProducts || []).map((p: any) => p.id));
		const inactive = lines.filter((l) => !activeIds.has(l.product_id)).map((l) => l.ref);
		if (inactive.length) {
			return fail(400, { missing: inactive, error: 'Un article de votre panier n’est plus en vente. Il a été retiré.' });
		}

		const printLines = lines.filter((l) => l.delivery_mode === 'print');
		let finalDate: string | null = null;
		let finalTime: string | null = null;

		if (printLines.length) {
			if (!DATE_RE.test(pickupDate)) return fail(400, { error: 'Merci de choisir une date de retrait.' });
			const notice = Math.max(0, ...printLines.map((l) => l.min_days_notice || 0));
			if (pickupDate < addDays(todayParis(), notice)) {
				return fail(400, { error: `La date de retrait doit être au moins ${notice} jour(s) après aujourd’hui.` });
			}
			const dayOfWeek = new Date(pickupDate + 'T12:00:00Z').getUTCDay();
			const { data: availability } = await (locals.supabaseServiceRole as any)
				.from('availabilities')
				.select('is_open, daily_order_limit, start_time, end_time, interval_time')
				.eq('shop_id', shopId)
				.eq('day', dayOfWeek)
				.maybeSingle();
			if (!availability?.is_open) return fail(400, { error: 'Ce jour n’est pas disponible pour le retrait.' });

			const { data: closed } = await (locals.supabaseServiceRole as any)
				.from('unavailabilities')
				.select('id')
				.eq('shop_id', shopId)
				.lte('start_date', pickupDate)
				.gte('end_date', pickupDate)
				.limit(1);
			if (closed?.length) return fail(400, { error: 'Cette date n’est pas disponible pour le retrait.' });

			if (availability.daily_order_limit) {
				const { count } = await (locals.supabaseServiceRole as any)
					.from('orders')
					.select('id', { count: 'exact', head: true })
					.eq('shop_id', shopId)
					.eq('pickup_date', pickupDate)
					.in('status', ['pending', 'quoted', 'confirmed', 'to_verify']);
				if ((count ?? 0) >= availability.daily_order_limit) {
					return fail(400, { error: 'Cette date est complète. Merci d’en choisir une autre.' });
				}
			}

			if (availability.start_time && availability.end_time && availability.interval_time) {
				if (!TIME_RE.test(pickupTime)) return fail(400, { error: 'Merci de choisir un créneau de retrait.' });
				finalTime = pickupTime;
			}
			finalDate = pickupDate;
		}

		const total = Math.round(lines.reduce((s, l) => s + l.total_amount, 0) * 100) / 100;
		const { data: cartRef, error: refError } = await (locals.supabaseServiceRole as any).rpc('generate_order_ref');
		if (refError || !cartRef) return fail(500, { error: 'Erreur, merci de réessayer.' });

		const cart: CartData = {
			kind: 'cart',
			shop_id: shopId,
			customer_name: name,
			customer_email: email,
			customer_phone: phone || null,
			additional_information: info || null,
			pickup_date: finalDate,
			pickup_time: finalTime,
			total_amount: total,
			lines,
		};
		const { error: insertError } = await (locals.supabaseServiceRole as any)
			.from('pending_orders')
			.insert({ order_ref: cartRef, order_data: cart });
		if (insertError) return fail(500, { error: 'Erreur, merci de réessayer.' });

		return { cartRef };
	},
};
