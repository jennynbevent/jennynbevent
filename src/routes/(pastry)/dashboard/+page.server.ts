import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const load = async ({ locals, parent }) => {
    // ✅ OPTIMISÉ : Réutiliser les permissions du layout au lieu de refaire la requête
    const { permissions, shop, user } = await parent();

    if (!permissions.shopId) {
        redirect(303, '/onboarding');
    }

    if (!shop || !user) {
        redirect(303, '/onboarding');
    }

    // ✅ OPTIMISÉ : Un seul appel pour les métriques de commandes
    const { data: ordersMetrics, error: ordersError } = await locals.supabase.rpc('get_orders_metrics', {
        p_shop_id: shop.id
    });

    if (ordersError) {
        console.error('Error fetching orders metrics:', ordersError);
    }

    // Type assertion pour les métriques
    const metrics = ordersMetrics as any;

    // Get popular active products (top 5 by sales) - Version corrigée
    const { data: popularProducts, error: popularProductsError } = await locals.supabase
        .from('orders')
        .select(`
			product_name,
			total_amount,
			status
		`)
        .eq('shop_id', shop.id)
        .not('product_id', 'is', null)  // Seulement les commandes avec nom de produit
        .eq('status', 'completed');  // Seulement les commandes terminées

    // Debug: Log des articles populaires
    if (popularProductsError) {
    } else {
    }

    // Process popular products data - Version corrigée
    const productSales = new Map();
    popularProducts?.forEach(item => {
        if (item.product_name) {
            const productName = item.product_name;
            const current = productSales.get(productName) || {
                product: { name: productName },
                totalQuantity: 0,
                totalRevenue: 0
            };
            current.totalQuantity += 1; // Chaque commande = 1 article
            current.totalRevenue += item.total_amount || 0;
            productSales.set(productName, current);
        }
    });

    // Sort by total quantity and take top 5
    const topProducts = Array.from(productSales.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 5);

    const { count: productsCount } = await locals.supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shop.id)
        .eq('is_active', true);

    const currentPlan = null;
    const plans: Array<{ id: string; name: string; price: number; currency: string; stripePriceId?: string; features: string[]; limitations: string[]; popular: boolean; isFree: boolean }> = [];
    const hasLifetimePlan = false;

    return {
        user,
        shop,
        permissions,
        plans,
        currentPlan,
        hasLifetimePlan,
        metrics: {
            productsCount: productsCount ?? 0,
            recentOrders: metrics?.recent_orders || [],
            ordersCount: {
                weekly: metrics?.weekly_count || 0,
                monthly: metrics?.monthly_count || 0,
                threeMonths: metrics?.three_months_count || 0,
                yearly: metrics?.yearly_count || 0
            },
            revenue: {
                weekly: metrics?.weekly_revenue || 0,
                monthly: metrics?.monthly_revenue || 0,
                threeMonths: metrics?.three_months_revenue || 0,
                yearly: metrics?.yearly_revenue || 0
            },
            deposit: {
                weekly: metrics?.weekly_deposit || 0,
                monthly: metrics?.monthly_deposit || 0,
                threeMonths: metrics?.three_months_deposit || 0,
                yearly: metrics?.yearly_deposit || 0
            },
            popularProducts: topProducts
        }
    };
};

export const actions: Actions = {
    // Actions disponibles pour le dashboard
}; 