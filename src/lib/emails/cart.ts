import { formatDateTimeForEmail } from '$lib/utils/email-formatters';
import { PICKUP_ADDRESS, PICKUP_MAPS_URL } from '$lib/utils/delivery';
import {
	EmailContainer,
	EmailHeader,
	EmailTitle,
	EmailParagraph,
	EmailButton,
	EmailNotice,
	EmailSignature,
	emailImage,
	euros,
} from './components';
import { EMAIL_COLORS, EMAIL_SPACING } from './styles';
import { escapeHtml } from './contact-message';
import type { RelayPoint } from '$lib/delivery/settings';

export type CartEmailLine = {
	name: string;
	image?: string | null;
	price: number;
	mode: 'print' | 'email';
	lines: string[];
};

export type CartEmailData = {
	customerName: string;
	shopName: string;
	shopLogo?: string | null;
	shopColor?: string | null;
	items: CartEmailLine[];
	total: number;
	cartRef: string;
	pickupDate?: string | null;
	pickupTime?: string | null;
	url: string;
	relay?: RelayPoint | null; // livraison en Point Relais
	shippingFee?: number | null;
};

function relayHtml(r: RelayPoint): string {
	return `<strong>${escapeHtml(r.name)}</strong><br />${escapeHtml(r.address)}<br />${escapeHtml(r.zip)} ${escapeHtml(r.city)}`;
}

function shippingLine(d: CartEmailData): string {
	if (!d.relay) return '';
	const fee = Number(d.shippingFee) || 0;
	return `<p style="margin: 0 0 4px 0; text-align: right; font-size: 14px; color: ${EMAIL_COLORS.neutral[700]};">Livraison Point Relais : <strong>${fee > 0 ? euros(fee) : 'offerte'}</strong></p>`;
}

function itemsTable(items: CartEmailLine[], relay = false): string {
	const rows = items
		.map((it) => {
			const img = it.image
				? `<img src="${escapeHtml(emailImage(it.image, 'f_jpg,q_auto,w_120,h_120,c_fill'))}" alt="" width="60" height="60" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover; display: block;" />`
				: `<div style="width: 60px; height: 60px; border-radius: 8px; background: #F3E6EA;"></div>`;
			const mode = it.mode === 'email' ? '✉️ Par e-mail, sous 48 h' : relay ? '📦 Livraison en Point Relais' : '📍 Retrait à Andrésy';
			const details = [...it.lines.map(escapeHtml), mode].join('<br />');
			return `
				<tr>
					<td style="padding: 10px 10px 10px 0; vertical-align: top; width: 60px;">${img}</td>
					<td style="padding: 10px 0; vertical-align: top; font-size: 14px; color: ${EMAIL_COLORS.neutral[800]};">
						<strong>${escapeHtml(it.name)}</strong>
						<div style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 12.5px; line-height: 150%; margin-top: 2px;">${details}</div>
					</td>
					<td style="padding: 10px 0 10px 10px; vertical-align: top; text-align: right; white-space: nowrap; font-size: 14px; font-weight: 600;">${euros(it.price)}</td>
				</tr>`;
		})
		.join(`<tr><td colspan="3" style="border-top: 1px solid ${EMAIL_COLORS.neutral[200]}; height: 0; line-height: 0;"></td></tr>`);
	return `
		<table role="presentation" style="width: 100%; border-collapse: collapse; margin: ${EMAIL_SPACING.lg} 0 ${EMAIL_SPACING.sm} 0;">
			${rows}
			<tr><td colspan="3" style="border-top: 2px solid ${EMAIL_COLORS.neutral[200]};"></td></tr>
		</table>
	`;
}

function totalLine(total: number, label: string): string {
	return `<p style="margin: 0 0 ${EMAIL_SPACING.lg} 0; text-align: right; font-size: 16px; color: ${EMAIL_COLORS.neutral[900]};">${label} <strong>${euros(total)}</strong></p>`;
}

function remiseNotices(d: CartEmailData, shopColor?: string | null): string {
	const hasPrint = d.items.some((i) => i.mode === 'print');
	const hasEmail = d.items.some((i) => i.mode === 'email');
	let html = '';
	if (hasPrint && d.relay) {
		html += EmailNotice(
			'Livraison en Point Relais',
			`Votre colis sera envoyé au Point Relais :<br />${relayHtml(d.relay)}<br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Vous recevrez le numéro de suivi par e-mail dès l’envoi.</span>`,
			shopColor
		);
	} else if (hasPrint && d.pickupDate) {
		html += EmailNotice(
			'Retrait de votre commande',
			`Le <strong>${formatDateTimeForEmail(d.pickupDate, d.pickupTime)}</strong>, à l’adresse suivante :<br /><a href="${PICKUP_MAPS_URL}" style="color: ${EMAIL_COLORS.neutral[900]}; font-weight: 600; text-decoration: underline;">${PICKUP_ADDRESS}</a><br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Nous vous prévenons par e-mail dès que votre commande est prête.</span>`,
			shopColor
		);
	}
	if (hasEmail) {
		html += EmailNotice('Envoi par e-mail', 'Vos fichiers prêts à imprimer vous seront envoyés par e-mail sous 48 h maximum.', shopColor);
	}
	return html;
}

/** Client : commande reçue (paiement à vérifier) ou confirmée (paiement par carte) */
export function CartCustomerEmail(d: CartEmailData & { stage: 'pending' | 'confirmed' }): string {
	const title =
		d.stage === 'confirmed' ? EmailTitle('Votre commande est confirmée') : EmailTitle('Nous avons bien reçu votre commande');
	const intro =
		d.stage === 'confirmed'
			? `Bonjour ${escapeHtml(d.customerName)},<br /><br />Merci pour votre commande ! Votre paiement est bien reçu et nous commençons la préparation.`
			: `Bonjour ${escapeHtml(d.customerName)},<br /><br />Merci pour votre commande ! Nous vérifions votre paiement et nous vous confirmons tout très vite par e-mail.`;
	return EmailContainer(
		`
		${EmailHeader({ logoUrl: d.shopLogo || undefined, logoAlt: escapeHtml(d.shopName), type: 'customer', shopColor: d.shopColor })}
		${title}
		${EmailParagraph(intro)}
		${itemsTable(d.items, !!d.relay)}
		${shippingLine(d)}
		${totalLine(d.total, d.stage === 'confirmed' ? 'Total réglé :' : 'Total :')}
		${remiseNotices(d, d.shopColor)}
		<div style="text-align: center; margin: ${EMAIL_SPACING.xl} 0;">${EmailButton({ href: d.url, text: 'Voir ma commande', shopColor: d.shopColor })}</div>
		${EmailSignature(escapeHtml(d.shopName))}
		<p style="text-align: center; color: ${EMAIL_COLORS.neutral[500]}; font-size: 12px; margin-top: ${EMAIL_SPACING.lg};">Commande n° ${escapeHtml(d.cartRef)}</p>
	`,
		d.shopColor
	);
}

/** Pour toi : nouvelle commande (panier) */
export function CartOwnerEmail(
	d: CartEmailData & { customerEmail: string; customerPhone?: string | null; paidByCard: boolean; info?: string | null }
): string {
	const contact = [escapeHtml(d.customerName), escapeHtml(d.customerEmail), d.customerPhone ? escapeHtml(d.customerPhone) : '']
		.filter(Boolean)
		.join(' · ');
	return EmailContainer(`
		${EmailHeader({ logoUrl: undefined, logoAlt: 'Jnb Event', type: 'pastry' })}
		${EmailTitle('🛍️ Nouvelle commande !')}
		${EmailParagraph(`${contact}<br /><span style="color: ${EMAIL_COLORS.neutral[500]};">${d.items.length} article${d.items.length > 1 ? 's' : ''} · ${d.paidByCard ? 'payé par carte' : 'paiement à vérifier'}</span>`)}
		${itemsTable(d.items, !!d.relay)}
		${shippingLine(d)}
		${totalLine(d.total, 'Total :')}
		${d.relay ? EmailParagraph(`📦 À envoyer en Point Relais : ${relayHtml(d.relay)}`) : ''}
		${!d.relay && d.pickupDate && d.items.some((i) => i.mode === 'print') ? EmailParagraph(`📍 Retrait le <strong>${formatDateTimeForEmail(d.pickupDate, d.pickupTime)}</strong>`) : ''}
		${d.info ? EmailNotice('Informations du client', escapeHtml(d.info).replace(/\n/g, '<br />')) : ''}
		<div style="text-align: center; margin: ${EMAIL_SPACING.xl} 0;">${EmailButton({ href: d.url, text: 'Voir la commande' })}</div>
	`);
}

/** Client : « Votre colis est en route » (avec le numéro de suivi) */
export function ParcelShippedEmail(d: {
	customerName: string;
	shopName: string;
	shopLogo?: string | null;
	shopColor?: string | null;
	items: string[];
	relay: RelayPoint;
	tracking: string;
	trackingUrl: string | null;
	orderRef: string;
	url: string;
}): string {
	const list = d.items.map((n) => `• ${escapeHtml(n)}`).join('<br />');
	return EmailContainer(
		`
		${EmailHeader({ logoUrl: d.shopLogo || undefined, logoAlt: escapeHtml(d.shopName), type: 'customer', shopColor: d.shopColor })}
		${EmailTitle('📦 Votre colis est en route !')}
		${EmailParagraph(`Bonjour ${escapeHtml(d.customerName)},<br /><br />Bonne nouvelle : votre commande vient d’être déposée chez Mondial Relay.<br /><br />${list}`)}
		${EmailNotice(
			'Numéro de suivi',
			`<strong style="font-size: 16px; letter-spacing: 0.5px;">${escapeHtml(d.tracking)}</strong><br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Livraison en général sous 3 à 5 jours ouvrés.</span>`,
			d.shopColor
		)}
		${d.trackingUrl ? `<div style="text-align: center; margin: ${EMAIL_SPACING.lg} 0;">${EmailButton({ href: d.trackingUrl, text: 'Suivre mon colis', shopColor: d.shopColor })}</div>` : ''}
		${EmailNotice('Votre Point Relais', `${relayHtml(d.relay)}<br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Mondial Relay vous préviendra par SMS ou e-mail dès que le colis est arrivé. Pensez à prendre une pièce d’identité pour le retirer.</span>`, d.shopColor)}
		${EmailSignature(escapeHtml(d.shopName))}
		<p style="text-align: center; color: ${EMAIL_COLORS.neutral[500]}; font-size: 12px; margin-top: ${EMAIL_SPACING.lg};">Commande n° ${escapeHtml(d.orderRef)} · <a href="${escapeHtml(d.url)}" style="color: ${EMAIL_COLORS.neutral[500]};">voir ma commande</a></p>
	`,
		d.shopColor
	);
}

/** Client : « Votre colis vous attend au Point Relais » */
export function ParcelArrivedEmail(d: {
	customerName: string;
	shopName: string;
	shopLogo?: string | null;
	shopColor?: string | null;
	relay: RelayPoint;
	tracking: string;
	trackingUrl: string | null;
	orderRef: string;
}): string {
	return EmailContainer(
		`
		${EmailHeader({ logoUrl: d.shopLogo || undefined, logoAlt: escapeHtml(d.shopName), type: 'customer', shopColor: d.shopColor })}
		${EmailTitle('🎉 Votre colis vous attend !')}
		${EmailParagraph(`Bonjour ${escapeHtml(d.customerName)},<br /><br />Votre colis est arrivé au Point Relais. Vous pouvez aller le chercher dès maintenant.`)}
		${EmailNotice('Votre Point Relais', `${relayHtml(d.relay)}<br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Pensez à prendre une pièce d’identité. Le colis reste disponible environ 10 jours.</span>`, d.shopColor)}
		${d.trackingUrl ? `<div style="text-align: center; margin: ${EMAIL_SPACING.lg} 0;">${EmailButton({ href: d.trackingUrl, text: 'Voir le suivi', shopColor: d.shopColor })}</div>` : ''}
		${EmailSignature(escapeHtml(d.shopName))}
		<p style="text-align: center; color: ${EMAIL_COLORS.neutral[500]}; font-size: 12px; margin-top: ${EMAIL_SPACING.lg};">Commande n° ${escapeHtml(d.orderRef)} · Suivi ${escapeHtml(d.tracking)}</p>
	`,
		d.shopColor
	);
}
