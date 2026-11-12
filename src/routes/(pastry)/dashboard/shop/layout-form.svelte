<script lang="ts">
	import { enhance } from '$app/forms';
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
	// Les 3 images « Nos univers » : articles cliqués dans l'ordre (1 = grande image)
	let picks: string[] = (h.tiles ?? []).map((t) => t.product_id).filter((x): x is string => !!x).slice(0, 3);

	let saving = false;
	let message = '';
	let errorMessage = '';

	$: withImage = (layout.products ?? []).filter((p) => p.image_url);
	$: tiles = picks.filter((id) => withImage.some((p) => p.id === id)).map((id) => ({
		category_id: withImage.find((p) => p.id === id)?.category_id ?? null,
		product_id: id,
		image_url: null,
	})) as HomeTile[];
	$: homeJson = JSON.stringify({ banner, kicker, title, subtitle, tiles });
	$: groups = [
		...order.map((c) => ({ name: c.name, items: withImage.filter((p) => p.category_id === c.id) })),
		{ name: 'Sans catégorie', items: withImage.filter((p) => !p.category_id || !order.some((c) => c.id === p.category_id)) },
	].filter((g) => g.items.length);
	const catName = (id: string | null) => order.find((c) => c.id === id)?.name ?? '';
	const prodOf = (id: string) => withImage.find((p) => p.id === id);

	function togglePick(id: string) {
		if (picks.includes(id)) picks = picks.filter((x) => x !== id);
		else if (picks.length < 3) picks = [...picks, id];
	}


	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= order.length) return;
		const copy = [...order];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		order = copy;
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
		<div class="mb-6 rounded-lg border-2 border-red-300 bg-red-50 p-4 text-sm text-red-800">
			<p class="font-semibold">⚠️ Ce bloc ne peut pas encore enregistrer : il manque un réglage dans Supabase.</p>
			<p class="mt-1">Dans Supabase → SQL Editor, collez cette commande puis cliquez sur « Run » :</p>
			<pre class="mt-2 overflow-x-auto rounded bg-white p-2 text-xs text-neutral-800">ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS home_settings jsonb;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS position integer;</pre>
			<p class="mt-1">Rechargez ensuite cette page.</p>
		</div>
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
				if (result.type === 'success') message = 'Page d’accueil enregistrée ✓ — visible sur le site tout de suite.';
				else if (result.type === 'failure') errorMessage = String(result.data?.error || 'Erreur');
				else errorMessage = 'Une erreur est survenue.';
				// Pas de rechargement après succès : le message de confirmation reste visible
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
			Cliquez sur 3 articles, dans l'ordre : <strong>1</strong> = grande image à gauche, <strong>2</strong> = petite en haut, <strong>3</strong> = petite en bas.
			Le nom de leur catégorie s'affiche sur l'image. Cliquez à nouveau sur un article pour le retirer.
		</p>

		<!-- Aperçu -->
		<div class="mb-5 flex flex-wrap items-center gap-4 rounded-lg border bg-[#FBF6F8] p-4">
			<div class="grid h-32 w-56 flex-none grid-cols-[1.4fr_1fr] grid-rows-2 gap-1.5">
				{#each [0, 1, 2] as i}
					{@const p = picks[i] ? prodOf(picks[i]) : null}
					<div class="relative overflow-hidden rounded bg-white {i === 0 ? 'row-span-2' : ''} {p ? '' : 'border border-dashed border-[#D9C3CC]'}">
						{#if p}
							<img src={p.image_url} alt="" class="h-full w-full object-cover" />
							<span class="absolute inset-x-0 bottom-1 text-center text-[8px] font-semibold uppercase tracking-wider text-white drop-shadow">{catName(p.category_id)}</span>
						{/if}
						<span class="absolute left-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#7A4F60] text-[9px] font-semibold text-white">{i + 1}</span>
					</div>
				{/each}
			</div>
			<div class="text-sm">
				<p class="font-medium text-[#7A4F60]">Aperçu sur le site ({picks.length}/3)</p>
				{#if picks.length < 3}
					<p class="text-muted-foreground">Encore {3 - picks.length} à choisir. Sans choix, le site prend une photo de vos premières catégories.</p>
				{:else}
					<p class="text-muted-foreground">C'est complet. Pensez à enregistrer en bas.</p>
				{/if}
				{#if picks.length}
					<button type="button" class="mt-1 text-xs underline text-muted-foreground" on:click={() => (picks = [])}>Tout désélectionner</button>
				{/if}
			</div>
		</div>

		{#if withImage.length === 0}
			<p class="mb-8 text-sm text-muted-foreground">Ajoutez d'abord des articles avec une photo.</p>
		{:else}
			<div class="mb-8 space-y-4">
				{#each groups as g}
					<div>
						<p class="mb-2 text-xs font-semibold uppercase tracking-wider text-[#7A4F60]">{g.name}</p>
						<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
							{#each g.items as p (p.id)}
								{@const pos = picks.indexOf(p.id)}
								<button
									type="button"
									on:click={() => togglePick(p.id)}
									class="relative overflow-hidden rounded-lg border-2 text-left transition {pos >= 0 ? 'border-[#7A4F60]' : 'border-transparent hover:border-[#D9C3CC]'} {pos < 0 && picks.length >= 3 ? 'opacity-50' : ''}"
									title={p.name}
								>
									<img src={p.image_url} alt={p.name} class="aspect-square w-full object-cover" />
									{#if pos >= 0}
										<span class="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#7A4F60] text-xs font-semibold text-white">{pos + 1}</span>
									{/if}
									<span class="block truncate bg-white px-1.5 py-1 text-[11px]">{p.name}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

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
