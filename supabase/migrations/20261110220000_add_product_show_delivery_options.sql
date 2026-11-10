-- Affiche « Comment recevoir votre commande » et « Votre QR code » sur la page du produit
ALTER TABLE public.products
	ADD COLUMN IF NOT EXISTS show_delivery_options boolean NOT NULL DEFAULT false;
