import { error, redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

import { z } from 'zod';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { formSchema } from './schema';
import { customizationSchema } from './customization-schema';
import { policiesSchema } from './policies-schema';
import { paymentConfigSchema } from '../../../onboarding/schema';
import { uploadShopLogo, uploadBackgroundImage, deleteImage, extractPublicIdFromUrl } from '$lib/cloudinary';
import { verifyShopOwnership } from '$lib/auth';
import { setError } from 'sveltekit-superforms';
import { isStripeConfigured, stripeMode } from '$lib/stripe/shop-payments';

export const load: PageServerLoad = async ({ locals, parent, url }) => {
    // ✅ OPTIMISÉ : Réutiliser les permissions et shop du layout
    const { permissions, shop: layoutShop, user } = await parent();

    if (!user) {
        throw redirect(302, '/login');
    }

    // Récupérer l'ID de la boutique
    if (!permissions.shopId) {
        throw error(400, 'Boutique non trouvée');
    }

    if (!layoutShop) {
        throw error(404, 'Boutique non trouvée');
    }

    // 3 requêtes parallèles (sans stripe_connect, sans annuaire)
    const [customizationsResult, policiesResult, paymentLinksResult] = await Promise.all([
        locals.supabase
            .from('shop_customizations')
            .select('button_color, button_text_color, text_color, icon_color, secondary_text_color, background_color, background_image_url')
            .eq('shop_id', permissions.shopId)
            .single(),
        locals.supabase
            .from('shop_policies')
            .select('terms_and_conditions, return_policy, delivery_policy, payment_terms')
            .eq('shop_id', permissions.shopId)
            .single(),
        locals.supabase
            .from('payment_links')
            .select('provider_type, payment_identifier')
            .eq('profile_id', user.id)
            .eq('is_active', true)
    ]);

    const customizations = customizationsResult.data;
    const policies = policiesResult.data;
    const shop = layoutShop;

    return {
        shop,
        form: await superValidate(zod(formSchema), {
            defaults: {
                name: shop.name,
                bio: shop.bio || '',
                slug: shop.slug,
                logo_url: shop.logo_url || '',
                instagram: shop.instagram || '',
                tiktok: shop.tiktok || '',
                website: shop.website || ''
            }
        }),
        customizationForm: await superValidate(zod(customizationSchema), {
            defaults: {
                button_color: customizations?.button_color || '#BC90A5',
                button_text_color: customizations?.button_text_color || '#ffffff',
                text_color: customizations?.text_color || '#333333',
                icon_color: customizations?.icon_color || '#6b7280',
                secondary_text_color: customizations?.secondary_text_color || '#333333',
                background_color: customizations?.background_color || '#fafafa',
                background_image_url: customizations?.background_image_url || null, // ✅ Utiliser null au lieu de '' pour éviter les chaînes vides
            }
        }),
        policiesForm: await superValidate(zod(policiesSchema), {
            defaults: {
                terms_and_conditions: policies?.terms_and_conditions || '',
                return_policy: policies?.return_policy || '',
                delivery_policy: policies?.delivery_policy || '',
                payment_terms: policies?.payment_terms || ''
            }
        }),
        paymentForm: await superValidate(zod(paymentConfigSchema), {
            defaults: (() => {
                const defaults: { paypal_me?: string; revolut_me?: string; wero_me?: string } = {};
                paymentLinksResult.data?.forEach(link => {
                    if (link.provider_type === 'paypal') {
                        defaults.paypal_me = link.payment_identifier;
                    } else if (link.provider_type === 'revolut') {
                        defaults.revolut_me = link.payment_identifier;
                    } else if (link.provider_type === 'wero') {
                        defaults.wero_me = link.payment_identifier;
                    }
                });
                return defaults;
            })()
        }),
        permissions,
        stripe: {
            configured: isStripeConfigured(),
            mode: stripeMode(),
            enabled: !!paymentLinksResult.data?.some((l) => l.provider_type === 'stripe'),
        }
    };
};

export const actions: Actions = {
    updateShop: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        if (!shopId || !shopSlug) {
            return { success: false, error: 'Données de boutique manquantes' };
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            return { success: false, error: 'Non autorisé' };
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getUserPermissions + requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            return { success: false, error: 'Accès non autorisé à cette boutique' };
        }

        // Valider avec Superforms (passer formData au lieu de request)
        const form = await superValidate(formData, zod(formSchema));

        if (!form.valid) {
            return form;
        }

        const { name, bio, slug, instagram, tiktok, website, logo } = form.data;
        const logoFile = logo;
        const currentLogoUrl = form.data.logo_url;

        // ✅ OPTIMISÉ : Récupérer uniquement logo_url et slug actuels (pour comparaison)
        const { data: shop, error: shopError } = await locals.supabase
            .from('shops')
            .select('id, logo_url, slug')
            .eq('id', shopId)
            .single();

        if (shopError || !shop) {
            return { success: false, error: 'Boutique non trouvée' };
        }

        // Validate inputs
        if (!name || !slug) {
            return { success: false, error: 'Le nom et l\'URL de la boutique sont obligatoires' };
        }

        if (slug.length < 3) {
            return { success: false, error: 'Le slug doit contenir au moins 3 caractères' };
        }

        // Check if slug is available (excluding current shop)
        const { data: existingShop } = await locals.supabase
            .from('shops')
            .select('id')
            .eq('slug', slug)
            .neq('id', shop.id)
            .single();

        if (existingShop) {
            return { success: false, error: 'Ce slug est déjà utilisé' };
        }

        // Handle logo upload if new file is provided
        let logoUrl = currentLogoUrl;

        if (logoFile && logoFile.size > 0) {
            // Validation basique : taille max 5MB
            if (logoFile.size > 5 * 1024 * 1024) {
                return { success: false, error: 'Le logo ne doit pas dépasser 5MB' };
            }

            // Vérifier que c'est bien une image
            if (!logoFile.type.startsWith('image/')) {
                return { success: false, error: 'Le fichier doit être une image' };
            }

            try {
                // Upload vers Cloudinary (compression et optimisation automatiques)
                const uploadResult = await uploadShopLogo(logoFile, shop.id);
                logoUrl = uploadResult.secure_url;

                // Supprimer l'ancien logo Cloudinary si il existe
                if (currentLogoUrl) {
                    const oldPublicId = extractPublicIdFromUrl(currentLogoUrl);
                    if (oldPublicId) {
                        await deleteImage(oldPublicId);
                    }
                }
            } catch (err) {
                console.error('❌ [Shop Update] Erreur Cloudinary logo:', err);
                return { success: false, error: 'Erreur lors de l\'upload du logo' };
            }
        }

        // Store old slug for cache invalidation
        const oldSlug = shop.slug;
        const slugChanged = oldSlug !== slug;

        // Update shop
        const { error: updateError } = await locals.supabase
            .from('shops')
            .update({
                name,
                bio,
                slug,
                instagram: instagram || null,
                tiktok: tiktok || null,
                website: website || null,
                logo_url: logoUrl || null
            })
            .eq('id', shopId);

        if (updateError) {
            return { success: false, error: 'Erreur lors de la mise à jour' };
        }

        // ✅ Synchronisation Resend désactivée (fonctionnalité supprimée)

        // Return form data for Superforms compatibility with updated data
        const updatedForm = await superValidate(zod(formSchema), {
            defaults: {
                name,
                bio: bio || '',
                slug,
                logo_url: logoUrl || '',
                instagram: instagram || '',
                tiktok: tiktok || '',
                website: website || ''
            }
        });
        updatedForm.message = 'Boutique mise à jour avec succès !';
        return { form: updatedForm };
    },

    updateCustomizationForm: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
        const form = await superValidate(formData, zod(customizationSchema));

        // Debug: Log les erreurs de validation
        if (!form.valid) {
            console.error('🎨 [Customization Form] Validation errors:', form.errors);
            console.error('🎨 [Customization Form] Form data:', form.data);
            console.error('🎨 [Customization Form] FormData entries:', Array.from(formData.entries()));
        }

        if (!shopId || !shopSlug) {
            form.message = 'Données de boutique manquantes';
            return { form };
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            form.message = 'Non autorisé';
            return { form };
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            form.message = 'Accès non autorisé à cette boutique';
            return { form };
        }

        if (!form.valid) {
            console.error('🎨 [Customization Form] Form is invalid after security checks, returning errors');
            return fail(400, { form });
        }

        // Handle background image upload
        // ✅ Filtrer les chaînes vides pour background_image (quand aucun fichier n'est sélectionné)
        const background_image = form.data.background_image instanceof File ? form.data.background_image : undefined;
        const { background_image_url } = form.data;
        let finalBackgroundImageUrl = background_image_url;

        if (background_image && background_image.size > 0) {
            // Validation basique : taille max 5MB
            if (background_image.size > 5 * 1024 * 1024) {
                form.message = 'L\'image de fond ne doit pas dépasser 5MB';
                return { form };
            }

            // Vérifier que c'est bien une image
            if (!background_image.type.startsWith('image/')) {
                form.message = 'Le fichier doit être une image';
                return { form };
            }

            try {
                // Upload vers Cloudinary (compression et optimisation automatiques)
                const uploadResult = await uploadBackgroundImage(background_image, shopId);
                finalBackgroundImageUrl = uploadResult.secure_url;

                // Supprimer l'ancienne image de fond Cloudinary si elle existe
                if (background_image_url) {
                    const oldPublicId = extractPublicIdFromUrl(background_image_url);
                    if (oldPublicId) {
                        await deleteImage(oldPublicId);
                    }
                }

                console.log('🎨 [Dashboard Shop] Background image uploaded:', finalBackgroundImageUrl);
            } catch (err) {
                console.error('🎨 [Dashboard Shop] Background image processing error:', err);
                form.message = 'Erreur lors de l\'upload de l\'image de fond';
                return { form };
            }
        }

        const { error: updateError } = await locals.supabase
            .from('shop_customizations')
            .update({
                button_color: form.data.button_color,
                button_text_color: form.data.button_text_color,
                text_color: form.data.text_color,
                icon_color: form.data.icon_color,
                secondary_text_color: form.data.secondary_text_color,
                background_color: form.data.background_color,
                background_image_url: finalBackgroundImageUrl
            })
            .eq('shop_id', shopId);

        if (updateError) {
            console.error('🎨 [Dashboard Shop] Upsert error:', updateError);
            form.message = 'Erreur lors de la mise à jour des personnalisations';
            return { form };
        }

        // ✅ Succès
        const updatedForm = await superValidate(zod(customizationSchema), {
            defaults: {
                button_color: form.data.button_color,
                button_text_color: form.data.button_text_color,
                text_color: form.data.text_color,
                icon_color: form.data.icon_color,
                secondary_text_color: form.data.secondary_text_color,
                background_color: form.data.background_color,
                background_image_url: finalBackgroundImageUrl
                // Note: background_image (File) n'est pas inclus car non sérialisable
            }
        });

        updatedForm.message = 'Personnalisation sauvegardée avec succès !';
        // ✅ IMPORTANT : Ne pas retourner le File dans le formulaire (non sérialisable)
        // Le formulaire mis à jour ne contient que les données sérialisables
        return { form: updatedForm };
    },

    removeBackgroundImage: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Récupérer shopId et shopSlug depuis formData
        if (!request) {
            return { success: false, error: 'Requête invalide' };
        }

        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        if (!shopId || !shopSlug) {
            return { success: false, error: 'Données de boutique manquantes' };
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            return { success: false, error: 'Non autorisé' };
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            return { success: false, error: 'Accès non autorisé à cette boutique' };
        }

        // Récupérer l'URL actuelle de l'image de fond (utiliser shopId directement)
        const { data: customizations } = await locals.supabase
            .from('shop_customizations')
            .select('background_image_url')
            .eq('shop_id', shopId)
            .single();

        if (customizations?.background_image_url) {
            try {
                // Supprimer l'image Cloudinary
                const publicId = extractPublicIdFromUrl(customizations.background_image_url);
                if (publicId) {
                    await deleteImage(publicId);
                    console.log('🎨 [Dashboard Shop] Background image deleted from Cloudinary');
                }
            } catch (error) {
                console.error('🎨 [Dashboard Shop] Error processing background image deletion:', error);
            }
        }

        // Mettre à jour la base de données pour supprimer l'URL (utiliser shopId directement)
        const { error: updateError } = await locals.supabase
            .from('shop_customizations')
            .update({
                background_image_url: null,
                updated_at: new Date().toISOString()
            })
            .eq('shop_id', shopId);

        if (updateError) {
            console.error('🎨 [Dashboard Shop] Error updating customizations:', updateError);
            return { success: false, error: 'Erreur lors de la suppression' };
        }

        return { success: true };
    },

    updateDirectory: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
        const form = await superValidate(formData, zod(directorySchema));

        if (!shopId || !shopSlug) {
            form.message = 'Données de boutique manquantes';
            return { form };
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            form.message = 'Non autorisé';
            return { form };
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            form.message = 'Accès non autorisé à cette boutique';
            return { form };
        }

        if (!form.valid) {
            return { form };
        }

        // Vérifier si la ville a changé pour déclencher le géocodage
        const { data: currentShop } = await locals.supabase
            .from('shops')
            .select('directory_actual_city, directory_city, directory_postal_code, latitude, longitude')
            .eq('id', shopId)
            .single();

        const cityChanged =
            currentShop?.directory_actual_city !== form.data.directory_actual_city ||
            currentShop?.directory_city !== form.data.directory_city ||
            currentShop?.directory_postal_code !== form.data.directory_postal_code;

        // Mettre à jour les champs annuaire (sans directory_enabled qui a son propre formulaire)
        const { error: updateError } = await locals.supabase
            .from('shops')
            .update({
                directory_city: form.data.directory_city,
                directory_actual_city: form.data.directory_actual_city,
                directory_postal_code: form.data.directory_postal_code,
                directory_cake_types: form.data.directory_cake_types
            })
            .eq('id', shopId);

        if (updateError) {
            console.error('📋 [Directory] Update error:', updateError);
            form.message = 'Erreur lors de la mise à jour des informations annuaire';
            return { form };
        }

        // ✅ Géocoder automatiquement si la ville a changé ou si les coordonnées sont manquantes
        const cityName = form.data.directory_actual_city || form.data.directory_city;
        if (cityName && (cityChanged || !currentShop?.latitude || !currentShop?.longitude)) {
            const { geocodeShopIfNeeded } = await import('$lib/utils/geocoding');
            // Géocoder de manière synchrone pour s'assurer que ça fonctionne
            try {
                const success = await geocodeShopIfNeeded(
                    locals.supabase,
                    shopId,
                    cityName,
                    form.data.directory_postal_code
                );
                if (!success) {
                    console.warn(`⚠️ [Directory] Géocodage échoué pour ${cityName}, mais la mise à jour a réussi`);
                }
            } catch (error) {
                console.error('❌ [Directory] Erreur lors du géocodage automatique:', error);
                // Ne pas faire échouer la requête si le géocodage échoue
            }
        }

        // Retourner le formulaire mis à jour
        const updatedForm = await superValidate(zod(directorySchema), {
            defaults: {
                directory_city: form.data.directory_city,
                directory_actual_city: form.data.directory_actual_city,
                directory_postal_code: form.data.directory_postal_code,
                directory_cake_types: form.data.directory_cake_types,
                directory_enabled: form.data.directory_enabled
            }
        });

        updatedForm.message = 'Informations annuaire sauvegardées avec succès !';
        return { form: updatedForm };
    },

    toggleDirectory: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        if (!shopId || !shopSlug) {
            const toggleForm = await superValidate(zod(toggleDirectorySchema));
            toggleForm.message = 'Données de boutique manquantes';
            return fail(400, { toggleForm });
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            throw error(401, 'Non autorisé');
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            throw error(403, 'Accès non autorisé à cette boutique');
        }

        const toggleForm = await superValidate(formData, zod(toggleDirectorySchema));

        if (!toggleForm.valid) {
            return fail(400, { toggleForm });
        }

        const directoryEnabled = toggleForm.data.directory_enabled;

        try {
            const { error: updateError } = await locals.supabase
                .from('shops')
                .update({ directory_enabled: directoryEnabled })
                .eq('id', shopId);

            if (updateError) {
                console.error('📋 [Toggle Directory] Update error:', updateError);
                const errorForm = await superValidate(zod(toggleDirectorySchema));
                errorForm.message = 'Erreur lors de la mise à jour';
                return fail(400, { toggleForm: errorForm });
            }

            console.log('✅ [Toggle Directory] Updated directory_enabled to:', directoryEnabled, 'for shop:', shopId);

            // ✅ Synchronisation Resend désactivée (fonctionnalité supprimée)

            // ✅ Si l'annuaire est activé, géocoder automatiquement si les informations sont disponibles
            if (directoryEnabled) {
                // Récupérer les informations de localisation du shop
                const { data: shopData, error: shopError } = await locals.supabase
                    .from('shops')
                    .select('directory_actual_city, directory_city, directory_postal_code, latitude, longitude')
                    .eq('id', shopId)
                    .single();

                if (!shopError && shopData) {
                    // Vérifier si le shop n'a pas déjà de coordonnées
                    if (!shopData.latitude || !shopData.longitude) {
                        const cityName = shopData.directory_actual_city || shopData.directory_city;
                        if (cityName) {
                            // Géocoder de manière synchrone pour s'assurer que ça fonctionne
                            const { geocodeShopIfNeeded } = await import('$lib/utils/geocoding');
                            try {
                                const success = await geocodeShopIfNeeded(
                                    locals.supabase,
                                    shopId,
                                    cityName,
                                    shopData.directory_postal_code
                                );
                                if (!success) {
                                    console.warn(`⚠️ [Toggle Directory] Géocodage échoué pour ${cityName}`);
                                }
                            } catch (error) {
                                console.error('❌ [Toggle Directory] Erreur lors du géocodage automatique:', error);
                                // Ne pas faire échouer la requête si le géocodage échoue
                            }
                        }
                    }
                }
            }

            // Retourner le formulaire mis à jour
            const updatedForm = await superValidate(zod(toggleDirectorySchema), {
                defaults: {
                    directory_enabled: directoryEnabled
                }
            });

            updatedForm.message = directoryEnabled
                ? 'Annuaire activé'
                : 'Annuaire désactivé';
            return { toggleForm: updatedForm };
        } catch (err) {
            const errorForm = await superValidate(zod(toggleDirectorySchema));
            errorForm.message = 'Erreur inattendue lors de la mise à jour';
            return fail(500, { toggleForm: errorForm });
        }
    },

    updatePolicies: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
        const form = await superValidate(formData, zod(policiesSchema));

        if (!shopId || !shopSlug) {
            form.message = 'Données de boutique manquantes';
            return { form };
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            form.message = 'Non autorisé';
            return { form };
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            form.message = 'Accès non autorisé à cette boutique';
            return { form };
        }

        if (!form.valid) {
            return { form };
        }

        // Mettre à jour les politiques de ventes dans shop_policies
        // Utiliser upsert pour créer si n'existe pas, sinon mettre à jour
        const { error: updateError } = await locals.supabase
            .from('shop_policies')
            .upsert({
                shop_id: shopId,
                terms_and_conditions: form.data.terms_and_conditions || null,
                return_policy: form.data.return_policy || null,
                delivery_policy: form.data.delivery_policy || null,
                payment_terms: form.data.payment_terms || null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'shop_id'
            });

        if (updateError) {
            console.error('📋 [Policies] Update error:', updateError);
            form.message = 'Erreur lors de la mise à jour des politiques';
            return { form };
        }

        // Retourner le formulaire mis à jour
        const updatedForm = await superValidate(zod(policiesSchema), {
            defaults: {
                terms_and_conditions: form.data.terms_and_conditions || '',
                return_policy: form.data.return_policy || '',
                delivery_policy: form.data.delivery_policy || '',
                payment_terms: form.data.payment_terms || ''
            }
        });

        updatedForm.message = 'Politiques de ventes sauvegardées avec succès !';
        return { form: updatedForm };
    },

    updatePaypal: async ({ request, locals }) => {
        try {
            const { session, user } = await locals.safeGetSession();

            if (!session || !user) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                setError(cleanForm, 'paypal_me', 'Non autorisé');
                return { form: cleanForm };
            }

            const userId = user.id;
            const formData = await request.formData();
            const paypal_me = formData.get('paypal_me') as string;

            // Valider le champ PayPal
            const paypalSchema = z.object({
                paypal_me: z.string()
                    .optional()
                    .transform((val) => {
                        if (!val || val.trim() === '') return undefined;
                        return val.toLowerCase().trim();
                    })
                    .refine(
                        (val) => {
                            if (val === undefined) return true;
                            return /^[a-zA-Z0-9_-]+$/.test(val) && val.length >= 1 && val.length <= 50;
                        },
                        {
                            message: 'Le nom PayPal.me ne peut contenir que des lettres, chiffres, tirets et underscores (max 50 caractères)'
                        }
                    )
            });

            const validation = paypalSchema.safeParse({ paypal_me });

            if (!validation.success) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                const error = validation.error.errors[0];
                setError(cleanForm, 'paypal_me', error.message);
                return { form: cleanForm };
            }

            const validatedPaypal = validation.data.paypal_me;

            // Utiliser upsert pour mettre à jour uniquement PayPal, sans affecter Revolut
            if (validatedPaypal) {
                const { error: upsertError } = await locals.supabase
                    .from('payment_links')
                    .upsert({
                        profile_id: userId,
                        provider_type: 'paypal',
                        payment_identifier: validatedPaypal,
                        is_active: true
                    }, {
                        onConflict: 'profile_id,provider_type'
                    });

                if (upsertError) {
                    console.error('❌ [PayPal] Failed to upsert payment link:', upsertError);
                    const cleanForm = await superValidate(zod(paymentConfigSchema));
                    setError(cleanForm, 'paypal_me', 'Erreur lors de la sauvegarde de PayPal');
                    return { form: cleanForm };
                }

                console.log('✅ [PayPal] Successfully saved PayPal payment link');
            } else {
                // Si vide, supprimer le payment_link PayPal
                const { error: deleteError } = await locals.supabase
                    .from('payment_links')
                    .delete()
                    .eq('profile_id', userId)
                    .eq('provider_type', 'paypal');

                if (deleteError) {
                    console.warn('⚠️ [PayPal] Failed to delete payment link:', deleteError);
                } else {
                    console.log('✅ [PayPal] Successfully removed PayPal payment link');
                }
            }

            // Récupérer les valeurs Revolut et Wero actuelles pour les conserver dans le formulaire
            const { data: currentRevolut } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'revolut')
                .eq('is_active', true)
                .single();

            const { data: currentWero } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'wero')
                .eq('is_active', true)
                .single();

            // Retourner le formulaire mis à jour (conserver toutes les valeurs)
            const updatedForm = await superValidate(zod(paymentConfigSchema), {
                defaults: {
                    paypal_me: validatedPaypal,
                    revolut_me: currentRevolut?.payment_identifier || undefined,
                    wero_me: currentWero?.payment_identifier || undefined
                }
            });
            updatedForm.message = 'PayPal sauvegardé avec succès !';
            return { form: updatedForm };

        } catch (err) {
            console.error('PayPal update error:', err);
            const cleanForm = await superValidate(zod(paymentConfigSchema));
            setError(cleanForm, 'paypal_me', 'Une erreur inattendue est survenue');
            return { form: cleanForm };
        }
    },

    updateRevolut: async ({ request, locals }) => {
        try {
            const { session, user } = await locals.safeGetSession();

            if (!session || !user) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                setError(cleanForm, 'revolut_me', 'Non autorisé');
                return { form: cleanForm };
            }

            const userId = user.id;
            const formData = await request.formData();
            const revolut_me = formData.get('revolut_me') as string;

            // Valider le champ Revolut
            const revolutSchema = z.object({
                revolut_me: z.string()
                    .optional()
                    .transform((val) => {
                        if (!val || val.trim() === '') return undefined;
                        return val.trim();
                    })
                    .refine(
                        (val) => {
                            if (val === undefined) return true;
                            return /^[a-zA-Z0-9_@.-]+$/.test(val) && val.length >= 1 && val.length <= 100;
                        },
                        {
                            message: 'L\'identifiant Revolut contient des caractères invalides (max 100 caractères)'
                        }
                    )
            });

            const validation = revolutSchema.safeParse({ revolut_me });

            if (!validation.success) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                const error = validation.error.errors[0];
                setError(cleanForm, 'revolut_me', error.message);
                return { form: cleanForm };
            }

            const validatedRevolut = validation.data.revolut_me;

            // Utiliser upsert pour mettre à jour uniquement Revolut, sans affecter PayPal
            if (validatedRevolut) {
                const { error: upsertError } = await locals.supabase
                    .from('payment_links')
                    .upsert({
                        profile_id: userId,
                        provider_type: 'revolut',
                        payment_identifier: validatedRevolut,
                        is_active: true
                    }, {
                        onConflict: 'profile_id,provider_type'
                    });

                if (upsertError) {
                    console.error('❌ [Revolut] Failed to upsert payment link:', upsertError);
                    const cleanForm = await superValidate(zod(paymentConfigSchema));
                    setError(cleanForm, 'revolut_me', 'Erreur lors de la sauvegarde de Revolut');
                    return { form: cleanForm };
                }

                console.log('✅ [Revolut] Successfully saved Revolut payment link');
            } else {
                // Si vide, supprimer le payment_link Revolut
                const { error: deleteError } = await locals.supabase
                    .from('payment_links')
                    .delete()
                    .eq('profile_id', userId)
                    .eq('provider_type', 'revolut');

                if (deleteError) {
                    console.warn('⚠️ [Revolut] Failed to delete payment link:', deleteError);
                } else {
                    console.log('✅ [Revolut] Successfully removed Revolut payment link');
                }
            }

            // Récupérer les valeurs PayPal et Wero actuelles pour les conserver dans le formulaire
            const { data: currentPaypal } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'paypal')
                .eq('is_active', true)
                .single();

            const { data: currentWero } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'wero')
                .eq('is_active', true)
                .single();

            // Retourner le formulaire mis à jour (conserver toutes les valeurs)
            const updatedForm = await superValidate(zod(paymentConfigSchema), {
                defaults: {
                    paypal_me: currentPaypal?.payment_identifier || undefined,
                    revolut_me: validatedRevolut,
                    wero_me: currentWero?.payment_identifier || undefined
                }
            });
            updatedForm.message = 'Revolut sauvegardé avec succès !';
            return { form: updatedForm };

        } catch (err) {
            console.error('Revolut update error:', err);
            const cleanForm = await superValidate(zod(paymentConfigSchema));
            setError(cleanForm, 'revolut_me', 'Une erreur inattendue est survenue');
            return { form: cleanForm };
        }
    },

    // Paiement par carte (Stripe) : activer / désactiver
    enableStripe: async ({ locals }) => {
        const { user } = await locals.safeGetSession();
        if (!user) return fail(401, { error: 'Non autorisé' });
        if (!isStripeConfigured()) return fail(400, { error: 'Les clés Stripe ne sont pas encore en place.' });
        const { error: upsertError } = await locals.supabase
            .from('payment_links')
            .upsert(
                { profile_id: user.id, provider_type: 'stripe', payment_identifier: 'carte', is_active: true },
                { onConflict: 'profile_id,provider_type' }
            );
        if (upsertError) {
            console.error('[Stripe] activation impossible:', upsertError);
            return fail(500, { error: "Impossible d'activer le paiement par carte." });
        }
        return { success: true };
    },

    disableStripe: async ({ locals }) => {
        const { user } = await locals.safeGetSession();
        if (!user) return fail(401, { error: 'Non autorisé' });
        const { error: deleteError } = await locals.supabase
            .from('payment_links')
            .delete()
            .eq('profile_id', user.id)
            .eq('provider_type', 'stripe');
        if (deleteError) return fail(500, { error: 'Impossible de désactiver le paiement par carte.' });
        return { success: true };
    },

    updateWero: async ({ request, locals }) => {
        try {
            const { session, user } = await locals.safeGetSession();

            if (!session || !user) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                setError(cleanForm, 'wero_me', 'Non autorisé');
                return { form: cleanForm };
            }

            const userId = user.id;
            const formData = await request.formData();
            const wero_me = formData.get('wero_me') as string;

            // Valider le champ Wero
            const weroSchema = z.object({
                wero_me: z.string()
                    .optional()
                    .transform((val) => {
                        if (!val || val.trim() === '') return undefined;
                        return val.trim();
                    })
                    .refine(
                        (val) => {
                            if (val === undefined) return true;
                            // Wero accepte email ou numéro de téléphone
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            const phoneRegex = /^\+?[0-9]{10,15}$/;
                            return (emailRegex.test(val) || phoneRegex.test(val)) && val.length <= 100;
                        },
                        {
                            message: 'L\'identifiant Wero doit être un email valide ou un numéro de téléphone (max 100 caractères)'
                        }
                    )
            });

            const validation = weroSchema.safeParse({ wero_me });

            if (!validation.success) {
                const cleanForm = await superValidate(zod(paymentConfigSchema));
                const error = validation.error.errors[0];
                setError(cleanForm, 'wero_me', error.message);
                return { form: cleanForm };
            }

            const validatedWero = validation.data.wero_me;

            // Utiliser upsert pour mettre à jour uniquement Wero, sans affecter PayPal/Revolut
            if (validatedWero) {
                const { error: upsertError } = await locals.supabase
                    .from('payment_links')
                    .upsert({
                        profile_id: userId,
                        provider_type: 'wero',
                        payment_identifier: validatedWero,
                        is_active: true
                    }, {
                        onConflict: 'profile_id,provider_type'
                    });

                if (upsertError) {
                    console.error('❌ [Wero] Failed to upsert payment link:', upsertError);
                    const cleanForm = await superValidate(zod(paymentConfigSchema));
                    setError(cleanForm, 'wero_me', 'Erreur lors de la sauvegarde de Wero');
                    return { form: cleanForm };
                }

                console.log('✅ [Wero] Successfully saved Wero payment link');
            } else {
                // Si vide, supprimer le payment_link Wero
                const { error: deleteError } = await locals.supabase
                    .from('payment_links')
                    .delete()
                    .eq('profile_id', userId)
                    .eq('provider_type', 'wero');

                if (deleteError) {
                    console.warn('⚠️ [Wero] Failed to delete payment link:', deleteError);
                } else {
                    console.log('✅ [Wero] Successfully removed Wero payment link');
                }
            }

            // Récupérer les valeurs PayPal et Revolut actuelles pour les conserver dans le formulaire
            const { data: currentPaypal } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'paypal')
                .eq('is_active', true)
                .single();

            const { data: currentRevolut } = await locals.supabase
                .from('payment_links')
                .select('payment_identifier')
                .eq('profile_id', userId)
                .eq('provider_type', 'revolut')
                .eq('is_active', true)
                .single();

            // Retourner le formulaire mis à jour (conserver toutes les valeurs)
            const updatedForm = await superValidate(zod(paymentConfigSchema), {
                defaults: {
                    paypal_me: currentPaypal?.payment_identifier || undefined,
                    revolut_me: currentRevolut?.payment_identifier || undefined,
                    wero_me: validatedWero
                }
            });
            updatedForm.message = 'Wero sauvegardé avec succès !';
            return { form: updatedForm };

        } catch (err) {
            console.error('Wero update error:', err);
            const cleanForm = await superValidate(zod(paymentConfigSchema));
            setError(cleanForm, 'wero_me', 'Une erreur inattendue est survenue');
            return { form: cleanForm };
        }
    },

};
