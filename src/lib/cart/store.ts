/** Panier du client, gardé dans le navigateur (même s'il ferme la page) */
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

export type CartItem = {
	ref: string; // référence de la ligne enregistrée côté serveur
	productId: string;
	name: string;
	image: string | null;
	price: number;
	mode: 'print' | 'email';
	lines: string[]; // options choisies, déjà mises en forme
	minDaysNotice: number;
	addedAt: number;
};

const KEY = 'jnb-cart-v1';
const MAX_ITEMS = 20;
const MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 jours

function read(): CartItem[] {
	if (!browser) return [];
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
		if (!Array.isArray(raw)) return [];
		return raw.filter((i) => i && typeof i.ref === 'string' && Date.now() - (i.addedAt || 0) < MAX_AGE);
	} catch {
		return [];
	}
}

export const cart = writable<CartItem[]>(read());

cart.subscribe((items) => {
	if (!browser) return;
	try {
		localStorage.setItem(KEY, JSON.stringify(items));
	} catch {
		/* stockage indisponible : le panier reste le temps de la visite */
	}
});

// Garde plusieurs onglets synchronisés
if (browser) {
	window.addEventListener('storage', (e) => {
		if (e.key === KEY) cart.set(read());
	});
}

export const cartCount = derived(cart, (items) => items.length);
export const cartTotal = derived(cart, (items) => Math.round(items.reduce((s, i) => s + (Number(i.price) || 0), 0) * 100) / 100);

export function addToCart(item: CartItem): boolean {
	let ok = true;
	cart.update((items) => {
		if (items.length >= MAX_ITEMS) {
			ok = false;
			return items;
		}
		return [...items.filter((i) => i.ref !== item.ref), item];
	});
	return ok;
}

export function removeFromCart(ref: string) {
	cart.update((items) => items.filter((i) => i.ref !== ref));
}

export function clearCart() {
	cart.set([]);
}
