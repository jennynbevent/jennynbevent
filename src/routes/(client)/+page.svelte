<script lang="ts">
	import CartButton from '$lib/components/client/cart-button.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { Search, Cake, ArrowLeft, Instagram } from 'lucide-svelte';
	import { ClientFooter } from '$lib/components';
	import { HOME_DEFAULTS, type HomeSettings } from '$lib/utils/home-settings';
	import { Menu, X } from 'lucide-svelte';

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

	// Lien « Contact » : page Contact si elle est activée, sinon Instagram
	$: contactHref = shop?.is_custom_accepted
		? '/contact'
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
	// Réglages de la page d'accueil (textes + 3 images « Nos univers »)
	// Textes et images d'accueil fixés dans le code (HOME_DEFAULTS) ; images = 1re photo des 3 premières catégories
	const home: HomeSettings = HOME_DEFAULTS;
	$: universTiles = (() => {
		const withImage = (products as Product[]).filter((p) => p.image_url);
		const secs = sections.filter((sec) => sec.id !== 'autres');
		const used = new Set<string>();
		const out: { href: string; label: string; image: string }[] = [];
		for (const t of home.tiles ?? []) {
			const sec = secs.find((x) => x.id === t.category_id);
			if (!sec) {
				const solo = withImage.find((p) => p.id === t.product_id);
				if (solo?.image_url) out.push({ href: '#creations', label: solo.name, image: solo.image_url });
				continue;
			}
			// Une même catégorie peut revenir si chaque image a sa propre photo
			if (!t.image_url && used.has(sec.id)) continue;
			const prod = withImage.find((p) => p.id === t.product_id) ?? sec.items.find((p) => p.image_url);
			const image = t.image_url || prod?.image_url;
			if (image) {
				out.push({ href: categoryHref(sec.id), label: sec.name, image });
				used.add(sec.id);
			}
		}
		for (const sec of secs) {
			if (out.length >= 3) break;
			if (used.has(sec.id)) continue;
			const prod = sec.items.find((p) => p.image_url);
			if (prod?.image_url) out.push({ href: categoryHref(sec.id), label: sec.name, image: prod.image_url });
		}
		return out.slice(0, 3);
	})();
	let menuOpen = false;

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
		<!-- BANDE DU HAUT -->
		{#if home.banner}
			<div class="px-3 py-2 text-center text-[10px] uppercase tracking-[0.08em] text-white sm:text-xs sm:tracking-[0.12em]" style="background-color: #7A4F60;">
				{home.banner}
			</div>
		{/if}

		<!-- EN-TÊTE : logo centré + menu des catégories -->
		<header class="relative border-b" style="border-color: rgba(0,0,0,0.08);">
			{#if showBackButton}
				<button on:click={goBack} class="absolute left-4 top-4 z-10 rounded-full bg-white/80 p-2 shadow-sm" style={customStyles.iconStyle} title="Retour">
					<ArrowLeft class="h-5 w-5" />
				</button>
			{:else}
				<button
					type="button"
					class="absolute left-3 top-[42px] z-10 rounded-full p-2 md:hidden"
					on:click={() => (menuOpen = !menuOpen)}
					aria-label="Menu"
				>
					{#if menuOpen}<X class="h-6 w-6" />{:else}<Menu class="h-6 w-6" />{/if}
				</button>
			{/if}
			<div class="absolute right-3 top-[42px] z-10 flex items-center md:right-6 md:top-8">
				{#if shop.instagram}
					<a href="https://instagram.com/{shop.instagram.replace('@', '')}" target="_blank" rel="noopener noreferrer" class="rounded-full p-2 hover:bg-black/5" style={customStyles.iconStyle} title="Instagram">
						<Instagram class="h-5 w-5" />
					</a>
				{/if}
				<CartButton style={customStyles.iconStyle} />
			</div>
			<a href={showBackButton ? '/?from=app' : '/'} class="flex flex-col items-center pb-4 pt-4 md:pb-0 md:pt-6">
				<span class="h-12 w-12 overflow-hidden rounded-full bg-white p-1 shadow-sm md:h-[70px] md:w-[70px]">
					<img src={shop.logo_url || '/images/logo_jennynbevent.jpg'} alt="" class="h-full w-full object-contain" />
				</span>
				<span class="serif mt-1.5 text-[22px] uppercase tracking-[0.18em] md:text-[30px]">{shop.name}</span>
			</a>
			<nav class="hidden flex-wrap justify-center gap-x-10 gap-y-2 px-6 py-5 text-[13px] tracking-[0.06em] md:flex">
				{#each sections as sec (sec.id)}
					<a href={categoryHref(sec.id)} class="hover:underline hover:underline-offset-4">{sec.name}</a>
				{/each}
				{#if contactHref}<a href={contactHref} target={contactExternal ? '_blank' : undefined} rel={contactExternal ? 'noopener noreferrer' : undefined} class="hover:underline hover:underline-offset-4">Contact</a>{/if}
				{#if faqs && faqs.length > 0}<a href="/faq" class="hover:underline hover:underline-offset-4">FAQ</a>{/if}
			</nav>
			{#if menuOpen}
				<nav class="flex flex-col border-t px-6 py-3 text-[15px] md:hidden" style="border-color: rgba(0,0,0,0.08);">
					{#each sections as sec (sec.id)}
						<a href={categoryHref(sec.id)} on:click={() => (menuOpen = false)} class="py-2.5">{sec.name}</a>
					{/each}
					{#if faqs && faqs.length > 0}<a href="/faq" class="py-2.5">FAQ</a>{/if}
					{#if contactHref}
						<a href={contactHref} target={contactExternal ? '_blank' : undefined} rel={contactExternal ? 'noopener noreferrer' : undefined} class="py-2.5">Contact</a>
					{/if}
				</nav>
			{/if}
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
							<p class="mt-0.5 text-sm" style={`color: ${customizations?.button_color || '#BC90A5'};`}>{formatPrice(product.base_price)}</p>
						</a>
					{/each}
				</div>
			</main>
		{:else}
			<!-- ACCUEIL -->
			<section class="mx-auto w-full max-w-4xl px-5 pt-10 text-center md:pt-16">
				{#if home.kicker}<p class="serif text-[17px] italic md:text-xl" style="color: #9A7C88;">{home.kicker}</p>{/if}
				<h1 class="serif mt-1.5 text-[38px] font-normal leading-[1.05] md:text-[62px]">{home.title}</h1>
				<div class="mx-auto my-6 h-px w-[60px]" style="background-color: {customizations?.button_color || '#BC90A5'};"></div>
				{#if home.subtitle}<p class="whitespace-pre-line text-[15px] leading-relaxed text-neutral-600 md:text-base">{home.subtitle}</p>{/if}
			</section>

			{#if universTiles.length}
				<section class="mx-auto w-full max-w-6xl px-4 sm:px-6">
					<p class="mb-5 mt-10 text-center text-[13px] font-semibold tracking-[0.22em] md:mb-6 md:mt-14" style="color: #7A4F60;">NOS UNIVERS</p>
					<div class="univers grid gap-3 md:gap-[18px]" data-count={universTiles.length}>
						{#each universTiles as tile, i}
							<a href={tile.href} class="group relative block overflow-hidden {i === 0 ? 'big' : ''}">
								<img src={tile.image} alt={tile.label} class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
								<span class="pointer-events-none absolute inset-0" style="background: linear-gradient(transparent 55%, rgba(30,18,24,0.55));"></span>
								<span class="absolute inset-x-0 bottom-6 text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-white underline underline-offset-[5px] {i === 0 ? 'md:text-[15px]' : ''}">{tile.label}</span>
							</a>
						{/each}
					</div>
				</section>
			{/if}

			<main id="creations" class="mx-auto mt-10 w-full max-w-6xl flex-1 scroll-mt-4 px-4 pb-10 sm:px-6">
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
									<p class="mt-0.5 text-sm" style={`color: ${customizations?.button_color || '#BC90A5'};`}>{formatPrice(product.base_price)}</p>
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
							Me contacter
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
	.univers {
		grid-template-columns: 1fr;
		grid-template-rows: 380px;
		grid-auto-rows: 200px;
	}
	@media (min-width: 768px) {
		.univers {
			grid-template-columns: 1.4fr 1fr;
			grid-template-rows: 260px 260px;
		}
		.univers :global(.big) {
			grid-row: span 2;
		}
		.univers[data-count='1'] {
			grid-template-columns: 1fr;
			grid-template-rows: 460px;
		}
		.univers[data-count='2'] {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 460px;
		}
		.univers[data-count='1'] :global(.big),
		.univers[data-count='2'] :global(.big) {
			grid-row: span 1;
		}
	}
	.no-scrollbar {
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
</style>
