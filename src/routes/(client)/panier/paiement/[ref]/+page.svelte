<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { ArrowLeft, Copy, Check } from 'lucide-svelte';
	import { ClientFooter } from '$lib/components';

	export let data;
	$: customizations = $page.data.customizations;
	$: buttonStyle = `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`;

	const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
	const providerName: Record<string, string> = { stripe: 'Carte bancaire', paypal: 'PayPal', wero: 'Wero', revolut: 'Revolut' };

	$: stripe = data.paymentLinks.find((p: any) => p.provider_type === 'stripe');
	$: others = data.paymentLinks.filter((p: any) => p.provider_type !== 'stripe');

	let cardLoading = false;
	let errorText = '';
	let chosen: { provider_type: string; payment_identifier: string } | null = null;
	let copied = false;

	function manualLink(p: { provider_type: string; payment_identifier: string }) {
		const id = p.payment_identifier.replace(/^@/, '');
		if (p.provider_type === 'paypal') return `https://paypal.me/${id}/${data.total}EUR`;
		if (p.provider_type === 'revolut') return `https://revolut.me/${id}?amount=${Math.round(data.total * 100)}`;
		return null;
	}

	function choose(p: { provider_type: string; payment_identifier: string }) {
		chosen = p;
		const link = manualLink(p);
		if (link) window.open(link, '_blank', 'noopener');
	}

	async function copyId() {
		if (!chosen) return;
		try {
			await navigator.clipboard.writeText(chosen.payment_identifier);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			/* copie impossible */
		}
	}
</script>

<svelte:head>
	<title>Paiement - {data.shop.name}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-[#fafafa] text-neutral-800">
	<header class="relative border-b border-black/[0.08] px-5 pb-4 pt-5 text-center">
		<a href="/panier" class="absolute left-4 top-5 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-neutral-600 hover:bg-black/[0.04]">
			<ArrowLeft class="h-4 w-4" /> Panier
		</a>
		<a href="/" class="inline-flex flex-col items-center">
			{#if data.shop.logo_url}<img src={data.shop.logo_url} alt={data.shop.name} class="h-12 w-12 rounded-full object-cover shadow-sm" />{/if}
			<span class="serif mt-1.5 text-2xl tracking-wide">JNB EVENT</span>
		</a>
	</header>

	<main class="mx-auto grid max-w-5xl gap-8 px-5 pb-16 pt-8 lg:grid-cols-[1fr_1fr]">
		<section>
			<h1 class="serif mb-4 text-4xl">Paiement</h1>
			<div class="space-y-1 rounded-2xl border bg-white p-4">
				{#each data.items as it}
					<div class="flex items-start gap-3 border-b py-2.5 last:border-b-0">
						{#if it.image}<img src={it.image} alt="" class="h-12 w-12 shrink-0 rounded-lg object-cover" />{:else}<div class="h-12 w-12 shrink-0 rounded-lg bg-[#F3E6EA]"></div>{/if}
						<div class="min-w-0 flex-1 text-sm">
							<p class="font-semibold">{it.name}</p>
							<p class="text-[12.5px] text-neutral-500">{it.mode === 'email' ? '✉️ Par e-mail · sous 48 h' : '📍 Retrait à Andrésy'}</p>
						</div>
						<span class="text-sm font-semibold">{formatPrice(it.price)}</span>
					</div>
				{/each}
				{#if data.pickupDate}
					<p class="pt-2 text-sm text-neutral-600">📍 Retrait le {new Date(data.pickupDate + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{data.pickupTime ? ' à ' + data.pickupTime.slice(0, 5) : ''}</p>
				{/if}
				<div class="flex justify-between border-t pt-3 text-base font-semibold" style={`color: ${customizations?.button_color || '#BC90A5'};`}>
					<span>Total à payer</span><span>{formatPrice(data.total)}</span>
				</div>
			</div>
		</section>

		<section class="space-y-4 lg:pt-16">
			{#if data.cancelled}
				<p class="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Le paiement a été annulé. Vous pouvez réessayer.</p>
			{/if}

			{#if stripe}
				<form
					method="POST"
					action="?/card"
					use:enhance={() => {
						cardLoading = true;
						errorText = '';
						return async ({ result }) => {
							if (result.type === 'success' && result.data?.checkoutUrl) {
								window.location.href = String(result.data.checkoutUrl);
								return;
							}
							cardLoading = false;
							errorText = result.type === 'failure' ? String(result.data?.error || 'Erreur') : 'Erreur, merci de réessayer.';
						};
					}}
				>
					<button type="submit" disabled={cardLoading} class="w-full rounded-xl px-6 py-4 text-base font-medium shadow-sm disabled:opacity-60" style={buttonStyle}>
						{cardLoading ? 'Redirection…' : `💳 Payer ${formatPrice(data.total)} par carte`}
					</button>
					<p class="mt-2 text-center text-xs text-neutral-500">Paiement sécurisé. Votre commande est confirmée immédiatement.</p>
				</form>
			{/if}

			{#if others.length}
				{#if stripe}<p class="pt-2 text-center text-sm text-neutral-500">ou</p>{/if}
				<div class="space-y-2">
					{#each others as p}
						<button type="button" on:click={() => choose(p)} class="w-full rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:border-neutral-400 {chosen?.provider_type === p.provider_type ? 'border-neutral-900' : ''}">
							Payer avec {providerName[p.provider_type] || p.provider_type}
						</button>
					{/each}
				</div>
				{#if chosen}
					<div class="space-y-3 rounded-2xl border bg-white p-4 text-sm">
						{#if chosen.provider_type === 'wero'}
							<p>Envoyez <strong>{formatPrice(data.total)}</strong> avec Wero à :</p>
							<button type="button" on:click={copyId} class="flex w-full items-center justify-between rounded-lg border px-3 py-2 font-semibold">
								{chosen.payment_identifier}
								{#if copied}<Check class="h-4 w-4 text-green-600" />{:else}<Copy class="h-4 w-4 text-neutral-500" />{/if}
							</button>
						{:else}
							<p>Une page {providerName[chosen.provider_type]} s'est ouverte pour payer <strong>{formatPrice(data.total)}</strong>. <a href={manualLink(chosen)} target="_blank" rel="noopener noreferrer" class="underline">Rouvrir la page</a></p>
						{/if}
						<p class="text-neutral-600">Une fois le paiement effectué, cliquez sur « J'ai payé ». Nous vérifions et vous confirmons la commande par e-mail.</p>
						<form method="POST" action="?/manual" use:enhance>
							<input type="hidden" name="provider" value={chosen.provider_type} />
							<button type="submit" class="w-full rounded-xl px-6 py-3 font-medium" style={buttonStyle}>J'ai payé</button>
						</form>
					</div>
				{/if}
			{/if}

			{#if errorText || $page.form?.error}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText || $page.form?.error}</p>{/if}
		</section>
	</main>

	<ClientFooter {customizations} shopSlug={undefined} hasPolicies={$page.data.hasPolicies} />
</div>

<style>
	.serif {
		font-family: 'Cormorant Garamond', Georgia, serif;
		letter-spacing: -0.01em;
	}
</style>
