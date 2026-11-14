import { formatDateTimeForEmail } from '$lib/utils/email-formatters';
import { EmailContainer, EmailHeader, EmailFooter, EmailTitle, EmailParagraph, EmailButton, EmailTable, EmailOrderVisuals, amountRows, euros } from './components';
import type { OrderEmailExtras } from './order-extras';
import { EMAIL_SPACING, EMAIL_COLORS, EMAIL_TYPOGRAPHY } from './styles';

interface OrderPendingVerificationPastryProps {
    customerName: string;
    customerEmail: string;
    customerInstagram?: string;
    productName: string;
    pickupDate: string;
    pickupTime?: string | null;
    pickupDateEnd?: string | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    orderId: string;
    orderRef: string;
    dashboardUrl: string;
    date: string;
    extras?: OrderEmailExtras;
}

export function OrderPendingVerificationPastryEmail({
    customerName,
    customerEmail,
    customerInstagram,
    productName,
    pickupDate,
    pickupTime,
    pickupDateEnd,
    totalAmount,
    paidAmount,
    remainingAmount,
    orderId,
    orderRef,
    dashboardUrl,
    date,
    extras,
}: OrderPendingVerificationPastryProps) {
    const header = EmailHeader({
        logoUrl: undefined,
        logoAlt: 'Jennynbevent',
        type: 'pastry',
    });

    const title = EmailTitle('Nouvelle commande - Action requise');

    const intro = EmailParagraph(
        `Vous avez reçu une nouvelle commande de <strong>${customerName}</strong>.<br /><br /><strong>Vérifiez la réception du paiement avant de commencer la préparation.</strong>`
    );

    const warning = `
        <div style="margin: ${EMAIL_SPACING.lg} 0; padding: ${EMAIL_SPACING.lg}; border-radius: ${EMAIL_SPACING.md}; border-left: 3px solid ${EMAIL_COLORS.accent.primary}; background-color: ${EMAIL_COLORS.accent.light50};">
            <h3 style="margin: 0 0 ${EMAIL_SPACING.md} 0; color: ${EMAIL_COLORS.neutral[900]}; font-size: 16px; font-weight: 600;">Vérification du paiement</h3>
            <ol style="margin: 0; padding-left: 20px; list-style: decimal; color: ${EMAIL_COLORS.neutral[700]};">
                <li style="margin-bottom: ${EMAIL_SPACING.sm};">Ouvrez votre compte de paiement (PayPal, Revolut ou Wero)</li>
                <li style="margin-bottom: ${EMAIL_SPACING.sm};">Recherchez un paiement de <strong>${euros(paidAmount)}</strong> avec la référence : <code style="font-family: monospace; background-color: white; padding: 4px 8px; border-radius: 4px; font-size: 13px;">${orderRef}</code></li>
                <li>Une fois vérifié, validez la commande sur votre dashboard Jennynbevent</li>
            </ol>
        </div>
    `;

    const customerInfoRows = [
        { label: 'Nom', value: customerName },
        { label: 'Email', value: `<a href="mailto:${customerEmail}" style="color: ${EMAIL_COLORS.accent.primary};">${customerEmail}</a>` },
    ];
    if (customerInstagram) {
        customerInfoRows.push({ label: 'Instagram', value: `<a href="https://instagram.com/${customerInstagram.replace('@', '')}" style="color: ${EMAIL_COLORS.accent.primary};">${customerInstagram}</a>` });
    }
    const customerInfo = EmailTable(customerInfoRows);

    const orderDetails = EmailTable([
        { label: 'Article', value: productName },
        { label: pickupDateEnd ? 'Information de réservation' : 'Date de retrait', value: formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd) },
        ...(extras?.deliveryMode ? [{ label: 'Remise', value: extras.deliveryMode === 'email' ? 'Par e-mail (fichier à imprimer, sous 48 h)' : extras.deliveryMode === 'relais' ? 'Livraison en Point Relais' : 'Retrait à Andrésy' }] : []),
        ...amountRows(totalAmount, paidAmount, { total: 'Total', paid: 'Acompte à vérifier' }),
    ]);

    const ctaSection = `
        <div style="text-align: center; margin: ${EMAIL_SPACING['2xl']} 0;">
            <p style="margin-bottom: ${EMAIL_SPACING.md}; color: ${EMAIL_COLORS.neutral[700]}; font-size: 14px;">Une fois le paiement vérifié, validez-le sur votre tableau de bord</p>
            ${EmailButton({
        href: dashboardUrl,
        text: 'Valider le paiement',
        variant: 'primary',
    })}
        </div>
    `;

    const footer = EmailFooter({
        orderId,
        date,
        showOrderId: true,
        showRequestId: false,
    });

    // Ajouter orderRef au footer
    const footerWithRef = footer.replace(
        '</div>',
        `<p style="color: ${EMAIL_COLORS.neutral[600]}; font-size: ${EMAIL_TYPOGRAPHY.fontSize.sm}; margin: ${EMAIL_SPACING.xs} 0;"><strong style="font-weight: ${EMAIL_TYPOGRAPHY.fontWeight.medium};">Référence de paiement :</strong> ${orderRef}</p></div>`
    );

    return EmailContainer(
        `
            ${header}
            ${title}
            ${intro}
            ${warning}
            ${EmailOrderVisuals(extras, productName)}
            ${customerInfo}
            ${orderDetails}
            ${ctaSection}
            ${footerWithRef}
        `
    );
}

