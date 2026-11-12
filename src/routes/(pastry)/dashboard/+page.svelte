<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		Package,
		ShoppingCart,
		Euro,
		Plus,
		Calendar,
		FileText,
		Copy,
		Check,
		BellRing,
		ChevronRight,
	} from 'lucide-svelte';
	import { env } from '$env/dynamic/public';
	import PushNotifications from '$lib/components/push-notifications.svelte';
	// Données de la page
	$: ({ shop, metrics, permissions, user, plans, currentPlan, hasLifetimePlan } = $page.data);
	
	// ✅ Tracking: Page view côté client (session_id persistant)
	onMount(() => {
		if (shop?.id && user?.id) {
			import('$lib/utils/analytics').then(({ logPageView }) => {
				const { supabase } = $page.data;
				
				if (supabase) {
					logPageView(supabase, {
						page: '/dashboard',
						shop_id: shop.id
					}).catch((err: unknown) => {
						// Ne pas bloquer si le tracking échoue
						console.error('Error tracking page_view:', err);
					});
				}
			});
		}
	});

	// Calculer si la limite est atteinte
	$: isProductLimitReached =
		permissions.productLimit &&
		(permissions.productCount || 0) >= permissions.productLimit;

	// État pour le filtre de revenus
	let selectedRevenuePeriod: 'weekly' | 'monthly' | 'threeMonths' | 'yearly' =
		'monthly';

	// État pour le feedback de copie
	let copySuccess = false;


	// Fonction pour formater le prix
	function formatPrice(price: number): string {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(price);
	}

	// Fonction pour formater la date
	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	// Fonction pour obtenir le statut de la commande
	function getOrderStatus(status: string): {
		label: string;
		variant: 'default' | 'secondary' | 'destructive' | 'outline';
	} {
		switch (status) {
			case 'pending':
				return { label: 'En attente', variant: 'secondary' };
			case 'confirmed':
				return { label: 'Confirmée', variant: 'default' };
			case 'completed':
				return { label: 'Terminée', variant: 'outline' };
			case 'cancelled':
				return { label: 'Annulée', variant: 'destructive' };
			case 'ready':
				return { label: 'Prête', variant: 'default' };
			case 'quoted':
				return { label: 'Devis envoyé', variant: 'outline' };
			case 'to_verify':
				return { label: 'À vérifier', variant: 'secondary' };
			case 'refused':
				return { label: 'Refusée', variant: 'outline' };
			default:
				return { label: status, variant: 'outline' };
		}
	}

	// Fonction pour obtenir le revenu actuel
	$: currentRevenue = metrics.revenue[selectedRevenuePeriod];

	// Fonction pour obtenir le nombre de commandes actuel
	$: currentOrdersCount = metrics.ordersCount[selectedRevenuePeriod];

	$: periodLabel =
		selectedRevenuePeriod === 'weekly'
			? 'cette semaine'
			: selectedRevenuePeriod === 'monthly'
				? 'ce mois'
				: selectedRevenuePeriod === 'threeMonths'
					? 'ces 3 mois'
					: 'cette année';

	const periods: { id: 'weekly' | 'monthly' | 'threeMonths' | 'yearly'; label: string }[] = [
		{ id: 'weekly', label: 'Semaine' },
		{ id: 'monthly', label: 'Mois' },
		{ id: 'threeMonths', label: '3 mois' },
		{ id: 'yearly', label: 'Année' },
	];

	// Couleur de la pastille de statut
	function statusClass(status: string): string {
		switch (status) {
			case 'to_verify':
			case 'pending':
				return 'bg-[#F3E6EA] text-[#7A4F60]';
			case 'confirmed':
			case 'ready':
				return 'bg-[#EEF3EC] text-[#3C5A45]';
			case 'completed':
				return 'bg-[#EFEAE6] text-[#5E5350]';
			case 'quoted':
				return 'bg-[#F6EEDF] text-[#7A5A2E]';
			case 'cancelled':
			case 'refused':
				return 'bg-[#F7E4E1] text-[#9A3B32]';
			default:
				return 'bg-[#EFEAE6] text-[#5E5350]';
		}
	}

	// Actions rapides
	function goToAddProduct() {
		goto('/dashboard/products/new');
	}

	function goToOrders() {
		goto('/dashboard/orders');
	}

	function goToAvailability() {
		goto('/dashboard/availability');
	}

	function goToCustomForm() {
		goto('/dashboard/custom-form');
	}

	// Fonction pour copier l'URL du shop
	async function copyShopUrl() {
		const fullUrl = `${env.PUBLIC_SITE_URL}/`;

		await navigator.clipboard.writeText(fullUrl);
		copySuccess = true;
		// Reset after 2 seconds
		setTimeout(() => {
			copySuccess = false;
		}, 2000);
	}

</script>

<svelte:head>
	<title>Tableau de bord - Jennynbevent</title>
</svelte:head>

<div class="w-full space-y-5 text-[#3A2F33]">
	<!-- En-tête -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div>
			<h1 class="dash-serif text-3xl font-medium sm:text-4xl">Tableau de bord</h1>
			<p class="mt-1 text-sm text-[#7A6A70]">
				Bienvenue {shop?.name || 'Jennynbevent'}, voici votre activité
			</p>
		</div>
		{#if shop?.slug}
			<button
				type="button"
				on:click={copyShopUrl}
				title="Copier l'adresse de la boutique"
				class="flex items-center gap-2 self-start rounded-xl border border-[#EADDE1] bg-white px-3 py-2 text-sm text-[#3A2F33] transition-colors hover:border-[#BC90A5] sm:self-auto"
			>
				<span class="max-w-[240px] truncate">{(env.PUBLIC_SITE_URL || '').replace(/^https?:\/\//, '')}</span>
				{#if copySuccess}
					<Check class="h-4 w-4 text-[#7A4F60]" />
					<span class="text-xs text-[#7A4F60]">Copiée</span>
				{:else}
					<Copy class="h-4 w-4 text-[#7A4F60]" />
				{/if}
			</button>
		{/if}
	</div>

	<!-- Notifications des nouvelles commandes -->
	<PushNotifications />

	<!-- Période -->
	<div class="flex flex-wrap gap-1">
		{#each periods as p}
			<button
				type="button"
				on:click={() => (selectedRevenuePeriod = p.id)}
				class="rounded-full px-4 py-1.5 text-sm transition-colors {selectedRevenuePeriod === p.id
					? 'bg-[#7A4F60] text-white'
					: 'text-[#7A6A70] hover:bg-[#F3E6EA]'}"
			>
				{p.label}
			</button>
		{/each}
	</div>

	<!-- Chiffres clés -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="rounded-2xl border border-[#EADDE1] bg-white p-4">
			<div class="flex items-center justify-between text-xs text-[#7A6A70] sm:text-sm">
				Articles en vente <Package class="h-4 w-4 text-[#BC90A5]" />
			</div>
			<div class="mt-2 text-2xl font-medium text-[#7A4F60] sm:text-3xl">{metrics.productsCount}</div>
			<div class="mt-1 text-xs text-[#9A8A90]">
				{metrics.productsCount === 0 ? 'aucun article' : 'actifs'}
			</div>
		</div>
		<div class="rounded-2xl border border-[#EADDE1] bg-white p-4">
			<div class="flex items-center justify-between text-xs text-[#7A6A70] sm:text-sm">
				Commandes <ShoppingCart class="h-4 w-4 text-[#BC90A5]" />
			</div>
			<div class="mt-2 text-2xl font-medium text-[#7A4F60] sm:text-3xl">{currentOrdersCount}</div>
			<div class="mt-1 text-xs text-[#9A8A90]">{periodLabel}</div>
		</div>
		<div class="rounded-2xl border border-[#EADDE1] bg-white p-4">
			<div class="flex items-center justify-between text-xs text-[#7A6A70] sm:text-sm">
				Chiffre d'affaires <Euro class="h-4 w-4 text-[#BC90A5]" />
			</div>
			<div class="mt-2 text-2xl font-medium text-[#7A4F60] sm:text-3xl">{formatPrice(currentRevenue)}</div>
			<div class="mt-1 text-xs text-[#9A8A90]">{periodLabel}</div>
		</div>
		<a
			href="/dashboard/orders"
			class="rounded-2xl border p-4 transition-colors {metrics.toVerifyCount > 0
				? 'border-[#BC90A5] bg-[#FBF3F6] hover:bg-[#F7EAF0]'
				: 'border-[#EADDE1] bg-white hover:bg-[#FBF6F7]'}"
		>
			<div class="flex items-center justify-between text-xs text-[#7A6A70] sm:text-sm">
				À traiter <BellRing class="h-4 w-4 text-[#BC90A5]" />
			</div>
			<div class="mt-2 text-2xl font-medium text-[#7A4F60] sm:text-3xl">{metrics.toVerifyCount}</div>
			<div class="mt-1 text-xs text-[#9A8A90]">
				{metrics.toVerifyCount > 1 ? 'commandes à vérifier' : 'commande à vérifier'}
			</div>
		</a>
	</div>

	<!-- Actions rapides -->
	<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<button
			type="button"
			on:click={goToAddProduct}
			disabled={isProductLimitReached}
			class="flex items-center gap-3 rounded-2xl border border-[#EADDE1] bg-white p-3 text-left text-sm transition-colors hover:border-[#BC90A5] disabled:opacity-50"
		>
			<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3E6EA] text-[#7A4F60]"><Plus class="h-5 w-5" /></span>
			Ajouter un article
		</button>
		<button
			type="button"
			on:click={goToOrders}
			class="flex items-center gap-3 rounded-2xl border border-[#EADDE1] bg-white p-3 text-left text-sm transition-colors hover:border-[#BC90A5]"
		>
			<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3E6EA] text-[#7A4F60]"><ShoppingCart class="h-5 w-5" /></span>
			Voir les commandes
		</button>
		<button
			type="button"
			on:click={goToAvailability}
			class="flex items-center gap-3 rounded-2xl border border-[#EADDE1] bg-white p-3 text-left text-sm transition-colors hover:border-[#BC90A5]"
		>
			<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3E6EA] text-[#7A4F60]"><Calendar class="h-5 w-5" /></span>
			Disponibilités
		</button>
		<button
			type="button"
			on:click={goToCustomForm}
			class="flex items-center gap-3 rounded-2xl border border-[#EADDE1] bg-white p-3 text-left text-sm transition-colors hover:border-[#BC90A5]"
		>
			<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F3E6EA] text-[#7A4F60]"><FileText class="h-5 w-5" /></span>
			Formulaire
		</button>
	</div>

	<!-- Dernières commandes -->
	<div class="overflow-hidden rounded-2xl border border-[#EADDE1] bg-white">
		<div class="flex items-center justify-between px-4 py-3">
			<h2 class="font-medium">Dernières commandes</h2>
			<a href="/dashboard/orders" class="text-sm text-[#7A4F60] underline underline-offset-2">Tout voir</a>
		</div>
		{#if metrics.recentOrders.length === 0}
			<div class="border-t border-[#F1E6E9] px-4 py-10 text-center text-sm text-[#9A8A90]">
				<ShoppingCart class="mx-auto mb-3 h-8 w-8 opacity-50" />
				Aucune commande pour le moment
			</div>
		{:else}
			<!-- Ordinateur : tableau -->
			<table class="hidden w-full table-fixed border-collapse text-sm lg:table">
				<thead>
					<tr class="bg-[#FBF6F7] text-left text-xs text-[#7A6A70]">
						<th class="px-4 py-2 font-normal">Article</th>
						<th class="px-4 py-2 font-normal">Client</th>
						<th class="w-32 px-4 py-2 font-normal">Remise</th>
						<th class="w-32 px-4 py-2 font-normal">Statut</th>
						<th class="w-28 px-4 py-2 text-right font-normal">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each metrics.recentOrders as order}
						<tr
							class="cursor-pointer border-t border-[#F1E6E9] transition-colors hover:bg-[#FBF6F7]"
							on:click={() => goto(`/dashboard/orders/${order.id}`)}
						>
							<td class="truncate px-4 py-3">
								<div class="truncate">{order.product_name || 'Demande personnalisée'}</div>
								<div class="text-xs text-[#9A8A90]">{formatDate(order.created_at)}</div>
							</td>
							<td class="truncate px-4 py-3">{order.customer_name || order.customer_email}</td>
							<td class="px-4 py-3 text-[#7A6A70]">{order.delivery || '—'}</td>
							<td class="px-4 py-3">
								<span class="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs {statusClass(order.status)}">
									{getOrderStatus(order.status).label}
								</span>
							</td>
							<td class="px-4 py-3 text-right">
								{(order.total_amount || 0) > 0 ? formatPrice(order.total_amount) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<!-- Téléphone : liste -->
			<div class="lg:hidden">
				{#each metrics.recentOrders as order}
					<a
						href="/dashboard/orders/{order.id}"
						class="flex items-center gap-3 border-t border-[#F1E6E9] px-4 py-3"
					>
						<div class="min-w-0 flex-1">
							<div class="truncate text-sm font-medium">{order.product_name || 'Demande personnalisée'}</div>
							<div class="truncate text-xs text-[#7A6A70]">
								{order.customer_name || order.customer_email}{order.delivery ? ` · ${order.delivery}` : ''}
							</div>
							<span class="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] {statusClass(order.status)}">
								{getOrderStatus(order.status).label}
							</span>
						</div>
						<div class="text-right text-sm">
							{(order.total_amount || 0) > 0 ? formatPrice(order.total_amount) : ''}
						</div>
						<ChevronRight class="h-4 w-4 text-[#BC90A5]" />
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
