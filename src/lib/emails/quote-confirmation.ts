import { formatDateTimeForEmail } from '$lib/utils/email-formatters';
import { EmailContainer, EmailHeader, EmailFooter, EmailTitle, EmailParagraph, EmailButton, EmailTable, EmailSection , amountRows, hasBalance } from './components';
import { EMAIL_SPACING, EMAIL_COLORS } from './styles';

interface QuoteConfirmationProps {
    customerName: string;
    shopName: string;
    shopLogo?: string;
    pickupDate: string;
    pickupTime?: string | null;
    pickupDateEnd?: string | null;
    totalPrice: number;
    depositAmount: number;
    remainingAmount: number;
    orderId: string;
    orderUrl: string;
    date: string;
    shopColor?: string | null;
}

export function QuoteConfirmationEmail({
    customerName,
    shopName,
    shopLogo,
    pickupDate,
    pickupTime,
    pickupDateEnd,
    totalPrice,
    depositAmount,
    remainingAmount,
    orderId,
    orderUrl,
    date,
    shopColor,
}: QuoteConfirmationProps) {
    const header = EmailHeader({
        logoUrl: shopLogo,
        logoAlt: shopName,
        type: 'customer',
        shopColor,
    });

    const title = EmailTitle('Commande confirmée');

    const intro = EmailParagraph(
        `Bonjour ${customerName},<br /><br />Bonne nouvelle : votre commande sur mesure est confirmée et votre paiement a bien été reçu. Elle sera prête pour le <strong>${formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd)}</strong>.`
    );

    const details = EmailTable([
        { label: pickupDateEnd ? 'Information de réservation' : 'Date de retrait', value: formatDateTimeForEmail(pickupDate, pickupTime, pickupDateEnd) },
        ...amountRows(totalPrice, depositAmount),
    ]);

    const important = hasBalance(totalPrice, depositAmount)
        ? EmailSection({ title: 'Reste à régler', children: 'Le solde sera à régler lors du retrait de votre commande.' })
        : '';

    const ctaSection = `
        <div style="text-align: center; margin: ${EMAIL_SPACING['2xl']} 0;">
            <p style="margin-bottom: ${EMAIL_SPACING.md}; color: ${EMAIL_COLORS.neutral[700]}; font-size: 14px;">Retrouvez tous les détails de votre commande</p>
            ${EmailButton({
        href: orderUrl,
        text: 'Voir le récapitulatif',
        variant: 'primary',
        shopColor,
    })}
        </div>
    `;

    const footer = EmailFooter({
        orderId,
        date,
        showOrderId: true,
        showRequestId: false,
    });

    return EmailContainer(
        `
            ${header}
            ${title}
            ${intro}
            ${details}
            ${important}
            ${ctaSection}
            ${footer}
        `,
        shopColor
    );
}