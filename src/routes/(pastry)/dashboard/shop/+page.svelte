<script lang="ts">
	import ShopForm from './shop-form.svelte';
	import CustomizationForm from './customization-form.svelte';
	import PoliciesForm from './policies-form.svelte';
	import type { SuperValidated, Infer } from 'sveltekit-superforms';
import { formSchema } from './schema';
import { customizationSchema } from './customization-schema';
import { policiesSchema } from './policies-schema';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Store, Palette, FileText, CreditCard, Bell, Truck, CircleHelp } from 'lucide-svelte';
	import DeliveryForm from './delivery-form.svelte';
	import HelpTab from './help-tab.svelte';
	import PushNotifications from '$lib/components/push-notifications.svelte';
	import { cn } from '$lib/utils';
	import PaymentForm from './payment-form.svelte';
	import StripeCard from './stripe-card.svelte';
	import LayoutForm from './layout-form.svelte';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: layoutState = (data as any).layout ?? { categories: [], products: [], home: null, ready: false };
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: stripeState = (data as any).stripe ?? { configured: false, mode: null, enabled: false };

	export let data: {
		shop: {
			id: string;
			name: string;
			bio: string;
			slug: string;
			logo_url: string | null;
			instagram?: string | null;
			tiktok?: string | null;
			website?: string | null;
		};
		form: SuperValidated<Infer<typeof formSchema>>;
		customizationForm: SuperValidated<Infer<typeof customizationSchema>>;
		policiesForm: SuperValidated<Infer<typeof policiesSchema>>;
		paymentForm: SuperValidated<any>;
		permissions?: {
			plan: 'free' | 'basic' | 'premium' | 'exempt';
		};
	};

	let error = '';
	let success = '';
	let activeTab: 'info' | 'customization' | 'policies' | 'payment' | 'delivery' | 'notifications' | 'help' = 'info';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	$: deliveryState = (data as any).delivery;

	const tabs = [
		{ id: 'info' as const, label: 'Informations', icon: Store },
		{ id: 'customization' as const, label: 'Personnalisation', icon: Palette },
		{ id: 'policies' as const, label: 'Politiques de ventes', icon: FileText },
		{ id: 'payment' as const, label: 'Méthodes de paiement', icon: CreditCard },
		{ id: 'delivery' as const, label: 'Livraison', icon: Truck },
		{ id: 'notifications' as const, label: 'Notifications', icon: Bell },
		{ id: 'help' as const, label: 'Aide', icon: CircleHelp }
	];
</script>

<svelte:head>
	<title>Paramètres de la boutique - Jennynbevent</title>
</svelte:head>

<div class="container mx-auto space-y-6 p-3 md:p-6">
	<div class="mb-8">
		<h1 class="text-3xl font-bold text-foreground">
			Paramètres de la boutique
		</h1>
		<p class="mt-3 text-muted-foreground">
			Gérez les informations de votre boutique et sa personnalisation
		</p>
	</div>

	{#if error}
		<Alert class="mb-8">
			<AlertDescription>{error}</AlertDescription>
		</Alert>
	{/if}

	{#if success}
		<Alert class="mb-8">
			<AlertDescription class="text-green-600">{success}</AlertDescription>
		</Alert>
	{/if}

	<!-- Navigation par onglets -->
	<nav class="mb-6 border-b -mx-3 md:mx-0">
		<ul class="flex gap-4 overflow-x-auto scrollbar-hide px-3 md:px-0">
			{#each tabs as tab}
				{@const Icon = tab.icon}
				<li class="flex-shrink-0">
					<button
						type="button"
						on:click={() => (activeTab = tab.id)}
						class={cn(
							'inline-flex items-center gap-2 border-b-2 px-1 pb-4 text-sm font-medium transition-colors whitespace-nowrap',
							activeTab === tab.id
								? 'border-primary text-primary'
								: 'border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground'
						)}
					>
						<Icon class="h-4 w-4" />
						{tab.label}
					</button>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- Contenu selon l'onglet actif -->
	{#if activeTab === 'info'}
		<Card class="shadow-sm">
			<CardHeader class="pb-6">
				<div class="flex items-center space-x-4">
					<Store class="h-7 w-7 text-primary" />
					<div>
						<CardTitle class="text-xl">Informations de la boutique</CardTitle>
						<CardDescription class="text-base">
							Modifiez les informations de votre boutique
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				<ShopForm data={data.form} />
			</CardContent>
		</Card>
	{:else if activeTab === 'customization'}
		<CustomizationForm form={data.customizationForm} />
		{#key layoutState}
			<LayoutForm layout={layoutState} />
		{/key}
	{:else if activeTab === 'policies'}
		<PoliciesForm data={data.policiesForm} />
	{:else if activeTab === 'payment'}
		<Card class="shadow-sm">
			<CardHeader class="pb-6">
				<div class="flex items-center space-x-4">
					<CreditCard class="h-7 w-7 text-primary" />
					<div>
						<CardTitle class="text-xl">Méthodes de paiement</CardTitle>
						<CardDescription class="text-base">
							Configurez vos moyens de paiement pour recevoir les paiements
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				<StripeCard stripe={stripeState} />
				<PaymentForm data={data.paymentForm} />
			</CardContent>
		</Card>
	{:else if activeTab === 'delivery'}
		{#key deliveryState}
			<DeliveryForm delivery={deliveryState} />
		{/key}
	{:else if activeTab === 'help'}
		<HelpTab />
	{:else if activeTab === 'notifications'}
		<PushNotifications />
		<p class="text-sm text-muted-foreground">
			À activer une fois sur chaque appareil (iPhone, ordinateur…). Sur iPhone / iPad, ouvrez d'abord l'espace boutique depuis son icône sur l'écran d'accueil.
		</p>
	{/if}
</div>