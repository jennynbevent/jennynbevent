-- Suivi automatique Mondial Relay
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_label text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_checked_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS relay_arrived_at timestamptz;
