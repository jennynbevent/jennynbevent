import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { verifyShopOwnership } from '$lib/auth';
import { uploadProductImage, deleteImage, extractPublicIdFromUrl } from '$lib/cloudinary';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { updateProductFormSchema, createCategoryFormSchema } from './schema.js';
import { ErrorLogger } from '$lib/services/error-logging';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
    // ✅ OPTIMISÉ : Utiliser shopId et shop du parent (déjà chargé)
    const { permissions, shop } = await parent();
    const productId = params.id;

    if (!productId) {
        throw error(404, 'Produit non trouvé');
    }

    if (!permissions.shopId || !shop) {
        throw error(500, 'Erreur lors du chargement de la boutique');
    }

    const shopId = permissions.shopId;

    // ✅ OPTIMISÉ : 1 requête pour récupérer le produit avec sa catégorie
    const { data: product, error: productError } = await locals.supabase
        .from('products')
        .select(`*,categories(name)`)
        .eq('id', productId)
        .eq('shop_id', shopId)
        .single();

    if (productError || !product) {
        throw error(404, 'Produit non trouvé');
    }

    // ✅ OPTIMISÉ : Récupérer catégories, form_fields et images en parallèle (3 requêtes simultanées)
    const [categoriesResult, formFieldsResult, imagesResult] = await Promise.all([
        // Récupérer les catégories disponibles (nécessaire pour le dropdown)
        locals.supabase
            .from('categories')
            .select('id, name')
            .eq('shop_id', shopId)
            .order('name'),
        // Récupérer le formulaire de personnalisation s'il existe
        product.form_id
            ? locals.supabase
                .from('form_fields')
                .select('*')
                .eq('form_id', product.form_id)
                .order('order')
            : Promise.resolve({ data: null, error: null }),
        // Récupérer les images du produit
        locals.supabase
            .from('product_images')
            .select('*')
            .eq('product_id', productId)
            .order('display_order', { ascending: true })
    ]);

    const categories = categoriesResult.data || [];
    if (categoriesResult.error) {
        console.error('Error fetching categories:', categoriesResult.error);
    }

    // Extraire et normaliser les form_fields
    let customizationFields: any[] = [];
    if (formFieldsResult.data && Array.isArray(formFieldsResult.data)) {
        // Normaliser les champs pour s'assurer qu'ils ont la bonne structure
        customizationFields = formFieldsResult.data.map(field => {
            const normalizedField: any = {
                id: field.id,
                label: field.label,
                type: field.type,
                required: field.required,
                order: field.order
            };

            // Pour les champs de sélection, s'assurer qu'ils ont des options
            if (field.type === 'single-select' || field.type === 'multi-select') {
                normalizedField.options = (field as any).options || [
                    { label: '', price: 0 },
                    { label: '', price: 0 }
                ];
            } else {
                // Pour les champs texte/nombre, s'assurer qu'ils ont options: []
                normalizedField.options = [];
            }

            return normalizedField;
        });
    }

    // Charger les images du produit
    const productImages = imagesResult.data || [];

    // Si pas d'images dans product_images mais qu'il y a image_url, créer une image par défaut
    if (productImages.length === 0 && product.image_url) {
        productImages.push({
            id: undefined,
            image_url: product.image_url,
            public_id: null,
            display_order: 0
        });
    }

    // Initialiser Superforms pour l'édition
    const updateProductForm = await superValidate(
        zod(updateProductFormSchema),
        {
            defaults: {
                name: product.name,
                description: product.description || '',
                base_price: product.base_price,
                category_id: product.category_id || '',
                min_days_notice: product.min_days_notice,
                deposit_percentage: product.deposit_percentage ?? 50,
                booking_type: (product as any).booking_type || 'pickup',
                min_reservation_days: (product as any).min_reservation_days ?? 1,
                show_delivery_options: !!(product as any).show_delivery_options,
                customizationFields: customizationFields
            }
        }
    );

    // Initialiser Superforms pour les catégories
    const createCategoryForm = await superValidate(zod(createCategoryFormSchema));

    return {
        product: {
            ...product,
            images: productImages
        },
        categories: categories || [],
        customizationFields,
        updateProductForm,
        createCategoryForm,
        shopId: permissions.shopId,
        shopSlug: permissions.shopSlug || shop.slug
    };
};

export const actions: Actions = {
    updateProduct: async ({ request, locals, params }) => {
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

        // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getShopIdAndSlug + requête shop)
        const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
        if (!isOwner) {
            return fail(403, { error: 'Accès non autorisé à cette boutique' });
        }

        const productId = params.id;

        if (!productId) {
            return fail(404, {
                error: 'Produit non trouvé'
            });
        }

        // Valider avec Superforms
        const form = await superValidate(formData, zod(updateProductFormSchema));

        if (!form.valid) {
            return fail(400, { form });
        }

        // Extraire les données validées
        const { name, description, base_price, category_id, min_days_notice, deposit_percentage, booking_type, min_reservation_days, show_delivery_options, customizationFields } = form.data;

        // Récupérer toutes les nouvelles images depuis formData
        const newImageFiles: File[] = [];
        let index = 0;
        while (formData.has(`images-${index}`)) {
            const file = formData.get(`images-${index}`) as File;
            if (file && file.size > 0) {
                newImageFiles.push(file);
            }
            index++;
        }

        // Récupérer les IDs des images existantes à conserver
        const existingImageIds: string[] = [];
        let existingIndex = 0;
        while (formData.has(`existing-image-id-${existingIndex}`)) {
            const id = formData.get(`existing-image-id-${existingIndex}`) as string;
            if (id) {
                existingImageIds.push(id);
            }
            existingIndex++;
        }

        console.log('📥 [Product Update] Existing image IDs to keep:', existingImageIds);
        console.log('📥 [Product Update] New image files:', newImageFiles.length);

        // Vérifier la limite de 3 images total
        const totalImages = existingImageIds.length + newImageFiles.length;
        if (totalImages > 3) {
            return fail(400, { form, error: 'Vous ne pouvez pas avoir plus de 3 images' });
        }

        // Vérifier la taille cumulée des nouvelles images (max 12MB)
        const MAX_TOTAL_SIZE = 12 * 1024 * 1024; // 12MB
        const totalNewSize = newImageFiles.reduce((sum, file) => sum + file.size, 0);
        if (totalNewSize > MAX_TOTAL_SIZE) {
            const totalSizeMB = (totalNewSize / (1024 * 1024)).toFixed(2);
            return fail(400, { form, error: `La taille totale des nouvelles images dépasse 12 MB. Taille actuelle: ${totalSizeMB} MB` });
        }

        // Vérifier s'il y a une nouvelle catégorie à créer
        const newCategoryName = formData.get('newCategoryName') as string;
        let finalCategoryId = category_id;

        // ✅ OPTIMISÉ : Créer la nouvelle catégorie (vérifier d'abord, puis insérer si nécessaire)
        if (newCategoryName && newCategoryName.trim()) {
            try {
                // Vérifier si la catégorie existe déjà
                const { data: existingCategory, error: checkError } = await locals.supabase
                    .from('categories')
                    .select('id')
                    .eq('name', newCategoryName.trim())
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
                            name: newCategoryName.trim(),
                            shop_id: shopId
                        })
                        .select('id')
                        .single();

                    if (insertError) {
                        await ErrorLogger.logCritical(insertError, {
                            userId: userId,
                            shopId: shopId,
                            productId: productId,
                            categoryName: newCategoryName,
                        }, {
                            action: 'updateProduct',
                            step: 'create_category',
                        });
                        return fail(500, { form, error: `Erreur lors de la création de la catégorie: ${insertError.message || insertError.code || 'Erreur inconnue'}` });
                    }

                    newCategory = insertedCategory;
                }

                finalCategoryId = newCategory.id;
            } catch (err) {
                await ErrorLogger.logCritical(err, {
                    userId: userId,
                    shopId: shopId,
                    productId: productId,
                    categoryName: newCategoryName,
                }, {
                    action: 'updateProduct',
                    step: 'create_category_catch',
                });
                return fail(500, { form, error: 'Erreur lors de la création de la catégorie' });
            }
        }

        // Gérer le cas de la catégorie temporaire
        if (finalCategoryId === 'temp-new-category') {
            if (!newCategoryName || !newCategoryName.trim()) {
                return fail(400, { form, error: 'Nom de catégorie requis pour la nouvelle catégorie' });
            }
            // La catégorie a déjà été créée ci-dessus
        }

        try {
            // ✅ OPTIMISÉ : Récupérer le produit avec form_id et les images existantes
            const [currentProductResult, existingImagesResult] = await Promise.all([
                locals.supabase
                    .from('products')
                    .select('image_url, form_id')
                    .eq('id', productId)
                    .eq('shop_id', shopId)
                    .single(),
                locals.supabase
                    .from('product_images')
                    .select('*')
                    .eq('product_id', productId)
                    .order('display_order', { ascending: true })
            ]);

            const currentProduct = currentProductResult.data;
            const currentFormId = currentProduct?.form_id || null;
            const existingImages = existingImagesResult.data || [];

            // Supprimer les images qui ne sont plus dans la liste à conserver
            const imagesToDelete = existingImages.filter(img => !existingImageIds.includes(img.id));
            for (const imageToDelete of imagesToDelete) {
                // Supprimer de Cloudinary si public_id existe
                if (imageToDelete.public_id) {
                    try {
                        await deleteImage(imageToDelete.public_id);
                    } catch (err) {
                        console.error('❌ [Product Update] Erreur suppression Cloudinary:', err);
                    }
                }
                // Supprimer de la base de données
                await locals.supabase
                    .from('product_images')
                    .delete()
                    .eq('id', imageToDelete.id);
            }

            // Uploader les nouvelles images
            const uploadedImages: Array<{ url: string, public_id: string }> = [];
            for (let i = 0; i < newImageFiles.length; i++) {
                const file = newImageFiles[i];

                // Vérifier que c'est bien une image
                if (!file.type.startsWith('image/')) {
                    return fail(400, { form, error: 'Tous les fichiers doivent être des images valides (JPG, PNG, etc.)' });
                }

                try {
                    // Upload vers Cloudinary
                    const uploadResult = await uploadProductImage(file, shopId, productId, existingImageIds.length + i);

                    // Insérer dans product_images
                    const { error: imageInsertError } = await locals.supabase
                        .from('product_images')
                        .insert({
                            product_id: productId,
                            image_url: uploadResult.secure_url,
                            public_id: uploadResult.public_id,
                            display_order: existingImageIds.length + i
                        });

                    if (imageInsertError) {
                        await ErrorLogger.logCritical(imageInsertError, {
                            userId: userId,
                            shopId: shopId,
                            productId: productId,
                            imageIndex: i,
                        }, {
                            action: 'updateProduct',
                            step: 'insert_product_image',
                        });
                    } else {
                        uploadedImages.push({
                            url: uploadResult.secure_url,
                            public_id: uploadResult.public_id || ''
                        });
                    }
                } catch (err) {
                    await ErrorLogger.logCritical(err, {
                        userId: userId,
                        shopId: shopId,
                        productId: productId,
                        imageIndex: i,
                    }, {
                        action: 'updateProduct',
                        step: 'upload_image_cloudinary',
                    });
                }
            }

            // Mettre à jour l'ordre des images existantes conservées
            for (let i = 0; i < existingImageIds.length; i++) {
                await locals.supabase
                    .from('product_images')
                    .update({ display_order: i })
                    .eq('id', existingImageIds[i]);
            }

            // Récupérer toutes les images finales pour mettre à jour image_url du produit (rétrocompatibilité)
            const { data: allImages } = await locals.supabase
                .from('product_images')
                .select('image_url')
                .eq('product_id', productId)
                .order('display_order', { ascending: true })
                .limit(1);

            // Mettre à jour le produit
            const updateData: Record<string, unknown> = {
                name,
                description: description ?? null,
                base_price,
                category_id: (finalCategoryId && String(finalCategoryId).trim()) ? finalCategoryId : null,
                min_days_notice: min_days_notice ?? 0,
                deposit_percentage: deposit_percentage ?? 50,
                booking_type: booking_type || 'pickup',
                min_reservation_days: booking_type === 'reservation' ? (min_reservation_days ?? 1) : 0,
                show_delivery_options: booking_type === 'reservation' ? false : !!show_delivery_options
            };

            // Mettre à jour image_url avec la première image (pour rétrocompatibilité)
            if (allImages && allImages.length > 0) {
                updateData.image_url = allImages[0].image_url;
            } else {
                updateData.image_url = null;
            }

            const { data: updatedProduct, error: updateError } = await locals.supabase
                .from('products')
                .update(updateData)
                .eq('id', productId)
                .eq('shop_id', shopId)
                .select()
                .single();

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId: userId,
                    shopId: shopId,
                    productId: productId,
                }, {
                    action: 'updateProduct',
                    step: 'update_product',
                });
                return fail(500, {
                    form,
                    error: 'Erreur lors de la modification du produit'
                });
            }

            // Note: La suppression des anciennes images Cloudinary est gérée lors de la suppression des images dans product_images

            // Mettre à jour les champs de personnalisation si fournis
            if (customizationFields !== undefined) { // Vérifier si le champ est présent (même vide)
                try {

                    if (updatedProduct.form_id) {
                        // Récupérer les champs existants pour comparer
                        const { data: existingFields, error: fetchError } = await locals.supabase
                            .from('form_fields')
                            .select('id, label, type, options, required, order')
                            .eq('form_id', updatedProduct.form_id)
                            .order('order');

                        if (fetchError) {
                            return fail(500, {
                                form,
                                error: 'Erreur lors de la récupération des champs existants'
                            });
                        }


                        // Identifier les champs à supprimer (ceux qui existent mais ne sont plus dans la nouvelle liste)
                        const fieldsToDelete = existingFields.filter(existingField =>
                            !customizationFields.some(newField => newField.id === existingField.id)
                        );

                        // Identifier les champs à mettre à jour ou ajouter
                        const fieldsToUpsert = customizationFields.map((field: any, index: number) => ({
                            id: field.id || undefined, // Garder l'ID si il existe
                            form_id: updatedProduct.form_id,
                            label: field.label,
                            type: field.type,
                            options: field.options && field.options.length > 0 ? field.options : null,
                            required: field.required,
                            order: index + 1
                        }));


                        // ✅ OPTIMISÉ : Regrouper toutes les suppressions en une seule requête
                        // Identifier tous les IDs à supprimer (champs supprimés + cas où tous les champs sont supprimés)
                        const idsToDelete: string[] = [];

                        if (fieldsToUpsert.length === 0 && existingFields.length > 0) {
                            // Tous les champs ont été supprimés
                            idsToDelete.push(...existingFields.map(f => f.id));
                        } else if (fieldsToDelete.length > 0) {
                            // Seulement les champs spécifiques à supprimer
                            idsToDelete.push(...fieldsToDelete.map(f => f.id));
                        }

                        // Supprimer tous les champs en une seule requête
                        if (idsToDelete.length > 0) {
                            const { error: deleteError } = await locals.supabase
                                .from('form_fields')
                                .delete()
                                .in('id', idsToDelete);

                            if (deleteError) {
                                return fail(500, {
                                    form,
                                    error: 'Erreur lors de la suppression des champs'
                                });
                            }
                        }

                        // Mettre à jour ou ajouter les champs
                        if (fieldsToUpsert.length > 0) {
                            const { error: upsertError } = await locals.supabase
                                .from('form_fields')
                                .upsert(fieldsToUpsert, {
                                    onConflict: 'id',
                                    ignoreDuplicates: false
                                });

                            if (upsertError) {
                                return fail(500, {
                                    form,
                                    error: 'Erreur lors de la mise à jour des champs de personnalisation'
                                });
                            }
                        }
                    } else if (customizationFields.length > 0) {
                        // Créer un nouveau formulaire si le produit n'en avait pas
                        const { data: newForm, error: formError } = await locals.supabase
                            .from('forms')
                            .insert({
                                shop_id: shopId,
                                is_custom_form: false
                            })
                            .select()
                            .single();

                        if (formError) {
                            return fail(500, {
                                form,
                                error: 'Erreur lors de la création du formulaire'
                            });
                        }

                        // Ajouter les champs
                        const formFields = customizationFields.map((field: any, index: number) => ({
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
                                productId: productId,
                                formId: newForm.id,
                            }, {
                                action: 'updateProduct',
                                step: 'create_form_fields',
                            });
                            return fail(500, {
                                form,
                                error: 'Erreur lors de la création des champs de personnalisation'
                            });
                        }

                        // Associer le formulaire au produit
                        await locals.supabase
                            .from('products')
                            .update({ form_id: newForm.id })
                            .eq('id', productId);
                    }
                } catch (parseError) {
                    return fail(400, {
                        form,
                        error: 'Erreur lors du traitement des champs de personnalisation'
                    });
                }
            }
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                productId: productId,
            }, {
                action: 'updateProduct',
                step: 'general_error',
            });
            return fail(500, {
                form,
                error: 'Erreur inattendue lors de la modification du produit: ' + (err instanceof Error ? err.message : String(err))
            });
        }

        // Increment catalog version to invalidate public cache
        // Retourner un succès avec le formulaire Superforms
        form.message = 'Produit modifié avec succès';
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

        // Extraire les données validées
        const { name: categoryName } = form.data;
        const trimmedName = categoryName.trim();

        try {
            const { data: newCategory, error: categoryError } = await locals.supabase
                .from('categories')
                .insert({
                    name: trimmedName,
                    shop_id: shopId
                })
                .select()
                .single();

            if (categoryError) {
                return fail(500, { form, error: 'Erreur lors de la création de la catégorie' });
            }

            // Retourner le succès avec le formulaire et la nouvelle catégorie
            form.message = 'Catégorie créée avec succès';
            return { form, category: newCategory };
        } catch (err) {
            return fail(500, { form, error: 'Erreur lors de la création de la catégorie' });
        }
    }
};