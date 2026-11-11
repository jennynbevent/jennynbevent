<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Search, Cake, ArrowLeft, Instagram } from 'lucide-svelte';
	import { ClientFooter } from '$lib/components';

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

	type Product = { id: string; name: string; base_price: number; image_url: string | null; category_id: string | null };
	type Category = { id: string; name: string; description?: string | null };

	// « Tout voir » : ?categorie=<id> affiche toute la catégorie
	$: selectedCategory = $page.url.searchParams.get('categorie');
	let filteredProducts: Product[] = products;
	$: showBackButton = $page.url.searchParams.get('from') === 'app';

	function goBack() {
		if (typeof window !== 'undefined' && window.history.length > 1) {
			window.history.back();
		} else {
			goto('/');
		}
	}

	$: filteredProducts = currentSection ? currentSection.items : products;

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

	// Lien « Contact » : formulaire sur mesure s'il est activé, sinon Instagram
	$: contactHref = shop?.is_custom_accepted
		? '/custom'
		: shop?.instagram
			? `https://instagram.com/${shop.instagram.replace('@', '')}`
			: null;
	$: contactExternal = !!contactHref?.startsWith('http');

	// Un univers par catégorie contenant au moins un produit
	$: sections = [
		...((categories ?? []) as Category[])
			.map((c) => ({ ...c, items: (products as Product[]).filter((p) => p.category_id === c.id) }))
			.filter((c) => c.items.length > 0),
		...(() => {
			const ids = new Set(((categories ?? []) as Category[]).map((c) => c.id));
			const rest = (products as Product[]).filter((p) => !p.category_id || !ids.has(p.category_id));
			return rest.length ? [{ id: 'autres', name: 'Autres créations', description: '', items: rest }] : [];
		})(),
	];
	$: currentSection = selectedCategory ? sections.find((sec) => sec.id === selectedCategory) : null;
	// Photos d'accueil : celles choisies dans l'espace admin, complétées par les dernières créations
	$: heroImages = (() => {
		const withImage = (products as Product[]).filter((p) => p.image_url);
		const chosen = (($page.data.heroProductIds ?? []) as string[])
			.map((id) => withImage.find((p) => p.id === id))
			.filter(Boolean) as Product[];
		const rest = withImage.filter((p) => !chosen.some((c) => c.id === p.id));
		return [...chosen, ...rest].slice(0, 4);
	})();

	function categoryHref(id: string) {
		const params = new URLSearchParams();
		params.set('categorie', id);
		if ($page.url.searchParams.get('from') === 'app') params.set('from', 'app');
		return `/?${params.toString()}#creations`;
	}
	function productHref(id: string) {
		return $page.url.searchParams.get('from') === 'app' ? `/product/${id}?from=app` : `/product/${id}`;
	}

	function goToFAQ() {
		goto('/faq');
	}

	$: productCount = products?.length || 0;
	$: hasCustomOrders = shop?.is_custom_accepted || false;
	$: seoTitle = shop?.name
		? `${shop.name}`
		: 'Boutique de créations personnalisées';
	$: seoDescription = shop?.bio
		? `${shop.bio} Commandez vos articles personnalisés en ligne. ${productCount > 0 ? `${productCount} créations disponibles. ` : ''}${hasCustomOrders ? 'Demandes sur mesure acceptées. ' : ''}Livraison et retrait disponibles.`
		: shop?.name
			? `Découvrez ${shop.name}, créations personnalisées pour vos événements. Commandez vos articles personnalisés en ligne${productCount > 0 ? ` parmi ${productCount} créations disponibles` : ''}. ${hasCustomOrders ? 'Demandes sur mesure acceptées. ' : ''}Livraison et retrait disponibles.`
			: 'Commandez vos articles personnalisés en ligne. Livraison et retrait disponibles.';
	$: seoKeywords = `${shop?.name || ''}, décoration événementielle, panneau de bienvenue, QR code mariage, articles personnalisés, commande en ligne, articles sur mesure${hasCustomOrders ? ', demande personnalisée' : ''}, livraison`;
	$: ogImageUrl = `${$page.url.origin}/og-jnb.png`;
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
		<link rel="preconnect" href="https://fonts.googleapis.com" />
		<link
			href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap"
			rel="stylesheet"
		/>
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
		style="background-color: {customStyles.background}; background-image: {customStyles.backgroundImage}; background-size: cover; background-position: center; background-repeat: no-repeat; {customStyles.textStyle}"
	>
		<!-- EN-TÊTE -->
		<header class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
			<div class="flex min-w-0 items-center gap-3">
				{#if showBackButton}
					<button on:click={goBack} class="rounded-full bg-white/80 p-2 shadow-sm" style={customStyles.iconStyle} title="Retour">
						<ArrowLeft class="h-5 w-5" />
					</button>
				{/if}
				<a href="/" class="flex min-w-0 items-center gap-3">
					<span class="h-11 w-11 flex-none overflow-hidden rounded-full bg-white p-1 shadow-sm">
						<img src={shop.logo_url || '/images/logo_jennynbevent.jpg'} alt="" class="h-full w-full object-contain" />
					</span>
					<span class="serif truncate text-2xl font-semibold">{shop.name}</span>
				</a>
			</div>
			<nav class="flex flex-none items-center gap-1 text-sm sm:gap-2">
				{#if faqs && faqs.length > 0}
					<a href="/faq" class="hidden rounded-full px-3 py-2 hover:bg-black/5 sm:inline-block">FAQ</a>
				{/if}
				{#if shop.instagram}
					<a href="https://instagram.com/{shop.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="rounded-full p-2 hover:bg-black/5" style={customStyles.iconStyle} title="Instagram">
						<Instagram class="h-5 w-5" />
					</a>
				{/if}
				{#if contactHref}
					<a href={contactHref} target={contactExternal ? '_blank' : undefined} rel={contactExternal ? 'noopener noreferrer' : undefined} class="rounded-full px-4 py-2 font-medium" style={customStyles.buttonStyle}>Contact</a>
				{/if}
			</nav>
		</header>

		{#if !isShopActive}
			<div class="flex flex-1 items-center justify-center px-4 py-16 text-center">
				<div class="max-w-md">
					<h2 class="serif mb-3 text-3xl font-semibold">Boutique temporairement fermée</h2>
					<p class="text-neutral-600">Cette boutique n'est pas disponible pour le moment. Revenez bientôt découvrir nos créations !</p>
				</div>
			</div>
		{:else if currentSection}
			<!-- PAGE D'UNE CATÉGORIE (« Tout voir ») -->
			<main id="creations" class="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-4 sm:px-6">
				<a href={showBackButton ? '/?from=app' : '/'} class="text-sm text-neutral-600 hover:underline">← Toutes les créations</a>
				<h1 class="serif mt-3 text-4xl font-semibold">{currentSection.name}</h1>
				{#if currentSection.description}<p class="mt-1 text-neutral-600">{currentSection.description}</p>{/if}
				<div class="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
					{#each currentSection.items as product (product.id)}
						<a href={productHref(product.id)} class="group block">
							<div class="aspect-square overflow-hidden rounded-xl bg-white shadow-sm">
								{#if product.image_url}
									<img src={product.image_url} alt={product.name} loading="lazy" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
								{:else}
									<div class="flex h-full items-center justify-center bg-[#BB91A4]/15"><Cake class="h-10 w-10 text-neutral-300" /></div>
								{/if}
							</div>
							<p class="mt-2 line-clamp-2 text-[15px] font-semibold leading-tight">{product.name}</p>
							<p class="mt-0.5 text-sm" style={`color: ${customizations?.button_color || '#BC90A5'};`}>dès {formatPrice(product.base_price)}</p>
						</a>
					{/each}
				</div>
			</main>
		{:else}
			<!-- ACCUEIL -->
			<section class="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-2 md:pt-10">
				<div>
					<h1 class="serif text-4xl font-semibold leading-[1.1] sm:text-5xl">{shop.name}</h1>
					{#if shop.bio}
						<p class="mt-4 max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-600 sm:text-base">{shop.bio}</p>
					{/if}
					<div class="mt-6 flex flex-wrap gap-3">
						<a href="#creations" class="rounded-full px-6 py-3 text-sm font-medium shadow-sm" style={customStyles.buttonStyle}>Voir les créations</a>
						{#if contactHref}
							<a href={contactHref} target={contactExternal ? '_blank' : undefined} rel={contactExternal ? 'noopener noreferrer' : undefined} class="rounded-full border px-6 py-3 text-sm font-medium" style={`border-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_color || '#BC90A5'};`}>Contact</a>
						{/if}
					</div>
				</div>
				{#if heroImages.length}
					<div class="grid grid-cols-2 gap-3">
						{#each heroImages as img, i (img.id)}
							<a href={productHref(img.id)} class="block self-start overflow-hidden rounded-xl bg-white shadow-sm {i % 2 ? 'mt-6' : ''}">
								<img src={img.image_url} alt={img.name} class="aspect-[4/5] w-full object-cover" />
							</a>
						{/each}
					</div>
				{/if}
			</section>

			<main id="creations" class="mx-auto w-full max-w-6xl flex-1 scroll-mt-4 px-4 pb-10 sm:px-6">
				{#each sections as section (section.id)}
					<section class="border-t py-8" style="border-color: rgba(0,0,0,0.08);">
						<div class="flex items-end justify-between gap-4">
							<div class="min-w-0">
								<h2 class="serif text-[28px] font-semibold leading-tight">{section.name}</h2>
								{#if section.description}<p class="mt-0.5 text-sm text-neutral-600">{section.description}</p>{/if}
							</div>
							{#if section.items.length > 4}
								<a href={categoryHref(section.id)} class="flex-none text-sm font-medium hover:underline" style={`color: ${customizations?.button_color || '#BC90A5'};`}>Tout voir ({section.items.length}) →</a>
							{/if}
						</div>
						<!-- Téléphone : une ligne à faire glisser ; ordinateur : grille de 4 -->
						<div class="no-scrollbar -mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
							{#each section.items.slice(0, 4) as product (product.id)}
								<a href={productHref(product.id)} class="group block w-[44%] flex-none snap-start md:w-auto">
									<div class="aspect-square overflow-hidden rounded-xl bg-white shadow-sm">
										{#if product.image_url}
											<img src={product.image_url} alt={product.name} loading="lazy" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
										{:else}
											<div class="flex h-full items-center justify-center bg-[#BB91A4]/15"><Cake class="h-10 w-10 text-neutral-300" /></div>
										{/if}
									</div>
									<p class="mt-2 line-clamp-2 text-[15px] font-semibold leading-tight">{product.name}</p>
									<p class="mt-0.5 text-sm" style={`color: ${customizations?.button_color || '#BC90A5'};`}>dès {formatPrice(product.base_price)}</p>
								</a>
							{/each}
						</div>
					</section>
				{:else}
					<p class="py-16 text-center text-neutral-600">Aucune création disponible pour le moment.</p>
				{/each}

				{#if contactHref}
					<section class="mt-4 rounded-2xl px-6 py-10 text-center" style={`background-color: ${customizations?.button_color || '#BC90A5'}1A;`}>
						<h2 class="serif text-3xl font-semibold">Une idée sur mesure ?</h2>
						<p class="mx-auto mt-2 max-w-md text-neutral-600">Panneau photo, création personnalisée… Racontez-nous votre événement, on vous répond rapidement.</p>
						<a href={contactHref} target={contactExternal ? '_blank' : undefined} rel={contactExternal ? 'noopener noreferrer' : undefined} class="mt-5 inline-block rounded-full px-7 py-3 text-sm font-medium shadow-sm" style={customStyles.buttonStyle}>
							{shop.is_custom_accepted ? 'Demander un devis' : 'Me contacter'}
						</a>
					</section>
				{/if}
			</main>
		{/if}

		<ClientFooter {customizations} shopSlug={undefined} hasPolicies={$page.data.hasPolicies} />
	</div>
{/if}

<style>
	.serif {
		font-family: 'Cormorant Garamond', Georgia, serif;
		letter-spacing: -0.01em;
	}
	.no-scrollbar {
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
</style>
