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

interface OrderReadyProps {
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

/** E-mail client : la commande est prête (avec le fichier PDF en pièce jointe si ajouté) */
export function OrderReadyEmail({
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
}: OrderReadyProps) {
    const header = EmailHeader({ logoUrl: shopLogo, logoAlt: shopName, type: 'customer', shopColor });
    const isEmail = extras?.deliveryMode === 'email';
    const hasFile = (extras?.attachments?.length ?? 0) > 0;
    const when = formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd);

    const title = EmailTitle('Votre commande est prête ! 🎉');

    let message: string;
    if (hasFile) {
        message = `Bonne nouvelle : votre commande est prête ! Vous trouverez votre fichier prêt à imprimer <strong>en pièce jointe de cet e-mail</strong>.`;
        if (!isEmail) message += ` Votre commande vous attend également pour le <strong>${when}</strong>.`;
    } else if (isEmail) {
        message = `Bonne nouvelle : votre commande est prête ! Votre fichier prêt à imprimer vous est envoyé par e-mail.`;
    } else {
        message = `Bonne nouvelle : votre commande est prête et vous attend pour le <strong>${when}</strong>.`;
    }

    const intro = EmailParagraph(`Bonjour ${customerName},<br /><br />${message}`);

    const printTips = hasFile
        ? EmailNotice(
              'Conseils d’impression',
              'Imprimez votre fichier à 100 % (taille réelle), sans « ajuster à la page », de préférence sur un papier épais ou cartonné pour un rendu optimal.',
              shopColor
          )
        : '';

    const details = EmailTable([
        { label: 'Article', value: productName },
        ...(isEmail ? [] : [{ label: pickupDateEnd ? 'Réservation' : 'Date de retrait', value: when }]),
        ...amountRows(totalAmount, paidAmount, { total: hasBalance(totalAmount, paidAmount) ? 'Total' : 'Total réglé' }),
    ]);

    const balance = hasBalance(totalAmount, paidAmount)
        ? EmailNotice(
              'Reste à régler',
              `Pensez à prévoir le solde de <strong>${euros(totalAmount - paidAmount)}</strong> lors du retrait.`,
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
            ${printTips}
            ${EmailOrderVisuals(extras, productName)}
            ${details}
            ${isEmail ? '' : EmailDeliveryNotice(extras, 'ready', shopColor)}
            ${balance}
            ${cta}
            ${EmailSignature(shopName)}
            ${footer}
        `,
        shopColor
    );
}
