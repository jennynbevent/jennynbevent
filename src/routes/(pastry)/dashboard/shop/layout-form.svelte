<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowUp, ArrowDown, LayoutGrid } from 'lucide-svelte';
	import { HOME_DEFAULTS, type HomeSettings, type HomeTile } from '$lib/utils/home-settings';

	type Cat = { id: string; name: string };
	type Prod = { id: string; name: string; image_url: string | null; category_id: string | null };

	/** Disposition : ordre des catégories + page d'accueil (textes et « Nos univers ») */
	export let layout: { categories: Cat[]; products: Prod[]; home: HomeSettings | null; ready: boolean };

	let order: Cat[] = [...(layout.categories ?? [])];
	const h = layout.home ?? HOME_DEFAULTS;
	let banner = h.banner;
	let kicker = h.kicker;
	let title = h.title;
	let subtitle = h.subtitle;
	let tiles: HomeTile[] = [0, 1, 2].map((i) => h.tiles?.[i] ?? { category_id: null, product_id: null });

	let saving = false;
	let message = '';
	let errorMessage = '';

	$: withImage = (layout.products ?? []).filter((p) => p.image_url);
	$: homeJson = JSON.stringify({ banner, kicker, title, subtitle, tiles });

	const slotNames = ['Grande image (à gauche)', 'Petite image (en haut à droite)', 'Petite image (en bas à droite)'];

	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= order.length) return;
		const copy = [...order];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		order = copy;
	}

	function photosFor(categoryId: string | null) {
		const inCat = withImage.filter((p) => p.category_id === categoryId);
		return inCat.length ? inCat : withImage;
	}

	function setCategory(i: number, id: string) {
		tiles[i] = { category_id: id || null, product_id: null, image_url: tiles[i]?.image_url ?? null };
		tiles = tiles;
	}
	function setPhoto(i: number, id: string) {
		tiles[i] = { ...tiles[i], product_id: id, image_url: null };
		tiles = tiles;
	}

	// Photo envoyée depuis l'ordinateur
	let uploading: number | null = null;
	let uploadError = ['', '', ''];
	async function onUpload(i: number, event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		uploadError[i] = '';
		if (!file) return;
		if (file.size > 10 * 1024 * 1024) {
			uploadError[i] = 'Image trop lourde (10 Mo maximum).';
			return;
		}
		uploading = i;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch('/api/upload-home-image', { method: 'POST', body });
			const data = await res.json();
			if (!res.ok || !data.url) throw new Error(data.error || 'Erreur');
			tiles[i] = { ...tiles[i], product_id: null, image_url: data.url };
			tiles = tiles;
		} catch (e) {
			uploadError[i] = e instanceof Error ? e.message : "L'envoi a échoué.";
		} finally {
			uploading = null;
		}
	}
</script>

<div class="mt-6 rounded-xl border bg-card p-6 shadow-sm">
	<div class="mb-6 flex items-center gap-3">
		<LayoutGrid class="h-6 w-6 text-primary" />
		<div>
			<h2 class="text-xl font-semibold">Page d'accueil et disposition</h2>
			<p class="text-sm text-muted-foreground">Textes du haut de page, images « Nos univers » et ordre des catégories.</p>
		</div>
	</div>

	{#if !layout.ready}
		<p class="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
			Pour activer cette option, exécutez d'abord la petite commande SQL dans Supabase (voir les instructions reçues).
		</p>
	{/if}

	<form
		method="POST"
		action="?/updateLayout"
		use:enhance={() => {
			saving = true;
			message = '';
			errorMessage = '';
			return async ({ result }) => {
				saving = false;
				if (result.type === 'success') message = 'Page d’accueil enregistrée ✓';
				else if (result.type === 'failure') errorMessage = String(result.data?.error || 'Erreur');
				else errorMessage = 'Une erreur est survenue.';
				await invalidateAll();
			};
		}}
	>
		<input type="hidden" name="categoryOrder" value={JSON.stringify(order.map((c) => c.id))} />
		<input type="hidden" name="home" value={homeJson} />

		<!-- Textes -->
		<h3 class="mb-3 font-medium">Textes du haut de page</h3>
		<div class="mb-8 grid gap-4">
			<label class="grid gap-1 text-sm">
				<span class="font-medium">Bande du haut (mauve)</span>
				<input bind:value={banner} maxlength="160" class="h-10 rounded-md border px-3" placeholder="Retrait à Andrésy · Livraison bientôt de retour · …" />
				<span class="text-xs text-muted-foreground">Laisser vide pour masquer la bande.</span>
			</label>
			<label class="grid gap-1 text-sm">
				<span class="font-medium">Petite ligne en italique</span>
				<input bind:value={kicker} maxlength="80" class="h-10 rounded-md border px-3" placeholder="Créations personnalisées" />
			</label>
			<label class="grid gap-1 text-sm">
				<span class="font-medium">Grande phrase</span>
				<input bind:value={title} maxlength="120" class="h-10 rounded-md border px-3" placeholder="Les détails qui rendent votre événement unique" />
			</label>
			<label class="grid gap-1 text-sm">
				<span class="font-medium">Texte sous la phrase</span>
				<textarea bind:value={subtitle} maxlength="300" rows="2" class="rounded-md border px-3 py-2" placeholder="Panneaux de bienvenue, papeterie…"></textarea>
				<span class="text-xs text-muted-foreground">Laisser vide pour le masquer.</span>
			</label>
		</div>

		<!-- Nos univers -->
		<h3 class="mb-1 font-medium">Les 3 images « Nos univers »</h3>
		<p class="mb-4 text-sm text-muted-foreground">
			Pour chaque emplacement, choisissez une catégorie puis une photo de la boutique ou une photo de votre ordinateur. Sans choix, les premières catégories s'affichent avec leur première photo.
		</p>
		<div class="mb-8 grid gap-5">
			{#each tiles as tile, i}
				<div class="rounded-lg border bg-white p-4">
					<div class="mb-3 flex flex-wrap items-center gap-3">
						<span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#F3E6EA] text-xs text-[#7A4F60]">{i + 1}</span>
						<span class="text-sm font-medium">{slotNames[i]}</span>
						<select
							class="ml-auto h-9 rounded-md border px-2 text-sm"
							value={tile.category_id ?? ''}
							on:change={(e) => setCategory(i, e.currentTarget.value)}
						>
							<option value="">Automatique</option>
							{#each order as cat (cat.id)}
								<option value={cat.id}>{cat.name}</option>
							{/each}
						</select>
					</div>
					{#if tile.category_id}
						<div class="flex gap-2 overflow-x-auto pb-1">
							<!-- Photo depuis l'ordinateur -->
							{#if tile.image_url}
								<div class="relative h-20 w-20 flex-none overflow-hidden rounded-md border-2 border-[#7A4F60]" title="Votre photo">
									<img src={tile.image_url} alt="Votre photo" class="h-full w-full object-cover" />
									<button type="button" class="absolute right-0.5 top-0.5 rounded-full bg-white/90 px-1.5 text-xs" on:click={() => { tiles[i] = { ...tiles[i], image_url: null }; tiles = tiles; }} title="Retirer">✕</button>
								</div>
							{/if}
							<label class="flex h-20 w-20 flex-none cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-[#D9C3CC] bg-[#FBF6F8] text-center text-[11px] leading-tight text-[#7A4F60] hover:bg-[#F3E6EA]">
								{#if uploading === i}
									Envoi…
								{:else}
									<span class="text-lg leading-none">+</span>Depuis mon ordinateur
								{/if}
								<input type="file" accept="image/*" class="hidden" disabled={uploading !== null} on:change={(e) => onUpload(i, e)} />
							</label>
							{#each photosFor(tile.category_id) as p (p.id)}
								<button
									type="button"
									on:click={() => setPhoto(i, p.id)}
									class="h-20 w-20 flex-none overflow-hidden rounded-md border-2 {!tile.image_url && tile.product_id === p.id ? 'border-[#7A4F60]' : 'border-transparent hover:border-[#D9C3CC]'}"
									title={p.name}
								>
									<img src={p.image_url} alt={p.name} class="h-full w-full object-cover" />
								</button>
							{/each}
						</div>
						{#if uploadError[i]}<p class="mt-1 text-xs text-red-600">{uploadError[i]}</p>{/if}
						{#if !tile.product_id && !tile.image_url}<p class="mt-1 text-xs text-muted-foreground">Aucune photo choisie : la première de la catégorie sera utilisée.</p>{/if}
					{/if}
				</div>
			{/each}
		</div>

		<!-- Ordre des catégories -->
		<h3 class="mb-2 font-medium">Ordre des catégories (menu et page d'accueil)</h3>
		{#if order.length === 0}
			<p class="mb-6 text-sm text-muted-foreground">Aucune catégorie pour le moment.</p>
		{:else}
			<ol class="mb-8 space-y-2">
				{#each order as cat, i (cat.id)}
					<li class="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2">
						<span class="flex items-center gap-3 text-sm">
							<span class="flex h-6 w-6 items-center justify-center rounded-full bg-[#F3E6EA] text-xs text-[#7A4F60]">{i + 1}</span>
							{cat.name}
						</span>
						<span class="flex gap-1">
							<button type="button" class="rounded-md border p-1.5 hover:bg-muted disabled:opacity-30" disabled={i === 0} on:click={() => move(i, -1)} title="Monter">
								<ArrowUp class="h-4 w-4" />
							</button>
							<button type="button" class="rounded-md border p-1.5 hover:bg-muted disabled:opacity-30" disabled={i === order.length - 1} on:click={() => move(i, 1)} title="Descendre">
								<ArrowDown class="h-4 w-4" />
							</button>
						</span>
					</li>
				{/each}
			</ol>
		{/if}

		<button type="submit" disabled={saving || !layout.ready} class="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
			{saving ? 'Enregistrement…' : 'Enregistrer la page d’accueil'}
		</button>
		{#if message}<p class="mt-2 text-sm text-green-700">{message}</p>{/if}
		{#if errorMessage}<p class="mt-2 text-sm text-red-600">{errorMessage}</p>{/if}
	</form>
</div>
