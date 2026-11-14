<script lang="ts">
	import { onMount } from 'svelte';
	import { cartCount } from '$lib/cart/store';

	let cls = '';
	export { cls as class };
	export let style = '';
	let mounted = false;
	onMount(() => (mounted = true));
</script>

<!-- Sac dessiné au trait, même style que les autres icônes -->
<a href="/panier" class="relative inline-flex rounded-full p-2 hover:bg-black/5 {cls}" {style} title="Mon panier" aria-label="Mon panier">
	<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
		<path d="M3 6h18" />
		<path d="M16 10a4 4 0 0 1-8 0" />
	</svg>
	{#if mounted && $cartCount > 0}
		<span class="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#7A4F60] px-1 text-[10.5px] font-bold text-white">{$cartCount}</span>
	{/if}
</a>
