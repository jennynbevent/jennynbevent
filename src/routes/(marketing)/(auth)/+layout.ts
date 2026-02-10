import { env } from '$env/dynamic/public';
import {
	createBrowserClient,
	createServerClient,
	isBrowser,
	parse,
} from '@supabase/ssr';

export const load = async ({ fetch, data, depends }) => {
	depends('supabase:auth');
	const supabaseUrl = env.PUBLIC_SUPABASE_URL ?? '';
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY ?? '';

	const supabase = isBrowser()
		? createBrowserClient(supabaseUrl, anonKey, {
				global: {
					fetch,
				},
				cookies: {
					get(key) {
						const cookie = parse(document.cookie);
						return cookie[key];
					},
				},
				auth: {
					flowType: 'pkce',
				},
			})
		: createServerClient(supabaseUrl, anonKey, {
				global: {
					fetch,
				},
				cookies: {
					get() {
						return JSON.stringify(data.session);
					},
				},
				auth: {
					flowType: 'pkce',
				},
			});

	const url = data.url;

	return { supabase, url };
};
