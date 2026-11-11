<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import type { AuthChangeEvent } from '@supabase/supabase-js';
	import { onMount } from 'svelte';
	import { WebsiteName } from '../../../../config';
	import SocialsAuth from '../components/socials-auth.svelte';
	import LoginForm from './login-form.svelte';
	import { revealElement } from '$lib/utils/animations';

	export let data;

	let { supabase } = data;

	let heroTitle: HTMLElement;
	let cardContainer: HTMLElement;

	onMount(async () => {
		// ✅ Tracking: Page view côté client (login page)
		import('$lib/utils/analytics').then(({ logPageView }) => {
			const supabase = $page.data.supabase;
			if (supabase) {
				logPageView(supabase, {
					page: '/login'
				}).catch((err: unknown) => {
					console.error('Error tracking page_view:', err);
				});
			}
		});

		supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
			// Ne pas rediriger si l’utilisateur est sur l’étape « code OTP » : il peut avoir
			// ouvert le lien magique dans un autre onglet ; on laisse le formulaire et le serveur gérer la redirection.
			const step = $page.url.searchParams.get('step');
			if (event === 'SIGNED_IN' && step !== 'code') {
				setTimeout(() => {
					goto('/dashboard');
				}, 1);
			}
		});

		if (heroTitle) await revealElement(heroTitle, { delay: 0, duration: 0.6 });
		if (cardContainer) await revealElement(cardContainer, { delay: 0.2, duration: 0.6 });
	});
</script>

<svelte:head>
	<!-- Installation comme application (iPad / iPhone / ordinateur) -->
	<link rel="manifest" href="/manifest-dashboard.webmanifest" />
	<link rel="apple-touch-icon" href="/icons/apple-touch-icon-dashboard.png" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-title" content="Jnb Event" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="theme-color" content="#7A4F60" />
	<title>Se connecter - Accès dashboard cake designer | {WebsiteName}</title>
	<meta
		name="description"
		content="Espace boutique Jnb Event."
	/>
	<meta
		name="keywords"
		content="Jnb Event, espace boutique"
	/>
	<meta property="og:title" content="Se connecter - Accès dashboard cake designer | {WebsiteName}" />
	<meta
		property="og:description"
		content="Espace boutique Jnb Event."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://jennynbevent.com/login" />
	<link rel="canonical" href="https://jennynbevent.com/login" />
</svelte:head>

<!-- Hero section premium -->
<section class="relative flex min-h-[90vh] w-full flex-col justify-center overflow-hidden bg-white pt-24 pb-24 md:min-h-screen md:pt-32 md:pb-32">
	<div class="absolute inset-0 h-full w-full bg-gradient-to-b from-[#BB91A4]/30 via-transparent to-transparent"></div>
	
	<div class="relative z-10 mx-auto max-w-2xl px-6 sm:px-8 lg:px-12">
		{#if $page.url.searchParams.get('refuse') === '1'}
			<div class="mb-8 rounded-xl border border-[#BC90A5]/40 bg-[#FBF3F6] p-4 text-center text-sm text-[#7A4F60]">
				Cet espace est réservé à l'administratrice de la boutique.
				<a href="/" class="underline">Retour à la boutique</a>
			</div>
		{/if}
		{#if $page.url.searchParams.get('verified') == 'true'}
			<div class="mb-8 text-center">
				<Alert.Root class="mb-6" variant="default">
					<Alert.Title>Email vérifié !</Alert.Title>
					<Alert.Description>
						Tu peux maintenant te connecter à ton compte.
					</Alert.Description>
				</Alert.Root>
			</div>
		{/if}

		<!-- Header minimaliste -->
		<div class="mb-12 text-center">
			<h1
				bind:this={heroTitle}
				class="mb-6 text-4xl font-semibold leading-[110%] tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl"
				style="font-weight: 600; letter-spacing: -0.03em;"
			>
				Connecte-toi à <span class="text-[#BC90A5]">ton compte</span>
			</h1>
		</div>

		<!-- Card avec formulaire -->
		<div bind:this={cardContainer}>
			<Card.Root
				class="mx-auto rounded-2xl border border-neutral-200 bg-white/80 backdrop-blur-sm shadow-xl"
			>
				<Card.Content class="p-8 sm:p-10">
					<SocialsAuth />

					<div class="mt-6 space-y-6">
						<LoginForm
							form={data.form}
							otpForm={data.otpForm}
							step={data.step}
							email={data.email}
						/>
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</section>
