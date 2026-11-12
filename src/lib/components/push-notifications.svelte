<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	/** Carte « Notifications » : activer les alertes de nouvelles commandes sur cet appareil */
	type State = 'loading' | 'unsupported' | 'install' | 'nokey' | 'denied' | 'off' | 'on';
	let state: State = 'loading';
	let busy = false;
	let info = '';
	let error = '';
	let reg: ServiceWorkerRegistration | null = null;
	let reason = '';

	const publicKey = (env.PUBLIC_VAPID_PUBLIC_KEY || '').trim();

	function keyBytes(base64: string) {
		const padding = '='.repeat((4 - (base64.length % 4)) % 4);
		const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
		const out = new Uint8Array(raw.length);
		for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
		return out;
	}

	onMount(async () => {
		const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
		const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
		if (!publicKey) return (state = 'nokey');
		if (isIOS && !standalone) return (state = 'install');
		if (!supported) {
			reason = [
				!('serviceWorker' in navigator) ? 'serviceWorker absent' : '',
				!('PushManager' in window) ? 'PushManager absent' : '',
				!('Notification' in window) ? 'Notification absent' : '',
				standalone ? 'appli' : 'navigateur',
			].filter(Boolean).join(' · ');
			return (state = 'unsupported');
		}
		try {
			reg = await navigator.serviceWorker.register('/sw-dashboard.js');
			await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (Notification.permission === 'denied') state = 'denied';
			else state = sub ? 'on' : 'off';
			// Réenregistre l'appareil (au cas où il aurait été oublié côté serveur)
			if (sub) fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sub) });
		} catch (e) {
			console.error(e);
			reason = 'Erreur : ' + (e instanceof Error ? e.message : String(e));
			state = 'unsupported';
		}
	});

	async function enable() {
		error = '';
		info = '';
		busy = true;
		try {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				state = permission === 'denied' ? 'denied' : 'off';
				return;
			}
			reg = reg ?? (await navigator.serviceWorker.register('/sw-dashboard.js'));
			await navigator.serviceWorker.ready;
			const sub =
				(await reg.pushManager.getSubscription()) ??
				(await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
			const res = await fetch('/api/push/subscribe', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(sub),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || "Impossible d'activer les notifications.");
			state = 'on';
			await test();
		} catch (e) {
			error = e instanceof Error ? e.message : "Impossible d'activer les notifications.";
		} finally {
			busy = false;
		}
	}

	async function test() {
		error = '';
		info = '';
		const res = await fetch('/api/push/test', { method: 'POST' });
		const data = await res.json().catch(() => ({}));
		if (res.ok && data.sent > 0) info = 'Notification d’essai envoyée ✓ Elle doit apparaître dans quelques secondes.';
		else error = "La notification d'essai n'est pas partie. Vérifiez que les clés sont bien dans Vercel.";
	}

	async function disable() {
		busy = true;
		try {
			const sub = await reg?.pushManager.getSubscription();
			if (sub) {
				await fetch('/api/push/subscribe', {
					method: 'DELETE',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ endpoint: sub.endpoint }),
				});
				await sub.unsubscribe();
			}
			state = 'off';
			info = 'Notifications désactivées sur cet appareil.';
		} finally {
			busy = false;
		}
	}
</script>

{#if state !== 'loading'}
	<div class="mb-6 rounded-xl border bg-white p-4 shadow-sm sm:p-5">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="min-w-0">
				<p class="font-medium">🔔 Notifications des nouvelles commandes</p>
				{#if state === 'on'}
					<p class="text-sm text-green-700">Activées sur cet appareil ✓</p>
				{:else if state === 'off'}
					<p class="text-sm text-muted-foreground">Recevez une alerte sur cet appareil à chaque nouvelle commande.</p>
				{:else if state === 'install'}
					<p class="text-sm text-muted-foreground">
						Sur iPad / iPhone, ouvrez l'espace boutique depuis son <strong>icône sur l'écran d'accueil</strong> (pas depuis Safari) pour activer les notifications.
					</p>
				{:else if state === 'denied'}
					<p class="text-sm text-amber-700">
						Les notifications sont bloquées. Sur iPad : <strong>Réglages → Notifications → Jnb Event</strong> → autoriser, puis rouvrez l'appli.
					</p>
				{:else if state === 'nokey'}
					<p class="text-sm text-amber-700">Les clés de notification ne sont pas encore dans Vercel.</p>
				{:else}
					<p class="text-sm text-muted-foreground">Cet appareil ou ce navigateur ne gère pas les notifications (iPad : iPadOS 16.4 minimum).</p>
					{#if reason}<p class="mt-1 text-xs text-muted-foreground">Détail technique : {reason}</p>{/if}
				{/if}
			</div>
			<div class="flex gap-2">
				{#if state === 'off'}
					<button type="button" on:click={enable} disabled={busy} class="rounded-md bg-[#7A4F60] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
						{busy ? 'Activation…' : 'Activer les notifications'}
					</button>
				{:else if state === 'on'}
					<button type="button" on:click={test} disabled={busy} class="rounded-md border px-3 py-2 text-sm hover:bg-muted">Tester</button>
					<button type="button" on:click={disable} disabled={busy} class="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">Désactiver</button>
				{/if}
			</div>
		</div>
		{#if info}<p class="mt-2 text-sm text-green-700">{info}</p>{/if}
		{#if error}<p class="mt-2 text-sm text-red-600">{error}</p>{/if}
	</div>
{/if}
