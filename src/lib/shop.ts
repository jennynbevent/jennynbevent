import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Single-user app: get the only shop in the site.
 * Uses SELECT * FROM shops LIMIT 1, or singleShopId if provided (e.g. from env).
 */
export async function getSingleShop(
	supabase: SupabaseClient,
	singleShopId?: string | null
): Promise<{ id: string;[key: string]: unknown } | null> {
	if (singleShopId) {
		const { data, error } = await supabase.from('shops').select('*').eq('id', singleShopId).single();
		if (error || !data) return null;
		return data as { id: string;[key: string]: unknown };
	}
	const { data, error } = await supabase.from('shops').select('*').limit(1).maybeSingle();
	if (error || !data) return null;
	return data as { id: string;[key: string]: unknown };
}
