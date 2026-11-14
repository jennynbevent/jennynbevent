import { EmailContainer, EmailHeader, EmailTitle, EmailParagraph, EmailTable, EmailButton, EmailSignature } from './components';
import { EMAIL_SPACING, EMAIL_COLORS } from './styles';

/** Échappe le texte saisi par un client avant de l'insérer dans un e-mail */
export function escapeHtml(text: string): string {
	return String(text ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function messageBlock(title: string, text: string): string {
	return `
		<div style="margin: ${EMAIL_SPACING.lg} 0; padding: ${EMAIL_SPACING.md}; border-radius: 12px; background-color: ${EMAIL_COLORS.neutral[50]}; border-left: 3px solid ${EMAIL_COLORS.accent.primary};">
			<p style="margin: 0 0 6px 0; color: ${EMAIL_COLORS.neutral[500]}; font-size: 13px;">${title}</p>
			<p style="margin: 0; color: ${EMAIL_COLORS.neutral[800]}; font-size: 15px; line-height: 160%; white-space: pre-wrap;">${escapeHtml(text)}</p>
		</div>
	`;
}

function photosBlock(photos: string[]): string {
	if (!photos.length) return '';
	return `
		<div style="margin: ${EMAIL_SPACING.md} 0;">
			${photos
				.map(
					(url) =>
						`<a href="${escapeHtml(url)}" style="display: inline-block; margin: 0 8px 8px 0;"><img src="${escapeHtml(url)}" alt="Photo" style="width: 120px; height: 120px; object-fit: cover; border-radius: 10px; border: 1px solid ${EMAIL_COLORS.neutral[200]};" /></a>`
				)
				.join('')}
		</div>
	`;
}

/** Pour toi : nouveau message reçu depuis la page Contact */
export function ContactMessageNotificationEmail(p: {
	name: string;
	email: string;
	phone?: string | null;
	message: string;
	photos: string[];
	dashboardUrl: string;
}): string {
	const rows = [
		{ label: 'Nom', value: escapeHtml(p.name) },
		{ label: 'E-mail', value: `<a href="mailto:${escapeHtml(p.email)}" style="color: ${EMAIL_COLORS.accent.primary};">${escapeHtml(p.email)}</a>` },
	];
	if (p.phone) rows.push({ label: 'Téléphone', value: escapeHtml(p.phone) });
	return EmailContainer(`
		${EmailHeader({ logoUrl: undefined, logoAlt: 'Jnb Event', type: 'pastry' })}
		${EmailTitle('💬 Nouveau message')}
		${EmailParagraph(`${escapeHtml(p.name)} vous a écrit depuis la page Contact du site.`)}
		${EmailTable(rows)}
		${messageBlock('Message', p.message)}
		${photosBlock(p.photos)}
		<div style="text-align: center; margin: ${EMAIL_SPACING.xl} 0 ${EMAIL_SPACING.md} 0;">
			${EmailButton({ href: p.dashboardUrl, text: 'Voir le message' })}
		</div>
		${EmailParagraph(`<strong>Pour répondre :</strong> cliquez simplement sur « Répondre » dans votre messagerie, la réponse partira directement à ${escapeHtml(p.name)}.`, 'font-size: 14px; text-align: center;')}
	`);
}

/** Pour le client : copie de son message */
export function ContactMessageCopyEmail(p: {
	name: string;
	message: string;
	shopName: string;
	shopLogo?: string | null;
}): string {
	return EmailContainer(`
		${EmailHeader({ logoUrl: p.shopLogo || undefined, logoAlt: escapeHtml(p.shopName), type: 'customer' })}
		${EmailTitle('Nous avons bien reçu votre message')}
		${EmailParagraph(`Bonjour ${escapeHtml(p.name)},<br />merci pour votre message ! Nous vous répondons très vite par e-mail.`)}
		${messageBlock('Votre message', p.message)}
		${EmailSignature(escapeHtml(p.shopName))}
	`);
}

/** Pour le client : ta réponse écrite depuis l'espace boutique */
export function ContactReplyEmail(p: {
	name: string;
	reply: string;
	originalMessage: string;
	shopName: string;
	shopLogo?: string | null;
}): string {
	return EmailContainer(`
		${EmailHeader({ logoUrl: p.shopLogo || undefined, logoAlt: escapeHtml(p.shopName), type: 'customer' })}
		${EmailParagraph(`Bonjour ${escapeHtml(p.name)},`)}
		<p style="margin: 0 0 ${EMAIL_SPACING.md} 0; color: ${EMAIL_COLORS.neutral[800]}; font-size: 15px; line-height: 165%; white-space: pre-wrap;">${escapeHtml(p.reply)}</p>
		${EmailSignature(escapeHtml(p.shopName))}
		${messageBlock('Votre message', p.originalMessage)}
	`);
}
