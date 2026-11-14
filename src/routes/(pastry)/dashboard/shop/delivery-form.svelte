<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Truck } from 'lucide-svelte';
	import { PARCEL_SIZES, type DeliverySettings } from '$lib/delivery/settings';

	export let delivery: { settings: DeliverySettings; ready: boolean };

	let s = structuredClone(delivery.settings);
	let freeOn = s.freeFrom !== null;
	let freeFrom = s.freeFrom ?? 120;
	let saving = false;
	let message = '';
	let errorText = '';

	const sizes = PARCEL_SIZES.filter((p) => p.id !== 'pickup_only') as Array<{ id: 'small' | 'medium' | 'large'; label: string; hint: string }>;
</script>

<Card class="shadow-sm">
	<CardHeader class="pb-6">
		<div class="flex items-center space-x-4">
			<Truck class="h-7 w-7 text-primary" />
			<div>
				<CardTitle class="text-xl">Livraison en Point Relais</CardTitle>
				<CardDescription class="text-base">Mondial Relay : le client choisit son Point Relais dans le panier</CardDescription>
			</div>
		</div>
	</CardHeader>
	<CardContent class="pt-0">
		{#if !delivery.ready}
			<p class="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
				⚠️ La mise à jour de la base (SQL « Point Relais ») n'a pas encore été faite. Fais-la dans Supabase, puis recharge cette page.
			</p>
		{/if}

		<form
			method="POST"
			action="?/updateDelivery"
			class="space-y-6"
			use:enhance={() => {
				saving = true;
				message = '';
				errorText = '';
				return async ({ result }) => {
					saving = false;
					if (result.type === 'success') {
						message = 'Enregistré ✓';
						await invalidateAll();
					} else if (result.type === 'failure') {
						errorText = String(result.data?.error || 'Erreur');
					} else {
						errorText = 'Une erreur est survenue.';
					}
				};
			}}
		>
			<!-- Activer -->
			<label class="flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
				<span>
					<span class="block font-medium">Proposer la livraison en Point Relais</span>
					<span class="block text-sm text-muted-foreground">Désactivé : le panier propose uniquement le retrait à Andrésy.</span>
				</span>
				<input type="checkbox" name="enabled" bind:checked={s.enabled} class="h-5 w-5 shrink-0" />
			</label>

			<!-- Prix -->
			<div class="space-y-3">
				<div>
					<p class="font-medium">Prix payé par le client, selon la taille du colis</p>
					<p class="text-sm text-muted-foreground">Tu choisis la taille de chaque article dans sa fiche (Articles → modifier). Un seul envoi par panier : c'est le plus grand colis qui compte.</p>
				</div>
				<div class="grid gap-3 sm:grid-cols-3">
					{#each sizes as size}
						<label class="block rounded-xl border p-3">
							<span class="block text-sm font-medium">{size.label}</span>
							<span class="block min-h-[32px] text-xs text-muted-foreground">{size.hint}</span>
							<span class="mt-2 flex items-center gap-2">
								<input name={size.id} type="number" step="0.01" min="0" max="99" bind:value={s.prices[size.id]} class="w-full rounded-lg border px-3 py-2 text-right" />
								<span>€</span>
							</span>
						</label>
					{/each}
				</div>
			</div>

			<!-- Livraison offerte -->
			<div class="space-y-2 rounded-xl border p-4">
				<label class="flex cursor-pointer items-center gap-3">
					<input type="checkbox" name="freeOn" bind:checked={freeOn} class="h-4 w-4" />
					<span class="font-medium">Livraison offerte à partir d'un montant</span>
				</label>
				{#if freeOn}
					<div class="flex items-center gap-2 pl-7">
						<span class="text-sm">Dès</span>
						<input name="freeFrom" type="number" step="1" min="0" max="999" bind:value={freeFrom} class="w-28 rounded-lg border px-3 py-2 text-right" />
						<span class="text-sm">€ d'articles dans le panier</span>
					</div>
					<p class="pl-7 text-xs text-muted-foreground">Le panier affiche « Plus que X € pour la livraison offerte ».</p>
				{/if}
			</div>

			<!-- Préparation -->
			<label class="block space-y-1">
				<span class="block font-medium">Délai avant l'envoi</span>
				<span class="flex items-center gap-2">
					<input name="prepDays" type="number" min="0" max="30" bind:value={s.prepDays} class="w-24 rounded-lg border px-3 py-2 text-right" />
					<span class="text-sm">jours (si un article demande plus, c'est son délai qui compte)</span>
				</span>
			</label>

			<!-- Code enseigne -->
			<label class="block space-y-1">
				<span class="block font-medium">Code enseigne Mondial Relay (facultatif)</span>
				<input name="brand" bind:value={s.brand} maxlength="10" placeholder="ex. CC12ABCD" class="w-full max-w-xs rounded-lg border px-3 py-2 uppercase" />
				<span class="block text-xs text-muted-foreground">
					Il se trouve dans ton espace Mondial Relay Pro. Laissé vide, la carte des Points Relais fonctionne quand même (mode démo de Mondial Relay).
				</span>
			</label>

			<div class="flex items-center gap-3">
				<Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
				{#if message}<span class="text-sm text-green-700">{message}</span>{/if}
				{#if errorText}<span class="text-sm text-red-700">{errorText}</span>{/if}
			</div>
		</form>
	</CardContent>
</Card>
