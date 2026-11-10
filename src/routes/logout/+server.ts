import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Déconnexion depuis le menu du tableau de bord
export const POST: RequestHandler = async ({ locals }) => {
	await locals.supabase.auth.signOut();
	redirect(303, '/login');
};
