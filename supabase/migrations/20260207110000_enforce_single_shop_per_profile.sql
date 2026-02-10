-- Single-user app: one shop per profile max.
-- Ensure no duplicate profile_id before adding constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM shops
    GROUP BY profile_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(profile_id): duplicate profile_id found in shops. Clean up manually first.';
  END IF;
END $$;

ALTER TABLE shops ADD CONSTRAINT shops_profile_id_key UNIQUE (profile_id);

COMMENT ON CONSTRAINT shops_profile_id_key ON shops IS 'Single-user app: at most one shop per profile.';
