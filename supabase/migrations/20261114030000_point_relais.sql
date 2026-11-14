-- Livraison en Point Relais (Mondial Relay)
-- Réglages de livraison de la boutique (activée, prix par taille de colis, livraison offerte dès…)
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS delivery_settings jsonb;

-- Taille de colis de chaque article : small / medium / large / pickup_only
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parcel_size text DEFAULT 'medium';

-- Expédition d'une commande
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_relay jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_fee numeric(10,2);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS parcel_size text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
