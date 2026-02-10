-- Include pickup_date_end in get_orders_data for reservation-type orders.

CREATE OR REPLACE FUNCTION "public"."get_orders_data"("p_profile_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'orders', (
            SELECT json_agg(
                json_build_object(
                    'id', o.id,
                    'customer_name', o.customer_name,
                    'customer_email', o.customer_email,
                    'pickup_date', o.pickup_date,
                    'pickup_time', o.pickup_time,
                    'pickup_date_end', o.pickup_date_end,
                    'status', o.status,
                    'total_amount', o.total_amount,
                    'product_name', o.product_name,
                    'additional_information', o.additional_information,
                    'chef_message', o.chef_message,
                    'created_at', o.created_at,
                    'chef_pickup_date', o.chef_pickup_date,
                    'chef_pickup_time', o.chef_pickup_time,
                    'product', json_build_object(
                        'name', p.name,
                        'image_url', p.image_url
                    )
                )
            )
            FROM (
                SELECT o.id, o.customer_name, o.customer_email, o.pickup_date, o.pickup_time, o.pickup_date_end, o.status, o.total_amount, o.product_name, o.additional_information, o.chef_message, o.created_at, o.chef_pickup_date, o.chef_pickup_time, o.product_id
                FROM orders o
                JOIN shops s ON s.id = o.shop_id
                WHERE s.profile_id = p_profile_id
                ORDER BY o.pickup_date ASC
            ) o
            LEFT JOIN products p ON p.id = o.product_id
        ),
        'shop', (
            SELECT json_build_object(
                'id', s.id,
                'name', s.name,
                'slug', s.slug
            )
            FROM shops s
            WHERE s.profile_id = p_profile_id
        )
    ) INTO result;

    RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_orders_data"("p_profile_id" "uuid") OWNER TO "postgres";

-- Include pickup_date_end in get_order_detail_data for reservation-type orders.

CREATE OR REPLACE FUNCTION "public"."get_order_detail_data"("p_order_id" "uuid", "p_profile_id" "uuid") RETURNS json
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'order', (
            SELECT json_build_object(
                'id', o.id,
                'customer_name', o.customer_name,
                'customer_email', o.customer_email,
                'customer_phone', o.customer_phone,
                'customer_instagram', o.customer_instagram,
                'pickup_date', o.pickup_date,
                'pickup_time', o.pickup_time,
                'pickup_date_end', o.pickup_date_end,
                'status', o.status,
                'total_amount', o.total_amount,
                'product_name', o.product_name,
                'additional_information', o.additional_information,
                'chef_message', o.chef_message,
                'created_at', o.created_at,
                'chef_pickup_date', o.chef_pickup_date,
                'chef_pickup_time', o.chef_pickup_time,
                'paid_amount', o.paid_amount,
                'order_ref', o.order_ref,
                'payment_provider', o.payment_provider,
                'customization_data', o.customization_data,
                'inspiration_photos', o.inspiration_photos,
                'product', json_build_object(
                    'name', p.name,
                    'description', p.description,
                    'image_url', p.image_url,
                    'base_price', p.base_price
                ),
                'shop', json_build_object(
                    'name', s.name,
                    'slug', s.slug
                )
            )
            FROM orders o
            LEFT JOIN products p ON p.id = o.product_id
            JOIN shops s ON s.id = o.shop_id
            WHERE o.id = p_order_id
            AND s.profile_id = p_profile_id
        ),
        'personalNote', (
            SELECT json_build_object(
                'note', pon.note,
                'updated_at', pon.updated_at
            )
            FROM personal_order_notes pon
            WHERE pon.order_id = p_order_id
            AND pon.shop_id = (SELECT s.id FROM shops s WHERE s.profile_id = p_profile_id)
        ),
        'shop', (
            SELECT json_build_object(
                'name', s.name,
                'slug', s.slug,
                'logo_url', s.logo_url
            )
            FROM shops s
            WHERE s.profile_id = p_profile_id
        )
    ) INTO result;

    RETURN result;
END;
$$;

ALTER FUNCTION "public"."get_order_detail_data"("p_order_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";
