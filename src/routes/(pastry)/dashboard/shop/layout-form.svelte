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

	$: homeJson = JSON.stringify({ banner, kicker, title, subtitle, tiles });

	const slotNames = ['Grande image (à gauche)', 'Petite image (en haut)', 'Petite image (en bas)'];

	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= order.length) return;
		const copy = [...order];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		order = copy;
	}

	function setCategory(i: number, id: string) {
		tiles[i] = { ...tiles[i], category_id: id || null };
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

<div class="mt-6 min-w-0 rounded-xl border bg-card p-6 shadow-sm">
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
			Pour chaque image : choisissez la catégorie (son nom s'affiche sur l'image et mène vers elle), puis ajoutez votre photo depuis votre ordinateur.
		</p>
		<div class="mb-8 grid gap-4 md:grid-cols-3">
			{#each tiles as tile, i}
				<div class="min-w-0 rounded-lg border bg-white p-4">
					<div class="mb-3 flex items-center gap-2">
						<span class="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#F3E6EA] text-xs text-[#7A4F60]">{i + 1}</span>
						<span class="text-sm font-medium">{slotNames[i]}</span>
					</div>

					<label class="mb-1 block text-xs text-muted-foreground" for="univers-cat-{i}">Catégorie</label>
					<select
						id="univers-cat-{i}"
						class="mb-3 h-10 w-full rounded-md border px-2 text-sm"
						value={tile.category_id ?? ''}
						on:change={(e) => setCategory(i, e.currentTarget.value)}
					>
						<option value="">— Choisir —</option>
						{#each order as cat (cat.id)}
							<option value={cat.id}>{cat.name}</option>
						{/each}
					</select>

					<span class="mb-1 block text-xs text-muted-foreground">Photo</span>
					{#if tile.image_url}
						<div class="relative aspect-[4/3] w-full overflow-hidden rounded-md border">
							<img src={tile.image_url} alt="Photo choisie" class="h-full w-full object-cover" />
							{#if tile.category_id}
								<span class="absolute inset-x-0 bottom-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white underline underline-offset-4 drop-shadow">
									{order.find((c) => c.id === tile.category_id)?.name ?? ''}
								</span>
							{/if}
						</div>
						<div class="mt-2 flex gap-3 text-xs">
							<label class="cursor-pointer text-[#7A4F60] underline">
								{uploading === i ? 'Envoi…' : 'Changer la photo'}
								<input type="file" accept="image/*" class="hidden" disabled={uploading !== null} on:change={(e) => onUpload(i, e)} />
							</label>
							<button type="button" class="text-muted-foreground underline" on:click={() => { tiles[i] = { ...tiles[i], image_url: null, product_id: null }; tiles = tiles; }}>Retirer</button>
						</div>
					{:else}
						<label class="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-[#D9C3CC] bg-[#FBF6F8] text-center text-sm text-[#7A4F60] hover:bg-[#F3E6EA]">
							{#if uploading === i}
								Envoi de la photo…
							{:else}
								<span class="text-2xl leading-none">+</span>
								Ajouter une photo<br /><span class="text-xs opacity-80">depuis mon ordinateur</span>
							{/if}
							<input type="file" accept="image/*" class="hidden" disabled={uploading !== null} on:change={(e) => onUpload(i, e)} />
						</label>
					{/if}
					{#if uploadError[i]}<p class="mt-1 text-xs text-red-600">{uploadError[i]}</p>{/if}
					{#if tile.image_url && !tile.category_id}<p class="mt-1 text-xs text-amber-700">Choisissez une catégorie pour que l'image s'affiche.</p>{/if}
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
