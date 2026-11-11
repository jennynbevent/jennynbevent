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
} from './components';
import { EMAIL_SPACING } from './styles';
import type { OrderEmailExtras } from './order-extras';

interface OrderPendingVerificationClientProps {
    customerName: string;
    shopName: string;
    shopLogo?: string;
    productName: string;
    pickupDate: string;
    pickupTime?: string | null;
    pickupDateEnd?: string | null;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    orderId: string;
    orderUrl: string;
    orderRef: string;
    date: string;
    shopColor?: string | null;
    extras?: OrderEmailExtras;
}

/** E-mail client : commande enregistrée, paiement en cours de vérification */
export function OrderPendingVerificationClientEmail({
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
    orderRef,
    date,
    shopColor,
    extras,
}: OrderPendingVerificationClientProps) {
    const header = EmailHeader({ logoUrl: shopLogo, logoAlt: shopName, type: 'customer', shopColor });
    const isEmail = extras?.deliveryMode === 'email';

    const title = EmailTitle('Merci pour votre commande !');

    const intro = EmailParagraph(
        `Bonjour ${customerName},<br /><br />Nous avons bien reçu votre commande chez <strong>${shopName}</strong> et nous vous en remercions. Nous vérifions votre paiement et vous confirmons sa prise en charge par e-mail dans les plus brefs délais.`
    );

    const payment = EmailNotice(
        'Paiement en cours de vérification',
        `Votre référence de commande est <strong>${orderRef}</strong>. Si ce n’est pas déjà fait, indiquez-la dans le message de votre paiement : elle nous permet de l’identifier rapidement.`,
        shopColor
    );

    const details = EmailTable([
        { label: 'Article', value: productName },
        isEmail
            ? { label: 'Envoi prévu', value: `par e-mail, au plus tard le ${formatDateTimeForEmail(pickupDate, null)}` }
            : { label: pickupDateEnd ? 'Réservation' : 'Date de retrait', value: formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd) },
        ...amountRows(totalAmount, paidAmount),
    ]);

    const cta = `
        <div style="text-align: center; margin: ${EMAIL_SPACING.xl} 0;">
            ${EmailButton({ href: orderUrl, text: 'Suivre ma commande', variant: 'primary', shopColor })}
        </div>
    `;

    const footer = EmailFooter({ orderId, date, showOrderId: true, showRequestId: false });

    return EmailContainer(
        `
            ${header}
            ${title}
            ${intro}
            ${payment}
            ${EmailOrderVisuals(extras, productName)}
            ${details}
            ${EmailDeliveryNotice(extras, 'pending', shopColor)}
            ${cta}
            ${EmailSignature(shopName)}
            ${footer}
        `,
        shopColor
    );
}
