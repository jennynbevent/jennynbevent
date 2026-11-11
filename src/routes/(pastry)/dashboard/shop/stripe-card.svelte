<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	/** État du paiement par carte (Stripe) */
	export let stripe: { configured: boolean; mode: 'test' | 'live' | null; enabled: boolean };

	let submitting = false;
	let errorMessage = '';
</script>

<div class="mb-6 rounded-2xl border border-[#EADDE1] bg-[#FBF6F8] p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="flex items-center gap-3">
			<img src="/payments_logo/stripe_logo.svg" alt="Stripe" class="h-7 w-auto" />
			<span class="rounded-full bg-[#7A4F60] px-2.5 py-0.5 text-xs text-white">Automatique</span>
			{#if stripe.mode === 'test'}
				<span class="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-800">Mode test</span>
			{/if}
		</div>
		{#if stripe.enabled && stripe.configured}
			<span class="text-sm font-medium text-green-700">✓ Activé</span>
		{/if}
	</div>

	<p class="mt-3 text-sm text-[#5E5357]">
		Paiement direct par <strong>carte bancaire, Apple Pay ou Google Pay</strong>. Le client paie en un clic et la
		commande est <strong>confirmée automatiquement</strong> : plus de référence à copier ni de paiement à
		vérifier.
	</p>

	{#if !stripe.configured}
		<div class="mt-4 rounded-lg border border-dashed border-[#D9C3CC] bg-white p-3 text-sm text-[#7A6A70]">
			En attente des clés Stripe. Ajoutez <code>STRIPE_SECRET_KEY</code> et <code>STRIPE_WEBHOOK_SECRET</code>
			dans Vercel (Settings → Environment Variables), puis redéployez le site.
		</div>
	{:else}
		<form
			method="POST"
			action={stripe.enabled ? '?/disableStripe' : '?/enableStripe'}
			class="mt-4"
			use:enhance={() => {
				submitting = true;
				errorMessage = '';
				return async ({ result }) => {
					submitting = false;
					if (result.type === 'failure') errorMessage = String(result.data?.error || 'Erreur');
					await invalidateAll();
				};
			}}
		>
			{#if stripe.enabled}
				<button
					type="submit"
					disabled={submitting}
					class="rounded-lg border border-[#D9C3CC] bg-white px-4 py-2 text-sm text-[#7A4F60] hover:bg-[#F3E6EA] disabled:opacity-50"
				>
					{submitting ? '…' : 'Désactiver le paiement par carte'}
				</button>
			{:else}
				<button
					type="submit"
					disabled={submitting}
					class="rounded-lg bg-[#7A4F60] px-4 py-2 text-sm text-white hover:bg-[#6a4252] disabled:opacity-50"
				>
					{submitting ? '…' : 'Activer le paiement par carte'}
				</button>
			{/if}
		</form>
		{#if errorMessage}
			<p class="mt-2 text-sm text-red-600">{errorMessage}</p>
		{/if}
	{/if}

	<p class="mt-4 text-xs text-[#9A8A90]">
		PayPal, Revolut et Wero ci-dessous restent proposés en paiement manuel, en plus de la carte.
	</p>
</div>
