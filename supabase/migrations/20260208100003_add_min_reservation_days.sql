-- Add min_reservation_days to products: for booking_type = 'reservation',
-- the chosen date range (pickup_date to pickup_date_end) must cover at least this many days (inclusive).

ALTER TABLE "public"."products"
ADD COLUMN IF NOT EXISTS "min_reservation_days" integer NOT NULL DEFAULT 1
CHECK (min_reservation_days >= 0);

COMMENT ON COLUMN "public"."products"."min_reservation_days" IS 'For booking_type = reservation: minimum duration of the date range in days (inclusive). 0 = no minimum.';
