<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { initSmoothScroll, destroySmoothScroll } from '$lib/utils/smooth-scroll';
	import '../../app.css';

	export let data;

	onMount(() => {
		initSmoothScroll();
	});

	onDestroy(() => {
		destroySmoothScroll();
	});
</script>

<main class="marketing-section">
	<slot />
</main>

<style>
	:root {
		scroll-behavior: smooth;
	}
</style>
