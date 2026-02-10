-- Allow shops to show all time slots to clients even when already reserved,
-- so multiple customers can pick up at the same slot (e.g. group pickup).
ALTER TABLE "public"."shops"
  ADD COLUMN IF NOT EXISTS "allow_multiple_pickups_per_slot" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."shops"."allow_multiple_pickups_per_slot" IS 'Si true, tous les créneaux sont proposés aux clients, même déjà réservés (récupération groupée).';
