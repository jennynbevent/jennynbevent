import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getUserPermissions } from '$lib/auth';
import { isAllowedAdminEmail } from '$lib/auth/admin-access';
import { fetchPrintFile } from '$lib/cloudinary';

/** Affiche le PDF envoyé au client pour cette commande (réservé à l'administratrice) */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user || !isAllowedAdminEmail(user.email)) throw error(401, 'Non autorisé');

	const permissions = await getUserPermissions(user.id, locals.supabase);
	if (!permissions.shopId) throw error(403, 'Boutique introuvable');

	const { data: order } = await (locals.supabase as any)
		.from('orders')
		.select('print_file_url, print_file_name')
		.eq('id', params.id)
		.eq('shop_id', permissions.shopId)
		.maybeSingle();

	if (!order?.print_file_url) throw error(404, 'Aucun fichier envoyé pour cette commande');

	let content: Buffer;
	try {
		content = await fetchPrintFile(order.print_file_url);
	} catch {
		throw error(502, 'Le fichier est momentanément indisponible');
	}

	const name = String(order.print_file_name || 'fichier.pdf').replace(/["\\\r\n]/g, '');
	const disposition = url.searchParams.get('telecharger') ? 'attachment' : 'inline';
	return new Response(new Uint8Array(content), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `${disposition}; filename="${name}"`,
			'Cache-Control': 'private, no-store',
		},
	});
};
