<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { ArrowLeft, X } from 'lucide-svelte';
	import { DatePicker, TimeSlotSelector } from '$lib/components';
	import { ClientFooter } from '$lib/components';
	import { cart, cartTotal, removeFromCart } from '$lib/cart/store';

	export let data;
	$: ({ shop, availabilities, unavailabilities, datesWithLimitReached } = data);
	$: customizations = $page.data.customizations;
	$: buttonStyle = `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`;

	let mounted = false;
	onMount(() => (mounted = true));

	$: items = mounted ? $cart : [];
	$: printItems = items.filter((i) => i.mode === 'print');
	$: hasPrint = printItems.length > 0;
	$: minNotice = Math.max(0, ...printItems.map((i) => i.minDaysNotice || 0));

	let name = '';
	let email = '';
	let phone = '';
	let info = '';
	let pickupDate = '';
	let pickupTime = '';
	let slots: string[] = [];
	let loadingSlots = false;
	let sending = false;
	let errorText = '';

	const formatPrice = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

	async function loadSlots(date: string) {
		slots = [];
		pickupTime = '';
		const day = new Date(date + 'T12:00:00').getDay();
		const a = availabilities.find((x: any) => x.day === day);
		if (!a || !a.is_open || !a.start_time || !a.end_time || !a.interval_time) return;
		loadingSlots = true;
		try {
			const res = await fetch('/api/get-free-pickup-slots', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					shop_id: shop.id,
					pickup_date: date,
					start_time: a.start_time,
					end_time: a.end_time,
					interval_time: a.interval_time,
					break_start_time: a.break_start_time ?? null,
					break_end_time: a.break_end_time ?? null,
				}),
			});
			slots = res.ok ? (await res.json()).timeSlots || [] : [];
		} catch {
			slots = [];
		} finally {
			loadingSlots = false;
		}
	}

	$: needsSlot = (() => {
		if (!pickupDate) return false;
		const day = new Date(pickupDate + 'T12:00:00').getDay();
		const a = availabilities.find((x: any) => x.day === day);
		return !!(a && a.start_time && a.end_time && a.interval_time);
	})();
	$: canOrder =
		items.length > 0 && name.trim() && /\S+@\S+\.\S+/.test(email) && (!hasPrint || (pickupDate && (!needsSlot || pickupTime)));
</script>

<svelte:head>
	<title>Mon panier - {shop?.name}</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-[#fafafa] text-neutral-800">
	<header class="relative border-b border-black/[0.08] px-5 pb-4 pt-5 text-center">
		<a href="/" class="absolute left-4 top-5 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-neutral-600 hover:bg-black/[0.04]">
			<ArrowLeft class="h-4 w-4" /> Boutique
		</a>
		<a href="/" class="inline-flex flex-col items-center">
			{#if shop?.logo_url}<img src={shop.logo_url} alt={shop.name} class="h-12 w-12 rounded-full object-cover shadow-sm" />{/if}
			<span class="serif mt-1.5 text-2xl tracking-wide">JNB EVENT</span>
		</a>
	</header>

	<main class="mx-auto max-w-6xl px-5 pb-16 pt-8">
		<h1 class="serif mb-6 text-4xl">Mon panier</h1>

		{#if mounted && items.length === 0}
			<div class="rounded-2xl border bg-white p-10 text-center">
				<p class="text-neutral-600">Votre panier est vide.</p>
				<a href="/" class="mt-5 inline-block rounded-xl px-6 py-3 text-sm font-medium" style={buttonStyle}>Découvrir la boutique</a>
			</div>
		{:else if mounted}
			<form
				method="POST"
				action="?/checkout"
				class="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr]"
				use:enhance={({ formData }) => {
					formData.set('refs', JSON.stringify(items.map((i) => i.ref)));
					sending = true;
					errorText = '';
					return async ({ result }) => {
						sending = false;
						if (result.type === 'success' && result.data?.cartRef) {
							goto(`/panier/paiement/${result.data.cartRef}`);
						} else if (result.type === 'failure') {
							const missing = result.data?.missing;
							if (Array.isArray(missing)) missing.forEach((r) => removeFromCart(String(r)));
							errorText = String(result.data?.error || 'Une erreur est survenue.');
						} else if (result.type === 'error') {
							errorText = 'Une erreur est survenue, merci de réessayer.';
						}
					};
				}}
			>
				<input type="hidden" name="shopId" value={shop.id} />
				<input type="hidden" name="pickup_date" value={hasPrint ? pickupDate : ''} />
				<input type="hidden" name="pickup_time" value={hasPrint ? pickupTime : ''} />

				<!-- Articles -->
				<div class="min-w-0 space-y-3">
					{#each items as item (item.ref)}
						<div class="flex items-start gap-4 rounded-2xl border bg-white p-3.5">
							{#if item.image}
								<img src={item.image} alt="" class="h-[72px] w-[72px] shrink-0 rounded-xl object-cover" />
							{:else}
								<div class="h-[72px] w-[72px] shrink-0 rounded-xl bg-[#F3E6EA]"></div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-semibold">{item.name}</p>
								{#each item.lines as l}<p class="truncate text-[13px] text-neutral-500">{l}</p>{/each}
								<span class="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold {item.mode === 'email' ? 'bg-blue-50 text-blue-800' : 'bg-[#F3E6EA] text-[#7A4F60]'}">
									{item.mode === 'email' ? '✉️ Par e-mail · sous 48 h' : '🖨️ Imprimé'}
								</span>
							</div>
							<div class="flex shrink-0 flex-col items-end gap-2">
								<span class="font-semibold">{formatPrice(item.price)}</span>
								<button type="button" on:click={() => removeFromCart(item.ref)} class="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" title="Retirer" aria-label="Retirer {item.name}">
									<X class="h-4 w-4" />
								</button>
							</div>
						</div>
					{/each}

					{#if hasPrint}
						<div class="mt-6 space-y-3 rounded-2xl border bg-white p-4">
							<h2 class="text-lg font-semibold">Comment recevoir vos articles imprimés ?</h2>
							<div class="flex items-center justify-between gap-3 rounded-xl border-2 border-[#7A4F60] bg-[#FBF6F8] px-4 py-3 text-sm">
								<span>📍 Retrait à Andrésy (78) <span class="text-neutral-500">— vous choisissez la date</span></span>
								<b>Gratuit</b>
							</div>
							<div class="pt-2">
								<p class="mb-2 text-sm font-medium">Date de retrait *</p>
								<DatePicker
									{availabilities}
									{unavailabilities}
									{datesWithLimitReached}
									minDaysNotice={minNotice}
									on:dateSelected={(e) => {
										pickupDate = e.detail;
										loadSlots(e.detail);
									}}
								/>
							</div>
							{#if pickupDate && loadingSlots}
								<p class="text-sm text-neutral-500">Chargement des créneaux…</p>
							{:else if pickupDate && slots.length > 0}
								<TimeSlotSelector
									timeSlots={slots}
									selectedTime={pickupTime}
									required={true}
									label="Choisir un créneau de retrait"
									{customizations}
									on:change={(e) => (pickupTime = e.detail.value)}
								/>
							{:else if pickupDate && needsSlot}
								<p class="rounded-xl border border-orange-200 bg-orange-50 p-3 text-center text-sm text-orange-700">⚠️ Aucun créneau disponible pour cette date</p>
							{/if}
							{#if items.some((i) => i.mode === 'email')}
								<p class="text-[13px] text-neutral-500">Les articles « par e-mail » arrivent dans votre boîte mail, ils ne sont pas concernés par le retrait.</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Contact + récapitulatif -->
				<div class="min-w-0 space-y-6">
					<div class="space-y-4">
						<h2 class="text-xl font-semibold">Information de contact</h2>
						<label class="block">
							<span class="mb-1.5 block text-sm font-medium">Nom complet *</span>
							<input name="customer_name" bind:value={name} required maxlength="120" placeholder="Votre nom complet" autocomplete="name" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
						</label>
						<label class="block">
							<span class="mb-1.5 block text-sm font-medium">Email *</span>
							<input name="customer_email" type="email" bind:value={email} required maxlength="200" placeholder="votre@email.com" autocomplete="email" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
						</label>
						<label class="block">
							<span class="mb-1.5 block text-sm font-medium">Numéro de téléphone (facultatif)</span>
							<input name="customer_phone" type="tel" bind:value={phone} maxlength="40" placeholder="06 12 34 56 78" autocomplete="tel" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
						</label>
						<label class="block">
							<span class="mb-1.5 block text-sm font-medium">Informations supplémentaires</span>
							<textarea name="additional_information" bind:value={info} rows="3" maxlength="2000" placeholder="Informations supplémentaires..." class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]"></textarea>
						</label>
					</div>

					<div class="space-y-3">
						<h2 class="text-xl font-semibold">Récapitulatif de la commande</h2>
						<div class="space-y-2 rounded-2xl border bg-white p-4 text-sm">
							<p class="text-neutral-600">Merci de bien vérifier les informations de commande car en cas d'erreur votre commande pourra être retardée.</p>
							<div class="flex justify-between pt-1"><span>{items.length} article{items.length > 1 ? 's' : ''}</span><span>{formatPrice($cartTotal)}</span></div>
							{#if hasPrint}
								<div class="flex justify-between"><span>Retrait à Andrésy</span><span>{pickupDate ? new Date(pickupDate + 'T12:00:00').toLocaleDateString('fr-FR') + (pickupTime ? ' · ' + pickupTime.slice(0, 5) : '') : 'à choisir'}</span></div>
							{/if}
							<div class="flex justify-between border-t pt-3 font-semibold" style={`color: ${customizations?.button_color || '#BC90A5'};`}>
								<span>Total à payer :</span><span>{formatPrice($cartTotal)}</span>
							</div>
						</div>
						{#if errorText}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>{/if}
						<button type="submit" disabled={!canOrder || sending} class="w-full rounded-xl px-6 py-3.5 font-medium shadow-sm disabled:opacity-50" style={buttonStyle}>
							{sending ? 'Un instant…' : 'Commander'}
						</button>
						{#if !canOrder && items.length}
							<p class="text-center text-xs text-neutral-500">
								{!name.trim() || !/\S+@\S+\.\S+/.test(email) ? 'Indiquez votre nom et votre e-mail.' : 'Choisissez la date et le créneau de retrait.'}
							</p>
						{/if}
					</div>
				</div>
			</form>
		{/if}
	</main>

	<ClientFooter {customizations} shopSlug={undefined} hasPolicies={$page.data.hasPolicies} />
</div>

<style>
	.serif {
		font-family: 'Cormorant Garamond', Georgia, serif;
		letter-spacing: -0.01em;
	}
</style>
