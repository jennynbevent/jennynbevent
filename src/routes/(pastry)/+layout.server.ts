import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';

/**
 * Single-user dashboard: no plans nor permission limits.
 * Only ensures the user is logged in and has a shop (redirect to onboarding otherwise).
 */
export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase, supabaseServiceRole },
	depends,
}) => {
	depends('app:messages');
	const { session, user } = await safeGetSession();
	if (!session || !user) {
		redirect(303, '/login');
	}

	// Espace réservé à la propriétaire : toute autre personne est déconnectée
	if (!isAllowedAdminEmail(user.email)) {
		redirect(303, '/logout?refuse=1');
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

	// Nombre de messages non lus (page Contact)
	let unreadMessages = 0;
	try {
		const { count } = await (supabaseServiceRole as any)
			.from('shop_messages')
			.select('id', { count: 'exact', head: true })
			.eq('shop_id', shop.id)
			.is('read_at', null);
		unreadMessages = count ?? 0;
	} catch {
		unreadMessages = 0;
	}

	return {
		user,
		shop,
		permissions,
		unreadMessages,
		orderLimitStats: null,
	};
};
