<script lang="ts">
	import { onNavigate, goto } from '$app/navigation';
	import { onMount } from 'svelte';
import Home from '~icons/lucide/home';
import ShoppingCart from '~icons/lucide/shopping-cart';
import Package from '~icons/lucide/package';
import FileText from '~icons/lucide/file-text';
import Calendar from '~icons/lucide/calendar';
import Store from '~icons/lucide/store';
import HelpCircle from '~icons/lucide/help-circle';
import MenuIcon from '~icons/lucide/menu';
import XIcon from '~icons/lucide/x';
import LogOut from '~icons/lucide/log-out';

	import { Button } from '$lib/components/ui/button';
	import * as Drawer from '$lib/components/ui/drawer';

	import NavLink from './components/nav-link.svelte';

	export let data;

	const navItems = [
		{ href: '/dashboard', label: 'Tableau de bord', icon: Home, exact: true },
		{ href: '/dashboard/orders', label: 'Commandes', icon: ShoppingCart, exact: false },
		{ href: '/dashboard/products', label: 'Articles', icon: Package, exact: false },
		{ href: '/dashboard/custom-form', label: 'Formulaire', icon: FileText, exact: false },
		{ href: '/dashboard/availability', label: 'Disponibilités', icon: Calendar, exact: false },
		{ href: '/dashboard/shop', label: 'Ma boutique', icon: Store, exact: false },
		{ href: '/dashboard/faq', label: 'Aide', icon: HelpCircle, exact: false },
	];

	let menuOpen = false;
	onNavigate((_) => {
		menuOpen = false;
	});

	// Fonction pour gérer la navigation avec goto() pour rester dans la PWA
	function handleNavClick(href: string, event: MouseEvent) {
		// Si c'est un clic avec modificateur (Ctrl, Cmd, etc.), laisser le comportement par défaut
		if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) {
			return;
		}
		
		// Empêcher le comportement par défaut et utiliser la navigation SvelteKit
		event.preventDefault();
		goto(href);
	}
</script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link
		href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="dash flex min-h-screen w-full flex-col bg-[#F7F2F0]">
	<!-- Menu latéral (ordinateur) -->
	<aside class="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col bg-[#7A4F60] px-3 py-5 text-[#F1DDE3] md:flex">
		<a href="/" class="mb-6 flex items-center gap-3 px-2">
			<img
				src={data.shop?.logo_url || '/images/logo_jennynbevent.jpg'}
				alt={data.shop?.name || 'Logo Jennynbevent'}
				class="h-9 w-9 rounded-lg object-cover"
			/>
			<div class="min-w-0">
				<div class="dash-serif truncate text-lg leading-tight text-white">{data.shop?.name || 'Jennynbevent'}</div>
				<div class="text-[11px] text-[#E3C9D1]">Espace boutique</div>
			</div>
		</a>
		<nav class="flex flex-col gap-1">
			{#each navItems as item}
				<NavLink
					href={item.href}
					exact={item.exact}
					class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#F1DDE3] transition-colors hover:bg-white/10 hover:text-white"
					activeClass="!bg-white/[0.16] !text-white"
				>
					<svelte:component this={item.icon} class="h-[18px] w-[18px]" />
					{item.label}
				</NavLink>
			{/each}
		</nav>
		<div class="mt-auto border-t border-white/15 px-2 pt-4 text-xs text-[#E3C9D1]">
			<div class="truncate">{data.user?.email || ''}</div>
			<form method="POST" action="/logout" class="mt-2">
				<button type="submit" class="flex items-center gap-2 text-[#F1DDE3] hover:text-white">
					<LogOut class="h-4 w-4" /> Déconnexion
				</button>
			</form>
		</div>
	</aside>

	<div class="flex flex-col md:pl-56">
		<!-- En-tête (téléphone) -->
		<header class="sticky top-0 z-30 flex h-14 items-center justify-between bg-[#7A4F60] px-4 text-white md:hidden">
			<div class="flex items-center gap-2">
				<img
					src={data.shop?.logo_url || '/images/logo_jennynbevent.jpg'}
					alt={data.shop?.name || 'Logo Jennynbevent'}
					class="h-8 w-8 rounded-lg object-cover"
				/>
				<span class="dash-serif max-w-[180px] truncate text-lg">{data.shop?.name || 'Jennynbevent'}</span>
			</div>
			<Drawer.Root bind:open={menuOpen}>
				<Drawer.Trigger asChild let:builder>
					<Button builders={[builder]} size="icon" variant="ghost" class="text-white hover:bg-white/10 hover:text-white">
						<MenuIcon class="h-5 w-5" />
						<span class="sr-only">Menu</span>
					</Button>
				</Drawer.Trigger>
				<Drawer.Content class="bg-[#7A4F60] text-white">
					<Drawer.Header class="flex justify-end py-0">
						<Drawer.Close asChild let:builder>
							<Button variant="ghost" size="icon" builders={[builder]} class="text-white hover:bg-white/10 hover:text-white">
								<span class="sr-only">Fermer</span>
								<XIcon />
							</Button>
						</Drawer.Close>
					</Drawer.Header>
					<nav class="flex flex-col gap-1 p-3 pb-6">
						{#each navItems as item}
							<a
								href={item.href}
								on:click={(e) => handleNavClick(item.href, e)}
								class="flex items-center gap-3 rounded-lg px-4 py-3 text-base text-[#F1DDE3] hover:bg-white/10 hover:text-white"
							>
								<svelte:component this={item.icon} class="h-5 w-5" />
								{item.label}
							</a>
						{/each}
						<form method="POST" action="/logout" class="mt-2 border-t border-white/15 pt-3">
							<button type="submit" class="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-base text-[#E3C9D1] hover:bg-white/10">
								<LogOut class="h-5 w-5" /> Déconnexion
							</button>
						</form>
					</nav>
				</Drawer.Content>
			</Drawer.Root>
		</header>
		<main class="flex w-full flex-col items-start p-4 sm:p-6 lg:p-8">
			<slot />
		</main>
	</div>
</div>

<style>
	:global(.dash-serif) {
		font-family: 'Cormorant Garamond', Georgia, serif;
	}
</style>
