import { formatDateTimeForEmail } from '$lib/utils/email-formatters';
import {
    EmailContainer,
    EmailHeader,
    EmailFooter,
    EmailTitle,
    EmailParagraph,
    EmailButton,
    EmailTable,
    EmailNotice,
    EmailOrderVisuals,
    EmailDeliveryNotice,
    EmailSignature,
    amountRows,
    hasBalance,
    euros,
} from './components';
import { EMAIL_SPACING } from './styles';
import type { OrderEmailExtras } from './order-extras';

interface OrderConfirmationProps {
    customerName: string;
    shopName: string;
    shopLogo?: string;
    productName: string;
    pickupDate: string;
    pickupTime?: string | null;
    pickupDateEnd?: string | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount?: number;
    orderId: string;
    orderUrl: string;
    date: string;
    shopColor?: string | null;
    extras?: OrderEmailExtras;
}

/** E-mail client : paiement reçu, commande confirmée et en préparation */
export function OrderConfirmationEmail({
    customerName,
    shopName,
    shopLogo,
    productName,
    pickupDate,
    pickupTime,
    pickupDateEnd,
    totalAmount,
    paidAmount,
    orderId,
    orderUrl,
    date,
    shopColor,
    extras,
}: OrderConfirmationProps) {
    const header = EmailHeader({ logoUrl: shopLogo, logoAlt: shopName, type: 'customer', shopColor });
    const isEmail = extras?.deliveryMode === 'email';
    const when = formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd);

    const title = EmailTitle('Votre commande est confirmée');

    const next = isEmail
        ? 'Votre fichier prêt à imprimer vous sera envoyé par e-mail sous 48 h maximum.'
        : `Elle sera prête pour le <strong>${when}</strong>.`;

    const intro = EmailParagraph(
        `Bonjour ${customerName},<br /><br />Bonne nouvelle : nous avons bien reçu votre paiement et votre commande est désormais en préparation. ${next}`
    );

    const details = EmailTable([
        { label: 'Article', value: productName },
        isEmail
            ? { label: 'Envoi prévu', value: `par e-mail, au plus tard le ${formatDateTimeForEmail(pickupDate, null)}` }
            : { label: pickupDateEnd ? 'Réservation' : 'Date de retrait', value: when },
        ...amountRows(totalAmount, paidAmount, { total: hasBalance(totalAmount, paidAmount) ? 'Total' : 'Total réglé' }),
    ]);

    const balance = hasBalance(totalAmount, paidAmount)
        ? EmailNotice(
              'Reste à régler',
              `Le solde de <strong>${euros(totalAmount - paidAmount)}</strong> sera à régler lors du retrait de votre commande.`,
              shopColor
          )
        : '';

    const cta = `
        <div style="text-align: center; margin: ${EMAIL_SPACING.xl} 0;">
            ${EmailButton({ href: orderUrl, text: 'Voir ma commande', variant: 'primary', shopColor })}
        </div>
    `;

    const footer = EmailFooter({ orderId, date, showOrderId: true, showRequestId: false });

    return EmailContainer(
        `
            ${header}
            ${title}
            ${intro}
            ${EmailOrderVisuals(extras, productName)}
            ${details}
            ${isEmail ? '' : EmailDeliveryNotice(extras, 'confirmed', shopColor)}
            ${balance}
            ${cta}
            ${EmailSignature(shopName)}
            ${footer}
        `,
        shopColor
    );
}
