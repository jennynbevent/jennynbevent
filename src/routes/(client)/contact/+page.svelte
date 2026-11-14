<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { ArrowLeft } from 'lucide-svelte';
	import { ClientFooter } from '$lib/components';

	$: ({ shop, customizations } = $page.data);
	$: buttonStyle = `background-color: ${customizations?.button_color || '#BC90A5'}; color: ${customizations?.button_text_color || '#ffffff'};`;

	export let form: { success?: boolean; error?: string; values?: Record<string, string> } | null;

	let sending = false;
	let sent = false;
	let previews: string[] = [];
	let photoError = '';
	let fileInput: HTMLInputElement;

	$: values = form?.values ?? {};

	// Réduit les photos (max 1600 px) pour que l'envoi reste léger et rapide
	async function shrink(file: File): Promise<File> {
		try {
			const bmp = await createImageBitmap(file);
			const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(bmp.width * scale);
			canvas.height = Math.round(bmp.height * scale);
			canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
			const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
			if (!blob) return file;
			return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
		} catch {
			return file;
		}
	}

	async function onPhotos() {
		photoError = '';
		previews.forEach((u) => URL.revokeObjectURL(u));
		const files = Array.from(fileInput?.files ?? []);
		if (files.length > 3) {
			photoError = '3 photos maximum.';
			fileInput.value = '';
			previews = [];
			return;
		}
		const small = await Promise.all(files.map(shrink));
		const dt = new DataTransfer();
		small.forEach((f) => dt.items.add(f));
		fileInput.files = dt.files;
		previews = small.map((f) => URL.createObjectURL(f));
	}

	function clearPhotos() {
		if (fileInput) fileInput.value = '';
		previews.forEach((u) => URL.revokeObjectURL(u));
		previews = [];
	}
</script>

<svelte:head>
	<title>Contact - {shop?.name}</title>
	<meta name="description" content="Une question, une idée ? Écrivez à {shop?.name}, on vous répond rapidement." />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&display=swap" rel="stylesheet" />
</svelte:head>

<div class="min-h-screen bg-[#fafafa] text-neutral-800">
	<header class="relative border-b border-black/[0.08] px-5 pb-5 pt-6 text-center">
		<a href="/" class="absolute left-4 top-6 flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-neutral-600 hover:bg-black/[0.04]">
			<ArrowLeft class="h-4 w-4" /> Retour
		</a>
		<a href="/" class="inline-flex flex-col items-center">
			{#if shop?.logo_url}
				<img src={shop.logo_url} alt={shop.name} class="h-14 w-14 rounded-full object-cover shadow-sm" />
			{/if}
			<span class="serif mt-2 text-2xl tracking-wide">JNB EVENT</span>
		</a>
	</header>

	<main class="mx-auto max-w-xl px-5 pb-16 pt-10">
		<div class="text-center">
			<p class="serif text-xl italic text-[#9A7C88]">Une question, une idée ?</p>
			<h1 class="serif mt-1 text-[40px] leading-tight md:text-5xl">Contactez-nous</h1>
			<div class="mx-auto my-5 h-px w-[60px] bg-[#BC90A5]"></div>
			<p class="text-neutral-600">Écrivez-nous, on vous répond rapidement par e-mail. ✨</p>
		</div>

		{#if sent || form?.success}
			<div class="mt-10 rounded-2xl border border-[#EADDE1] bg-white p-8 text-center">
				<p class="text-3xl">💌</p>
				<h2 class="mt-2 text-xl font-semibold">Merci, votre message est bien envoyé !</h2>
				<p class="mt-2 text-neutral-600">Vous allez recevoir une copie par e-mail. Nous vous répondons très vite.</p>
				<a href="/" class="mt-6 inline-block rounded-xl px-6 py-3 text-sm font-medium" style={buttonStyle}>Retour à la boutique</a>
			</div>
		{:else}
			<form
				method="POST"
				action="?/send"
				enctype="multipart/form-data"
				class="mt-8 space-y-4"
				use:enhance={() => {
					sending = true;
					return async ({ result, update }) => {
						sending = false;
						if (result.type === 'success') {
							sent = true;
							clearPhotos();
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="shopId" value={shop?.id} />
				<!-- Champ piège pour les robots (invisible) -->
				<input type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />

				<label class="block">
					<span class="mb-1.5 block text-sm font-medium">Nom complet *</span>
					<input name="name" required maxlength="120" value={values.name ?? ''} placeholder="Votre nom complet" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
				</label>
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="mb-1.5 block text-sm font-medium">Email *</span>
						<input name="email" type="email" required maxlength="200" value={values.email ?? ''} placeholder="votre@email.com" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
					</label>
					<label class="block">
						<span class="mb-1.5 block text-sm font-medium">Téléphone (facultatif)</span>
						<input name="phone" type="tel" maxlength="40" value={values.phone ?? ''} placeholder="06 12 34 56 78" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]" />
					</label>
				</div>
				<label class="block">
					<span class="mb-1.5 block text-sm font-medium">Votre message *</span>
					<textarea name="message" required maxlength="3000" rows="6" placeholder="Décrivez votre projet ou posez votre question…" class="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 outline-none focus:border-[#BC90A5]">{values.message ?? ''}</textarea>
				</label>

				<div>
					<span class="mb-1.5 block text-sm font-medium">Photos d'inspiration (facultatif, 3 max)</span>
					<label class="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-3 text-sm text-[#7A4F60] hover:border-[#BC90A5]">
						+ Ajouter des photos
						<input bind:this={fileInput} on:change={onPhotos} type="file" name="photos" accept="image/*" multiple class="hidden" />
					</label>
					{#if previews.length}
						<div class="mt-3 flex flex-wrap items-center gap-2">
							{#each previews as src}
								<img {src} alt="" class="h-20 w-20 rounded-lg object-cover" />
							{/each}
							<button type="button" on:click={clearPhotos} class="ml-1 text-sm text-neutral-500 underline">Retirer</button>
						</div>
					{/if}
					{#if photoError}<p class="mt-1 text-sm text-red-600">{photoError}</p>{/if}
				</div>

				{#if form?.error}<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{form.error}</p>{/if}

				<button type="submit" disabled={sending} class="w-full rounded-xl px-6 py-3.5 font-medium shadow-sm disabled:opacity-60" style={buttonStyle}>
					{sending ? 'Envoi en cours…' : 'Envoyer mon message'}
				</button>
				<p class="text-center text-sm text-neutral-500">Vous recevrez une copie de votre message par e-mail.</p>
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
