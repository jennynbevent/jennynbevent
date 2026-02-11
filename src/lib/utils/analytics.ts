/**
 * Système de tracking d'événements pour analytics
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/DatabaseDefinitions';
import { logger } from './logger';

/**
 * Events prédéfinis pour faciliter le tracking
 */
export const Events = {
	// Acquisition
	PAGE_VIEW: 'page_view',

	// Activation
	SIGNUP: 'signup',
	SHOP_CREATED: 'shop_created',
	PRODUCT_ADDED: 'product_added',

	// Business
	SUBSCRIPTION_STARTED: 'subscription_started',
	SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
	ORDER_RECEIVED: 'order_received',
	PAYMENT_ENABLED: 'payment_enabled'
} as const;

let sessionId: string | null = null;

/**
 * Récupère ou crée un session ID unique
 */
export function getSessionId(): string {
	if (typeof window === 'undefined') {
		// Server-side, générer un ID temporaire
		return crypto.randomUUID();
	}

	if (!sessionId) {
		sessionId = localStorage.getItem('session_id');
		if (!sessionId) {
			sessionId = crypto.randomUUID();
			localStorage.setItem('session_id', sessionId);
		}
	}

	return sessionId;
}

/**
 * Log un événement (no-op: table events supprimée, single-user site)
 */
export async function logEvent(
	_supabase: SupabaseClient<Database>,
	_eventName: string,
	_metadata: Record<string, unknown> = {},
	_userId: string | null = null,
	_page?: string
): Promise<void> {
	// No-op: events table dropped for single-user site
}

/**
 * Détermine le type d'utilisateur basé sur l'URL et localStorage
 */
function getUserTypeFromContext(): 'pastry' | 'client' | 'visitor' {
	if (typeof window === 'undefined') {
		return 'visitor';
	}

	const pathname = window.location.pathname;

	// 1. Détection basée sur l'URL (priorité haute)
	if (pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding')) {
		return 'pastry';
	}

	// 2. Détection basée sur localStorage (popup home page)
	const popupAnswer = localStorage.getItem('Jennynbevent_cake_designer_popup_answered');
	if (popupAnswer === 'createur') {
		return 'pastry';
	}
	if (popupAnswer === 'gourmand') {
		return 'client';
	}

	// 3. Détection basée sur les routes client
	if (
		pathname.match(/^\/[^\/]+$/) || // /slug (boutique)
		pathname.startsWith('/gateaux') ||
		pathname.startsWith('/patissiers') ||
		pathname.match(/^\/[^\/]+\/product\/[^\/]+$/) // /slug/product/id
	) {
		return 'client';
	}

	// 4. Par défaut : visitor
	return 'visitor';
}

/**
 * Tracking de page_view (no-op: table events supprimée, single-user site)
 */
export async function logPageView(
	_supabase: SupabaseClient<Database> | null = null,
	_metadata: Record<string, unknown> = {}
): Promise<void> {
	// No-op: events table dropped for single-user site
}

/**
 * ⚡ VERSION OPTIMISÉE : Fire-and-forget pour ne pas bloquer les actions critiques
 * Utilisez cette fonction dans les actions (signup, createShop, etc.) pour ne pas ralentir la réponse
 */
export function logEventAsync(
	supabase: SupabaseClient<Database>,
	eventName: string,
	metadata: Record<string, unknown> = {},
	userId: string | null = null,
	page?: string
): void {
	// Fire-and-forget : ne pas attendre le résultat
	logEvent(supabase, eventName, metadata, userId, page).catch(() => {
		// Erreur déjà loggée dans logEvent, juste éviter un warning de Promise non catchée
		logger.error('❌ [Analytics] Async tracking failed:', eventName);
	});
}

