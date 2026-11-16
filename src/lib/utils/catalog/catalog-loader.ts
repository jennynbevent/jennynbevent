import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Charge le catalogue d'une boutique (ISR gère le cache)
 * @param supabase Instance Supabase
 * @param shopId ID de la boutique
 * @returns Données du catalogue (produits, catégories, infos boutique)
 */
async function loadCategories(supabase: SupabaseClient, shopId: string) {
    // Ordre choisi dans l'espace admin (colonne « position »), puis alphabétique
    const withPosition = await supabase
        .from('categories')
        .select('id, name, description, position')
        .eq('shop_id', shopId)
        .order('position', { ascending: true, nullsFirst: false })
        .order('name');
    if (!withPosition.error) return withPosition;
    const withDescription = await supabase
        .from('categories')
        .select('id, name, description')
        .eq('shop_id', shopId)
        .order('name');
    if (!withDescription.error) return withDescription;
    // La colonne « description » n'a pas encore été ajoutée dans Supabase
    return supabase.from('categories').select('id, name').eq('shop_id', shopId).order('name');
}

export async function loadShopCatalog(
    supabase: SupabaseClient,
    shopId: string
): Promise<any> {
    console.log('🏪 [Catalog Loader] Starting catalog load for shop:', shopId);

    try {
        // 1. Récupérer les informations de la boutique
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id, name, bio, slug, logo_url, instagram, tiktok, website, is_custom_accepted, is_active')
            .eq('id', shopId)
            .single();

        if (shopError || !shop) {
            console.error('❌ [Catalog Loader] Shop not found, throwing error');
            throw new Error('Boutique non trouvée');
        }

        // 2. Charger directement depuis Supabase (ISR gère le cache)
        const [productsResult, categoriesResult, faqsResult] = await Promise.all([
            // Récupérer les produits actifs
            supabase
                .from('products')
                .select(`
                    id, name, description, base_price, image_url, min_days_notice, category_id, booking_type, min_reservation_days,
                    categories(name),
                    forms(
                        id,
                        form_fields(
                            id, label, type, options, required, order
                        )
                    )
                `)
                .eq('shop_id', shopId)
                .eq('is_active', true)
                .order('created_at', { ascending: false }),

            // Récupérer les catégories (avec sous-titre si la colonne existe)
            loadCategories(supabase, shopId),

            // Récupérer les FAQ
            supabase
                .from('faq')
                .select('id, question, answer')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: true })
        ]);

        if (productsResult.error) {
            console.error('❌ [Catalog Loader] Products error:', productsResult.error);
            throw new Error('Erreur lors du chargement des produits');
        }

        if (categoriesResult.error) {
            console.error('❌ [Catalog Loader] Categories error:', categoriesResult.error);
            throw new Error('Erreur lors du chargement des catégories');
        }

        // Images de la page d'accueil choisies dans l'espace admin (si la colonne existe)
        let heroProductIds: string[] = [];
        try {
            const { data: hero, error: heroError } = await (supabase as any)
                .from('shops')
                .select('hero_product_ids')
                .eq('id', shopId)
                .single();
            if (!heroError && Array.isArray(hero?.hero_product_ids)) heroProductIds = hero.hero_product_ids;
        } catch {
            heroProductIds = [];
        }

        // Disponibilité de chaque article (colonne ajoutée séparément : ignorée si absente)
        let products: any[] = productsResult.data || [];
        try {
            const { data: av, error: avError } = await (supabase as any)
                .from('products')
                .select('id, availability')
                .eq('shop_id', shopId)
                .eq('is_active', true);
            if (!avError && av) {
                const map = new Map(av.map((r: any) => [r.id, r.availability || 'available']));
                products = products.map((p: any) => ({ ...p, availability: map.get(p.id) || 'available' }));
            }
        } catch {
            /* colonne absente */
        }

        // 3. Structurer les données du catalogue
        const catalogData = {
            shop: {
                id: shop.id,
                name: shop.name,
                bio: shop.bio,
                slug: shop.slug,
                logo_url: shop.logo_url,
                instagram: shop.instagram,
                tiktok: shop.tiktok,
                website: shop.website,
                is_custom_accepted: shop.is_custom_accepted,
                is_active: shop.is_active
            },
            products,
            categories: categoriesResult.data || [],
            faqs: faqsResult.data || [],
            heroProductIds,
            cached_at: new Date().toISOString()
        };

        return catalogData;
    } catch (error) {
        console.error('💥 [Catalog Loader] Error in loadShopCatalog:', error);
        console.error('💥 [Catalog Loader] Error details:', {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

