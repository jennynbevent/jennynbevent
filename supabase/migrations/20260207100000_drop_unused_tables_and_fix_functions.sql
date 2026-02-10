-- Migration: Drop unused tables (single-user site) and replace RPCs that depended on them.
-- Tables dropped: admin_otp_codes, admin_sessions, affiliate_commissions, affiliate_payouts,
-- affiliations, contact_messages, events, push_subscriptions, stripe_connect_accounts,
-- stripe_customers, stripe_events, user_products.
-- RPCs replaced to use only profiles (is_stripe_free) and payment_links; no user_products or stripe_connect.

-- ============================================
-- 1. get_user_plan: return 'exempt' or 'free' only (no user_products)
-- ============================================
CREATE OR REPLACE FUNCTION "public"."get_user_plan"(
    "p_profile_id" "uuid",
    "premium_product_id" "text" DEFAULT 'prod_Selcz36pAfV3vV'::"text",
    "basic_product_id" "text" DEFAULT 'prod_Selbd3Ne2plHqG'::"text",
    "lifetime_product_id" "text" DEFAULT NULL
) RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_is_stripe_free BOOLEAN;
BEGIN
  SELECT COALESCE(is_stripe_free, false)
  INTO v_is_stripe_free
  FROM profiles
  WHERE id = p_profile_id;

  IF v_is_stripe_free THEN
    RETURN 'exempt';
  END IF;
  RETURN 'free';
END;
$$;

COMMENT ON FUNCTION "public"."get_user_plan"("p_profile_id" "uuid", "premium_product_id" "text", "basic_product_id" "text", "lifetime_product_id" "text") IS 'Get user plan. Single-user site: returns exempt (if is_stripe_free) or free. No subscription tables.';

-- ============================================
-- 2. get_user_permissions_complete: payment_links only, plan from is_stripe_free
-- ============================================
CREATE OR REPLACE FUNCTION "public"."get_user_permissions_complete"(
    "p_profile_id" "uuid",
    "p_premium_product_id" "text" DEFAULT 'prod_Selcz36pAfV3vV'::"text",
    "p_basic_product_id" "text" DEFAULT 'prod_Selbd3Ne2plHqG'::"text",
    "p_lifetime_product_id" "text" DEFAULT NULL
) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    result JSON;
    v_shop_id UUID;
    v_shop_slug TEXT;
    v_shop_name TEXT;
    v_shop_bio TEXT;
    v_shop_logo_url TEXT;
    v_shop_instagram TEXT;
    v_shop_tiktok TEXT;
    v_shop_website TEXT;
    v_shop_is_active BOOLEAN;
    v_shop_is_custom_accepted BOOLEAN;
    v_plan TEXT;
    v_product_count INTEGER;
    v_is_stripe_free BOOLEAN;
    v_has_payment_method BOOLEAN;
    v_product_limit INTEGER;
BEGIN
    SELECT
        s.id,
        s.slug,
        s.name,
        s.bio,
        s.logo_url,
        s.instagram,
        s.tiktok,
        s.website,
        s.is_active,
        s.is_custom_accepted,
        COALESCE(p.is_stripe_free, false)
    INTO
        v_shop_id,
        v_shop_slug,
        v_shop_name,
        v_shop_bio,
        v_shop_logo_url,
        v_shop_instagram,
        v_shop_tiktok,
        v_shop_website,
        v_shop_is_active,
        v_shop_is_custom_accepted,
        v_is_stripe_free
    FROM profiles p
    LEFT JOIN shops s ON s.profile_id = p.id
    WHERE p.id = p_profile_id;

    IF v_is_stripe_free THEN
        v_plan := 'exempt';
    ELSE
        v_plan := 'free';
    END IF;

    SELECT COUNT(*)
    INTO v_product_count
    FROM products p
    JOIN shops s ON s.id = p.shop_id
    WHERE s.profile_id = p_profile_id;

    SELECT get_product_limit(v_plan)
    INTO v_product_limit;

    SELECT EXISTS(
        SELECT 1
        FROM payment_links
        WHERE profile_id = p_profile_id
            AND is_active = true
    ) INTO v_has_payment_method;

    SELECT json_build_object(
        'shopId', v_shop_id,
        'shopSlug', v_shop_slug,
        'shop', CASE
            WHEN v_shop_id IS NOT NULL THEN json_build_object(
                'id', v_shop_id,
                'name', v_shop_name,
                'slug', v_shop_slug,
                'bio', v_shop_bio,
                'logo_url', v_shop_logo_url,
                'instagram', v_shop_instagram,
                'tiktok', v_shop_tiktok,
                'website', v_shop_website,
                'is_active', v_shop_is_active,
                'is_custom_accepted', v_shop_is_custom_accepted
            )
            ELSE NULL
        END,
        'plan', COALESCE(v_plan, 'free'),
        'productCount', COALESCE(v_product_count, 0),
        'productLimit', v_product_limit,
        'canAddMoreProducts', COALESCE(v_product_count, 0) < v_product_limit,
        'canHandleCustomRequests', v_plan IN ('premium', 'basic', 'lifetime', 'exempt'),
        'canManageCustomForms', v_plan IN ('premium', 'basic', 'lifetime', 'exempt'),
        'isExempt', v_plan = 'exempt',
        'has_payment_method', v_has_payment_method,
        'has_ever_had_subscription', false,
        'has_shop', v_shop_id IS NOT NULL
    ) INTO result;

    RETURN result;
END;
$$;

COMMENT ON FUNCTION "public"."get_user_permissions_complete"("p_profile_id" "uuid", "p_premium_product_id" "text", "p_basic_product_id" "text", "p_lifetime_product_id" "text") IS 'Get all user permissions. Single-user site: no user_products or stripe_connect; plan from is_stripe_free, has_payment_method from payment_links only.';

-- ============================================
-- 3. get_products_sorted_by_shop_premium: is_shop_premium from profiles.is_stripe_free only
-- ============================================
CREATE OR REPLACE FUNCTION "public"."get_products_sorted_by_shop_premium"(
    "p_premium_product_id" "text" DEFAULT 'prod_Selcz36pAfV3vV'::"text",
    "p_limit" integer DEFAULT 12,
    "p_offset" integer DEFAULT 0,
    "p_cake_type" "text" DEFAULT NULL::"text",
    "p_shop_ids" "uuid"[] DEFAULT NULL::"uuid"[],
    "p_lifetime_product_id" "text" DEFAULT NULL,
    "p_verified_only" boolean DEFAULT false,
    "p_min_price" numeric DEFAULT NULL::numeric,
    "p_max_price" numeric DEFAULT NULL::numeric
) RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "image_url" "text", "base_price" numeric, "cake_type" "text", "shop_id" "uuid", "shop_name" "text", "shop_slug" "text", "shop_logo_url" "text", "shop_city" "text", "shop_actual_city" "text", "shop_postal_code" "text", "shop_profile_id" "uuid", "shop_latitude" numeric, "shop_longitude" numeric, "is_shop_premium" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH products_with_shop_premium AS (
        SELECT
            p.id,
            p.name,
            p.description,
            p.image_url,
            p.base_price,
            p.cake_type,
            p.shop_id,
            s.name AS shop_name,
            s.slug AS shop_slug,
            s.logo_url AS shop_logo_url,
            s.directory_city AS shop_city,
            s.directory_actual_city AS shop_actual_city,
            s.directory_postal_code AS shop_postal_code,
            s.profile_id AS shop_profile_id,
            s.latitude AS shop_latitude,
            s.longitude AS shop_longitude,
            COALESCE(pr.is_stripe_free, false) AS is_shop_premium
        FROM products p
        INNER JOIN shops s ON p.shop_id = s.id
        LEFT JOIN profiles pr ON pr.id = s.profile_id
        WHERE p.is_active = TRUE
        AND s.is_active = TRUE
        AND s.directory_enabled = TRUE
        AND (p_cake_type IS NULL OR p.cake_type = p_cake_type)
        AND (p_shop_ids IS NULL OR p.shop_id = ANY(p_shop_ids))
        AND (p_min_price IS NULL OR p.base_price >= p_min_price)
        AND (p_max_price IS NULL OR p.base_price <= p_max_price)
    )
    SELECT
        pws.id,
        pws.name,
        pws.description,
        pws.image_url,
        pws.base_price,
        pws.cake_type,
        pws.shop_id,
        pws.shop_name,
        pws.shop_slug,
        pws.shop_logo_url,
        pws.shop_city,
        pws.shop_actual_city,
        pws.shop_postal_code,
        pws.shop_profile_id,
        pws.shop_latitude,
        pws.shop_longitude,
        pws.is_shop_premium
    FROM products_with_shop_premium pws
    WHERE (NOT p_verified_only OR pws.is_shop_premium = TRUE)
    ORDER BY
        pws.is_shop_premium DESC,
        abs(hashtext(pws.id::text || current_date::text)) ASC,
        pws.name ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION "public"."get_products_sorted_by_shop_premium"("p_premium_product_id" "text", "p_limit" integer, "p_offset" integer, "p_cake_type" "text", "p_shop_ids" "uuid"[], "p_lifetime_product_id" "text", "p_verified_only" boolean, "p_min_price" numeric, "p_max_price" numeric) IS 'Returns products sorted by shop premium (is_stripe_free). Single-user site: no user_products.';

-- ============================================
-- 4. get_shops_sorted_by_premium: is_premium from profiles.is_stripe_free only
-- ============================================
CREATE OR REPLACE FUNCTION "public"."get_shops_sorted_by_premium"(
    "p_premium_product_id" "text" DEFAULT 'prod_Selcz36pAfV3vV'::"text",
    "p_limit" integer DEFAULT 12,
    "p_offset" integer DEFAULT 0,
    "p_city" "text" DEFAULT NULL::"text",
    "p_cake_type" "text" DEFAULT NULL::"text",
    "p_lifetime_product_id" "text" DEFAULT NULL,
    "p_verified_only" boolean DEFAULT false
) RETURNS TABLE("id" "uuid", "name" "text", "slug" "text", "logo_url" "text", "bio" "text", "directory_city" "text", "directory_actual_city" "text", "directory_postal_code" "text", "directory_cake_types" "text"[], "profile_id" "uuid", "latitude" numeric, "longitude" numeric, "is_premium" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH shops_with_premium AS (
        SELECT
            s.id,
            s.name,
            s.slug,
            s.logo_url,
            s.bio,
            s.directory_city,
            s.directory_actual_city,
            s.directory_postal_code,
            s.directory_cake_types,
            s.profile_id,
            s.latitude,
            s.longitude,
            COALESCE(p.is_stripe_free, false) AS is_premium
        FROM shops s
        LEFT JOIN profiles p ON p.id = s.profile_id
        WHERE s.directory_enabled = TRUE
        AND s.is_active = TRUE
        AND (p_city IS NULL OR s.directory_city = p_city)
        AND (p_cake_type IS NULL OR s.directory_cake_types @> ARRAY[p_cake_type]::TEXT[])
    )
    SELECT
        swp.id,
        swp.name,
        swp.slug,
        swp.logo_url,
        swp.bio,
        swp.directory_city,
        swp.directory_actual_city,
        swp.directory_postal_code,
        swp.directory_cake_types,
        swp.profile_id,
        swp.latitude,
        swp.longitude,
        swp.is_premium
    FROM shops_with_premium swp
    WHERE (NOT p_verified_only OR swp.is_premium = TRUE)
    ORDER BY
        swp.is_premium DESC,
        abs(hashtext(swp.id::text || current_date::text)) ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION "public"."get_shops_sorted_by_premium"("p_premium_product_id" "text", "p_limit" integer, "p_offset" integer, "p_city" "text", "p_cake_type" "text", "p_lifetime_product_id" "text", "p_verified_only" boolean) IS 'Returns shops sorted by premium (is_stripe_free). Single-user site: no user_products.';

-- ============================================
-- 5. find_shops_in_radius: is_premium from profiles.is_stripe_free only
-- ============================================
CREATE OR REPLACE FUNCTION "public"."find_shops_in_radius"(
    "p_latitude" numeric,
    "p_longitude" numeric,
    "p_radius_km" numeric,
    "p_limit" integer DEFAULT 100,
    "p_offset" integer DEFAULT 0,
    "p_premium_product_id" "text" DEFAULT 'prod_Selcz36pAfV3vV'::"text",
    "p_lifetime_product_id" "text" DEFAULT NULL,
    "p_verified_only" boolean DEFAULT false
) RETURNS TABLE("shop_id" "uuid", "distance_km" numeric, "name" "text", "slug" "text", "city" "text", "actual_city" "text", "postal_code" "text", "logo_url" "text", "is_premium" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    WITH shops_with_distance AS (
        SELECT
            s.id AS shop_id,
            calculate_distance_km(p_latitude, p_longitude, s.latitude, s.longitude) AS distance_km,
            s.name,
            s.slug,
            s.directory_city AS city,
            s.directory_actual_city AS actual_city,
            s.directory_postal_code AS postal_code,
            s.logo_url,
            s.profile_id
        FROM shops s
        WHERE s.directory_enabled = TRUE
            AND s.is_active = TRUE
            AND s.latitude IS NOT NULL
            AND s.longitude IS NOT NULL
            AND calculate_distance_km(p_latitude, p_longitude, s.latitude, s.longitude) <= p_radius_km
    ),
    shops_with_premium AS (
        SELECT
            swd.shop_id,
            swd.distance_km,
            swd.name,
            swd.slug,
            swd.city,
            swd.actual_city,
            swd.postal_code,
            swd.logo_url,
            COALESCE(p.is_stripe_free, false) AS is_premium
        FROM shops_with_distance swd
        LEFT JOIN profiles p ON p.id = swd.profile_id
    )
    SELECT
        swp.shop_id,
        swp.distance_km,
        swp.name,
        swp.slug,
        swp.city,
        swp.actual_city,
        swp.postal_code,
        swp.logo_url,
        swp.is_premium
    FROM shops_with_premium swp
    WHERE (NOT p_verified_only OR swp.is_premium = TRUE)
    ORDER BY
        swp.is_premium DESC,
        swp.distance_km ASC,
        abs(hashtext(swp.shop_id::text || current_date::text)) ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION "public"."find_shops_in_radius"("p_latitude" numeric, "p_longitude" numeric, "p_radius_km" numeric, "p_limit" integer, "p_offset" integer, "p_premium_product_id" "text", "p_lifetime_product_id" "text", "p_verified_only" boolean) IS 'Returns shops within radius. Single-user site: is_premium from profiles.is_stripe_free only.';

-- ============================================
-- 6. Drop function that references admin_sessions
-- ============================================
DROP FUNCTION IF EXISTS "public"."cleanup_expired_admin_sessions"();

-- ============================================
-- 7. Drop tables (order respects FK: affiliate_commissions before affiliations)
-- ============================================
DROP TABLE IF EXISTS "public"."affiliate_commissions";
DROP TABLE IF EXISTS "public"."affiliate_payouts";
DROP TABLE IF EXISTS "public"."affiliations";
DROP TABLE IF EXISTS "public"."admin_otp_codes";
DROP TABLE IF EXISTS "public"."admin_sessions";
DROP TABLE IF EXISTS "public"."contact_messages";
DROP TABLE IF EXISTS "public"."events";
DROP TABLE IF EXISTS "public"."push_subscriptions";
-- Drop views that depend on stripe_connect_accounts before dropping the table
DROP VIEW IF EXISTS "views"."user_onboarding_status" CASCADE;
DROP VIEW IF EXISTS "views"."user_shop_overview" CASCADE;
DROP TABLE IF EXISTS "public"."stripe_connect_accounts";
DROP TABLE IF EXISTS "public"."stripe_customers";
DROP TABLE IF EXISTS "public"."stripe_events";
DROP TABLE IF EXISTS "public"."user_products";
