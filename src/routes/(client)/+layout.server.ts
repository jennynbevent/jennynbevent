import type { LayoutServerLoad } from './$types';
import { getSingleShop } from '$lib/shop';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals }) => {
	try {
		const singleShopId = (env as Record<string, string | undefined>).PUBLIC_SINGLE_SHOP_ID ?? null;
		const shop = await getSingleShop(locals.supabaseServiceRole as any, singleShopId);
		if (!shop) {
			return {
				shopId: null,
				customizations: {
					button_color: '#ff6f61',
					button_text_color: '#ffffff',
					text_color: '#333333',
					icon_color: '#6b7280',
					secondary_text_color: '#333333',
					background_color: '#fafafa',
					background_image_url: null
				},
				hasPolicies: false
			};
		}

		const [customizationsResult, policiesResult] = await Promise.all([
			(locals.supabaseServiceRole as any)
				.from('shop_customizations')
				.select('button_color, button_text_color, text_color, icon_color, secondary_text_color, background_color, background_image_url')
				.eq('shop_id', shop.id)
				.maybeSingle(),
			(locals.supabaseServiceRole as any)
				.from('shop_policies')
				.select('terms_and_conditions, return_policy, delivery_policy, payment_terms')
				.eq('shop_id', shop.id)
				.maybeSingle()
		]);

		const customizations = customizationsResult.data;
		const policies = policiesResult.data;
		const hasPolicies = !!(
			policies &&
			(policies.terms_and_conditions ||
				policies.return_policy ||
				policies.delivery_policy ||
				policies.payment_terms)
		);

		return {
			shopId: shop.id,
			customizations: customizations || {
				button_color: '#ff6f61',
				button_text_color: '#ffffff',
				text_color: '#333333',
				icon_color: '#6b7280',
				secondary_text_color: '#333333',
				background_color: '#fafafa',
				background_image_url: null
			},
			hasPolicies
		};
	} catch (error) {
		console.error('Error loading client layout:', error);
		return {
			shopId: null,
			customizations: {
				button_color: '#ff6f61',
				button_text_color: '#ffffff',
				text_color: '#333333',
				icon_color: '#6b7280',
				secondary_text_color: '#333333',
				background_color: '#fafafa',
				background_image_url: null
			},
			hasPolicies: false
		};
	}
};
