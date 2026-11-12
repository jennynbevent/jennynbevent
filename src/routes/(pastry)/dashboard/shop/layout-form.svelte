<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowUp, ArrowDown, LayoutGrid } from 'lucide-svelte';

	type Cat = { id: string; name: string };

	/** Ordre des catégories (menu du site et page d'accueil) */
	export let layout: { categories: Cat[]; ready: boolean };

	let order: Cat[] = [...(layout.categories ?? [])];
	let saving = false;
	let message = '';
	let errorMessage = '';

	function move(i: number, dir: -1 | 1) {
		const j = i + dir;
		if (j < 0 || j >= order.length) return;
		const copy = [...order];
		[copy[i], copy[j]] = [copy[j], copy[i]];
		order = copy;
		message = '';
	}
</script>

<div class="mt-6 min-w-0 rounded-xl border bg-card p-6 shadow-sm">
	<div class="mb-6 flex items-center gap-3">
		<LayoutGrid class="h-6 w-6 text-primary" />
		<div>
			<h2 class="text-xl font-semibold">Ordre des catégories</h2>
			<p class="text-sm text-muted-foreground">Ordre du menu du site et des catégories sur la page d'accueil.</p>
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
		use:enhance={({ formData }) => {
			formData.set('categoryOrder', JSON.stringify(order.map((c) => c.id)));
			saving = true;
			message = '';
			errorMessage = '';
			return async ({ result }) => {
				saving = false;
				if (result.type === 'success') message = 'Ordre enregistré ✓';
				else if (result.type === 'failure') errorMessage = String(result.data?.error || 'Erreur');
				else errorMessage = 'Une erreur est survenue.';
			};
		}}
	>
		{#if order.length === 0}
			<p class="mb-6 text-sm text-muted-foreground">Aucune catégorie pour le moment.</p>
		{:else}
			<ol class="mb-6 space-y-2">
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
			{saving ? 'Enregistrement…' : 'Enregistrer l’ordre'}
		</button>
		{#if message}<p class="mt-2 text-sm text-green-700">{message}</p>{/if}
		{#if errorMessage}<p class="mt-2 text-sm text-red-600">{errorMessage}</p>{/if}
	</form>
</div>
