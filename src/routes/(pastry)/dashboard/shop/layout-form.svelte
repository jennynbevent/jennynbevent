<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { ArrowUp, ArrowDown, LayoutGrid } from 'lucide-svelte';

	type Cat = { id: string; name: string };
	type Prod = { id: string; name: string; image_url: string | null };

	/** Disposition de la boutique : ordre des catégories + 4 images d'accueil */
	export let layout: { categories: Cat[]; products: Prod[]; heroIds: string[]; ready: boolean };

	let order: Cat[] = [...(layout.categories ?? [])];
	let hero: string[] = [...(layout.heroIds ?? [])].slice(0, 4);
	let saving = false;
	let message = '';
	let errorMessage = '';

	$: withImage = (layout.products ?? []).filter((p) => p.image_url);

	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= order.length) return;
		const copy = [...order];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		order = copy;
	}

	function toggleHero(id: string) {
		if (hero.includes(id)) hero = hero.filter((h) => h !== id);
		else if (hero.length < 4) hero = [...hero, id];
	}
</script>

<div class="mt-6 rounded-xl border bg-card p-6 shadow-sm">
	<div class="mb-6 flex items-center gap-3">
		<LayoutGrid class="h-6 w-6 text-primary" />
		<div>
			<h2 class="text-xl font-semibold">Disposition de la boutique</h2>
			<p class="text-sm text-muted-foreground">Choisissez l'ordre des catégories et les 4 photos de la page d'accueil.</p>
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
				if (result.type === 'success') message = 'Disposition enregistrée ✓';
				else if (result.type === 'failure') errorMessage = String(result.data?.error || 'Erreur');
				else errorMessage = 'Une erreur est survenue.';
				await invalidateAll();
			};
		}}
	>
		<input type="hidden" name="categoryOrder" value={JSON.stringify(order.map((c) => c.id))} />
		<input type="hidden" name="heroIds" value={JSON.stringify(hero)} />

		<!-- Ordre des catégories -->
		<h3 class="mb-2 font-medium">Ordre des catégories sur le site</h3>
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

		<!-- Images d'accueil -->
		<h3 class="mb-1 font-medium">Les 4 photos de la page d'accueil</h3>
		<p class="mb-3 text-sm text-muted-foreground">
			Cliquez sur les articles à afficher, dans l'ordre souhaité ({hero.length}/4). Sans choix, les dernières créations s'affichent.
		</p>
		<div class="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
			{#each withImage as p (p.id)}
				{@const pos = hero.indexOf(p.id)}
				<button
					type="button"
					on:click={() => toggleHero(p.id)}
					class="relative overflow-hidden rounded-lg border-2 text-left transition {pos >= 0 ? 'border-[#7A4F60]' : 'border-transparent hover:border-[#D9C3CC]'} {pos < 0 && hero.length >= 4 ? 'opacity-50' : ''}"
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

		<button type="submit" disabled={saving || !layout.ready} class="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
			{saving ? 'Enregistrement…' : 'Enregistrer la disposition'}
		</button>
		{#if message}<p class="mt-2 text-sm text-green-700">{message}</p>{/if}
		{#if errorMessage}<p class="mt-2 text-sm text-red-600">{errorMessage}</p>{/if}
	</form>
</div>
