<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { ArrowLeft, Mail, Phone, Send, Check, Trash2 } from 'lucide-svelte';

	export let data;
	export let form: { replyError?: string; reply?: string; replied?: boolean } | null;

	$: m = data.message;
	let reply = '';
	let sending = false;
	let confirmDelete = false;

	// Met à jour le compteur « non lus » du menu
	onMount(() => invalidate('app:messages'));

	$: if (form?.reply && !reply) reply = form.reply;

	function fmt(iso: string) {
		return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
	}
	$: initials = m.name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((p: string) => p[0]?.toUpperCase())
		.join('');
	$: mailto = `mailto:${m.email}?subject=${encodeURIComponent('Re : votre message à Jnb Event')}`;
</script>

<svelte:head><title>Message de {m.name}</title></svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-8">
	<a href="/dashboard/messages" class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
		<ArrowLeft class="h-4 w-4" /> Retour aux messages
	</a>

	<div class="rounded-2xl border bg-white p-5 md:p-6">
		<div class="flex items-start gap-3">
			<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F3E6EA] font-semibold text-[#7A4F60]">{initials}</span>
			<div class="min-w-0 flex-1">
				<p class="text-lg font-semibold">{m.name}</p>
				<p class="text-sm text-muted-foreground">Reçu le {fmt(m.created_at)}</p>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
					<a href={mailto} class="inline-flex items-center gap-1.5 text-[#7A4F60] underline-offset-2 hover:underline"><Mail class="h-4 w-4" />{m.email}</a>
					{#if m.phone}<a href="tel:{m.phone.replace(/\s/g, '')}" class="inline-flex items-center gap-1.5 text-[#7A4F60] underline-offset-2 hover:underline"><Phone class="h-4 w-4" />{m.phone}</a>{/if}
				</div>
			</div>
			{#if m.replied_at}
				<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"><Check class="h-3.5 w-3.5" /> Répondu</span>
			{:else if m.handled_at}
				<span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600"><Check class="h-3.5 w-3.5" /> Traité</span>
			{/if}
		</div>

		<p class="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed">{m.message}</p>

		{#if m.photos?.length}
			<div class="mt-4 flex flex-wrap gap-2">
				{#each m.photos as url}
					<a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt="" class="h-28 w-28 rounded-xl object-cover" /></a>
				{/each}
			</div>
		{/if}
	</div>

	{#if m.reply_text}
		<div class="rounded-2xl border border-green-200 bg-green-50/50 p-5">
			<p class="mb-2 text-sm font-medium text-green-800">Ta réponse · envoyée le {fmt(m.replied_at || m.created_at)}</p>
			<p class="whitespace-pre-wrap text-[15px] leading-relaxed">{m.reply_text}</p>
		</div>
	{/if}

	<form
		method="POST"
		action="?/reply"
		class="rounded-2xl border bg-white p-5"
		use:enhance={() => {
			sending = true;
			return async ({ result, update }) => {
				sending = false;
				if (result.type === 'success') reply = '';
				await update({ reset: false });
			};
		}}
	>
		<label for="reply" class="text-sm font-medium">{m.reply_text ? 'Envoyer une autre réponse' : 'Répondre'}</label>
		<textarea
			id="reply"
			name="reply"
			bind:value={reply}
			rows="5"
			maxlength="5000"
			placeholder="Bonjour {m.name.split(' ')[0]}, merci pour votre message…"
			class="mt-2 w-full rounded-xl border border-neutral-200 px-4 py-3 text-[15px] outline-none focus:border-[#BC90A5]"
		></textarea>
		<p class="mt-1 text-xs text-muted-foreground">Envoyé à {m.email} depuis contact@jennynbevent.com, avec ton logo. Sa réponse arrivera dans ta boîte mail.</p>
		{#if form?.replyError}<p class="mt-2 text-sm text-red-600">{form.replyError}</p>{/if}
		{#if form?.replied}<p class="mt-2 text-sm text-green-700">Réponse envoyée ✓</p>{/if}
		<div class="mt-3 flex flex-wrap gap-2">
			<button type="submit" disabled={sending || reply.trim().length < 2} class="inline-flex items-center gap-2 rounded-xl bg-[#7A4F60] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
				<Send class="h-4 w-4" />{sending ? 'Envoi…' : 'Envoyer la réponse'}
			</button>
			<a href={mailto} class="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm">
				<Mail class="h-4 w-4" /> Répondre depuis ma messagerie
			</a>
		</div>
	</form>

	<div class="flex flex-wrap gap-2">
		<form method="POST" action="?/toggleHandled" use:enhance>
			<button class="rounded-xl border bg-white px-4 py-2.5 text-sm">{m.handled_at ? 'Marquer comme à traiter' : 'Marquer comme traité'}</button>
		</form>
		<form method="POST" action="?/markUnread" use:enhance>
			<button class="rounded-xl border bg-white px-4 py-2.5 text-sm">Marquer comme non lu</button>
		</form>
		{#if confirmDelete}
			<form method="POST" action="?/delete" use:enhance class="flex gap-2">
				<button class="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm text-white"><Trash2 class="h-4 w-4" /> Confirmer la suppression</button>
				<button type="button" on:click={() => (confirmDelete = false)} class="rounded-xl border bg-white px-4 py-2.5 text-sm">Annuler</button>
			</form>
		{:else}
			<button type="button" on:click={() => (confirmDelete = true)} class="inline-flex items-center gap-1.5 rounded-xl border bg-white px-4 py-2.5 text-sm text-red-600"><Trash2 class="h-4 w-4" /> Supprimer</button>
		{/if}
	</div>
</div>
