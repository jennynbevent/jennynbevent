import { error, fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyShopOwnership } from '$lib/auth';
import { uploadProductImage } from '$lib/cloudinary';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { createProductFormSchema, createCategoryFormSchema } from './schema';
import { ErrorLogger } from '$lib/services/error-logging';

export const load: PageServerLoad = async ({ locals, parent }) => {
    // ✅ OPTIMISÉ : Utiliser shopId et shop du parent (déjà chargé)
    const { permissions, shop } = await parent();

    if (!permissions.shopId || !shop) {
        throw error(500, 'Erreur lors du chargement de la boutique');
    }

    // ✅ 1 seule requête pour les catégories
    const { data: categories, error: categoriesError } = await locals.supabase
        .from('categories')
        .select('id, name')
        .eq('shop_id', permissions.shopId)
        .order('name');


    // Initialiser les formulaires Superforms
    const createProductForm = await superValidate(zod(createProductFormSchema));
    const createCategoryForm = await superValidate(zod(createCategoryFormSchema));

    return {
        categories: categories || [],
        userPlan: permissions.plan,
        createProductForm,
        createCategoryForm,
        shopId: permissions.shopId,
        shopSlug: permissions.shopSlug || shop.slug
    };
};

export const actions: Actions = {
    createProduct: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;
        const shopSlug = formData.get('shopSlug') as string;

        if (!shopId || !shopSlug) {
            return fail(400, { error: 'Données de boutique manquantes' });
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            return fail(401, { error: 'Non autorisé' });
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getUserPermissions + getShopIdAndSlug)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            return fail(403, { error: 'Accès non autorisé à cette boutique' });
        }

        // ✅ formData a déjà été déclaré au début de l'action, pas besoin de le redéclarer
        // Valider avec Superforms
        const form = await superValidate(formData, zod(createProductFormSchema));

        if (!form.valid) {
            return fail(400, { form });
        }

        // Extraire les données validées
        const { name, description, base_price, category_id, min_days_notice, deposit_percentage, booking_type, min_reservation_days, customizationFields } = form.data;

        // Récupérer toutes les images depuis formData
        const imageFiles: File[] = [];
        let index = 0;
        while (formData.has(`images-${index}`)) {
            const file = formData.get(`images-${index}`) as File;
            if (file && file.size > 0) {
                imageFiles.push(file);
            }
            index++;
        }

        // Vérifier la limite de 3 images
        if (imageFiles.length > 3) {
            return fail(400, { form, error: 'Vous ne pouvez pas ajouter plus de 3 images' });
        }

        // Vérifier la taille cumulée (max 12MB)
        const MAX_TOTAL_SIZE = 12 * 1024 * 1024; // 12MB
        const totalSize = imageFiles.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > MAX_TOTAL_SIZE) {
            const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
            return fail(400, { form, error: `La taille totale des images dépasse 12 MB. Taille actuelle: ${totalSizeMB} MB` });
        }

        // Vérifier s'il y a une nouvelle catégorie à créer
        const newCategoryName = formData.get('newCategoryName') as string;
        let finalCategoryId = category_id;

        // Créer la nouvelle catégorie si nécessaire
        if (newCategoryName && newCategoryName.trim()) {
            try {
                const { data: newCategory, error: categoryError } = await locals.supabase
                    .from('categories')
                    .insert({
                        name: newCategoryName.trim(),
                        shop_id: shopId
                    })
                    .select()
                    .single();

                if (categoryError) {
                    return fail(500, { form, error: 'Erreur lors de la création de la catégorie' });
                }

                // Utiliser l'ID de la nouvelle catégorie
                finalCategoryId = newCategory.id;
            } catch (err) {
                return fail(500, { form, error: 'Erreur lors de la création de la catégorie' });
            }
        } else if (category_id === 'temp-new-category') {
            // Si l'ID est temporaire mais qu'il n'y a pas de nouveau nom, erreur
            return fail(400, { form, error: 'Erreur: catégorie temporaire sans nom' });
        }

        // Les champs de personnalisation sont déjà validés et parsés par Superforms
        const validatedCustomizationFields = customizationFields || [];

        let product: { id: string } | null = null;

        try {
            // Créer le produit d'abord (sans image_url pour l'instant)
            const { data: productData, error: insertError } = await locals.supabase
                .from('products')
                .insert({
                    name,
                    description: description ?? null,
                    base_price,
                    category_id: (finalCategoryId && finalCategoryId.trim()) ? finalCategoryId : null,
                    shop_id: shopId,
                    min_days_notice: min_days_notice ?? 0,
                    cake_type: null,
                    deposit_percentage: deposit_percentage ?? 50,
                    booking_type: booking_type || 'pickup',
                    min_reservation_days: booking_type === 'reservation' ? (min_reservation_days ?? 1) : 0
                })
                .select()
                .single();

            if (insertError) {
                await ErrorLogger.logCritical(insertError, {
                    userId: userId,
                    shopId: shopId,
                    productName: name,
                }, {
                    action: 'createProduct',
                    step: 'insert_product',
                });
                const userMessage =
                    insertError.code === '23503'
                        ? 'Catégorie invalide ou supprimée. Choisissez une autre catégorie ou créez-en une.'
                        : insertError.message || 'Erreur lors de l\'ajout du produit';
                return fail(500, { form, error: userMessage });
            }

            product = productData;

            // Uploader toutes les images et les insérer dans product_images
            if (imageFiles.length > 0) {
                const uploadedImages = [];
                for (let i = 0; i < imageFiles.length; i++) {
                    const file = imageFiles[i];

                    // Vérifier que c'est bien une image
                    if (!file.type.startsWith('image/')) {
                        return fail(400, { form, error: 'Tous les fichiers doivent être des images valides (JPG, PNG, etc.)' });
                    }

                    try {
                        // Upload vers Cloudinary
                        const uploadResult = await uploadProductImage(file, shopId, product.id, i);

                        // Insérer dans product_images
                        const { error: imageInsertError } = await locals.supabase
                            .from('product_images')
                            .insert({
                                product_id: product.id,
                                image_url: uploadResult.secure_url,
                                public_id: uploadResult.public_id,
                                display_order: i
                            });

                        if (imageInsertError) {
                            await ErrorLogger.logCritical(imageInsertError, {
                                userId: userId,
                                shopId: shopId,
                                productId: product.id,
                                imageIndex: i,
                            }, {
                                action: 'createProduct',
                                step: 'insert_product_image',
                            });
                        } else {
                            uploadedImages.push(uploadResult.secure_url);
                        }
                    } catch (err) {
                        await ErrorLogger.logCritical(err, {
                            userId: userId,
                            shopId: shopId,
                            productId: product.id,
                            imageIndex: i,
                        }, {
                            action: 'createProduct',
                            step: 'upload_image_cloudinary',
                        });
                    }
                }

                // Mettre à jour image_url du produit avec la première image (pour rétrocompatibilité)
                if (uploadedImages.length > 0) {
                    await locals.supabase
                        .from('products')
                        .update({ image_url: uploadedImages[0] })
                        .eq('id', product.id);
                }
            }

            // Create form if customization fields are provided
            if (validatedCustomizationFields.length > 0) {
                // Create the form
                const { data: newForm, error: formError } = await locals.supabase
                    .from('forms')
                    .insert({
                        shop_id: shopId,
                        is_custom_form: false
                    })
                    .select()
                    .single();

                if (formError) {
                    await ErrorLogger.logCritical(formError, {
                        userId: userId,
                        shopId: shopId,
                        productId: product.id,
                    }, {
                        action: 'createProduct',
                        step: 'create_form',
                    });
                    return fail(500, { form, error: 'Erreur lors de la création du formulaire' });
                }

                // Create form fields
                const formFields = validatedCustomizationFields.map((field, index) => ({
                    form_id: newForm.id,
                    label: field.label,
                    type: field.type,
                    options: field.options && field.options.length > 0 ? field.options : null,
                    required: field.required,
                    order: index + 1
                }));

                const { error: fieldsError } = await locals.supabase
                    .from('form_fields')
                    .insert(formFields);

                if (fieldsError) {
                    await ErrorLogger.logCritical(fieldsError, {
                        userId: userId,
                        shopId: shopId,
                        productId: product.id,
                        formId: newForm.id,
                    }, {
                        action: 'createProduct',
                        step: 'create_form_fields',
                    });
                    return fail(500, { form, error: 'Erreur lors de la création des champs du formulaire' });
                }

                // Update product with form_id
                const { error: updateError } = await locals.supabase
                    .from('products')
                    .update({ form_id: newForm.id })
                    .eq('id', product.id);

                if (updateError) {
                    await ErrorLogger.logCritical(updateError, {
                        userId: userId,
                        shopId: shopId,
                        productId: product.id,
                        formId: newForm.id,
                    }, {
                        action: 'createProduct',
                        step: 'associate_form_to_product',
                    });
                    return fail(500, { form, error: 'Erreur lors de l\'association du formulaire au produit' });
                }
            }
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
            }, {
                action: 'createProduct',
                step: 'general_error',
            });
            return fail(500, { form, error: 'Erreur inattendue lors de l\'ajout du produit' });
        }

        // Increment catalog version to invalidate public cache
        // ✅ Tracking: Product added (fire-and-forget pour ne pas bloquer)
        if (product) {
            const { logEventAsync, Events } = await import('$lib/utils/analytics');
            logEventAsync(
                locals.supabaseServiceRole,
                Events.PRODUCT_ADDED,
                { product_id: product.id, product_name: name, shop_id: shopId },
                userId,
                '/dashboard/products/new'
            );
        }

        // Retourner un succès pour Superforms
        form.message = 'Produit créé avec succès';
        return { form };
    },

    createCategory: async ({ request, locals }) => {
        // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
        const formData = await request.formData();
        const shopId = formData.get('shopId') as string;

        if (!shopId) {
            return fail(400, { error: 'Données de boutique manquantes' });
        }

        // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
        const { session } = await locals.safeGetSession();
        const userId = session?.user.id;

        if (!userId) {
            return fail(401, { error: 'Non autorisé' });
        }

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getShopIdAndSlug + requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            return fail(403, { error: 'Accès non autorisé à cette boutique' });
        }

        // Valider avec Superforms
        const form = await superValidate(formData, zod(createCategoryFormSchema));

        if (!form.valid) {
            return fail(400, { form });
        }

        const { name: trimmedName } = form.data;

        try {
            // ✅ OPTIMISÉ : Créer la nouvelle catégorie (vérifier d'abord, puis insérer si nécessaire)
            // Vérifier si la catégorie existe déjà
            const { data: existingCategory, error: checkError } = await locals.supabase
                .from('categories')
                .select('id, name')
                .eq('name', trimmedName)
                .eq('shop_id', shopId)
                .maybeSingle();

            let newCategory;

            if (existingCategory) {
                // La catégorie existe déjà, on la réutilise
                newCategory = existingCategory;
            } else {
                // Créer la nouvelle catégorie
                const { data: insertedCategory, error: insertError } = await locals.supabase
                    .from('categories')
                    .insert({
                        name: trimmedName,
                        shop_id: shopId
                    })
                    .select('id, name')
                    .single();

                if (insertError) {
                    return fail(500, { form, error: `Erreur lors de la création de la catégorie: ${insertError.message || insertError.code || 'Erreur inconnue'}` });
                }

                newCategory = insertedCategory;
            }


            // Retourner un succès pour Superforms
            form.message = 'Catégorie créée avec succès';
            return { form, category: newCategory };
        } catch (err) {
            return fail(500, { form, error: 'Erreur inattendue lors de la création de la catégorie' });
        }
    }
};
