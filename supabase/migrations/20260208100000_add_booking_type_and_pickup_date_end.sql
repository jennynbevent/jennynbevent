-- Add booking_type to products: 'pickup' (single date + time) or 'reservation' (date range).
-- Add pickup_date_end to orders for reservation-type orders (date range end).

ALTER TABLE "public"."products"
ADD COLUMN IF NOT EXISTS "booking_type" text NOT NULL DEFAULT 'pickup'
CHECK (booking_type IN ('pickup', 'reservation'));

COMMENT ON COLUMN "public"."products"."booking_type" IS 'pickup = single pickup date + time slot; reservation = date range (pickup_date to pickup_date_end)';

ALTER TABLE "public"."orders"
ADD COLUMN IF NOT EXISTS "pickup_date_end" date NULL;

COMMENT ON COLUMN "public"."orders"."pickup_date_end" IS 'End date of reservation period; NULL for pickup-type orders.';
