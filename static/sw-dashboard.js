// Jnb Event – notifications de l'espace boutique
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
	let data = {};
	try {
		data = event.data ? event.data.json() : {};
	} catch (e) {
		data = { title: 'Jnb Event', body: event.data ? event.data.text() : '' };
	}
	const title = data.title || 'Jnb Event';
	event.waitUntil(
		self.registration.showNotification(title, {
			body: data.body || '',
			icon: '/icons/jnb-192.png',
			badge: '/icons/jnb-192.png',
			tag: data.tag || undefined,
			data: { url: data.url || '/dashboard/orders' },
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || '/dashboard/orders';
	event.waitUntil(
		self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
			for (const client of list) {
				if ('focus' in client) {
					client.navigate(url).catch(() => {});
					return client.focus();
				}
			}
			return self.clients.openWindow(url);
		})
	);
});
