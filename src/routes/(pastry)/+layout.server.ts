import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Single-user dashboard: no plans nor permission limits.
 * Only ensures the user is logged in and has a shop (redirect to onboarding otherwise).
 */
export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase },
}) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		redirect(303, '/login');
	}

	const { data: shop, error: shopError } = await (supabase as any)
		.from('shops')
		.select('*')
		.eq('profile_id', user.id)
		.maybeSingle();

	if (shopError) {
		console.error('Error fetching shop:', shopError);
		redirect(303, '/login');
	}

	if (!shop) {
		redirect(303, '/onboarding');
	}

	// Minimal permissions for backward compatibility: only shopId/shopSlug, no limits
	const permissions = {
		shopId: shop.id,
		shopSlug: shop.slug ?? null,
		plan: 'exempt' as const,
		productCount: 0,
		productLimit: 999999,
		canAddMoreProducts: true,
		canHandleCustomRequests: true,
		canManageCustomForms: true,
		isExempt: true,
		needsSubscription: false,
	};

	return {
		user,
		shop,
		permissions,
		orderLimitStats: null,
	};
};
