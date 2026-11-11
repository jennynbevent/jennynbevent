/**
 * Composants réutilisables pour les emails
 * Style épuré inspiré de la homepage marketing
 */

import { PUBLIC_SITE_URL } from '$env/static/public';
import { EMAIL_COLORS, EMAIL_TYPOGRAPHY, EMAIL_SPACING, EMAIL_BORDER_RADIUS, EMAIL_MAX_WIDTH, getShopColors } from './styles';
import type { OrderEmailExtras } from './order-extras';
import { PICKUP_ADDRESS, PICKUP_MAPS_URL } from '$lib/utils/delivery';

interface EmailHeaderProps {
	logoUrl?: string;
	logoAlt: string;
	type: 'customer' | 'pastry'; // Pour adapter le style
	shopColor?: string | null; // Couleur de la boutique (pour les emails clients)
}

interface EmailFooterProps {
	orderId?: string;
	requestId?: string;
	date: string;
	showOrderId?: boolean;
	showRequestId?: boolean;
}

interface EmailButtonProps {
	href: string;
	text: string;
	variant?: 'primary' | 'outline';
	shopColor?: string | null; // Pour les emails clients
}

interface EmailSectionProps {
	title?: string;
	children: string;
	showBorder?: boolean;
}

/**
 * Header épuré pour les emails
 * - Logo boutique (grand) pour les clients
 * - Logo Jennynbevent (petit, discret) pour les pâtissiers
 */
export function EmailHeader({ logoUrl, logoAlt, type, shopColor }: EmailHeaderProps): string {
	const isCustomer = type === 'customer';
	const logoSize = isCustomer ? '60px' : '30px';
	const logoMargin = isCustomer ? EMAIL_SPACING.xl : EMAIL_SPACING.lg;

	// Pour les clients, utiliser le logo de la boutique ou Jennynbevent par défaut
	// Pour les pâtissiers, toujours utiliser Jennynbevent
	const finalLogoUrl = isCustomer
		? (logoUrl || `${PUBLIC_SITE_URL}/images/logo_jennynbevent.jpg`)
		: `${PUBLIC_SITE_URL}/images/logo_jennynbevent.jpg`;

	return `
		<div style="text-align: center; margin-bottom: ${logoMargin}; padding-top: ${EMAIL_SPACING.xl};">
			<img
				src="${finalLogoUrl}"
				alt="${logoAlt}"
				style="height: ${logoSize}; margin-bottom: ${EMAIL_SPACING.sm}; display: inline-block;"
			/>
			${isCustomer ? `
				<div style="height: 1px; background-color: ${EMAIL_COLORS.neutral[200]}; margin: ${EMAIL_SPACING.lg} auto; max-width: 120px;"></div>
			` : ''}
		</div>
	`;
}

/**
 * Footer minimaliste pour les emails
 */
export function EmailFooter({ orderId, requestId, date, showOrderId = true, showRequestId = true }: EmailFooterProps): string {
	return `
		<div style="text-align: center; margin-top: ${EMAIL_SPACING['2xl']}; padding-top: ${EMAIL_SPACING.lg}; border-top: 1px solid ${EMAIL_COLORS.neutral[200]};">
			${showOrderId && orderId ? `
				<p style="color: ${EMAIL_COLORS.neutral[600]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.sm}; margin: ${EMAIL_SPACING.xs} 0;">
					<strong style="font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium};">Numéro de commande :</strong> ${orderId.slice(0, 8)}
				</p>
			` : ''}
			${showRequestId && requestId ? `
				<p style="color: ${EMAIL_COLORS.neutral[600]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.sm}; margin: ${EMAIL_SPACING.xs} 0;">
					<strong style="font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium};">Numéro de demande :</strong> ${requestId.slice(0, 8)}
				</p>
			` : ''}
			<p style="color: ${EMAIL_COLORS.neutral[500]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.xs}; margin-top: ${EMAIL_SPACING.sm};">
				${date}
			</p>
		</div>
	`;
}

/**
 * Bouton épuré pour les emails
 * Style minimaliste inspiré de la homepage
 */
export function EmailButton({ href, text, variant = 'primary', shopColor }: EmailButtonProps): string {
	const colors = shopColor ? getShopColors(shopColor) : EMAIL_COLORS.accent;

	if (variant === 'outline') {
		// Style outline (comme la homepage)
		return `
			<a
				href="${href}"
				style="display: inline-block; padding: 14px 28px; border: 2px solid ${colors.primary}; color: ${colors.primary}; text-decoration: none; border-radius: ${EMAIL_BORDER_RADIUS.xl}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.base}; transition: all 0.3s ease;"
			>
				${text}
			</a>
		`;
	}

	// Style primary (fond coloré)
	return `
		<a
			href="${href}"
			style="display: inline-block; padding: 14px 28px; background-color: ${colors.primary}; color: white; text-decoration: none; border-radius: ${EMAIL_BORDER_RADIUS.xl}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.base}; transition: all 0.3s ease; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);"
		>
			${text}
		</a>
	`;
}

/**
 * Section de contenu épurée
 * Style minimaliste avec espacement généreux
 */
export function EmailSection({ title, children, showBorder = false }: EmailSectionProps): string {
	const borderStyle = showBorder
		? `border-top: 1px solid ${EMAIL_COLORS.neutral[200]}; padding-top: ${EMAIL_SPACING.lg};`
		: '';

	return `
		<div style="margin-bottom: ${EMAIL_SPACING.lg}; ${borderStyle}">
			${title ? `
				<h3 style="color: ${EMAIL_COLORS.neutral[900]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.xl}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.semibold}; letter-spacing: ${EMAIL_TYPOGRAPHY.letterSpacing.normal}; margin: 0 0 ${EMAIL_SPACING.md} 0; line-height: ${EMAIL_TYPOGRAPHY.lineHeight.tight};">
					${title}
				</h3>
			` : ''}
			<div style="color: ${EMAIL_COLORS.neutral[700]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.base}; line-height: ${EMAIL_TYPOGRAPHY.lineHeight.relaxed}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.normal}; letter-spacing: ${EMAIL_TYPOGRAPHY.letterSpacing.wide};">
				${children}
			</div>
		</div>
	`;
}

/**
 * Container principal pour tous les emails
 * Style épuré inspiré de la homepage avec dégradé subtil en arrière-plan
 */
export function EmailContainer(children: string, shopColor?: string | null): string {
	// Pour les emails clients : utiliser la couleur light de la boutique
	// Pour les emails pâtissiers : utiliser la couleur par défaut Jennynbevent
	const colors = shopColor ? getShopColors(shopColor) : EMAIL_COLORS.accent;

	// Dégradé subtil inspiré du hero de la homepage
	// Le hero utilise from-[#BB91A4]/30 via-transparent to-transparent
	// Pour les emails clients, on adapte la couleur selon la boutique
	const gradientColor = shopColor ? colors.light : EMAIL_COLORS.accent.light;

	// Convertir hex en rgb pour rgba (format: #BB91A4 -> rgba(255, 232, 214, 0.3))
	const hexToRgb = (hex: string) => {
		// Retirer le # si présent
		const cleanHex = hex.replace('#', '');
		const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
		return result
			? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16),
			}
			: null;
	};

	const rgb = hexToRgb(gradientColor);
	// Opacité de 30% comme le hero, mais adaptée pour les emails (un peu plus subtile)
	const gradientRgba = rgb
		? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)` // Opacité subtile pour les emails
		: `rgba(255, 232, 214, 0.25)`; // Fallback couleur Jennynbevent (#BB91A4)

	return `
		<div style="background: linear-gradient(to bottom, ${gradientRgba} 0%, transparent 60%); min-height: 100vh; padding: ${EMAIL_SPACING.xl} 0;">
			<div style="font-family: ${EMAIL_TYPOGRAPHY.fontFamily}; color: ${EMAIL_COLORS.neutral[900]}; max-width: ${EMAIL_MAX_WIDTH}; margin: 0 auto; padding: ${EMAIL_SPACING.xl} ${EMAIL_SPACING.lg}; background-color: white; border-radius: ${EMAIL_BORDER_RADIUS.xl}; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
				${children}
			</div>
		</div>
	`;
}

/**
 * Titre principal pour les emails
 * Style premium inspiré de la homepage
 */
export function EmailTitle(text: string, color?: string): string {
	const titleColor = color || EMAIL_COLORS.neutral[900];
	return `
		<h2 style="color: ${titleColor}; margin: 0 0 ${EMAIL_SPACING.md} 0; font-size: ${EMAIL_TYPOGRAPHY.fontSize['2xl']}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.semibold}; letter-spacing: ${EMAIL_TYPOGRAPHY.letterSpacing.tight}; line-height: ${EMAIL_TYPOGRAPHY.lineHeight.tight};">
			${text}
		</h2>
	`;
}

/**
 * Paragraphe épuré avec espacement généreux
 */
export function EmailParagraph(text: string, style: string = ''): string {
	return `
		<p style="margin: 0 0 ${EMAIL_SPACING.md} 0; color: ${EMAIL_COLORS.neutral[700]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.base}; line-height: ${EMAIL_TYPOGRAPHY.lineHeight.relaxed}; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.normal}; letter-spacing: ${EMAIL_TYPOGRAPHY.letterSpacing.wide}; ${style}">
			${text}
		</p>
	`;
}

/**
 * Séparateur élégant (style homepage)
 */
export function EmailSeparator(color?: string): string {
	const separatorColor = color || EMAIL_COLORS.neutral[300];
	return `
		<div style="display: flex; align-items: center; justify-content: center; gap: ${EMAIL_SPACING.md}; margin: ${EMAIL_SPACING.xl} 0;">
			<div style="height: 1px; width: 64px; background-color: ${separatorColor};"></div>
			<div style="height: 6px; width: 6px; border-radius: 50%; background-color: ${color || EMAIL_COLORS.accent.primary};"></div>
			<div style="height: 1px; flex: 1; max-width: 320px; background-color: ${separatorColor};"></div>
		</div>
	`;
}

/**
 * Table épurée pour afficher des informations
 * Style minimaliste sans bordures
 */
export function EmailTable(rows: Array<{ label: string; value: string }>): string {
	return `
		<table style="width: 100%; border-collapse: collapse; margin: ${EMAIL_SPACING.lg} 0;">
			${rows.map(row => `
				<tr>
					<td style="padding: ${EMAIL_SPACING.sm} 0; font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium}; color: ${EMAIL_COLORS.neutral[900]}; width: 140px; vertical-align: top; font-size: ${EMAIL_TYPOGRAPHY.fontSize.sm};">
						${row.label} :
					</td>
					<td style="padding: ${EMAIL_SPACING.sm} 0; color: ${EMAIL_COLORS.neutral[700]}; vertical-align: top; font-size: ${EMAIL_TYPOGRAPHY.fontSize.base};">
						${row.value}
					</td>
				</tr>
			`).join('')}
		</table>
	`;
}

/* ------------------------------------------------------------------ */
/* Blocs communs aux e-mails de commande (Jennynbevent)               */
/* ------------------------------------------------------------------ */


/** Adapte une image Cloudinary pour les e-mails (format lisible partout, taille raisonnable) */
export function emailImage(url: string, transform: string): string {
	if (!url) return url;
	if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
		return url.replace('/upload/', `/upload/${transform}/`);
	}
	return url;
}

/** Montant formaté en euros (ex. 12,50 €) */
export function euros(amount: number | null | undefined): string {
	const n = Number(amount) || 0;
	return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/**
 * Lignes de montants : uniquement le total, sauf si un acompte a été versé
 * (dans ce cas : total, acompte réglé, reste à régler).
 */
export function amountRows(
	totalAmount: number,
	paidAmount: number | null | undefined,
	labels: { total?: string; paid?: string; remaining?: string } = {}
): Array<{ label: string; value: string }> {
	const total = Number(totalAmount) || 0;
	const paid = paidAmount === null || paidAmount === undefined ? total : Number(paidAmount) || 0;
	const remaining = total - paid;
	if (paid > 0 && remaining > 0.009) {
		return [
			{ label: labels.total || 'Total', value: `<strong>${euros(total)}</strong>` },
			{ label: labels.paid || 'Acompte réglé', value: euros(paid) },
			{ label: labels.remaining || 'Reste à régler', value: `<strong>${euros(remaining)}</strong>` },
		];
	}
	return [{ label: labels.total || 'Total', value: `<strong>${euros(total)}</strong>` }];
}

/** Vrai s'il reste un solde à payer */
export function hasBalance(totalAmount: number, paidAmount: number | null | undefined): boolean {
	const total = Number(totalAmount) || 0;
	const paid = paidAmount === null || paidAmount === undefined ? total : Number(paidAmount) || 0;
	return paid > 0 && total - paid > 0.009;
}

/** Visuels : image de l'article commandé + QR code du client */
export function EmailOrderVisuals(extras: OrderEmailExtras | undefined, productName: string): string {
	if (!extras) return '';
	const cells: string[] = [];
	if (extras.productImage) {
		cells.push(`
			<td style="width: 50%; padding: 6px; vertical-align: top; text-align: center;">
				<div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${EMAIL_COLORS.neutral[500]}; margin-bottom: 8px; font-weight: 600;">Votre article</div>
				<img src="${emailImage(extras.productImage, 'f_jpg,q_auto,w_400,h_400,c_fill')}" alt="${productName}" width="200" style="width: 100%; max-width: 200px; border-radius: 10px; border: 1px solid ${EMAIL_COLORS.neutral[200]}; display: inline-block;" />
			</td>`);
	}
	if (extras.qrCodeUrl) {
		cells.push(`
			<td style="width: 50%; padding: 6px; vertical-align: top; text-align: center;">
				<div style="font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: ${EMAIL_COLORS.neutral[500]}; margin-bottom: 8px; font-weight: 600;">Votre QR code</div>
				<img src="${emailImage(extras.qrCodeUrl, 'f_png,w_400,c_limit')}" alt="QR code" width="200" style="width: 100%; max-width: 200px; border-radius: 10px; border: 1px solid ${EMAIL_COLORS.neutral[200]}; background: #ffffff; display: inline-block;" />
			</td>`);
	}
	if (cells.length === 0) return '';
	return `
		<table role="presentation" style="width: 100%; border-collapse: collapse; margin: ${EMAIL_SPACING.lg} 0;">
			<tr>${cells.join('')}</tr>
		</table>
	`;
}

/** Encadré d'information (fond doux, bordure à gauche) */
export function EmailNotice(title: string, html: string, shopColor?: string | null): string {
	const colors = shopColor ? getShopColors(shopColor) : EMAIL_COLORS.accent;
	return `
		<div style="margin: ${EMAIL_SPACING.lg} 0; padding: 18px 20px; border-radius: 12px; border-left: 3px solid ${colors.primary}; background-color: #FBF6F8;">
			<p style="margin: 0 0 6px 0; color: ${EMAIL_COLORS.neutral[900]}; font-size: 15px; font-weight: 600;">${title}</p>
			<div style="margin: 0; color: ${EMAIL_COLORS.neutral[700]}; font-size: 14px; line-height: 160%;">${html}</div>
		</div>
	`;
}

/** Bloc « Remise de la commande » selon le mode choisi par le client */
export function EmailDeliveryNotice(
	extras: OrderEmailExtras | undefined,
	stage: 'pending' | 'confirmed' | 'ready',
	shopColor?: string | null
): string {
	const mode = extras?.deliveryMode;
	if (mode === 'retrait') {
		const intro =
			stage === 'ready'
				? 'Votre commande vous attend à l’adresse suivante :'
				: 'Votre commande sera à retirer à l’adresse suivante :';
		return EmailNotice(
			'Retrait de votre commande',
			`${intro}<br /><a href="${PICKUP_MAPS_URL}" style="color: ${EMAIL_COLORS.neutral[900]}; font-weight: 600; text-decoration: underline;">${PICKUP_ADDRESS}</a><br /><span style="color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">Merci de vous présenter au créneau choisi lors de votre commande. En cas d’empêchement, répondez simplement à cet e-mail.</span>`,
			shopColor
		);
	}
	if (mode === 'email') {
		const text =
			stage === 'ready'
				? 'Votre fichier prêt à imprimer est joint à cet e-mail. Pensez à l’enregistrer et à vérifier le rendu avant impression.'
				: 'Votre fichier prêt à imprimer vous sera envoyé par e-mail sous 48 h maximum.';
		return EmailNotice('Envoi par e-mail', text, shopColor);
	}
	return '';
}

/** Formule de fin d'e-mail */
export function EmailSignature(shopName: string): string {
	return `
		<p style="margin: ${EMAIL_SPACING.lg} 0 0 0; color: ${EMAIL_COLORS.neutral[700]}; font-size: 15px; line-height: 160%;">
			Une question&nbsp;? Répondez simplement à cet e-mail, nous vous répondrons avec plaisir.<br /><br />
			À très bientôt,<br />
			<strong style="color: ${EMAIL_COLORS.neutral[900]};">${shopName}</strong>
		</p>
	`;
}
