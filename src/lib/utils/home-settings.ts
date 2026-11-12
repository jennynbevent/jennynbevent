/** Réglages de la page d'accueil (bande du haut, textes, 3 images « Nos univers ») */
export type HomeTile = { category_id: string | null; product_id: string | null; image_url?: string | null };
export type HomeSettings = {
	banner: string;
	kicker: string;
	title: string;
	subtitle: string;
	tiles: HomeTile[];
};

export const HOME_DEFAULTS: HomeSettings = {
	banner: 'Retrait à Andrésy · Livraison bientôt de retour · Fichiers par e-mail sous 48 h',
	kicker: 'Tout commence par une idée',
	title: 'Des créations personnalisées,\npensées pour vous',
	subtitle: 'Panneaux de bienvenue, papeterie, faire-part, tasses, stickers… et bien plus encore.',
	tiles: [],
};

const clip = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Lit des réglages enregistrés (ou absents) et complète avec les valeurs par défaut */
export function readHomeSettings(raw: unknown): HomeSettings {
	const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const tiles = Array.isArray(r.tiles) ? r.tiles : [];
	return {
		banner: 'banner' in r ? clip(r.banner, 160) : HOME_DEFAULTS.banner,
		kicker: 'kicker' in r ? clip(r.kicker, 80) : HOME_DEFAULTS.kicker,
		title: clip(r.title, 120) || HOME_DEFAULTS.title,
		subtitle: 'subtitle' in r ? clip(r.subtitle, 300) : HOME_DEFAULTS.subtitle,
		tiles: tiles.slice(0, 3).map((t) => {
			const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
			const id = (v: unknown) => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
			const img =
				typeof o.image_url === 'string' && /^https:\/\/res\.cloudinary\.com\/[^\s"'<>]+$/.test(o.image_url) && o.image_url.length < 500
					? o.image_url
					: null;
			return { category_id: id(o.category_id), product_id: id(o.product_id), image_url: img };
		}),
	};
}
