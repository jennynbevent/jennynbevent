<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { ArrowLeft, X } from 'lucide-svelte';
	import { DatePicker, TimeSlotSelector } from '$lib/components';
	import { ClientFooter } from '$lib/components';
	import { cart, cartTotal, removeFromCart } from '$lib/cart/store';
	import { cartParcelSize, shippingFee, missingForFree, parcelLabel, MR_TEST_BRAND, type RelayPoint } from '$lib/delivery/settings';

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

	// Livraison en Point Relais
	$: delivery = data.delivery;
	$: sizes = (data.parcelSizes || {}) as Record<string, string>;
	$: relaisOn = !!delivery?.enabled && hasPrint;
	$: parcel = cartParcelSize(printItems.map((i) => sizes[i.productId] || 'medium'));
	$: blockingItem = printItems.find((i) => sizes[i.productId] === 'pickup_only');
	$: relaisPossible = relaisOn && !!parcel;
	let mode: 'retrait' | 'relais' = 'retrait';
	$: if (!relaisPossible && mode === 'relais') mode = 'retrait';
	$: isRelais = mode === 'relais' && relaisPossible;
	$: fee = relaisPossible && parcel ? shippingFee(delivery, parcel, $cartTotal) : 0;
	$: missing = relaisPossible ? missingForFree(delivery, $cartTotal) : null;
	$: freeProgress = delivery?.freeFrom ? Math.min(100, Math.round(($cartTotal / delivery.freeFrom) * 100)) : 0;
	$: total = Math.round(($cartTotal + (isRelais ? fee : 0)) * 100) / 100;
	let relay: RelayPoint | null = null;
	let widgetError = '';
	let widgetLoading = false;
	let widgetReady = false;
	let postCode = '';

	function loadScript(src: string) {
		return new Promise<void>((resolve, reject) => {
			if (document.querySelector(`script[src="${src}"]`)) return resolve();
			const el = document.createElement('script');
			el.src = src;
			el.onload = () => resolve();
			el.onerror = () => reject(new Error(src));
			document.head.appendChild(el);
		});
	}
	function loadCss(href: string) {
		if (document.querySelector(`link[href="${href}"]`)) return;
		const el = document.createElement('link');
		el.rel = 'stylesheet';
		el.href = href;
		document.head.appendChild(el);
	}

	async function openRelayMap() {
		widgetError = '';
		widgetLoading = true;
		try {
			loadCss('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
			await loadScript('https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js');
			await loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
			await loadScript('https://widget.mondialrelay.com/parcelshop-picker/jquery.plugin.mondialrelay.parcelshoppicker.min.js');
			widgetReady = true;
			await tick();
			const $ = (window as any).jQuery;
			$('#mr-widget').empty();
			$('#mr-widget').MR_ParcelShopPicker({
				Target: '#mr-target',
				Brand: (delivery.brand || MR_TEST_BRAND).padEnd(8, ' '),
				Country: 'FR',
				PostCode: postCode,
				ColLivMod: '24R',
				NbResults: '20',
				Responsive: true,
				ShowResultsOnMap: true,
				OnParcelShopSelected: (d: any) => {
					// Les lockers (casiers) sont trop petits pour nos colis : refusés
					if (isLocker(d)) {
						relay = null;
						lockerWarning = true;
						return;
					}
					lockerWarning = false;
					relay = {
						id: String(d.ID || ''),
						name: String(d.Nom || '').trim(),
						address: [d.Adresse1, d.Adresse2].filter((x: any) => x && String(x).trim()).join(', ').trim(),
						zip: String(d.CP || '').trim(),
						city: String(d.Ville || '').trim(),
						country: String(d.Pays || 'FR').trim(),
					};
				},
			});
			watchLockers();
		} catch (e) {
			console.error('[Point Relais] carte:', e);
			widgetError = 'La carte des Points Relais n’a pas pu s’afficher. Vérifiez votre connexion et réessayez.';
		} finally {
			widgetLoading = false;
		}
	}

	let lockerWarning = false;
	const LOCKER_RE = /\blocker\b|\bconsigne\b/i;
	function isLocker(d: any) {
		return LOCKER_RE.test(String(d?.Nom || '')) || /^(LOC|LCK)/i.test(String(d?.TypeActivite || d?.Type || ''));
	}
	// Cache les lockers dans la liste de la carte Mondial Relay
	let lockerObserver: MutationObserver | null = null;
	function hideLockers(root: HTMLElement) {
		const numbered = /^\s*\d+\s*-\s*/;
		const leaves = Array.from(root.querySelectorAll<HTMLElement>('*')).filter(
			(e) => e.children.length === 0 && numbered.test(e.textContent || '') && LOCKER_RE.test(e.textContent || '')
		);
		for (const leaf of leaves) {
			let n: HTMLElement = leaf;
			while (n.parentElement && n.parentElement !== root) {
				const sibs = Array.from(n.parentElement.children);
				if (sibs.length > 1 && sibs.filter((x) => numbered.test(x.textContent || '')).length > 1) break;
				n = n.parentElement;
			}
			if (n !== root && n.style.display !== 'none') n.style.display = 'none';
		}
	}
	function watchLockers() {
		const root = document.getElementById('mr-widget');
		if (!root) return;
		lockerObserver?.disconnect();
		lockerObserver = new MutationObserver(() => hideLockers(root));
		lockerObserver.observe(root, { childList: true, subtree: true });
		hideLockers(root);
	}
	onDestroy(() => lockerObserver?.disconnect());

	async function chooseMode(m: 'retrait' | 'relais') {
		mode = m;
		if (m === 'relais' && !relay && !widgetReady) await openRelayMap();
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
	$: deliveryOk = !hasPrint || (isRelais ? !!relay : !!(pickupDate && (!needsSlot || pickupTime)));
	$: canOrder = items.length > 0 && name.trim() && /\S+@\S+\.\S+/.test(email) && deliveryOk;
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
									{item.mode === 'email' ? '✉️ Par e-mail · sous 48 h' : relaisOn && sizes[item.productId] === 'pickup_only' ? '🖨️ Imprimé · retrait uniquement' : '🖨️ Imprimé'}
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
							{#if relaisOn}
								<div class="grid gap-2">
									<button type="button" on:click={() => chooseMode('retrait')} class="flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm {mode === 'retrait' ? 'border-[#7A4F60] bg-[#FBF6F8]' : 'border-neutral-200 bg-white'}">
										<span class="flex items-center gap-3">
											<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 {mode === 'retrait' ? 'border-[#7A4F60]' : 'border-neutral-300'}">{#if mode === 'retrait'}<span class="h-2 w-2 rounded-full bg-[#7A4F60]"></span>{/if}</span>
											<span>📍 <b>Retrait à Andrésy (78)</b><br /><span class="text-neutral-500">Vous choisissez la date</span></span>
										</span>
										<b>Gratuit</b>
									</button>
									<button type="button" disabled={!relaisPossible} on:click={() => chooseMode('relais')} class="flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm disabled:opacity-60 {isRelais ? 'border-[#7A4F60] bg-[#FBF6F8]' : 'border-neutral-200 bg-white'}">
										<span class="flex items-center gap-3">
											<span class="grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 {isRelais ? 'border-[#7A4F60]' : 'border-neutral-300'}">{#if isRelais}<span class="h-2 w-2 rounded-full bg-[#7A4F60]"></span>{/if}</span>
											<span>📦 <b>Livraison en Point Relais</b><br /><span class="text-neutral-500">{relaisPossible ? `Mondial Relay · 3 à 5 jours après l’envoi` : `Indisponible : « ${blockingItem?.name || 'un article'} » est en retrait uniquement`}</span></span>
										</span>
										{#if relaisPossible}<b class="shrink-0">{fee > 0 ? formatPrice(fee) : 'Offerte'}</b>{/if}
									</button>
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
									{#if relay}
										<div class="flex items-start justify-between gap-3 rounded-xl border border-[#ecd8e0] bg-white px-4 py-3 text-sm">
											<span><span class="text-[12px] font-semibold uppercase tracking-wide text-[#7A4F60]">Votre Point Relais ✓</span><br /><b>{relay.name}</b><br />{relay.address}<br />{relay.zip} {relay.city}</span>
										</div>
									{:else}
										<p class="text-sm font-medium">Choisissez votre Point Relais * <span class="font-normal text-neutral-500">(cliquez sur un Point Relais dans la liste)</span></p>
									{/if}
									{#if lockerWarning}
										<p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">Les lockers (casiers automatiques) sont trop petits pour nos colis. Choisissez un Point Relais en magasin dans la liste.</p>
									{/if}
									{#if widgetLoading}<p class="text-sm text-neutral-500">Chargement de la carte…</p>{/if}
									{#if widgetError}
										<p class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{widgetError}</p>
										<button type="button" on:click={openRelayMap} class="text-sm underline">Réessayer</button>
									{/if}
									<div id="mr-widget" class="mr-widget min-w-0 overflow-hidden rounded-xl"></div>
									<input id="mr-target" type="hidden" />
									<p class="text-[12.5px] text-neutral-500">Taille du colis : {parcel ? parcelLabel(parcel) : ''}. Envoi sous {delivery.prepDays} jour{delivery.prepDays > 1 ? 's' : ''} environ, vous recevez le numéro de suivi par e-mail.</p>
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
							{#if hasPrint && isRelais}
								<div class="flex justify-between gap-3"><span>Livraison Point Relais{relay ? ` · ${relay.city}` : ''}</span><span class="shrink-0">{fee > 0 ? formatPrice(fee) : 'Offerte'}</span></div>
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
								{!name.trim() || !/\S+@\S+\.\S+/.test(email) ? 'Indiquez votre nom et votre e-mail.' : isRelais ? 'Choisissez votre Point Relais.' : 'Choisissez la date et le créneau de retrait.'}
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
