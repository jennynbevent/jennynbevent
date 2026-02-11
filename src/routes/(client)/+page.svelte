<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import {
		HelpCircle,
		Search,
		Cake,
		ArrowLeft,
	} from 'lucide-svelte';
	import { ClientFooter } from '$lib/components';
	import SocialMediaIcons from '$lib/components/client/social-media-icons.svelte';

	$: ({ shop, categories, products, faqs, isShopActive, notFound } =
		$page.data);

	onMount(() => {
		if (!notFound && shop?.id) {
			import('$lib/utils/analytics').then(({ logPageView }) => {
				const { supabase } = $page.data;
				if (supabase) {
					logPageView(supabase, {
						page: '/',
						shop_id: shop.id,
					}).catch((err: unknown) => {
						console.error('Error tracking page_view:', err);
					});
				}
			});
		}
	});

	$: ({ customizations } = $page.data);
	$: customStyles = {
		background: customizations?.background_color || '#fafafa',
		backgroundImage: customizations?.background_image_url
			? `url(${customizations.background_image_url})`
			: 'none',
		buttonStyle: `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`,
		textStyle: `color: ${customizations?.text_color || '#333333'};`,
		iconStyle: `color: ${customizations?.icon_color || '#6b7280'};`,
		secondaryTextStyle: `color: ${customizations?.secondary_text_color || '#333333'};`,
		categoryBorderStyle: `border-color: ${customizations?.secondary_text_color || '#d1d5db'}; color: ${customizations?.secondary_text_color || '#333333'}; background-color: white;`,
		separatorColor: 'rgba(0, 0, 0, 0.3)',
	};

	let selectedCategory: string | null = null;
	let filteredProducts = products;
	$: showBackButton = $page.url.searchParams.get('from') === 'app';

	function goBack() {
		if (typeof window !== 'undefined' && window.history.length > 1) {
			window.history.back();
		} else {
			goto('/');
		}
	}

	$: filteredProducts =
		selectedCategory === null
			? products
			: products.filter(
					(product: { category_id: string | null }) =>
						product.category_id === selectedCategory,
				);

	function formatPrice(price: number): string {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(price);
	}

	function viewProduct(productId: string) {
		const fromApp = $page.url.searchParams.get('from') === 'app';
		if (fromApp) {
			goto(`/product/${productId}?from=app`);
		} else {
			goto(`/product/${productId}`);
		}
	}

	function goToCustomRequest() {
		goto('/custom');
	}

	function goToFAQ() {
		goto('/faq');
	}

	$: productCount = products?.length || 0;
	$: hasCustomOrders = shop?.is_custom_accepted || false;
	$: seoTitle = shop?.name
		? `${shop.name} - Cake Designer & Pâtissier | Commandez vos articles personnalisés en ligne`
		: 'Boutique de pâtisserie';
	$: seoDescription = shop?.bio
		? `${shop.bio} Commandez vos articles personnalisés en ligne. ${productCount > 0 ? `${productCount} créations disponibles. ` : ''}${hasCustomOrders ? 'Demandes sur mesure acceptées. ' : ''}Livraison et retrait disponibles.`
		: shop?.name
			? `Découvrez ${shop.name}, votre cake designer et pâtissier. Commandez vos articles personnalisés en ligne${productCount > 0 ? ` parmi ${productCount} créations disponibles` : ''}. ${hasCustomOrders ? 'Demandes sur mesure acceptées. ' : ''}Livraison et retrait disponibles.`
			: 'Commandez vos articles personnalisés en ligne. Livraison et retrait disponibles.';
	$: seoKeywords = `cake designer, pâtissier, ${shop?.name || ''}, articles personnalisés, commande en ligne, pâtisserie, articles sur mesure${hasCustomOrders ? ', demande personnalisée' : ''}, livraison`;
	$: ogImageUrl = shop?.logo_url || `${$page.url.origin}/og-image.png`;
</script>

<svelte:head>
	{#if notFound}
		<title>Boutique non trouvée</title>
		<meta
			name="description"
			content="Cette boutique n'existe pas ou n'est plus disponible"
		/>
	{:else}
		<title>{seoTitle}</title>
		<meta name="description" content={seoDescription} />
		<meta name="keywords" content={seoKeywords} />
		<meta property="og:title" content={seoTitle} />
		<meta property="og:description" content={seoDescription} />
		<meta property="og:type" content="website" />
		<meta property="og:url" content={$page.url.href} />
		<meta property="og:image" content={ogImageUrl} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={seoTitle} />
		<meta name="twitter:description" content={seoDescription} />
		<meta name="twitter:image" content={ogImageUrl} />
	{/if}
</svelte:head>

{#if notFound}
	<div
		class="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-white via-[#BB91A4]/10 to-white px-4 py-12"
	>
		<div class="mx-auto max-w-md text-center">
			<div class="mb-6 flex justify-center">
				<div
					class="rounded-full bg-gradient-to-br from-neutral-100 to-white p-4 shadow-sm"
				>
					<Search class="h-12 w-12 text-neutral-600" />
				</div>
			</div>
			<h1
				class="mb-4 text-2xl font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-3xl"
				style="font-weight: 600; letter-spacing: -0.03em;"
			>
				Boutique non trouvée
			</h1>
			<p
				class="mb-8 text-base leading-[180%] text-neutral-600 sm:text-lg"
				style="font-weight: 300; letter-spacing: -0.01em;"
			>
				Cette boutique n'existe pas ou n'est plus disponible.
			</p>
		</div>
	</div>
{:else}
	<div
		class="flex min-h-screen flex-col overflow-x-hidden"
		style="background-color: {customStyles.background}; background-image: {customStyles.backgroundImage}; background-size: cover; background-position: center; background-repeat: no-repeat;"
	>
		<header class="relative px-4 py-6 text-center sm:py-8 md:py-12">
			{#if shop && (shop.instagram || shop.tiktok || shop.website)}
				<SocialMediaIcons {shop} iconStyle={customStyles.iconStyle} />
			{/if}
			{#if showBackButton}
				<button
					on:click={goBack}
					class="absolute left-4 top-4 flex items-center justify-center rounded-full bg-white/80 p-2 shadow-sm backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:shadow-sm"
					style={customStyles.iconStyle}
					title="Retour"
				>
					<ArrowLeft class="h-5 w-5" />
				</button>
			{/if}
			<div class="mb-4 flex justify-center">
				<div
					class="relative h-20 w-20 overflow-hidden rounded-full bg-white p-2.5 shadow-sm transition-transform duration-300 hover:scale-105 sm:h-24 sm:w-24 sm:p-3 md:h-28 md:w-28"
				>
					<img
						src={shop.logo_url || '/images/logo_jennynbevent.jpg'}
						alt={shop.name}
						class="h-full w-full object-contain"
					/>
				</div>
			</div>

			<h1
				class="mb-3 text-2xl font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-3xl"
				style="font-weight: 600; letter-spacing: -0.03em;"
			>
				{shop.name}
			</h1>

			{#if shop.bio}
				<p
					class="mx-auto mb-6 max-w-2xl whitespace-pre-wrap text-sm leading-[180%] text-neutral-600 sm:text-base"
					style="font-weight: 300; letter-spacing: -0.01em;"
				>
					{shop.bio}
				</p>
			{/if}

			{#if shop.is_custom_accepted && isShopActive}
				<Button
					on:click={goToCustomRequest}
					class="mb-4 rounded-full px-6 py-2.5 text-sm shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md sm:px-8 sm:py-3 sm:text-base"
					style={customStyles.buttonStyle}
				>
					Composer ma commande
				</Button>
			{/if}

			{#if faqs && faqs.length > 0}
				<button
					on:click={goToFAQ}
					class="mx-auto flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur-sm transition-all duration-300 hover:bg-white/80 hover:shadow-sm sm:text-base"
					style={`font-weight: 500; letter-spacing: -0.01em; color: ${customizations?.secondary_text_color || '#6b7280'}; border: 1px solid ${customizations?.secondary_text_color || '#e5e7eb'}20;`}
				>
					<HelpCircle class="h-4 w-4" />
					<span>Questions fréquentes</span>
				</button>
			{/if}
		</header>

		<div class="px-4">
			<div class="mx-auto mb-6 max-w-7xl sm:mb-8">
				<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
			</div>
		</div>

		{#if isShopActive}
			<div class="mb-6 px-4 sm:mb-8 md:px-6 lg:px-8">
				<div class="flex flex-wrap gap-2">
					<Button
						on:click={() => (selectedCategory = null)}
						class="whitespace-nowrap rounded-full text-xs shadow-sm transition-all duration-200 hover:shadow-sm sm:text-sm"
						style={selectedCategory === null
							? customStyles.buttonStyle
							: customStyles.categoryBorderStyle}
					>
						Tout
					</Button>
					{#each categories as category}
						<Button
							on:click={() => (selectedCategory = category.id)}
							class="whitespace-nowrap rounded-full text-xs shadow-sm transition-all duration-200 hover:shadow-sm sm:text-sm"
							style={selectedCategory === category.id
								? customStyles.buttonStyle
								: customStyles.categoryBorderStyle}
						>
							{category.name}
						</Button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="flex-1 px-4 pb-6 sm:pb-8 md:px-6 lg:px-8">
			{#if isShopActive}
				<div
					class="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
				>
					{#each filteredProducts as product}
						<button
							on:click={() => viewProduct(product.id)}
							class="group relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[#BC90A5]/20"
						>
							<div
								class="relative h-32 w-full overflow-hidden bg-gradient-to-br from-[#BB91A4]/20 to-white sm:h-36"
							>
								{#if product.image_url}
									<img
										src={product.image_url}
										alt={product.name}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
									/>
								{:else}
									<div
										class="flex h-full items-center justify-center bg-gradient-to-br from-[#BB91A4]/30 to-white"
									>
										<Cake class="h-10 w-10 text-neutral-300" />
									</div>
								{/if}
							</div>
							<div class="flex flex-1 flex-col p-2.5 sm:p-3">
								<h3
									class="mb-1 line-clamp-2 text-left text-sm font-semibold leading-tight text-neutral-900"
									style="font-weight: 600; letter-spacing: -0.02em;"
								>
									{product.name}
								</h3>
								<div class="mt-auto pt-1.5">
									<p
										class="flex items-baseline gap-1 text-sm font-bold sm:text-base"
										style={`color: ${customizations?.button_color || '#BC90A5'}; font-weight: 600;`}
									>
										<span
											class="text-xs font-normal text-neutral-600 sm:text-sm"
											style="font-weight: 400;"
										>
											À partir de
										</span>
										{formatPrice(product.base_price)}
									</p>
									<div
										class="mt-1.5 rounded-full px-2.5 py-0.5 text-center text-xs font-medium sm:text-sm"
										style={`background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'}; font-weight: 500;`}
									>
										Commander
									</div>
								</div>
							</div>
						</button>
					{/each}
				</div>

				{#if filteredProducts.length === 0}
					<div
						class="flex flex-1 items-center justify-center py-12 text-center sm:py-16"
					>
						<p
							class="text-base leading-[180%] text-neutral-600 sm:text-lg"
							style="font-weight: 300; letter-spacing: -0.01em;"
						>
							{#if selectedCategory}
								Aucun produit dans cette catégorie pour le moment.
							{:else}
								Aucun produit disponible pour le moment.
							{/if}
						</p>
					</div>
				{/if}
			{:else}
				<div
					class="flex flex-1 items-center justify-center py-12 text-center sm:py-16"
				>
					<div class="max-w-md">
						<div class="mb-6 flex justify-center">
							<div
								class="rounded-full bg-gradient-to-br from-neutral-100 to-white p-4 shadow-sm"
							>
								<svg
									class="h-8 w-8 text-neutral-600"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
									/>
								</svg>
							</div>
						</div>
						<h3
							class="mb-3 text-xl font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-2xl"
							style="font-weight: 600; letter-spacing: -0.03em;"
						>
							Boutique temporairement fermée
						</h3>
						<p
							class="text-base leading-[180%] text-neutral-600 sm:text-lg"
							style="font-weight: 300; letter-spacing: -0.01em;"
						>
							Cette boutique n'est pas disponible pour le moment. Revenez
							bientôt pour découvrir nos délicieuses créations !
						</p>
					</div>
				</div>
			{/if}
		</div>

		<ClientFooter {customizations} shopSlug={undefined} hasPolicies={$page.data.hasPolicies} />
	</div>
{/if}
