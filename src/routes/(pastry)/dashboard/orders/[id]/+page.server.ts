import { getDeliveryMode } from '$lib/utils/delivery';
import { optionLines } from '$lib/cart/options';
import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { getUserPermissions, verifyShopOwnership } from '$lib/auth';
import { PUBLIC_SITE_URL } from '$env/static/public';
import { superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';
import { makeQuoteFormSchema, rejectOrderFormSchema, personalNoteFormSchema } from './schema.js';
import { EmailService } from '$lib/services/email-service';
import { ErrorLogger } from '$lib/services/error-logging';
import { getShopColorFromShopId } from '$lib/emails/helpers';
import { amountDueNow } from '$lib/utils/deposit';
import { buildOrderEmailExtras } from '$lib/emails/order-extras';
import { isOwnPrintFileUrl, fetchPrintFile } from '$lib/cloudinary';


export const load: PageServerLoad = async ({ params, locals, parent }) => {
    try {
        // ✅ OPTIMISÉ : Utiliser user et permissions du parent (déjà chargés)
        const { user, permissions } = await parent();

        if (!user) {
            throw error(401, 'Non autorisé');
        }

        // Vérifier d'abord si c'est une pending_order
        const { data: pendingOrder, error: pendingError } = await locals.supabase
            .from('pending_orders')
            .select('*')
            .eq('id', params.id)
            .maybeSingle();

        if (pendingOrder && !pendingError) {
            // C'est une pending_order
            const orderData = pendingOrder.order_data as any;

            // Vérifier que cette pending_order appartient à cette boutique
            if (orderData?.shop_id !== permissions.shopId) {
                throw error(403, 'Accès non autorisé');
            }

            // Récupérer les informations de la boutique
            const { data: shop } = await locals.supabase
                .from('shops')
                .select('id, name, slug, logo_url')
                .eq('id', permissions.shopId)
                .single();

            if (!shop) {
                throw error(404, 'Boutique non trouvée');
            }

            // Récupérer le produit si disponible
            let product = null;
            if (orderData.product_id) {
                const { data: productData } = await locals.supabase
                    .from('products')
                    .select('base_price, deposit_percentage, image_url, booking_type')
                    .eq('id', orderData.product_id)
                    .single();
                product = productData;
            }

            // Transformer en format similaire à order pour l'affichage
            const order = {
                id: pendingOrder.id,
                customer_name: orderData.customer_name || 'Client inconnu',
                customer_email: orderData.customer_email || '',
                customer_phone: orderData.customer_phone || null,
                customer_instagram: orderData.customer_instagram || null,
                pickup_date: orderData.pickup_date,
                pickup_time: orderData.pickup_time || null,
                pickup_date_end: orderData.pickup_date_end || null,
                status: 'non_finalisee',
                total_amount: orderData.total_amount || null,
                paid_amount: null,
                product_name: orderData.product_name || null,
                product_base_price: product?.base_price || null,
                additional_information: orderData.additional_information || null,
                customization_data: orderData.customization_data || null,
					inspiration_photos: orderData.inspiration_photos || [],
                chef_message: null,
                chef_pickup_date: null,
                chef_pickup_time: null,
                order_ref: pendingOrder.order_ref || null,
                created_at: pendingOrder.created_at,
                is_pending: true
            };

            // Initialiser les formulaires Superforms
            const makeQuoteForm = await superValidate(zod(makeQuoteFormSchema));
            const rejectOrderForm = await superValidate(zod(rejectOrderFormSchema));
            const personalNoteForm = await superValidate(zod(personalNoteFormSchema));

            return {
                order,
                shop,
                paidAmount: null,
                personalNote: null,
                makeQuoteForm,
                rejectOrderForm,
                personalNoteForm,
                isPending: true,
                product
            };
        }

        // Sinon, c'est une commande normale
        // ✅ OPTIMISÉ : Un seul appel DB pour toutes les données de commande
        const { data: orderDetailData, error: rpcError } = await locals.supabase.rpc('get_order_detail_data', {
            p_order_id: params.id,
            p_profile_id: user.id
        });

        if (rpcError) {
            console.error('Error fetching order detail data:', rpcError);
            throw error(404, 'Commande non trouvée');
        }

        const { order, personalNote, shop } = orderDetailData;

        if (!order || !shop) {
            throw error(404, 'Commande non trouvée');
        }

        // ✅ AJOUTER shopId au shop (le RPC ne le retourne pas, mais on l'a depuis permissions)
        const shopWithId = {
            ...shop,
            id: permissions.shopId
        };

        // Récupérer le produit (booking_type pour libellé "Date de location")
        let product = null;
        if (order.product_id) {
            const { data: productData } = await locals.supabase
                .from('products')
                .select('booking_type')
                .eq('id', order.product_id)
                .single();
            product = productData;
        }

        // Récupérer le montant payé depuis la DB
        const paidAmount = order.paid_amount;

        // PDF envoyé au client (si la colonne existe et qu'un fichier a été envoyé)
        let printFile: { name: string; sentAt: string | null } | null = null;
        try {
            const { data: pf } = await (locals.supabase as any)
                .from('orders')
                .select('print_file_url, print_file_name, print_file_sent_at')
                .eq('id', params.id)
                .eq('shop_id', permissions.shopId)
                .maybeSingle();
            if (pf?.print_file_url) {
                printFile = { name: pf.print_file_name || 'fichier.pdf', sentAt: pf.print_file_sent_at || null };
            }
        } catch {
            printFile = null;
        }

        // Panier : les autres articles commandés en même temps
        let cart: { ref: string; total: number; items: Array<{ id: string; name: string; price: number; status: string; mode: string }> } | null = null;
        try {
            const { data: refRow } = await (locals.supabaseServiceRole as any)
                .from('orders')
                .select('cart_ref')
                .eq('id', params.id)
                .eq('shop_id', permissions.shopId)
                .maybeSingle();
            if (refRow?.cart_ref) {
                const { data: siblings } = await (locals.supabaseServiceRole as any)
                    .from('orders')
                    .select('id, product_name, total_amount, status, customization_data, created_at')
                    .eq('cart_ref', refRow.cart_ref)
                    .eq('shop_id', permissions.shopId)
                    .order('created_at', { ascending: true });
                const items = (siblings || []).map((o: any) => ({
                    id: o.id,
                    name: o.product_name,
                    price: Number(o.total_amount) || 0,
                    status: o.status,
                    mode: getDeliveryMode(o.customization_data) === 'email' ? 'email' : 'print',
                }));
                if (items.length > 1) {
                    cart = { ref: refRow.cart_ref, items, total: Math.round(items.reduce((t: number, i: any) => t + i.price, 0) * 100) / 100 };
                }
            }
        } catch {
            cart = null;
        }

        // Initialiser les formulaires Superforms
        const makeQuoteForm = await superValidate(zod(makeQuoteFormSchema));
        const rejectOrderForm = await superValidate(zod(rejectOrderFormSchema));
        const personalNoteForm = await superValidate(
            zod(personalNoteFormSchema),
            {
                defaults: {
                    note: personalNote?.note || ''
                }
            }
        );

        return {
            order,
            shop: shopWithId,
            product,
            paidAmount,
            personalNote: personalNote || null,
            makeQuoteForm,
            rejectOrderForm,
            personalNoteForm,
            isPending: false,
            printFile,
            cart
        };
    } catch (err) {
        throw err;
    }
};

export const actions: Actions = {
    // Valider une pending_order (convertir en order)
    validatePendingOrder: async ({ params, request, locals }) => {
        try {
            // Récupérer l'utilisateur depuis la session
            const { session, user } = await locals.safeGetSession();

            if (!session || !user) {
                return fail(401, { error: 'Non autorisé' });
            }

            // Récupérer les permissions de l'utilisateur
            const permissions = await getUserPermissions(user.id, locals.supabase);

            if (!permissions.shopId) {
                return fail(403, { error: 'Boutique non trouvée' });
            }

            // Récupérer la pending_order
            const { data: pendingOrder, error: pendingOrderError } = await (locals.supabaseServiceRole as any)
                .from('pending_orders')
                .select('*')
                .eq('id', params.id)
                .single();

            if (pendingOrderError || !pendingOrder) {
                await ErrorLogger.logCritical(
                    pendingOrderError || new Error('Pending order not found'),
                    {
                        pendingOrderId: params.id,
                        userId: user.id,
                    },
                    {
                        action: 'validatePendingOrder',
                        step: 'fetch_pending_order',
                    }
                );
                return fail(404, { error: 'Commande non trouvée' });
            }

            const orderData = pendingOrder.order_data as any;

            // Vérifier que cette pending_order appartient à cette boutique
            const shopId = permissions.shopId;
            if (orderData?.shop_id !== shopId) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Récupérer les informations du produit et de la boutique
            const { data: product, error: productError } = await (locals.supabaseServiceRole as any)
                .from('products')
                .select('base_price, deposit_percentage, image_url, shops(slug, logo_url, name, profile_id)')
                .eq('id', orderData.product_id)
                .single();

            if (productError || !product) {
                await ErrorLogger.logCritical(
                    productError || new Error('Product not found'),
                    {
                        pendingOrderId: params.id,
                        productId: orderData.product_id,
                        shopId: orderData.shop_id,
                    },
                    {
                        action: 'validatePendingOrder',
                        step: 'fetch_product',
                    }
                );
                return fail(500, { error: 'Produit non trouvé' });
            }

            // Calculer les montants
            const totalAmount = orderData.total_amount;
            // Total payé, sauf si un acompte est activé sur l'article
            const paidAmount = amountDueNow(totalAmount, product.deposit_percentage);
            const remainingAmount = totalAmount - paidAmount;

            // Créer l'order avec statut "confirmed" (validé manuellement par le pâtissier)
            const { data: order, error: orderError } = await (locals.supabaseServiceRole as any)
                .from('orders')
                .insert({
                    shop_id: orderData.shop_id,
                    product_id: orderData.product_id,
                    customer_name: orderData.customer_name,
                    customer_email: orderData.customer_email,
                    customer_phone: orderData.customer_phone || null,
                    customer_instagram: orderData.customer_instagram || null,
                    pickup_date: orderData.pickup_date,
                    pickup_time: orderData.pickup_time || null,
                    pickup_date_end: orderData.pickup_date_end || null,
                    additional_information: orderData.additional_information || null,
                    customization_data: orderData.customization_data || null,
					inspiration_photos: orderData.inspiration_photos || [],
                    status: 'confirmed',
                    total_amount: totalAmount,
                    paid_amount: paidAmount,
                    product_name: orderData.product_name,
                    product_base_price: product.base_price || 0,
                    order_ref: pendingOrder.order_ref,
                    payment_provider: null // Paiement manuel validé par le pâtissier
                })
                .select()
                .single();

            if (orderError || !order) {
                await ErrorLogger.logCritical(
                    orderError || new Error('Failed to create order'),
                    {
                        pendingOrderId: params.id,
                        shopId: orderData.shop_id,
                        productId: orderData.product_id,
                    },
                    {
                        action: 'validatePendingOrder',
                        step: 'create_order',
                    }
                );
                return fail(500, { error: 'Erreur lors de la création de la commande' });
            }

            // Tracking: Order received
            const { logEventAsync, Events } = await import('$lib/utils/analytics');
            logEventAsync(
                locals.supabaseServiceRole,
                Events.ORDER_RECEIVED,
                {
                    order_id: order.id,
                    order_ref: pendingOrder.order_ref,
                    shop_id: orderData.shop_id,
                    product_id: orderData.product_id,
                    total_amount: totalAmount,
                    order_type: 'product_order'
                },
                user.id,
                `/dashboard/orders/${params.id}`
            );

            // Envoyer l'email de confirmation uniquement au client
            try {
                // Récupérer la couleur de la boutique pour l'email
                const shopColor = await getShopColorFromShopId(
                    locals.supabaseServiceRole,
                    orderData.shop_id
                );

                await EmailService.sendOrderConfirmation({
                    customerEmail: orderData.customer_email,
                    customerName: orderData.customer_name,
                    shopName: product.shops.name,
                    shopLogo: product.shops.logo_url,
                    productName: orderData.product_name,
                    pickupDate: orderData.pickup_date,
                    pickupTime: orderData.pickup_time,
                    pickupDateEnd: orderData.pickup_date_end ?? undefined,
                    totalAmount: totalAmount,
                    paidAmount: paidAmount,
                    remainingAmount: remainingAmount,
                    orderId: order.id,
                    orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
                    date: new Date().toLocaleDateString('fr-FR'),
                    shopColor,
                    extras: buildOrderEmailExtras(orderData, product.image_url),
                });
            } catch (emailError) {
                console.error('❌ [Validate Pending Order] Email error:', emailError);
                // Ne pas bloquer la commande si l'email échoue
            }

            // Supprimer la pending_order
            const { error: deleteError } = await (locals.supabaseServiceRole as any)
                .from('pending_orders')
                .delete()
                .eq('id', params.id);

            if (deleteError) {
                console.error('❌ [Validate Pending Order] Failed to delete pending order:', deleteError);
                // Ne pas bloquer si la suppression échoue
            }

            // Rediriger vers la liste des commandes
            throw redirect(303, '/dashboard/orders');
        } catch (err) {
            // Si c'est une redirection, la relancer
            if (err && typeof err === 'object' && 'status' in err && err.status === 303) {
                throw err;
            }
            console.error('❌ [Validate Pending Order] Error:', err);
            return fail(500, { error: 'Erreur lors de la validation de la commande' });
        }
    },
    // Sauvegarder/modifier la note personnelle
    savePersonalNote: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
            const formData = await request.formData();
            const shopId = formData.get('shopId') as string;

            // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
            const form = await superValidate(formData, zod(personalNoteFormSchema));

            if (!shopId) {
                return fail(400, { form, error: 'Données de boutique manquantes' });
            }

            // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
            const { session } = await locals.safeGetSession();
            const userId = session?.user.id;

            if (!userId) {
                return fail(401, { form, error: 'Non autorisé' });
            }

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getUserPermissions + requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { form, error: 'Accès non autorisé à cette boutique' });
            }

            if (!form.valid) {
                return fail(400, { form });
            }

            const { note } = form.data;

            if (!note || !note.trim()) {
                return fail(400, { form, error: 'La note ne peut pas être vide' });
            }

            // Insérer ou mettre à jour la note (utiliser shopId directement, pas besoin de requête shop)
            const { error: upsertError } = await locals.supabase
                .from('personal_order_notes')
                .upsert({
                    order_id: params.id,
                    shop_id: shopId,
                    note: note.trim()
                }, {
                    onConflict: 'order_id,shop_id'
                });

            if (upsertError) {
                return fail(500, { form, error: 'Erreur lors de la sauvegarde' });
            }

            // Retourner le succès avec le formulaire Superforms
            form.message = 'Note sauvegardée avec succès';
            return { form };
        } catch (err) {
            const errorForm = await superValidate(zod(personalNoteFormSchema));
            return fail(500, { form: errorForm, error: 'Erreur serveur' });
        }
    },

    // Faire un devis pour une commande en attente
    makeQuote: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
            const formData = await request.formData();
            const shopId = formData.get('shopId') as string;
            const shopSlug = formData.get('shopSlug') as string;

            // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
            const form = await superValidate(formData, zod(makeQuoteFormSchema));

            if (!shopId || !shopSlug) {
                return fail(400, { form, error: 'Données de boutique manquantes' });
            }

            // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
            const { session } = await locals.safeGetSession();
            const userId = session?.user.id;

            if (!userId) {
                return fail(401, { form, error: 'Non autorisé' });
            }

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { form, error: 'Accès non autorisé à cette boutique' });
            }

            if (!form.valid) {
                return fail(400, { form });
            }

            const { price, chef_message: chefMessage, chef_pickup_date: chefPickupDate, chef_pickup_time: chefPickupTime } = form.data;

            if (!price) {
                return fail(400, { form, error: 'Le prix est requis' });
            }

            // ✅ OPTIMISÉ : Récupérer uniquement les infos shop nécessaires (name, logo_url) en une requête
            const { data: shop, error: shopError } = await locals.supabase
                .from('shops')
                .select('id, name, logo_url')
                .eq('id', shopId)
                .single();

            if (shopError || !shop) {
                return fail(404, { form, error: 'Boutique non trouvée' });
            }

            // Générer un order_ref unique pour le paiement du devis
            const { data: orderRefData, error: orderRefError } = await locals.supabase
                .rpc('generate_order_ref');

            if (orderRefError || !orderRefData) {
                console.error('Error generating order_ref:', orderRefError);
                return fail(500, { form, error: 'Erreur lors de la génération de la référence' });
            }

            const order_ref = orderRefData;
            console.log('🆔 [Make Quote] Generated order_ref:', order_ref);

            // Mettre à jour la commande
            const updateData: {
                status: 'quoted';
                total_amount: number;
                chef_message: string | null;
                chef_pickup_date?: string;
                chef_pickup_time?: string;
                order_ref: string;
            } = {
                status: 'quoted',
                total_amount: price,
                chef_message: chefMessage || null,
                order_ref: order_ref
            };

            // Ajouter la nouvelle date de récupération si fournie
            if (chefPickupDate) {
                updateData.chef_pickup_date = chefPickupDate;
            }

            // Ajouter la nouvelle heure de récupération si fournie
            if (chefPickupTime) {
                updateData.chef_pickup_time = chefPickupTime;
            }

            const { data: order, error: updateError } = await locals.supabase
                .from('orders')
                .update(updateData)
                .eq('id', params.id)
                .eq('shop_id', shop.id)
                .select()
                .single();

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId: userId,
                    shopId: shop.id,
                    orderId: params.id,
                }, {
                    action: 'makeQuote',
                    step: 'update_order_status',
                });
                return fail(500, { form, error: 'Erreur lors de la mise à jour de la commande' });
            }

            try {
                // Récupérer la couleur de la boutique pour l'email
                const shopColor = await getShopColorFromShopId(
                    locals.supabaseServiceRole,
                    shop.id
                );

                await Promise.all([
                    EmailService.sendQuote({
                        customerEmail: order.customer_email,
                        customerName: order.customer_name,
                        shopName: shop.name,
                        shopLogo: shop.logo_url || undefined,
                        quoteId: order.id.slice(0, 8),
                        orderUrl: `${PUBLIC_SITE_URL}/${shopSlug}/custom/checkout/${order_ref}`,
                        date: new Date().toLocaleDateString("fr-FR"),
                        shopColor,
                    })
                ]);
            } catch (e) {
                await ErrorLogger.logCritical(e, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                }, {
                    action: 'makeQuote',
                    step: 'send_emails',
                });
            }

            // Retourner le succès avec le formulaire Superforms
            form.message = 'Devis envoyé avec succès';
            return { form };
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                orderId: params.id,
            }, {
                action: 'makeQuote',
                step: 'general_error',
            });
            // Créer un formulaire vide pour retourner l'erreur
            const errorForm = await superValidate(zod(makeQuoteFormSchema));
            return fail(500, { form: errorForm, error: 'Erreur interne' });
        }
    },

    // Refuser une commande (pending_order ou order normale)
    rejectOrder: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Lire formData AVANT superValidate (car superValidate consomme le body)
            const formData = await request.formData();
            const shopId = formData.get('shopId') as string;
            const shopSlug = formData.get('shopSlug') as string;
            const orderStatus = formData.get('orderStatus') as string | null;
            const isPendingOrderStr = formData.get('isPendingOrder') as string;
            const isPendingOrder = isPendingOrderStr === 'true';

            // ✅ CRÉER LE FORM DÈS LE DÉBUT (obligatoire pour Superforms)
            const form = await superValidate(formData, zod(rejectOrderFormSchema));

            if (!shopId || !shopSlug) {
                return fail(400, { form, error: 'Données de boutique manquantes' });
            }

            // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
            const { session } = await locals.safeGetSession();
            const userId = session?.user.id;

            if (!userId) {
                return fail(401, { form, error: 'Non autorisé' });
            }

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { form, error: 'Accès non autorisé à cette boutique' });
            }

            if (!form.valid) {
                return fail(400, { form });
            }

            const { chef_message: chefMessage } = form.data;

            // ✅ OPTIMISÉ : Récupérer les infos shop nécessaires
            const { data: shop, error: shopError } = await locals.supabase
                .from('shops')
                .select('id, name, logo_url, slug')
                .eq('id', shopId)
                .single();

            if (shopError || !shop) {
                return fail(404, { form, error: 'Boutique non trouvée' });
            }

            // ✅ Détecter si c'est une pending_order
            if (isPendingOrder) {
                // Pour les pending_orders, le paiement a été fait → remboursement automatique
                const willRefund = true;
                const { data: pendingOrder, error: pendingError } = await locals.supabase
                    .from('pending_orders')
                    .select('*')
                    .eq('id', params.id)
                    .single();

                if (pendingError || !pendingOrder) {
                    return fail(404, { form, error: 'Commande non trouvée' });
                }

                const orderData = pendingOrder.order_data as any;

                if (orderData?.shop_id !== shopId) {
                    return fail(403, { form, error: 'Accès non autorisé' });
                }

                // Envoyer l'email d'annulation avec remboursement si activé
                try {
                    // Récupérer la couleur de la boutique pour l'email
                    const shopColor = await getShopColorFromShopId(
                        locals.supabaseServiceRole,
                        orderData.shop_id
                    );

                    await EmailService.sendOrderCancelled({
                        customerEmail: orderData.customer_email,
                        customerName: orderData.customer_name,
                        shopName: shop.name,
                        shopLogo: shop.logo_url || undefined,
                        orderId: pendingOrder.order_ref || pendingOrder.id.slice(0, 8),
                        orderUrl: `${PUBLIC_SITE_URL}/`,
                        date: new Date().toLocaleDateString('fr-FR'),
                        chefMessage: chefMessage || undefined,
                        willRefund: willRefund,
                        shopColor,
                    });
                } catch (emailError) {
                    await ErrorLogger.logCritical(emailError, {
                        userId,
                        shopId,
                        pendingOrderId: params.id,
                    }, {
                        action: 'rejectOrder',
                        step: 'send_cancellation_email_pending',
                    });
                }

                // Supprimer la pending_order
                const { error: deleteError } = await locals.supabase
                    .from('pending_orders')
                    .delete()
                    .eq('id', params.id);

                if (deleteError) {
                    await ErrorLogger.logCritical(deleteError, {
                        userId,
                        shopId,
                        pendingOrderId: params.id,
                    }, {
                        action: 'rejectOrder',
                        step: 'delete_pending_order',
                    });
                    return fail(500, { form, error: 'Erreur lors de la suppression' });
                }

                form.message = 'Commande refusée et email envoyé au client';
                return { form };
            }

            // ✅ Sinon, c'est une order normale - récupérer la commande pour vérifier le statut
            const { data: order, error: orderError } = await locals.supabase
                .from('orders')
                .select('id, status, customer_email, customer_name')
                .eq('id', params.id)
                .eq('shop_id', shopId)
                .single();

            if (orderError || !order) {
                return fail(404, { form, error: 'Commande non trouvée' });
            }

            const currentStatus = orderStatus || order.status;

            // ✅ Mettre à jour la commande
            const { error: updateError } = await locals.supabase
                .from('orders')
                .update({
                    status: 'refused',
                    chef_message: chefMessage || null,
                    refused_by: 'pastry_chef'
                })
                .eq('id', params.id)
                .eq('shop_id', shop.id);

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId,
                    shopId,
                    orderId: params.id,
                }, {
                    action: 'rejectOrder',
                    step: 'update_order_status',
                });
                return fail(500, { form, error: 'Erreur lors de la mise à jour de la commande' });
            }

            // ✅ Envoyer l'email approprié selon le statut
            try {
                // Récupérer la couleur de la boutique pour l'email (une seule fois pour les deux cas)
                const shopColor = await getShopColorFromShopId(
                    locals.supabaseServiceRole,
                    shop.id
                );

                // Pour les commandes payées (to_verify) : email avec remboursement automatique
                // Note: non_finalisee est uniquement pour pending_orders, géré dans le bloc précédent
                if (currentStatus === 'to_verify') {
                    // Commande payée → remboursement automatique
                    await EmailService.sendOrderCancelled({
                        customerEmail: order.customer_email,
                        customerName: order.customer_name,
                        shopName: shop.name,
                        shopLogo: shop.logo_url || undefined,
                        orderId: order.id.slice(0, 8),
                        orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
                        date: new Date().toLocaleDateString('fr-FR'),
                        chefMessage: chefMessage || undefined,
                        willRefund: true, // Remboursement automatique pour les commandes payées
                        shopColor,
                    });
                } else {
                    // Pour les commandes non payées (pending) : email de refus de demande
                    await EmailService.sendRequestRejected({
                        customerEmail: order.customer_email,
                        customerName: order.customer_name,
                        shopName: shop.name,
                        shopLogo: shop.logo_url || undefined,
                        reason: chefMessage,
                        requestId: order.id.slice(0, 8),
                        catalogUrl: `${PUBLIC_SITE_URL}/`,
                        date: new Date().toLocaleDateString("fr-FR"),
                        shopColor,
                    });
                }
            } catch (emailError) {
                await ErrorLogger.logCritical(emailError, {
                    userId,
                    shopId,
                    orderId: params.id,
                    customerEmail: order.customer_email,
                    orderStatus: currentStatus,
                }, {
                    action: 'rejectOrder',
                    step: 'send_rejection_email',
                });
            }

            // Retourner le succès avec le formulaire Superforms
            form.message = 'Commande refusée avec succès';
            return { form };
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                orderId: params.id,
            }, {
                action: 'rejectOrder',
                step: 'general_error',
            });
            // Créer un formulaire vide pour retourner l'erreur
            const errorForm = await superValidate(zod(rejectOrderFormSchema));
            return fail(500, { form: errorForm, error: 'Erreur interne' });
        }
    },

    // Confirmer la réception du paiement PayPal.me
    confirmPayment: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Récupérer shopId depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

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

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite getUserPermissions)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Récupérer les détails de la commande avant mise à jour
            const { data: order, error: orderError } = await locals.supabase
                .from('orders')
                .select('*, shops(name, logo_url, slug)')
                .eq('id', params.id)
                .eq('shop_id', shopId)
                .eq('status', 'to_verify')
                .single();

            if (orderError || !order) {
                await ErrorLogger.logCritical(
                    orderError || new Error('Commande non trouvée ou déjà confirmée'),
                    {
                        userId: userId,
                        shopId: shopId,
                        orderId: params.id,
                    },
                    {
                        action: 'confirmPayment',
                        step: 'fetch_order',
                    }
                );
                return fail(404, { error: 'Commande non trouvée ou déjà confirmée' });
            }

            // Mettre à jour la commande : passer de 'to_verify' à 'confirmed'
            const { error: updateError } = await locals.supabase
                .from('orders')
                .update({ status: 'confirmed' })
                .eq('id', params.id)
                .eq('shop_id', shopId)
                .eq('status', 'to_verify');

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                }, {
                    action: 'confirmPayment',
                    step: 'update_order_status',
                    critical: true, // Paiement confirmé mais statut non mis à jour
                });
                return fail(500, { error: 'Erreur lors de la confirmation du paiement' });
            }

            console.log('✅ Payment confirmed for order:', params.id);

            // Panier : le paiement couvre tous les articles commandés ensemble
            const cartRef = (order as any).cart_ref as string | null;
            if (cartRef) {
                const { data: confirmedRows } = await (locals.supabaseServiceRole as any)
                    .from('orders')
                    .update({ status: 'confirmed' })
                    .eq('cart_ref', cartRef)
                    .eq('shop_id', shopId)
                    .eq('status', 'to_verify')
                    .select('id');
                if ((order as any).payment_provider === 'stripe') {
                    return { message: 'Commande passée en préparation' };
                }
                try {
                    const { data: all } = await (locals.supabaseServiceRole as any)
                        .from('orders')
                        .select('id, product_id, product_name, total_amount, customization_data, inspiration_photos, pickup_date, pickup_time, created_at')
                        .eq('cart_ref', cartRef)
                        .eq('shop_id', shopId)
                        .order('created_at', { ascending: true });
                    const pIds = [...new Set((all || []).map((o: any) => o.product_id).filter(Boolean))];
                    const { data: prods } = pIds.length
                        ? await (locals.supabaseServiceRole as any).from('products').select('id, image_url').in('id', pIds)
                        : { data: [] };
                    const imgs = new Map((prods || []).map((p: any) => [p.id, p.image_url]));
                    const items = (all || []).map((o: any) => ({
                        name: o.product_name,
                        image: imgs.get(o.product_id) || null,
                        price: Number(o.total_amount) || 0,
                        mode: (getDeliveryMode(o.customization_data) === 'email' ? 'email' : 'print') as 'email' | 'print',
                        lines: optionLines(o.customization_data || {}),
                    }));
                    const printRow = (all || []).find((o: any) => getDeliveryMode(o.customization_data) !== 'email');
                    const shopColor = await getShopColorFromShopId(locals.supabaseServiceRole, shopId);
                    await EmailService.sendCartCustomer(order.customer_email, {
                        stage: 'confirmed',
                        customerName: order.customer_name,
                        shopName: order.shops.name,
                        shopLogo: order.shops.logo_url,
                        shopColor,
                        items,
                        total: Math.round(items.reduce((t: number, i: any) => t + i.price, 0) * 100) / 100,
                        cartRef,
                        pickupDate: printRow?.pickup_date || null,
                        pickupTime: printRow?.pickup_time || null,
                        url: `${PUBLIC_SITE_URL}/panier/merci/${all?.[0]?.id || order.id}`,
                    });
                } catch (e) {
                    console.error('[confirmPayment] e-mail panier:', e);
                }
                return { message: `Paiement confirmé pour les ${(confirmedRows?.length || 0) + 1} articles du panier` };
            }

            // Paiement par carte : le client a déjà reçu sa confirmation au moment du paiement
            if ((order as any).payment_provider === 'stripe') {
                return { message: 'Commande passée en préparation' };
            }

            // Envoyer un email de confirmation au client
            try {
                const totalAmount = order.total_amount || 0;
                const paidAmount = order.paid_amount ?? totalAmount;
                const remainingAmount = totalAmount - paidAmount;

                // Image de l'article pour l'e-mail
                let productImage: string | null = null;
                if (order.product_id) {
                    const { data: p } = await (locals.supabaseServiceRole as any)
                        .from('products')
                        .select('image_url')
                        .eq('id', order.product_id)
                        .maybeSingle();
                    productImage = p?.image_url || null;
                }

                // Récupérer la couleur de la boutique pour l'email
                const shopColor = await getShopColorFromShopId(
                    locals.supabaseServiceRole,
                    shopId
                );

                await EmailService.sendOrderConfirmation({
                    customerEmail: order.customer_email,
                    customerName: order.customer_name,
                    shopName: order.shops.name,
                    shopLogo: order.shops.logo_url,
                    productName: order.product_name || 'Commande personnalisée',
                    pickupDate: order.pickup_date,
                    pickupTime: order.pickup_time,
                    pickupDateEnd: (order as any).pickup_date_end ?? undefined,
                    totalAmount: totalAmount,
                    paidAmount: paidAmount,
                    remainingAmount: remainingAmount,
                    orderId: order.id,
                    orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
                    date: new Date().toLocaleDateString('fr-FR'),
                    shopColor,
                    extras: buildOrderEmailExtras(order, productImage),
                });

                console.log('✅ Confirmation email sent to client');
            } catch (emailError) {
                await ErrorLogger.logCritical(emailError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: order.id,
                    customerEmail: order.customer_email,
                }, {
                    action: 'confirmPayment',
                    step: 'send_confirmation_email',
                });
            }

            return { message: 'Paiement confirmé avec succès' };
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                orderId: params.id,
            }, {
                action: 'confirmPayment',
                step: 'general_error',
            });
            return fail(500, { error: 'Erreur interne' });
        }
    },

    // Marquer une commande comme prête
    makeOrderReady: async ({ request, params, locals }) => {
        let userId: string | undefined;
        let shopId: string | undefined;

        try {
            // ✅ OPTIMISÉ : Récupérer shopId depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

            const formData = await request.formData();
            shopId = formData.get('shopId') as string;
            const printFileUrl = ((formData.get('printFileUrl') as string) || '').trim();
            const printFileName = ((formData.get('printFileName') as string) || '').trim();

            if (!shopId) {
                return fail(400, { error: 'Données de boutique manquantes' });
            }

            // ✅ OPTIMISÉ : Utiliser safeGetSession au lieu de getUser()
            const { session } = await locals.safeGetSession();
            userId = session?.user.id;

            if (!userId) {
                return fail(401, { error: 'Non autorisé' });
            }

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Fichier PDF à imprimer (facultatif), joint à l'e-mail « commande prête »
            if (printFileUrl && !isOwnPrintFileUrl(printFileUrl, shopId)) {
                return fail(400, { error: 'Fichier à imprimer invalide' });
            }
            // Récupérer le PDF AVANT de changer le statut : s'il est illisible, rien n'est envoyé
            let printFileContent: Buffer | null = null;
            if (printFileUrl) {
                try {
                    printFileContent = await fetchPrintFile(printFileUrl);
                } catch (e) {
                    console.error('[makeOrderReady] PDF fetch failed:', e);
                    return fail(400, {
                        error: "Le PDF n'a pas pu être récupéré. Réessayez de l'ajouter, puis cliquez à nouveau sur « Marquer comme prête ».",
                    });
                }
            }

            // Récupérer les données de la commande et de la boutique avant la mise à jour
            const { data: orderData, error: orderFetchError } = await locals.supabase
                .from('orders')
                .select(`
                    customer_name,
                    customer_email,
                    product_name,
                    pickup_date,
                    pickup_time,
                    pickup_date_end,
                    total_amount,
                    paid_amount,
                    product_id,
                    customization_data,
                    inspiration_photos,
                    shops!inner(slug, name, logo_url)
                `)
                .eq('id', params.id)
                .eq('shop_id', shopId)
                .single();

            if (orderFetchError || !orderData) {
                await ErrorLogger.logCritical(
                    orderFetchError || new Error('Order not found'),
                    {
                        userId: userId,
                        shopId: shopId,
                        orderId: params.id,
                    },
                    {
                        action: 'makeOrderReady',
                        step: 'fetch_order_data',
                    }
                );
                return fail(404, { error: 'Commande non trouvée' });
            }

            // Mettre à jour la commande (utiliser shopId directement)
            const { error: updateError } = await locals.supabase
                .from('orders')
                .update({ status: 'ready' })
                .eq('id', params.id)
                .eq('shop_id', shopId);

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                }, {
                    action: 'makeOrderReady',
                    step: 'update_order_status',
                });
                return fail(500, { error: 'Erreur lors de la mise à jour de la commande' });
            }

            // Garder une trace du PDF envoyé (sans bloquer si la colonne n'existe pas encore)
            if (printFileUrl && printFileContent) {
                const { error: pfError } = await (locals.supabase as any)
                    .from('orders')
                    .update({
                        print_file_url: printFileUrl,
                        print_file_name: printFileName || 'fichier-a-imprimer.pdf',
                        print_file_sent_at: new Date().toISOString(),
                    })
                    .eq('id', params.id)
                    .eq('shop_id', shopId);
                if (pfError) console.error('[makeOrderReady] print file not saved:', pfError);
            }

            // Envoyer l'email au client
            try {
                const shop = orderData.shops as any;
                const totalAmount = orderData.total_amount || 0;
                const paidAmount = orderData.paid_amount ?? totalAmount;
                const remainingAmount = totalAmount - paidAmount;

                // Récupérer la couleur de la boutique
                const shopColor = await getShopColorFromShopId(locals.supabaseServiceRole, shopId);

                // Image de l'article + QR code + pièce jointe
                let productImage: string | null = null;
                if ((orderData as any).product_id) {
                    const { data: p } = await (locals.supabaseServiceRole as any)
                        .from('products')
                        .select('image_url')
                        .eq('id', (orderData as any).product_id)
                        .maybeSingle();
                    productImage = p?.image_url || null;
                }
                const extras = buildOrderEmailExtras(orderData as any, productImage);
                if (printFileUrl && printFileContent) {
                    const safeName = (printFileName || 'fichier-a-imprimer.pdf')
                        .replace(/[^\w.\-À-ÿ ]+/g, '')
                        .slice(0, 80) || 'fichier-a-imprimer.pdf';
                    extras.attachments = [
                        { filename: safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`, content: printFileContent },
                    ];
                }

                await EmailService.sendOrderReady({
                    customerEmail: orderData.customer_email,
                    customerName: orderData.customer_name,
                    shopName: shop.name,
                    shopLogo: shop.logo_url || undefined,
                    productName: orderData.product_name || 'Commande personnalisée',
                    pickupDate: orderData.pickup_date,
                    pickupTime: orderData.pickup_time || null,
                    pickupDateEnd: orderData.pickup_date_end ?? undefined,
                    totalAmount: totalAmount,
                    paidAmount: paidAmount,
                    remainingAmount: remainingAmount,
                    orderId: params.id,
                    orderUrl: `${PUBLIC_SITE_URL}/order/${params.id}`,
                    date: new Date().toLocaleDateString('fr-FR'),
                    shopColor,
                    extras,
                });
            } catch (emailError) {
                // Ne pas faire échouer l'action si l'email échoue
                // La commande est déjà marquée comme prête
                await ErrorLogger.logCritical(emailError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                    customerEmail: orderData.customer_email,
                }, {
                    action: 'makeOrderReady',
                    step: 'send_email',
                });
                console.error('Failed to send order ready email, but order was marked as ready:', emailError);
                return {
                    message: 'Commande marquée comme prête',
                    emailError: "La commande est bien marquée comme prête, mais l'e-mail n'a pas pu être envoyé au client. Envoyez-lui le fichier directement par e-mail.",
                };
            }

            return { message: 'Commande marquée comme prête', emailSent: true, withPdf: !!printFileContent };
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                orderId: params.id,
            }, {
                action: 'makeOrderReady',
                step: 'general_error',
            });
            return fail(500, { error: 'Erreur interne' });
        }
    },

    // Marquer une commande comme terminée
    makeOrderCompleted: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Récupérer shopId depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

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

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Mettre à jour la commande (utiliser shopId directement)
            const { error: updateError } = await locals.supabase
                .from('orders')
                .update({ status: 'completed' })
                .eq('id', params.id)
                .eq('shop_id', shopId);

            if (updateError) {
                await ErrorLogger.logCritical(updateError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                }, {
                    action: 'makeOrderCompleted',
                    step: 'update_order_status',
                });
                return fail(500, { error: 'Erreur lors de la mise à jour de la commande' });
            }

            return { message: 'Commande marquée comme terminée' };
        } catch (err) {
            await ErrorLogger.logCritical(err, {
                userId: userId,
                shopId: shopId,
                orderId: params.id,
            }, {
                action: 'makeOrderCompleted',
                step: 'general_error',
            });
            return fail(500, { error: 'Erreur interne' });
        }
    },

    // Annuler une commande avec devis
    cancelOrder: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Récupérer shopId et shopSlug depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

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

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // ✅ OPTIMISÉ : Récupérer uniquement les infos shop nécessaires (name, logo_url) en une requête
            const { data: shop, error: shopError } = await locals.supabase
                .from('shops')
                .select('id, name, logo_url')
                .eq('id', shopId)
                .single();

            if (shopError || !shop) {
                return fail(404, { error: 'Boutique non trouvée' });
            }

            // Vérifier que la commande a le statut "quoted"
            const { data: order, error: orderError } = await locals.supabase
                .from('orders')
                .select('id, status, customer_email, customer_name')
                .eq('id', params.id)
                .eq('shop_id', shop.id)
                .single();

            if (orderError || !order) {
                return fail(404, { error: 'Commande non trouvée' });
            }

            if (order.status !== 'quoted') {
                return fail(400, { error: 'Seules les commandes avec devis non payé peuvent être annulées' });
            }

            // Mettre à jour la commande
            const { error: updateError } = await locals.supabase
                .from('orders')
                .update({ status: 'refused', refused_by: 'pastry_chef' })
                .eq('id', params.id)
                .eq('shop_id', shop.id);

            if (updateError) {
                return fail(500, { error: 'Erreur lors de la mise à jour de la commande' });
            }

            try {
                // Récupérer la couleur de la boutique pour l'email
                const shopColor = await getShopColorFromShopId(
                    locals.supabaseServiceRole,
                    shop.id
                );

                await Promise.all([
                    EmailService.sendOrderCancelled({
                        customerEmail: order.customer_email,
                        customerName: order.customer_name,
                        shopName: shop.name,
                        shopLogo: shop.logo_url || undefined,
                        orderId: order.id.slice(0, 8),
                        orderUrl: `${PUBLIC_SITE_URL}/order/${order.id}`,
                        date: new Date().toLocaleDateString("fr-FR"),
                        shopColor,
                    })]);
            } catch (e) { }

            return { message: 'Commande annulée avec succès' };
        } catch (err) {
            return fail(500, { error: 'Erreur interne' });
        }
    },

    // Supprimer la note personnelle
    deletePersonalNote: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Récupérer shopId depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

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

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership (évite requête shop)
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Supprimer la note (utiliser shopId directement)
            const { error: deleteError } = await locals.supabase
                .from('personal_order_notes')
                .delete()
                .eq('order_id', params.id)
                .eq('shop_id', shopId);

            if (deleteError) {
                return fail(500, { error: 'Erreur lors de la suppression' });
            }

            return { success: true, message: 'Note supprimée avec succès' };
        } catch (err) {
            return fail(500, { error: 'Erreur serveur' });
        }
    },

    // Supprimer une commande (uniquement si pas payée avec Stripe)
    deleteOrder: async ({ request, params, locals }) => {
        try {
            // ✅ OPTIMISÉ : Récupérer shopId depuis formData
            if (!request) {
                return fail(400, { error: 'Requête invalide' });
            }

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

            // ✅ OPTIMISÉ : Vérifier la propriété avec verifyShopOwnership
            const isOwner = await verifyShopOwnership(userId, shopId, locals.supabase);
            if (!isOwner) {
                return fail(403, { error: 'Accès non autorisé à cette boutique' });
            }

            // Récupérer la commande pour vérifier qu'elle n'est pas payée avec Stripe
            const { data: order, error: orderError } = await locals.supabase
                .from('orders')
                .select('id, stripe_payment_intent_id, stripe_session_id, status')
                .eq('id', params.id)
                .eq('shop_id', shopId)
                .single();

            if (orderError || !order) {
                return fail(404, { error: 'Commande non trouvée' });
            }

            // Les commandes payées par carte peuvent aussi être supprimées (ex. commandes de test).
            // La suppression ne rembourse pas : le remboursement se fait dans Stripe.

            // Supprimer la commande
            // Utiliser supabaseServiceRole pour contourner les RLS (comme pour d'autres opérations sensibles)
            const { error: deleteError } = await locals.supabaseServiceRole
                .from('orders')
                .delete()
                .eq('id', params.id)
                .eq('shop_id', shopId);

            if (deleteError) {
                console.error('Error deleting order:', deleteError);
                await ErrorLogger.logCritical(deleteError, {
                    userId: userId,
                    shopId: shopId,
                    orderId: params.id,
                }, {
                    action: 'deleteOrder',
                    step: 'delete_order',
                });
                return fail(500, { error: 'Erreur lors de la suppression de la commande' });
            }

            return { message: 'Commande supprimée avec succès' };
        } catch (err) {
            console.error('Error in deleteOrder:', err);
            return fail(500, { error: 'Erreur interne' });
        }
    }
};