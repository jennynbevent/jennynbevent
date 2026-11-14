<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { Paperclip, Check } from 'lucide-svelte';

	export let data;

	let filter: 'all' | 'unread' = 'all';
	let enabled = data.contactEnabled;
	let toggleForm: HTMLFormElement;
	let toggleError = '';

	$: messages = data.messages;
	$: unreadCount = messages.filter((m) => !m.read_at).length;
	$: shown = filter === 'unread' ? messages.filter((m) => !m.read_at) : messages;

	function initials(name: string) {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((p) => p[0]?.toUpperCase())
			.join('');
	}

	const TZ = 'Europe/Paris';
	function when(iso: string) {
		const d = new Date(iso);
		const dayKey = (x: Date) => x.toLocaleDateString('fr-FR', { timeZone: TZ });
		const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
		if (dayKey(d) === dayKey(new Date())) return `Aujourd'hui ${time}`;
		if (dayKey(d) === dayKey(new Date(Date.now() - 86400000))) return `Hier ${time}`;
		return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: TZ });
	}

	async function toggle() {
		enabled = !enabled;
		// Attendre que la case cachée prenne la nouvelle valeur avant d'envoyer
		await tick();
		toggleForm.requestSubmit();
	}
</script>

<svelte:head><title>Messages</title></svelte:head>

<div class="mx-auto w-full max-w-4xl space-y-5 p-4 md:p-8">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Messages</h1>
		<p class="mt-1 text-muted-foreground">Les messages envoyés depuis la page Contact de ton site</p>
	</div>

	{#if !data.ready}
		<div class="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-800">
			<p class="font-semibold">⚠️ La messagerie n'est pas encore prête : il manque un réglage dans Supabase.</p>
			<p class="mt-1">Colle la commande SQL reçue dans Supabase → SQL Editor, puis clique sur « Run » et recharge cette page.</p>
		</div>
	{/if}

	<form
		bind:this={toggleForm}
		method="POST"
		action="?/toggle"
		use:enhance={() => {
			toggleError = '';
			return async ({ result }) => {
				if (result.type !== 'success') {
					enabled = !enabled;
					toggleError = "Le réglage n'a pas pu être enregistré.";
				}
			};
		}}
		class="flex items-center gap-4 rounded-2xl border bg-white p-4"
	>
		<input type="hidden" name="enabled" value={String(enabled)} />
		<button
			type="button"
			role="switch"
			aria-checked={enabled}
			on:click={toggle}
			class="relative h-7 w-12 shrink-0 rounded-full transition-colors {enabled ? 'bg-neutral-900' : 'bg-neutral-300'}"
		>
			<span class="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all {enabled ? 'left-6' : 'left-1'}"></span>
		</button>
		<div>
			<p class="font-medium">{enabled ? 'Page Contact activée' : 'Page Contact désactivée'}</p>
			<p class="text-sm text-muted-foreground">
				{enabled ? 'Désactive-la pour retirer « Contact » du menu du site.' : 'Active-la pour afficher « Contact » dans le menu du site.'}
			</p>
			{#if toggleError}<p class="mt-1 text-sm text-red-600">{toggleError}</p>{/if}
		</div>
		{#if enabled}<a href="/contact" target="_blank" class="ml-auto shrink-0 text-sm text-[#7A4F60] underline">Voir la page</a>{/if}
	</form>

	<div class="flex gap-2">
		<button type="button" on:click={() => (filter = 'all')} class="rounded-lg border px-3 py-1.5 text-sm {filter === 'all' ? 'border-neutral-900 bg-neutral-900 text-white' : 'bg-white'}">
			Tous ({messages.length})
		</button>
		<button type="button" on:click={() => (filter = 'unread')} class="rounded-lg border px-3 py-1.5 text-sm {filter === 'unread' ? 'border-neutral-900 bg-neutral-900 text-white' : 'bg-white'}">
			Non lus ({unreadCount})
		</button>
	</div>

	{#if shown.length === 0}
		<div class="rounded-2xl border bg-white p-10 text-center text-muted-foreground">
			{filter === 'unread' ? 'Aucun message non lu 🎉' : 'Aucun message pour le moment.'}
		</div>
	{:else}
		<div class="overflow-hidden rounded-2xl border bg-white">
			{#each shown as m (m.id)}
				<a
					href="/dashboard/messages/{m.id}"
					class="flex items-start gap-3 border-t px-4 py-3.5 first:border-t-0 hover:bg-[#FBF6F8] {m.read_at ? '' : 'bg-[#FBF6F8]'}"
				>
					<span class="mt-2 h-2 w-2 shrink-0 rounded-full {m.read_at ? 'bg-transparent' : 'bg-[#7A4F60]'}"></span>
					<span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3E6EA] text-sm font-semibold text-[#7A4F60]">{initials(m.name)}</span>
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-2">
							<span class="truncate {m.read_at ? '' : 'font-semibold'}">{m.name}</span>
							{#if m.replied_at}
								<span class="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-green-50 px-2 text-[11px] font-medium text-green-700"><Check class="h-3 w-3" /> Répondu</span>
							{:else if m.handled_at}
								<span class="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-neutral-100 px-2 text-[11px] font-medium text-neutral-600"><Check class="h-3 w-3" /> Traité</span>
							{/if}
						</span>
						<span class="block truncate text-sm text-muted-foreground">{m.message}</span>
					</span>
					<span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
						{when(m.created_at)}
						{#if m.photos?.length}· <Paperclip class="h-3 w-3" />{m.photos.length}{/if}
					</span>
				</a>
			{/each}
		</div>
	{/if}
</div>
