import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadShopCatalog } from '$lib/utils/catalog/catalog-loader';
import { env } from '$env/dynamic/private';

export const config = {
	isr: {
		expiration: false,
		bypassToken: env.REVALIDATION_TOKEN
	}
};

export const load: PageServerLoad = async ({ locals, setHeaders, url, request, parent }) => {
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

		const bypassToken = url.searchParams.get('bypassToken');
		const revalidateHeader = request.headers.get('x-prerender-revalidate');
		const isRevalidation =
			bypassToken === env.REVALIDATION_TOKEN || revalidateHeader === env.REVALIDATION_TOKEN;
		const isShopVisible = shopInfo.is_active;

		if (!isShopVisible && !isRevalidation) {
			return { notFound: true };
		}

		const catalogData = await loadShopCatalog(locals.supabaseServiceRole as any, shopId);

		setHeaders({
			'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
			'X-ISR-Revalidated': isRevalidation ? 'true' : 'false'
		});

		return {
			shop: catalogData.shop,
			categories: catalogData.categories,
			products: catalogData.products,
			faqs: catalogData.faqs,
			isShopActive: isShopVisible,
			cacheInfo: {
				cached_at: catalogData.cached_at,
				revalidated: isRevalidation
			}
		};
	} catch (err) {
		console.error('[/] Error loading shop:', err);
		if (err instanceof Error && err.message.includes('404')) {
			throw err;
		}
		throw error(500, 'Erreur lors du chargement de la boutique. Veuillez réessayer plus tard.');
	}
};
