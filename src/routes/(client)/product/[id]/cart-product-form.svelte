<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { OptionGroup } from '$lib/components';
	import { superForm } from 'sveltekit-superforms/client';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { createCartSchema } from './schema';
	import { addToCart, type CartItem } from '$lib/cart/store';

	/** Fiche article avec panier : personnalisation seulement (contact et date dans le panier) */
	export let data: SuperValidated<any>;
	export let shop: { id: string; profile_id?: string };
	export let product: any;
	export let customFields: Array<{
		id: string;
		label: string;
		type: 'short-text' | 'long-text' | 'number' | 'single-select' | 'multi-select';
		required: boolean;
		options?: Array<{ label: string; price?: number }>;
	}>;
	export let customizations: any;

	$: buttonColor = customizations?.button_color || '#BC90A5';
	$: buttonStyle = `background-color: ${buttonColor}; color: ${customizations?.button_text_color || '#ffffff'};`;
	$: outlineStyle = `border-color: ${buttonColor}; color: #7A4F60; background-color: white;`;

	let intent: 'add' | 'order' = 'add';
	let added: CartItem | null = null;
	let errorText = '';

	const form = superForm(data, {
		id: 'cart',
		validators: zodClient(createCartSchema(customFields)),
		dataType: 'json',
		resetForm: false,
		onSubmit: () => {
			errorText = '';
			added = null;
		},
		onResult: ({ result }) => {
			if (result.type === 'failure') errorText = (result.data as any)?.error || '';
		},
		onUpdated: ({ form: f }) => {
			const item = (f.message as any)?.cartItem as CartItem | undefined;
			if (!item) return;
			if (!addToCart(item)) {
				errorText = 'Votre panier est plein (20 articles maximum).';
				return;
			}
			if (intent === 'order') goto('/panier');
			else added = item;
		},
	});
	const { form: formData, enhance, submitting } = form;

	$: if (!$formData.customization_data) $formData.customization_data = {};
	$: showDeliveryOptions = !!product?.show_delivery_options;

	$: totalPrice = (() => {
		let total = Number(product.base_price) || 0;
		customFields.forEach((field) => {
			const v = $formData.customization_data?.[field.id];
			if (field.type === 'single-select' && v) total += field.options?.find((o) => o.label === v)?.price || 0;
			else if (field.type === 'multi-select' && Array.isArray(v))
				(v as string[]).forEach((label) => (total += field.options?.find((o) => o.label === label)?.price || 0));
		});
		return total;
	})();

	const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

	let qrUploading = false;
	let qrError = '';
	let qrInput: HTMLInputElement;
	async function onQrSelected(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		qrError = '';
		qrUploading = true;
		try {
			const body = new FormData();
			body.set('file', file);
			const res = await fetch('/api/upload-qr-code', { method: 'POST', body });
			const result = await res.json().catch(() => ({}));
			if (!res.ok || !result.url) throw new Error(result.error || "L'envoi a échoué, réessayez.");
			$formData.qr_code_url = result.url;
		} catch (e) {
			qrError = e instanceof Error ? e.message : "L'envoi a échoué, réessayez.";
		} finally {
			qrUploading = false;
			if (qrInput) qrInput.value = '';
		}
	}
</script>

<form method="POST" action="?/addToCart" use:enhance class="relative">
	<input type="hidden" name="shopId" value={shop.id} />
	<Form.Errors {form} />

	<div class="space-y-8">
		{#if customFields && customFields.length > 0}
			<div class="space-y-4">
				<h3 class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl" style="letter-spacing: -0.02em;">
					Personnalisation de votre commande
				</h3>
				<div class="space-y-4">
					{#each customFields as field}
						<div class="space-y-2">
							<Label for={field.id} class="text-sm font-medium">
								{field.label}{#if field.required}<span class="text-red-500"> *</span>{/if}
							</Label>
							<Form.Field {form} name={`customization_data.${field.id}`}>
								<Form.Control let:attrs>
									{#if field.type === 'short-text'}
										<Input {...attrs} id={field.id} type="text" placeholder="Votre réponse" required={field.required} style="background-color: white;" bind:value={$formData.customization_data[field.id]} />
									{:else if field.type === 'long-text'}
										<Textarea {...attrs} id={field.id} placeholder="Votre réponse" required={field.required} rows={3} style="background-color: white;" bind:value={$formData.customization_data[field.id]} />
									{:else if field.type === 'number'}
										<Input {...attrs} id={field.id} type="number" step="1" placeholder="Votre réponse" required={field.required} style="background-color: white;" bind:value={$formData.customization_data[field.id]} />
									{:else}
										<OptionGroup
											fieldId={field.id}
											fieldType={field.type}
											options={field.options || []}
											selectedValues={$formData.customization_data[field.id]}
											required={field.required}
											{customizations}
											on:change={(e) => ($formData.customization_data[field.id] = e.detail.values)}
										/>
									{/if}
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
						</div>
					{/each}
				</div>
			</div>
			<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
		{/if}

		{#if showDeliveryOptions}
			<div class="space-y-2">
				<h3 class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl" style="letter-spacing: -0.02em;">
					Votre QR code <span class="text-sm font-normal text-neutral-500">(facultatif)</span>
				</h3>
				{#if $formData.qr_code_url}
					<div class="flex items-center gap-3 rounded-xl border bg-white p-3">
						<img src={$formData.qr_code_url} alt="Votre QR code" class="h-16 w-16 rounded object-contain" />
						<span class="flex-1 text-sm text-neutral-700">QR code ajouté ✓</span>
						<button type="button" class="text-sm font-medium text-neutral-600 underline" on:click={() => ($formData.qr_code_url = '')}>Retirer</button>
					</div>
				{:else}
					<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-4 text-sm text-neutral-600 hover:border-neutral-500" style={`border-color: ${buttonColor};`}>
						<span class="text-2xl" aria-hidden="true">▦</span>
						<span>
							<span class="block font-medium text-neutral-900">{qrUploading ? 'Envoi en cours…' : 'Ajouter mon QR code'}</span>
							<span class="block text-xs">Image PNG ou JPG, par exemple depuis votre espace Souvientoi ou Placemoi</span>
						</span>
						<input bind:this={qrInput} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" class="sr-only" disabled={qrUploading} on:change={onQrSelected} />
					</label>
				{/if}
				{#if qrError}<p class="text-sm font-medium text-destructive">{qrError}</p>{/if}
			</div>
			<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
		{/if}

		<div class="space-y-4">
			<h3 class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl" style="letter-spacing: -0.02em;">Récapitulatif</h3>
			<div class="space-y-3 rounded-2xl border bg-white p-4 text-sm">
				{#if $formData.qr_code_url}
					<div class="flex items-center justify-between gap-2">
						<span class="font-semibold text-neutral-700">QR code :</span><span>Ajouté ✓</span>
					</div>
				{/if}
				<div class="border-t pt-3" style="border-color: rgba(0, 0, 0, 0.1);">
					<div class="flex items-center justify-between gap-2 font-semibold" style={`color: ${buttonColor};`}>
						<span>Prix de l'article :</span><span>{formatPrice(totalPrice)}</span>
					</div>
				</div>
			</div>
		</div>

		{#if errorText}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>{/if}

		{#if $page.url.searchParams.get('preview') !== 'true'}
			<div class="flex gap-2">
				<Button type="submit" variant="outline" disabled={$submitting} on:click={() => (intent = 'add')} class="flex-1 rounded-xl border" style={outlineStyle}>
					{$submitting && intent === 'add' ? 'Ajout…' : 'Ajouter au panier'}
				</Button>
				<Button type="submit" disabled={$submitting} on:click={() => (intent = 'order')} class="flex-1 rounded-xl" style={buttonStyle}>
					{$submitting && intent === 'order' ? 'Un instant…' : 'Commander'}
				</Button>
			</div>
		{:else}
			<div class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-sm text-blue-800">🔍 Mode prévisualisation - Boutons masqués</div>
		{/if}
	</div>

	{#if added}
		<div class="fixed bottom-4 left-1/2 z-50 w-[92%] max-w-sm -translate-x-1/2 rounded-2xl border bg-white p-4 shadow-xl sm:bottom-auto sm:left-auto sm:right-6 sm:top-24 sm:translate-x-0">
			<p class="font-semibold">✓ Ajouté au panier</p>
			<p class="mt-0.5 text-sm text-neutral-600">{added.name} · {formatPrice(added.price)}</p>
			<div class="mt-3 flex gap-2">
				<button type="button" on:click={() => (added = null)} class="flex-1 rounded-xl border px-3 py-2 text-sm">Continuer</button>
				<a href="/panier" class="flex-1 rounded-xl px-3 py-2 text-center text-sm font-medium" style={buttonStyle}>Voir mon panier</a>
			</div>
		</div>
	{/if}
</form>
