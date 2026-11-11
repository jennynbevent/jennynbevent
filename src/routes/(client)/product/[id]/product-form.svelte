<script lang="ts">
	import { hasDeposit, amountDueNow } from '$lib/utils/deposit';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { DatePicker, DateRangePicker, OptionGroup, TimeSlotSelector } from '$lib/components';
	import { superForm } from 'sveltekit-superforms/client';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { createLocalDynamicSchema } from './schema';
	import {
		Alert,
		AlertDescription,
		AlertTitle,
	} from '$lib/components/ui/alert';
	import { AlertTriangle } from 'lucide-svelte';
	import type { OrderLimitStats } from '$lib/utils/order-limits';

	export let data: SuperValidated<any>;
	export let shop: {
		id: string;
		name: string;
		slug: string;
		logo_url?: string;
		bio?: string;
		is_custom_accepted: boolean;
		is_active: boolean;
		is_visible: boolean;
		profile_id?: string;
	};
	export let customFields: Array<{
		id: string;
		label: string;
		type:
			| 'short-text'
			| 'long-text'
			| 'number'
			| 'single-select'
			| 'multi-select';
		required: boolean;
		options?: Array<{ label: string; price?: number }>;
	}>;

	export let product: any;
	export let availabilities: Array<{
		day: number;
		is_open: boolean;
		daily_order_limit?: number | null;
		start_time?: string | null;
		end_time?: string | null;
		interval_time?: string | null;
	}>;
	export let unavailabilities: Array<{ start_date: string; end_date: string }>;
	export let datesWithLimitReached: string[] = [];
	export let reservedRanges: Array<{ start_date: string; end_date: string }> = [];
	export let customizations: {
		button_color: string;
		button_text_color: string;
		text_color: string;
		icon_color: string;
		secondary_text_color: string;
		background_color: string;
		background_image_url?: string;
	};
	export let onCancel: () => void;
	export let orderLimitStats: OrderLimitStats | null = null;

	const dynamicSchema = createLocalDynamicSchema(customFields);

	// Vérifier si le formulaire doit être désactivé
	$: isFormDisabled = orderLimitStats?.isLimitReached || false;

	// Styles personnalisés
	$: customStyles = {
		buttonStyle: `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`,
		textStyle: `color: ${customizations?.text_color || '#333333'};`,
		secondaryTextStyle: `color: ${customizations?.secondary_text_color || '#333333'};`,
		inputBackgroundStyle: `background-color: white;`,
		separatorColor: 'rgba(0, 0, 0, 0.3)',
	};

	const form = superForm(data, {
		validators: zodClient(dynamicSchema),
		dataType: 'json',
		onSubmit: () => {
			// Form submission handled by superForm
		},
		onUpdated: ({ form }) => {
			if (
				form.message &&
				typeof form.message === 'object' &&
				'redirectTo' in form.message
			) {
				const redirectTo = (form.message as any).redirectTo;
				goto(redirectTo);
			}
		},
	});

	const { form: formData, enhance, submitting, message } = form;

	// État pour les créneaux horaires
	let availableTimeSlots: string[] = [];
	let selectedTimeSlot = '';
	let isLoadingTimeSlots = false;

	$: isReservation = product?.booking_type === 'reservation';

	let dateRangeError = '';

	$: totalPrice = (() => {
		let total = product.base_price || 0;

		// Ajouter les prix des options sélectionnées
		customFields.forEach((field) => {
			if (
				field.type === 'single-select' &&
				$formData.customization_data[field.id]
			) {
				const selectedOption = field.options?.find(
					(opt) => opt.label === $formData.customization_data[field.id],
				);
				if (selectedOption) {
					total += selectedOption.price || 0;
				}
			} else if (
				field.type === 'multi-select' &&
				Array.isArray($formData.customization_data[field.id])
			) {
				($formData.customization_data[field.id] as string[]).forEach(
					(optionLabel) => {
						const selectedOption = field.options?.find(
							(opt) => opt.label === optionLabel,
						);
						if (selectedOption) {
							total += selectedOption.price || 0;
						}
					},
				);
			}
		});

		return total;
	})();

	// Gérer la redirection en cas de succès
	$: if ($message?.redirectTo) {
		const url = $message.redirectTo;
		message.set(null); // reset pour éviter une boucle
		// Utiliser goto() pour la navigation PWA cross-platform
		if (url.startsWith('http://') || url.startsWith('https://')) {
			// URL externe (ex: Stripe) - utiliser window.location
			window.location.href = url;
		} else {
			// URL interne - utiliser goto() pour rester dans la PWA
			goto(url);
		}
	}

	// Fonction pour charger les créneaux horaires disponibles
	async function loadTimeSlots(pickupDate: string) {
		if (!pickupDate) {
			availableTimeSlots = [];
			selectedTimeSlot = '';
			return;
		}

		isLoadingTimeSlots = true;
		try {
			// Trouver la disponibilité pour le jour sélectionné
			const selectedDate = new Date(pickupDate);
			const dayOfWeek = selectedDate.getDay(); // 0=dimanche, 1=lundi, etc.
			const availability = availabilities.find((a) => a.day === dayOfWeek);

			if (
				!availability ||
				!availability.is_open ||
				!availability.start_time ||
				!availability.end_time ||
				!availability.interval_time
			) {
				availableTimeSlots = [];
				selectedTimeSlot = '';
				return;
			}

			// Appeler l'API pour récupérer les créneaux libres
			const response = await fetch(`/api/get-free-pickup-slots`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					shop_id: shop.id,
					pickup_date: pickupDate,
					start_time: availability.start_time,
					end_time: availability.end_time,
					interval_time: availability.interval_time,
					break_start_time: availability.break_start_time ?? null,
					break_end_time: availability.break_end_time ?? null,
				}),
			});

			if (response.ok) {
				const data = await response.json();
				availableTimeSlots = data.timeSlots || [];

				// Ne réinitialiser que si le créneau sélectionné n'est plus disponible
				if (
					selectedTimeSlot &&
					!availableTimeSlots.includes(selectedTimeSlot)
				) {
					selectedTimeSlot = '';
					$formData.pickup_time = '';
				}
			} else {
				console.error('Erreur lors du chargement des créneaux');
				availableTimeSlots = [];
				selectedTimeSlot = '';
				$formData.pickup_time = '';
			}
		} catch (error) {
			console.error('Erreur lors du chargement des créneaux:', error);
			availableTimeSlots = [];
			selectedTimeSlot = '';
			$formData.pickup_time = '';
		} finally {
			isLoadingTimeSlots = false;
		}
	}

	// Charger les créneaux quand la date change
	// Mode de remise et QR code
	$: showDeliveryOptions = !!product?.show_delivery_options && !isReservation;
	$: isEmailDelivery = showDeliveryOptions && $formData.delivery_mode === 'email';
	function isoInDays(days: number) {
		const d = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
	function chooseDelivery(mode: 'retrait' | 'email') {
		if ($formData.delivery_mode === mode) return;
		$formData.delivery_mode = mode;
		$formData.pickup_time = undefined;
		selectedTimeSlot = '';
		// Envoi par e-mail : pas de calendrier, la date est fixée automatiquement (48 h)
		$formData.pickup_date = mode === 'email' ? isoInDays(2) : '';
	}
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

	$: pickupDate = $formData.pickup_date;
	$: if (pickupDate && !isReservation && !isEmailDelivery) {
		loadTimeSlots(pickupDate);
	}
	$: if (isReservation) {
		availableTimeSlots = [];
		selectedTimeSlot = '';
	}

	// Fonction pour formater le prix
	function formatPrice(price: number): string {
		return new Intl.NumberFormat('fr-FR', {
			style: 'currency',
			currency: 'EUR',
		}).format(price);
	}
</script>

<form method="POST" action="?/createProductOrder" use:enhance>
	<!-- ✅ OPTIMISÉ : Passer shopId, profileId et productId via formData pour éviter requêtes redondantes -->
	<input type="hidden" name="shopId" value={shop.id} />
	<input type="hidden" name="profileId" value={shop.profile_id} />
	<input type="hidden" name="productId" value={product.id} />
	<Form.Errors {form} />

	{#if isFormDisabled}
		<Alert class="mb-6 border-[#BC90A5] bg-[#FFF1F0] text-[#8B1A1A]">
			<AlertTriangle class="h-4 w-4 text-[#BC90A5]" />
			<AlertTitle>Commandes désactivées temporairement</AlertTitle>
		</Alert>
	{/if}

	<div
		class="space-y-8"
		class:opacity-50={isFormDisabled}
		class:pointer-events-none={isFormDisabled}
	>
		{#if customFields && customFields.length > 0}
			<div class="space-y-4">
				<h3
					class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl"
					style="font-weight: 600; letter-spacing: -0.02em;"
				>
					Personnalisation de votre commande
				</h3>

				<div class="space-y-4">
					{#each customFields as field}
						<div class="space-y-2">
							<Label for={field.id} class="text-sm font-medium">
								{field.label}
								{#if field.required}
									<span class="text-red-500">*</span>
								{/if}
							</Label>

							{#if field.type === 'short-text'}
								<Form.Field {form} name={`customization_data.${field.id}`}>
									<Form.Control let:attrs>
										<Input
											{...attrs}
											id={field.id}
											type="text"
											placeholder="Votre réponse"
											required={field.required}
											disabled={isFormDisabled}
											style={customStyles.inputBackgroundStyle}
											bind:value={$formData.customization_data[field.id]}
										/>
									</Form.Control>
									<Form.FieldErrors />
								</Form.Field>
							{:else if field.type === 'long-text'}
								<Form.Field {form} name={`customization_data.${field.id}`}>
									<Form.Control let:attrs>
										<Textarea
											{...attrs}
											id={field.id}
											placeholder="Votre réponse"
											required={field.required}
											rows={3}
											disabled={isFormDisabled}
											style={customStyles.inputBackgroundStyle}
											bind:value={$formData.customization_data[field.id]}
										/>
									</Form.Control>
									<Form.FieldErrors />
								</Form.Field>
							{:else if field.type === 'number'}
								<Form.Field {form} name={`customization_data.${field.id}`}>
									<Form.Control let:attrs>
										<Input
											{...attrs}
											id={field.id}
											type="number"
											step="1"
											placeholder="Votre réponse"
											required={field.required}
											disabled={isFormDisabled}
											style={customStyles.inputBackgroundStyle}
											bind:value={$formData.customization_data[field.id]}
										/>
									</Form.Control>
									<Form.FieldErrors />
								</Form.Field>
							{:else if field.type === 'single-select' || field.type === 'multi-select'}
								<Form.Field {form} name={`customization_data.${field.id}`}>
									<Form.Control let:attrs>
										<OptionGroup
											fieldId={field.id}
											fieldType={field.type}
											options={field.options || []}
											selectedValues={$formData.customization_data[field.id]}
											required={field.required}
											disabled={isFormDisabled}
											{customizations}
											on:change={(e) =>
												($formData.customization_data[field.id] =
													e.detail.values)}
										/>
									</Form.Control>
									<Form.FieldErrors />
								</Form.Field>
							{/if}
						</div>
					{/each}
				</div>
			</div>
			<!-- Separator -->
			<div class="pt-4">
				<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
			</div>
		{/if}

		{#if showDeliveryOptions}
			<!-- Mode de remise -->
			<div class="space-y-3">
				<h3 class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl" style="font-weight: 600; letter-spacing: -0.02em;">
					Comment recevoir votre commande
				</h3>
				<div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Mode de remise">
					<button
						type="button"
						role="radio"
						aria-checked={!isEmailDelivery}
						on:click={() => chooseDelivery('retrait')}
						class="rounded-full border px-4 py-2 text-sm font-medium transition-colors {!isEmailDelivery ? 'border-neutral-900 bg-white text-neutral-900' : 'border-neutral-300 bg-white/60 text-neutral-600 hover:border-neutral-500'}"
					>
						📍 Retrait à Andrésy (78)
					</button>
					<span class="cursor-not-allowed rounded-full border border-dashed border-neutral-300 px-4 py-2 text-sm text-neutral-400 line-through" aria-disabled="true" title="Bientôt disponible">
						🚚 Livraison
					</span>
					<button
						type="button"
						role="radio"
						aria-checked={isEmailDelivery}
						on:click={() => chooseDelivery('email')}
						class="rounded-full border px-4 py-2 text-sm font-medium transition-colors {isEmailDelivery ? 'border-neutral-900 bg-white text-neutral-900' : 'border-neutral-300 bg-white/60 text-neutral-600 hover:border-neutral-500'}"
					>
						✉️ Par e-mail (à imprimer)
					</button>
				</div>
				<p class="text-xs text-neutral-500">
					{#if isEmailDelivery}
						Vous recevrez votre design en fichier, à imprimer vous-même ou à envoyer à vos invités.
					{:else}
						La livraison sera bientôt disponible.
					{/if}
				</p>
			</div>

			<!-- QR code du client -->
			<div class="space-y-2">
				<h3 class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl" style="font-weight: 600; letter-spacing: -0.02em;">
					Votre QR code <span class="text-sm font-normal text-neutral-500">(facultatif)</span>
				</h3>
				{#if $formData.qr_code_url}
					<div class="flex items-center gap-3 rounded-xl border bg-white p-3">
						<img src={$formData.qr_code_url} alt="Votre QR code" class="h-16 w-16 rounded object-contain" />
						<span class="flex-1 text-sm text-neutral-700">QR code ajouté ✓</span>
						<button type="button" class="text-sm font-medium text-neutral-600 underline" on:click={() => ($formData.qr_code_url = '')}>Retirer</button>
					</div>
				{:else}
					<label class="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed bg-white p-4 text-sm text-neutral-600 hover:border-neutral-500" style={`border-color: ${customizations?.button_color || '#BC90A5'};`}>
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

			<div class="pt-2">
				<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
			</div>
		{/if}

		{#if isEmailDelivery}
			<div class="rounded-2xl border bg-white p-4 text-sm text-neutral-700">
				✉️ Votre fichier vous sera envoyé par e-mail <strong>sous 48 h maximum</strong> après la confirmation de votre commande.
			</div>
		{/if}

		<!-- Section 2: Information de récupération ou plage de réservation -->
		<div class="space-y-4" class:hidden={isEmailDelivery}>
			<h3
				class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl"
				style="font-weight: 600; letter-spacing: -0.02em;"
			>
				{isReservation ? 'Information de location' : isEmailDelivery ? 'Date souhaitée' : 'Information de récupération'}
			</h3>
			{#if isReservation}
				<div class="space-y-2">
					<Form.Field {form} name="pickup_date">
						<Form.Control let:attrs>
							<Form.Label>Dates de location *</Form.Label>
							<div class="sr-only" {...attrs}></div>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Form.Field {form} name="pickup_date_end">
						<Form.Control let:attrs>
							<div class="sr-only" {...attrs}></div>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<DateRangePicker
						selectedStartDate={$formData.pickup_date || undefined}
						selectedEndDate={$formData.pickup_date_end || undefined}
						{availabilities}
						{unavailabilities}
						{datesWithLimitReached}
						{reservedRanges}
						minDaysNotice={product.min_days_notice}
						minReservationDays={product?.min_reservation_days ?? 0}
						on:startSelected={(e) => {
							dateRangeError = '';
							$formData.pickup_date = e.detail;
							$formData.pickup_date_end = '';
						}}
						on:endSelected={(e) => {
							dateRangeError = '';
							$formData.pickup_date_end = e.detail;
						}}
						on:invalidRange={(e) => {
							dateRangeError = e.detail?.message ?? 'La réservation doit couvrir au moins le nombre de jours requis.';
						}}
					/>
					{#if dateRangeError}
						<p class="text-sm text-destructive font-medium">
							{dateRangeError}
						</p>
					{/if}
					{#if product?.min_reservation_days > 0 && !dateRangeError}
						<p class="text-sm text-muted-foreground">
							Réservation d'au moins {product.min_reservation_days} jour(s).
						</p>
					{/if}
				</div>
			{:else}
				<div class="space-y-2">
					<Form.Field {form} name="pickup_date">
						<Form.Control let:attrs>
							<Form.Label>{isEmailDelivery ? 'Pour quelle date souhaitez-vous recevoir votre fichier ? *' : 'Date de récupération *'}</Form.Label>
							<DatePicker
								{availabilities}
								{unavailabilities}
								{datesWithLimitReached}
								minDaysNotice={product.min_days_notice}
								on:dateSelected={(event) => {
									$formData.pickup_date = event.detail;
								}}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<!-- Sélecteur de créneau horaire (pas besoin pour un envoi par e-mail) -->
				<div class="space-y-2" class:hidden={isEmailDelivery}>
					{#if $formData.pickup_date && availableTimeSlots.length > 0}
						<div class="space-y-2">
							<Form.Field {form} name="pickup_time">
								<Form.Control let:attrs>
									<TimeSlotSelector
										timeSlots={availableTimeSlots}
										selectedTime={selectedTimeSlot}
										disabled={isLoadingTimeSlots || isFormDisabled}
										required={true}
										label="Choisir un créneau de récupération"
										{customizations}
										on:change={(event) => {
											selectedTimeSlot = event.detail.value;
											$formData.pickup_time = event.detail.value;
										}}
									/>
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
						</div>
					{:else if $formData.pickup_date && isLoadingTimeSlots}
						<div class="space-y-2">
							<label class="text-sm font-medium text-gray-900">
								Choisir un créneau de récupération
							</label>
							<div
								class="flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 p-4"
							>
								<div class="flex items-center space-x-2 text-sm text-gray-500">
									<svg
										class="h-4 w-4 animate-spin"
										fill="none"
										viewBox="0 0 24 24"
									>
										<circle
											class="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											stroke-width="4"
										></circle>
										<path
											class="opacity-75"
											fill="currentColor"
											d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										></path>
									</svg>
									<span>Chargement des créneaux...</span>
								</div>
							</div>
						</div>
					{:else if $formData.pickup_date && availableTimeSlots.length === 0}
						<div class="space-y-2">
							<label class="text-sm font-medium text-gray-900">
								Choisir un créneau de récupération
							</label>
							<div
								class="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center"
							>
								<p class="text-sm text-orange-700">
									<span class="mr-2">⚠️</span>
									Aucun créneau disponible pour cette date
								</p>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>
		<!-- Separator -->
		<div class="pt-4">
			<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
		</div>

		<!-- Section 3: Information de contact -->
		<div class="space-y-4">
			<h3
				class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl"
				style="font-weight: 600; letter-spacing: -0.02em;"
			>
				Information de contact
			</h3>
			<div class="space-y-4">
				<div class="space-y-2">
					<Form.Field {form} name="customer_name">
						<Form.Control let:attrs>
							<Form.Label>Nom complet *</Form.Label>
							<Input
								{...attrs}
								id="name"
								placeholder="Votre nom complet"
								required
								disabled={isFormDisabled}
								style={customStyles.inputBackgroundStyle}
								bind:value={$formData.customer_name}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<div class="space-y-2">
					<Form.Field {form} name="customer_email">
						<Form.Control let:attrs>
							<Form.Label>Email *</Form.Label>
							<Input
								{...attrs}
								id="email"
								type="email"
								placeholder="votre@email.com"
								required
								disabled={isFormDisabled}
								style={customStyles.inputBackgroundStyle}
								bind:value={$formData.customer_email}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<div class="space-y-2">
					<Form.Field {form} name="customer_phone">
						<Form.Control let:attrs>
							<Form.Label>Numéro de téléphone (facultatif)</Form.Label>
							<Input
								{...attrs}
								id="phone"
								type="tel"
								placeholder="06 12 34 56 78"
								disabled={isFormDisabled}
								style={customStyles.inputBackgroundStyle}
								bind:value={$formData.customer_phone}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>


				<div class="space-y-2">
					<Form.Field {form} name="additional_information">
						<Form.Control let:attrs>
							<Form.Label>Informations supplémentaires</Form.Label>
							<Textarea
								{...attrs}
								id="info"
								placeholder="Informations supplémentaires..."
								rows={3}
								disabled={isFormDisabled}
								style={customStyles.inputBackgroundStyle}
								bind:value={$formData.additional_information}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
			</div>
		</div>
		<!-- Separator -->
		<div class="pt-4">
			<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
		</div>

		<!-- Section 4: Récapitulatif de la demande -->
		<div class="space-y-4">
			<h3
				class="text-lg font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-xl"
				style="font-weight: 600; letter-spacing: -0.02em;"
			>
				Récapitulatif de la commande
			</h3>
			<div class="space-y-3 rounded-2xl border bg-white p-4">
				<p class="text-sm" style={customStyles.secondaryTextStyle}>
					Merci de bien vérifier les informations de commande car en cas
					d'erreur votre commande pourra être retardée.
				</p>
				<div class="space-y-3 text-sm">
					{#if showDeliveryOptions}
						<div class="flex items-center justify-between gap-2">
							<span class="font-semibold text-neutral-700" style="font-weight: 600;">Mode de remise :</span>
							<span class="text-right text-neutral-900" style={customStyles.textStyle}>{isEmailDelivery ? 'Par e-mail, sous 48 h' : 'Retrait à Andrésy (78)'}</span>
						</div>
						{#if $formData.qr_code_url}
							<div class="flex items-center justify-between gap-2">
								<span class="font-semibold text-neutral-700" style="font-weight: 600;">QR code :</span>
								<span class="text-right text-neutral-900" style={customStyles.textStyle}>Ajouté ✓</span>
							</div>
						{/if}
					{/if}
					{#if $formData.pickup_date && !isEmailDelivery}
						<div class="flex items-center justify-between gap-2">
							<span class="font-semibold text-neutral-700" style="font-weight: 600;">
								{isReservation ? 'Information de location :' : isEmailDelivery ? 'Date souhaitée :' : 'Date de récupération :'}
							</span>
							<span class="text-right text-neutral-900 whitespace-nowrap" style={customStyles.textStyle}>
								{#if isReservation && $formData.pickup_date_end}
									Du {new Date($formData.pickup_date + 'T12:00:00Z').toLocaleDateString('fr-FR')} au {new Date($formData.pickup_date_end + 'T12:00:00Z').toLocaleDateString('fr-FR')}
								{:else}
									{new Date($formData.pickup_date + 'T12:00:00Z').toLocaleDateString('fr-FR')}
								{/if}
							</span>
						</div>
					{/if}
					{#if !isReservation && $formData.pickup_time}
						<div class="flex items-center justify-between gap-2">
							<span class="font-semibold text-neutral-700" style="font-weight: 600;">
								Créneau horaire :
							</span>
							<span class="text-right text-neutral-900 whitespace-nowrap" style={customStyles.textStyle}>
								{$formData.pickup_time.substring(0, 5)}
							</span>
						</div>
					{/if}
					<div class="flex items-center justify-between gap-2">
						<span class="font-semibold text-neutral-700" style="font-weight: 600;">Article :</span>
						<span class="text-right text-neutral-900 whitespace-nowrap" style={customStyles.textStyle}>
							{formatPrice(product.base_price)}
						</span>
					</div>
					{#if $formData.customer_name}
						<div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
							<span class="break-words font-semibold text-neutral-700" style="font-weight: 600;">Nom :</span>
							<span class="break-words text-right text-neutral-900 sm:ml-auto" style={customStyles.textStyle}>
								{$formData.customer_name}
							</span>
						</div>
					{/if}
					{#if $formData.customer_email}
						<div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
							<span class="break-words font-semibold text-neutral-700" style="font-weight: 600;">Email :</span>
							<span class="break-words break-all text-right text-neutral-900 sm:ml-auto" style={customStyles.textStyle}>
								{$formData.customer_email}
							</span>
						</div>
					{/if}
					{#if $formData.customer_phone}
						<div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
							<span class="break-words font-semibold text-neutral-700" style="font-weight: 600;">Téléphone :</span>
							<span class="break-words text-right text-neutral-900 sm:ml-auto" style={customStyles.textStyle}>
								{$formData.customer_phone}
							</span>
						</div>
					{/if}
					{#if $formData.customer_instagram}
						<div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
							<span class="break-words font-semibold text-neutral-700" style="font-weight: 600;">Instagram :</span>
							<span class="break-words text-right text-neutral-900 sm:ml-auto" style={customStyles.textStyle}>
								{$formData.customer_instagram}
							</span>
						</div>
					{/if}
					{#each customFields as field}
						{#if $formData.customization_data[field.id]}
							{#if Array.isArray($formData.customization_data[field.id])}
								{@const options = $formData.customization_data[field.id]}
								{@const selectedOptions = options.map((option) => {
									const selectedOption = field.options?.find(
										(opt) => opt.label === option,
									);
									return {
										label: option,
										price: selectedOption?.price || 0
									};
								})}
								<!-- Multi-select: Structure avec badges -->
								<div class="rounded-lg bg-neutral-50 p-3">
									<div class="mb-2">
										<span class="break-words text-xs font-semibold uppercase tracking-wide text-neutral-500" style="font-weight: 600;">
											{field.label}
										</span>
									</div>
									<div class="flex flex-wrap gap-2">
										{#each selectedOptions as selectedOption}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm shadow-sm">
												<span class="break-words text-neutral-900" style={customStyles.textStyle}>
													{selectedOption.label}
												</span>
												{#if selectedOption.price > 0}
													<span class="shrink-0 text-xs font-medium text-neutral-600">
														+{formatPrice(selectedOption.price)}
													</span>
												{/if}
											</span>
										{/each}
									</div>
								</div>
							{:else}
								{@const selectedOption = field.options?.find(
									(opt) => opt.label === $formData.customization_data[field.id],
								)}
								{@const isTextField = !field.options || field.options.length === 0}
								{#if selectedOption || isTextField}
									<!-- Single-select ou texte: Structure avec fond -->
									<div class="rounded-lg bg-neutral-50 p-3">
										<div class="mb-1">
											<span class="break-words text-xs font-semibold uppercase tracking-wide text-neutral-500" style="font-weight: 600;">
												{field.label}
											</span>
										</div>
										<div class="flex items-start justify-between gap-2">
											<span class="min-w-0 flex-1 break-words text-sm text-neutral-900" style={customStyles.textStyle}>
												{$formData.customization_data[field.id]}
											</span>
											{#if selectedOption && selectedOption.price > 0}
												<span class="shrink-0 text-sm font-medium text-neutral-600">
													+{formatPrice(selectedOption.price)}
												</span>
											{/if}
										</div>
									</div>
								{/if}
							{/if}
						{/if}
					{/each}

					<!-- Separator -->
					<div class="my-2">
						<div class="border-t" style="border-color: rgba(0, 0, 0, 0.1);"></div>
					</div>
					{#if hasDeposit(product?.deposit_percentage)}
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm font-semibold text-neutral-700" style="font-weight: 600;">
							Total :
						</span>
						<span
							class="font-semibold text-right text-neutral-900 whitespace-nowrap"
							style="font-weight: 600;"
						>
							{formatPrice(totalPrice)}
						</span>
					</div>
					{/if}
					<div
						class="flex items-center justify-between gap-2 font-semibold"
						style={`color: ${customizations?.button_color || '#BC90A5'}; font-weight: 600;`}
					>
						<span>{hasDeposit(product?.deposit_percentage) ? "Acompte à payer aujourd'hui :" : 'Total à payer :'}</span>
						<span class="text-right whitespace-nowrap">{formatPrice(amountDueNow(totalPrice, product?.deposit_percentage))}</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Section 5: Boutons d'action -->
		<div class="flex gap-2">
			{#if $page.url.searchParams.get('preview') !== 'true'}
				<Button
					type="submit"
					disabled={$submitting || isFormDisabled}
					class="flex-1 rounded-xl"
					style={customStyles.buttonStyle}
				>
					{#if $submitting}
						<span class="loading loading-spinner loading-sm"></span>
						Commande en cours...
					{:else}
						Commander
					{/if}
				</Button>
				<Button
					type="button"
					variant="outline"
					on:click={onCancel}
					disabled={isFormDisabled}
					class="rounded-xl"
				>
					Annuler
				</Button>
			{:else}
				<!-- Message en mode preview -->
				<div
					class="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center"
				>
					<p class="text-sm text-blue-800">
						🔍 Mode prévisualisation - Bouton de commande masqué
					</p>
				</div>
			{/if}
		</div>
	</div>
</form>

