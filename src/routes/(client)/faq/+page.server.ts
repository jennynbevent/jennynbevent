import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	try {
		const { shopId } = await parent();
		if (!shopId) throw error(404, 'Boutique non trouvée');

		const { data: shop, error: shopError } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('id, name, bio, logo_url, instagram, tiktok, website, faq(*)')
			.eq('id', shopId)
			.eq('is_active', true)
			.single();

		if (shopError || !shop) {
			throw error(404, 'Boutique non trouvée');
		}

		const faqs = (shop.faq || []).sort(
			(a: { created_at: string }, b: { created_at: string }) =>
				new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
		);
		const { faq, ...shopWithoutFaq } = shop;

		return {
			shop: shopWithoutFaq,
			faqs: faqs || []
		};
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Erreur inattendue lors du chargement des FAQ');
	}
};
