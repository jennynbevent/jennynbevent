import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/** Envoi du QR code du client avant la commande (renvoie l'adresse de l'image) */
export const POST: RequestHandler = async ({ request }) => {
	if (request.headers.get('x-rate-limit-exceeded') === 'true') {
		return json({ error: 'Trop de tentatives. Veuillez patienter.' }, { status: 429 });
	}
	const shopId = (env as Record<string, string | undefined>).PUBLIC_SINGLE_SHOP_ID;
	if (!shopId) return json({ error: 'Boutique introuvable' }, { status: 400 });

	let file: File | null = null;
	try {
		const form = await request.formData();
		const value = form.get('file');
		file = value instanceof File ? value : null;
	} catch {
		return json({ error: 'Fichier illisible' }, { status: 400 });
	}

	if (!file || file.size === 0) return json({ error: 'Aucun fichier reçu' }, { status: 400 });
	if (!ALLOWED.includes(file.type)) {
		return json({ error: 'Formats acceptés : PNG, JPG, WEBP ou SVG' }, { status: 400 });
	}
	if (file.size > MAX_BYTES) return json({ error: 'Fichier trop lourd (5 Mo maximum)' }, { status: 400 });

	try {
		const { uploadCustomerQrCode } = await import('$lib/cloudinary');
		const { secure_url } = await uploadCustomerQrCode(file, shopId);
		return json({ url: secure_url });
	} catch {
		return json({ error: "L'envoi a échoué, réessayez." }, { status: 500 });
	}
};
