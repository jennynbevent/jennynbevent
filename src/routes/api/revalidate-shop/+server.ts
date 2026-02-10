import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { forceRevalidateShop } from '$lib/utils/catalog/catalog-revalidation';
import { getSingleShop } from '$lib/shop';
import { env } from '$env/dynamic/private';

/**
 * API endpoint pour forcer la revalidation de la boutique (single-shop)
 * Usage: POST /api/revalidate-shop
 * Body: optionnel { "slug": "shop-slug" } pour compat, sinon revalide la boutique unique
 * Headers: { "Authorization": "Bearer REVALIDATION_TOKEN" }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const authHeader = request.headers.get('authorization');
		const expectedToken = `Bearer ${env.REVALIDATION_TOKEN}`;

		if (authHeader !== expectedToken) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		let slug: string | undefined;
		try {
			const body = await request.json().catch(() => ({}));
			slug = typeof body?.slug === 'string' ? body.slug : undefined;
		} catch {
			// body optional
		}

		if (!slug) {
			const singleShopId = (env as Record<string, string | undefined>).PUBLIC_SINGLE_SHOP_ID ?? null;
			const shop = await getSingleShop(locals.supabaseServiceRole as any, singleShopId);
			slug = shop?.slug ?? '';
		}

		console.log(`🔄 Manual revalidation requested for: ${slug || '(root)'}`);

		const success = await forceRevalidateShop(slug);

		if (success) {
			return json({
				success: true,
				message: slug ? `Shop ${slug} revalidated successfully` : 'Shop (root) revalidated successfully'
			});
		} else {
			return json({
				success: false,
				error: slug ? `Failed to revalidate shop ${slug}` : 'Failed to revalidate shop'
			}, { status: 500 });
		}
	} catch (error) {
		console.error('Error in revalidate-shop API:', error);
		return json({
			success: false,
			error: 'Internal server error'
		}, { status: 500 });
	}
};