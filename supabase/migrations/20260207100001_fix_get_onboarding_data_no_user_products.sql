-- get_onboarding_data referenced user_products (has_subscription) which was dropped.
-- Replace the function to use only shops and payment_links; has_subscription is always false (single-user site).

CREATE OR REPLACE FUNCTION "public"."get_onboarding_data"("p_profile_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'shop', (
      SELECT json_build_object(
        'id', s.id,
        'name', s.name,
        'bio', s.bio,
        'slug', s.slug,
        'logo_url', s.logo_url,
        'instagram', s.instagram,
        'tiktok', s.tiktok,
        'website', s.website,
        'is_custom_accepted', s.is_custom_accepted,
        'is_active', s.is_active
      )
      FROM shops s
      WHERE s.profile_id = p_profile_id
    ),
    'paypal_account', (
      SELECT json_build_object(
        'id', pl.id,
        'payment_identifier', pl.payment_identifier,
        'provider_type', pl.provider_type,
        'is_active', pl.is_active,
        'created_at', pl.created_at
      )
      FROM payment_links pl
      WHERE pl.profile_id = p_profile_id
        AND (pl.is_active = true OR pl.is_active IS NULL)
      ORDER BY
        CASE WHEN pl.provider_type = 'paypal' THEN 1 ELSE 2 END,
        pl.created_at
      LIMIT 1
    ),
    'has_shop', (
      SELECT count(*) > 0
      FROM shops s
      WHERE s.profile_id = p_profile_id
    ),
    'has_paypal', (
      SELECT count(*) > 0
      FROM payment_links pl
      WHERE pl.profile_id = p_profile_id
        AND (pl.is_active = true OR pl.is_active IS NULL)
    ),
    'has_subscription', false
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION "public"."get_onboarding_data"("p_profile_id" "uuid") IS 'Get onboarding status from shops and payment_links only. Single-user site: no user_products; has_subscription is always false.';
