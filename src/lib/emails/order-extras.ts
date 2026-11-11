import { getDeliveryMode, getCustomerQrCode, type DeliveryMode } from '$lib/utils/delivery';

/** Informations complémentaires affichées dans les e-mails de commande */
export interface OrderEmailExtras {
	productImage?: string | null;
	qrCodeUrl?: string | null;
	deliveryMode?: DeliveryMode;
	/** Pièces jointes (ex. fichier PDF à imprimer envoyé avec « Commande prête ») */
	attachments?: Array<{ filename: string; content?: Buffer | string; path?: string }>;
}

/** Construit les infos complémentaires à partir d'une commande */
export function buildOrderEmailExtras(
	order: { customization_data?: unknown; inspiration_photos?: unknown } | null | undefined,
	productImage?: string | null
): OrderEmailExtras {
	return {
		productImage: productImage || null,
		qrCodeUrl: getCustomerQrCode(order?.customization_data, order?.inspiration_photos),
		deliveryMode: getDeliveryMode(order?.customization_data),
	};
}
