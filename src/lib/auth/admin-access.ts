import { env } from '$env/dynamic/private';

/**
 * Accès à l'espace boutique réservé à la propriétaire.
 *
 * Par défaut, seule l'adresse ci-dessous peut se connecter, créer une boutique
 * ou ouvrir le tableau de bord.
 *
 * Pour autoriser d'autres adresses plus tard, sans toucher au code :
 * ajouter dans Vercel une variable d'environnement ADMIN_EMAILS, par ex.
 *   ADMIN_EMAILS=contact@jennynbevent.com,autre@exemple.com
 * Pour rouvrir l'inscription à tout le monde : ADMIN_EMAILS=*
 */
const DEFAULT_ADMIN_EMAILS = ['contact@jennynbevent.com'];

export const ADMIN_ONLY_MESSAGE =
	"Cet espace est réservé à l'administratrice de la boutique. Pour passer commande, rendez-vous sur la page d'accueil.";

function allowedEmails(): string[] | '*' {
	const raw = (env.ADMIN_EMAILS || '').trim();
	if (raw === '*') return '*';
	const list = raw
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return list.length > 0 ? list : DEFAULT_ADMIN_EMAILS;
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	const allowed = allowedEmails();
	if (allowed === '*') return true;
	return allowed.includes(email.trim().toLowerCase());
}
