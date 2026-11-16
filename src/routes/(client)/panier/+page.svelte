<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { ArrowLeft, X } from 'lucide-svelte';
	import { DatePicker, TimeSlotSelector } from '$lib/components';
	import { ClientFooter } from '$lib/components';
	import { cart, cartTotal, removeFromCart } from '$lib/cart/store';
	import { cartParcelSize, shippingFee, missingForFree, parcelLabel, LAPOSTE_LOCATOR_URL, type ShipAddress } from '$lib/delivery/settings';

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

	// Envoi Colissimo (La Poste) : à domicile ou en point retrait
	$: delivery = data.delivery;
	$: sizes = (data.parcelSizes || {}) as Record<string, string>;
	$: relaisOn = !!delivery?.enabled && hasPrint;
	$: parcel = cartParcelSize(printItems.map((i) => sizes[i.productId] || 'medium'));
	$: blockingItem = printItems.find((i) => sizes[i.productId] === 'pickup_only');
	$: relaisPossible = relaisOn && !!parcel;
	$: pointPossible = relaisPossible && !!delivery?.pointRetrait && (parcel === 'small' || parcel === 'medium');
	let mode: 'retrait' | 'home' | 'point' = 'retrait';
	$: if (!relaisPossible && mode !== 'retrait') mode = 'retrait';
	$: if (!pointPossible && mode === 'point') mode = 'home';
	$: isRelais = mode !== 'retrait' && relaisPossible;
	$: fee = relaisPossible && parcel ? shippingFee(delivery, parcel, $cartTotal) : 0;
	$: missing = relaisPossible ? missingForFree(delivery, $cartTotal) : null;
	$: freeProgress = delivery?.freeFrom ? Math.min(100, Math.round(($cartTotal / delivery.freeFrom) * 100)) : 0;
	$: total = Math.round(($cartTotal + (isRelais ? fee : 0)) * 100) / 100;

	// Adresse (domicile) ou point retrait
	let shipAddress = '';
	let shipAddress2 = '';
	let shipZip = '';
	let shipCity = '';
	let pointName = '';
	$: relay = isRelais
		? ({
				kind: mode === 'point' ? 'point' : 'home',
				name: mode === 'point' ? pointName.trim() : '',
				address: shipAddress.trim(),
				address2: mode === 'point' ? '' : shipAddress2.trim(),
				zip: shipZip.trim(),
				city: shipCity.trim(),
				country: 'FR',
			} as ShipAddress)
		: null;
	$: addressOk =
		!!relay && relay.address.length >= 4 && /^\d{5}$/.test(relay.zip) && relay.city.length >= 2 && (relay.kind !== 'point' || relay.name.length >= 2);
	$: phoneOk = phone.replace(/\D/g, '').length >= 6;

	function chooseMode(m: 'retrait' | 'home' | 'point') {
		mode = m;
	}

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
	$: deliveryOk = !hasPrint || (isRelais ? addressOk && phoneOk : !!(pickupDate && (!needsSlot || pickupTime)));
	// Articles « Bientôt de retour » / « Indisponible »
	$: unavailableMap = (data.unavailable || {}) as Record<string, string>;
	$: blockedItems = items.filter((i) => unavailableMap[i.productId]);
	$: canOrder = items.length > 0 && blockedItems.length === 0 && name.trim() && /\S+@\S+\.\S+/.test(email) && deliveryOk;

	// Délai d'envoi Colissimo de chaque article ; un seul colis = le plus long compte
	$: shipDaysMap = (data.shipDays || {}) as Record<string, number>;
	const itemShipDays = (i: { productId: string; minDaysNotice?: number }) => shipDaysMap[i.productId] ?? (i.minDaysNotice || 0);
	$: shipItems = printItems.filter((i) => !unavailableMap[i.productId]);
	$: longestItem = shipItems.reduce<(typeof shipItems)[number] | null>((best, i) => (!best || itemShipDays(i) > itemShipDays(best) ? i : best), null);
	$: longestDays = longestItem ? itemShipDays(longestItem) : 0;
	$: shipDateLabel = (() => {
		const d = new Date();
		d.setDate(d.getDate() + longestDays);
		return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
	})();
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
					formData.set('delivery', isRelais ? 'relais' : 'retrait');
					formData.set('relay', isRelais && relay ? JSON.stringify(relay) : 'null');
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
				<input type="hidden" name="pickup_date" value={hasPrint && !isRelais ? pickupDate : ''} />
				<input type="hidden" name="pickup_time" value={hasPrint && !isRelais ? pickupTime : ''} />

				<!-- Articles -->
				<div class="min-w-0 space-y-3">
					{#each items as item (item.ref)}
						<div class="flex items-start gap-4 rounded-2xl border bg-white p-3.5 {unavailableMap[item.productId] ? 'opacity-70' : ''}">
							{#if item.image}
								<img src={item.image} alt="" class="h-[72px] w-[72px] shrink-0 rounded-xl object-cover {unavailableMap[item.productId] ? 'grayscale' : ''}" />
							{:else}
								<div class="h-[72px] w-[72px] shrink-0 rounded-xl bg-[#F3E6EA]"></div>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="font-semibold">{item.name}</p>
								{#each item.lines as l}<p class="truncate text-[13px] text-neutral-500">{l}</p>{/each}
								{#if unavailableMap[item.productId]}
									<span class="mt-1 inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-[12px] font-semibold text-neutral-600">
										{unavailableMap[item.productId] === 'soon' ? '⏳ Bientôt de retour' : 'Indisponible'} · retirez-le pour commander
									</span>
								{:else if item.mode === 'email' || (relaisOn && sizes[item.productId] === 'pickup_only')}
								<span class="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold {item.mode === 'email' ? 'bg-blue-50 text-blue-800' : 'bg-[#F3E6EA] text-[#7A4F60]'}">
									{item.mode === 'email' ? '✉️ Par e-mail · sous 48 h' : '📍 Retrait uniquement'}
								</span>
								{:else if isRelais}
									<span class="mt-1 inline-block rounded-full bg-[#fff4e0] px-2.5 py-0.5 text-[12px] font-semibold text-[#8a5a14]">
										📦 Envoi sous {itemShipDays(item)} jour{itemShipDays(item) > 1 ? 's' : ''}
									</span>
								{/if}
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
							<h2 class="text-lg font-semibold">Comment recevoir votre commande ?</h2>
							{#if relaisOn}
								<div class="grid gap-2">
									<button type="button" on:click={() => chooseMode('retrait')} class="flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm {mode === 'retrait' ? 'border-[#7A4F60] bg-[#FBF6F8]' : 'border-neutral-200 bg-white'}">
										<span class="flex items-center gap-3">
											<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 {mode === 'retrait' ? 'border-[#7A4F60]' : 'border-neutral-300'}">{#if mode === 'retrait'}<span class="h-2 w-2 rounded-full bg-[#7A4F60]"></span>{/if}</span>
											<span>📍 <b>Retrait à Andrésy (78)</b><br /><span class="text-neutral-500">Vous choisissez la date</span></span>
										</span>
										<b>Gratuit</b>
									</button>
									<button type="button" disabled={!relaisPossible} on:click={() => chooseMode('home')} class="flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm disabled:opacity-60 {mode === 'home' && relaisPossible ? 'border-[#7A4F60] bg-[#FBF6F8]' : 'border-neutral-200 bg-white'}">
										<span class="flex items-center gap-3">
											<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 {mode === 'home' && relaisPossible ? 'border-[#7A4F60]' : 'border-neutral-300'}">{#if mode === 'home' && relaisPossible}<span class="h-2 w-2 rounded-full bg-[#7A4F60]"></span>{/if}</span>
											<span>📦 <b>Livraison à domicile · Colissimo</b><br /><span class="text-neutral-500">{relaisPossible ? `La Poste · environ 2 jours après l’envoi` : `Indisponible : « ${blockingItem?.name || 'un article'} » est en retrait uniquement`}</span></span>
										</span>
										{#if relaisPossible}<b class="shrink-0">{fee > 0 ? formatPrice(fee) : 'Offerte'}</b>{/if}
									</button>
									{#if relaisPossible && delivery?.pointRetrait}
										<button type="button" disabled={!pointPossible} on:click={() => chooseMode('point')} class="flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm disabled:opacity-60 {mode === 'point' && pointPossible ? 'border-[#7A4F60] bg-[#FBF6F8]' : 'border-neutral-200 bg-white'}">
											<span class="flex items-center gap-3">
												<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 {mode === 'point' && pointPossible ? 'border-[#7A4F60]' : 'border-neutral-300'}">{#if mode === 'point' && pointPossible}<span class="h-2 w-2 rounded-full bg-[#7A4F60]"></span>{/if}</span>
												<span>🏤 <b>Point retrait La Poste · Colissimo</b><br /><span class="text-neutral-500">{pointPossible ? 'Bureau de poste ou relais Pickup de votre choix' : 'Indisponible : colis trop grand pour un point retrait'}</span></span>
											</span>
											{#if pointPossible}<b class="shrink-0">{fee > 0 ? formatPrice(fee) : 'Offerte'}</b>{/if}
										</button>
									{/if}
								</div>
								{#if relaisPossible && missing !== null}
									<div class="rounded-xl bg-[#FBF6F8] px-4 py-3 text-[13px]">
										{#if missing > 0}
											<p>Plus que <b>{formatPrice(missing)}</b> pour la livraison offerte 🎁</p>
										{:else}
											<p><b>Livraison offerte</b> 🎉</p>
										{/if}
										<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-[#ecd8e0]"><div class="h-full rounded-full bg-[#BC90A5] transition-all" style="width: {freeProgress}%"></div></div>
									</div>
								{/if}
							{:else}
								<div class="flex items-center justify-between gap-3 rounded-xl border-2 border-[#7A4F60] bg-[#FBF6F8] px-4 py-3 text-sm">
									<span>📍 Retrait à Andrésy (78) <span class="text-neutral-500">— vous choisissez la date</span></span>
									<b>Gratuit</b>
								</div>
							{/if}

							{#if isRelais}
								<div class="space-y-3 pt-1">
									{#if mode === 'point'}
										<p class="font-semibold">Votre point retrait</p>
										<p class="rounded-xl bg-[#FBF6F8] px-4 py-3 text-[13px]">
											Choisissez un bureau de poste ou un relais Pickup près de chez vous sur
											<a href={LAPOSTE_LOCATOR_URL} target="_blank" rel="noopener" class="font-medium underline">le site de La Poste</a>, puis recopiez son nom et son adresse ici.
											<span class="text-neutral-500">Les consignes (casiers) ne sont pas acceptées.</span>
										</p>
										<label class="block">
											<span class="mb-1.5 block text-sm font-medium">Nom du point retrait *</span>
											<input bind:value={pointName} maxlength="120" placeholder="ex. Bureau de poste Andrésy" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
										</label>
									{:else}
										<p class="font-semibold">Adresse de livraison</p>
									{/if}
									<label class="block">
										<span class="mb-1.5 block text-sm font-medium">Adresse *</span>
										<input bind:value={shipAddress} maxlength="160" placeholder="ex. 12 rue des Lilas" autocomplete={mode === 'point' ? 'off' : 'address-line1'} class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
									</label>
									{#if mode === 'home'}
										<label class="block">
											<span class="mb-1.5 block text-sm font-medium">Complément <span class="font-normal text-neutral-500">(bâtiment, étage, digicode…)</span></span>
											<input bind:value={shipAddress2} maxlength="120" placeholder="Facultatif" autocomplete="address-line2" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
										</label>
									{/if}
									<div class="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
										<label class="block min-w-0">
											<span class="mb-1.5 block text-sm font-medium">Code postal *</span>
											<input bind:value={shipZip} inputmode="numeric" maxlength="5" placeholder="78570" autocomplete={mode === 'point' ? 'off' : 'postal-code'} class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
										</label>
										<label class="block min-w-0">
											<span class="mb-1.5 block text-sm font-medium">Ville *</span>
											<input bind:value={shipCity} maxlength="80" placeholder="Andrésy" autocomplete={mode === 'point' ? 'off' : 'address-level2'} class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
										</label>
									</div>
									<div class="rounded-xl border border-[#f3dc9a] bg-[#fffbea] px-4 py-3 text-[13.5px] leading-relaxed">
										📦 <b>{shipItems.length > 1 ? `Un seul colis pour vos ${shipItems.length} articles` : 'Votre colis'}</b><br />
										Envoi prévu au plus tard le <b>{shipDateLabel}</b>{#if shipItems.length > 1 && longestItem}, car « {longestItem.name} » demande {longestDays} jour{longestDays > 1 ? 's' : ''}{/if}.<br />
										<span class="text-[12.5px] text-[#8a5a14]">Puis environ 2 jours de livraison La Poste. Vous recevez le numéro de suivi par e-mail. Livraison en France métropolitaine.</span>
									</div>
								</div>
							{/if}
							{#if !isRelais}
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
							{/if}
							{#if items.some((i) => i.mode === 'email')}
								<p class="text-[13px] text-neutral-500">Les articles « par e-mail » arrivent dans votre boîte mail, ils ne sont pas concernés par {isRelais ? 'la livraison' : 'le retrait'}.</p>
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
							<span class="mb-1.5 block text-sm font-medium">{isRelais ? 'Téléphone * ' : 'Numéro de téléphone (facultatif)'}{#if isRelais}<span class="font-normal text-neutral-500">(pour La Poste)</span>{/if}</span>
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
							{#if hasPrint && isRelais}
								<div class="flex justify-between gap-3"><span>Livraison Colissimo{relay?.city ? ` · ${relay.city}` : ''}</span><span class="shrink-0">{fee > 0 ? formatPrice(fee) : 'Offerte'}</span></div>
							{:else if hasPrint}
								<div class="flex justify-between"><span>Retrait à Andrésy</span><span>{pickupDate ? new Date(pickupDate + 'T12:00:00').toLocaleDateString('fr-FR') + (pickupTime ? ' · ' + pickupTime.slice(0, 5) : '') : 'à choisir'}</span></div>
							{/if}
							<div class="flex justify-between border-t pt-3 font-semibold" style={`color: ${customizations?.button_color || '#BC90A5'};`}>
								<span>Total à payer :</span><span>{formatPrice(total)}</span>
							</div>
						</div>
						{#if errorText}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>{/if}
						<button type="submit" disabled={!canOrder || sending} class="w-full rounded-xl px-6 py-3.5 font-medium shadow-sm disabled:opacity-50" style={buttonStyle}>
							{sending ? 'Un instant…' : 'Commander'}
						</button>
						{#if !canOrder && items.length}
							<p class="text-center text-xs text-neutral-500">
								{blockedItems.length ? `Retirez « ${blockedItems[0].name} » (plus disponible pour le moment).` : !name.trim() || !/\S+@\S+\.\S+/.test(email) ? 'Indiquez votre nom et votre e-mail.' : isRelais ? (!addressOk ? 'Complétez l’adresse de livraison.' : 'Indiquez votre téléphone pour La Poste.') : 'Choisissez la date et le créneau de retrait.'}
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
