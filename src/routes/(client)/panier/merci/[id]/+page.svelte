<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { ClientFooter } from '$lib/components';
	import { clearCart } from '$lib/cart/store';

	export let data;
	$: customizations = $page.data.customizations;
	$: buttonStyle = `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`;
	const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

	// La commande est passée : on vide le panier
	onMount(() => clearCart());
</script>

<svelte:head>
	<title>Merci pour votre commande - {data.shop?.name}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-[#fafafa] text-neutral-800">
	<header class="border-b border-black/[0.08] px-5 pb-4 pt-5 text-center">
		<a href="/" class="inline-flex flex-col items-center">
			{#if data.shop?.logo_url}<img src={data.shop.logo_url} alt={data.shop.name} class="h-12 w-12 rounded-full object-cover shadow-sm" />{/if}
			<span class="serif mt-1.5 text-2xl tracking-wide">JNB EVENT</span>
		</a>
	</header>

	<main class="mx-auto max-w-2xl px-5 pb-16 pt-10">
		<div class="text-center">
			<p class="text-4xl">💕</p>
			<h1 class="serif mt-2 text-4xl">Merci {data.customerName.split(' ')[0]} !</h1>
			<p class="mt-3 text-neutral-600">
				{#if data.paidByCard}
					Votre paiement est bien reçu, votre commande est confirmée. Un e-mail de confirmation vient de vous être envoyé.
				{:else}
					Votre commande est bien enregistrée. Nous vérifions votre paiement et vous confirmons tout par e-mail très vite.
				{/if}
			</p>
			<p class="mt-1 text-sm text-neutral-500">Commande n° {data.ref}</p>
		</div>

		<div class="mt-8 rounded-2xl border bg-white p-4">
			{#each data.items as it}
				<div class="flex items-start gap-3 border-b py-3 last:border-b-0">
					{#if it.image}<img src={it.image} alt="" class="h-14 w-14 shrink-0 rounded-lg object-cover" />{:else}<div class="h-14 w-14 shrink-0 rounded-lg bg-[#F3E6EA]"></div>{/if}
					<div class="min-w-0 flex-1 text-sm">
						<p class="font-semibold">{it.name}</p>
						{#each it.lines as l}<p class="truncate text-[12.5px] text-neutral-500">{l}</p>{/each}
						<p class="text-[12.5px] text-neutral-500">{it.mode === 'email' ? '✉️ Par e-mail · sous 48 h' : data.relay ? '📦 Envoi Colissimo' : '📍 Retrait à Andrésy'}</p>
					</div>
					<span class="text-sm font-semibold">{formatPrice(it.price)}</span>
				</div>
			{/each}
			{#if data.relay}
				<div class="flex justify-between py-2 text-sm"><span>Livraison Colissimo</span><span>{data.shippingFee > 0 ? formatPrice(data.shippingFee) : 'Offerte'}</span></div>
			{/if}
			<div class="flex justify-between border-t pt-3 font-semibold">
				<span>Total</span><span>{formatPrice(data.total)}</span>
			</div>
		</div>

		{#if data.relay}
			<div class="mt-4 rounded-2xl border border-[#ecd8e0] bg-[#FBF6F8] p-4 text-sm">
				📦 <b>{data.relay.kind === 'point' ? 'Point retrait La Poste (Colissimo)' : 'Livraison à domicile (Colissimo)'}</b><br />
				{data.relay.kind === 'point' ? `${data.relay.name}, ` : ''}{data.relay.address}{data.relay.address2 ? `, ${data.relay.address2}` : ''}, {data.relay.zip} {data.relay.city}<br />
				<span class="text-neutral-600">Vous recevrez le numéro de suivi par e-mail dès l'envoi du colis.</span>
			</div>
		{/if}
		{#if data.pickupDate}
			<div class="mt-4 rounded-2xl border border-[#ecd8e0] bg-[#FBF6F8] p-4 text-sm">
				📍 <b>Retrait</b> le {new Date(data.pickupDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{data.pickupTime ? ' à ' + data.pickupTime.slice(0, 5) : ''}<br />
				<span class="text-neutral-600">5 Grand Rue de l'Hautil, 78570 Andrésy. Nous vous prévenons par e-mail dès que c'est prêt.</span>
			</div>
		{/if}

		<div class="mt-8 text-center">
			<a href="/" class="inline-block rounded-xl px-6 py-3 text-sm font-medium" style={buttonStyle}>Retour à la boutique</a>
		</div>
	</main>

	<ClientFooter {customizations} shopSlug={undefined} hasPolicies={$page.data.hasPolicies} />
</div>

<style>
	.serif {
		font-family: 'Cormorant Garamond', Georgia, serif;
		letter-spacing: -0.01em;
	}
</style>
