import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Déconnexion depuis le menu du tableau de bord
export const POST: RequestHandler = async ({ locals }) => {
	await locals.supabase.auth.signOut();
	redirect(303, '/login');
};

// Déconnexion forcée d'une personne qui n'a pas accès à l'espace boutique
export const GET: RequestHandler = async ({ locals, url }) => {
	await locals.supabase.auth.signOut();
	redirect(303, url.searchParams.get('refuse') === '1' ? '/login?refuse=1' : '/login');
};
