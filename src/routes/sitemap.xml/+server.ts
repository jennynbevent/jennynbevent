import type { RequestHandler } from './$types';

const baseUrl = 'https://pattyly.com';

// Single-shop: boutique à la racine, pas d'annuaire ni pages multi-patissiers
const pages = [
	{ url: '', changefreq: 'weekly' as const, priority: 1.0 },
	{ url: '/custom', changefreq: 'weekly' as const, priority: 0.9 },
	{ url: '/faq', changefreq: 'monthly' as const, priority: 0.8 },
	{ url: '/policies', changefreq: 'monthly' as const, priority: 0.8 },
	{ url: '/politiques', changefreq: 'monthly' as const, priority: 0.8 },
];

export const GET: RequestHandler = async ({ locals }) => {
	// Optionnel : ajouter les URLs produits du shop unique
	let productUrls: { url: string; changefreq: 'weekly'; priority: number }[] = [];
	try {
		const { getSingleShop } = await import('$lib/shop');
		const env = await import('$env/dynamic/private').then((m) => m.env as Record<string, string | undefined>);
		const singleShopId = env.PUBLIC_SINGLE_SHOP_ID ?? null;
		const shop = await getSingleShop(locals.supabaseServiceRole as any, singleShopId);
		if (shop?.id) {
			const { data: products } = await (locals.supabaseServiceRole as any)
				.from('products')
				.select('id')
				.eq('shop_id', shop.id)
				.eq('is_active', true);
			if (products?.length) {
				productUrls = products.map((p: { id: string }) => ({
					url: `/product/${p.id}`,
					changefreq: 'weekly' as const,
					priority: 0.7,
				}));
			}
		}
	} catch {
		// Ignore: sitemap reste sans produits
	}

	const allPages = [...pages, ...productUrls];
	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
			.map(
				(page) => `  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
			)
			.join('\n')}
</urlset>`;

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600',
		},
	});
};
