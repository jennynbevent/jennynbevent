import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadShopCatalog } from '$lib/utils/catalog/catalog-loader';

export const load: PageServerLoad = async ({ locals, setHeaders, parent }) => {
	try {
		const { shopId } = await parent();
		if (!shopId) {
			return { notFound: true };
		}

		const { data: shopInfo, error: shopError } = await (locals.supabaseServiceRole as any)
			.from('shops')
			.select('is_active')
			.eq('id', shopId)
			.single();

		if (shopError || !shopInfo) {
			return { notFound: true };
		}

		const isShopVisible = shopInfo.is_active;
		if (!isShopVisible) {
			return { notFound: true };
		}

		const catalogData = await loadShopCatalog(locals.supabaseServiceRole as any, shopId);

		// Pas d'ISR : une seule boutique, données toujours fraîches
		setHeaders({ 'Cache-Control': 'public, max-age=0, must-revalidate' });

		return {
			shop: catalogData.shop,
			categories: catalogData.categories,
			products: catalogData.products,
			faqs: catalogData.faqs,
			isShopActive: isShopVisible
		};
	} catch (err) {
		console.error('[/] Error loading shop:', err);
		if (err instanceof Error && err.message.includes('404')) {
			throw err;
		}
		throw error(500, 'Erreur lors du chargement de la boutique. Veuillez réessayer plus tard.');
	}
};
