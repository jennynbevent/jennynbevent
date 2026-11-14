<script lang="ts">
	// Onglet Aide : comment se passe une commande, qui reçoit quoi, comment envoyer un colis
	const paths = [
		{
			title: '📍 Retrait à Andrésy',
			color: 'bg-[#F3E6EA] text-[#7A4F60]',
			steps: [
				{ label: 'À traiter', text: 'Payé par carte. Clique sur « J’ai reçu le paiement ».' },
				{ label: 'En cours', text: 'Tu prépares la commande.' },
				{ label: 'Prête', text: 'Clique sur « Marquer comme prête » : le client est prévenu.' },
				{ label: 'Terminée', text: 'Le client est passé : « Marquer comme terminée ».' },
			],
		},
		{
			title: '✉️ Par e-mail',
			color: 'bg-blue-50 text-blue-800',
			steps: [
				{ label: 'À traiter', text: 'Payé par carte. Clique sur « J’ai reçu le paiement ».' },
				{ label: 'En cours', text: 'Tu prépares le fichier (48 h max).' },
				{ label: 'Prête', text: 'Ajoute le PDF puis « Marquer comme prête » : il part par e-mail.' },
				{ label: 'Terminée', text: '« Marquer comme terminée ».' },
			],
		},
		{
			title: '📦 Point Relais',
			color: 'bg-amber-50 text-amber-800',
			steps: [
				{ label: 'À traiter', text: 'Payé par carte. Clique sur « J’ai reçu le paiement ».' },
				{ label: 'En cours', text: 'Tu prépares et tu emballes le colis.' },
				{ label: 'Expédiée', text: 'Colle le n° de suivi puis « Colis envoyé » : le client reçoit le suivi.' },
				{ label: 'Terminée', text: 'Automatique quand le client retire son colis (suivi vérifié chaque jour et à l’ouverture de la commande).' },
			],
		},
	];

	const who = [
		{
			title: '📍 Retrait',
			rows: [
				['Commande payée', 'Toi : notification + e-mail · Client : e-mail de confirmation'],
				['Marquée prête', 'Client : e-mail « Votre commande est prête » avec l’adresse'],
			],
		},
		{
			title: '✉️ E-mail',
			rows: [
				['Commande payée', 'Toi : notification + e-mail · Client : e-mail de confirmation'],
				['Marquée prête', 'Client : e-mail avec le fichier PDF à imprimer'],
			],
		},
		{
			title: '📦 Point Relais',
			rows: [
				['Commande payée', 'Toi : notification + e-mail · Client : e-mail avec son Point Relais'],
				['Colis envoyé', 'Client : e-mail « Votre colis est en route » + n° de suivi'],
				['Colis arrivé', 'Client : e-mail « Votre colis vous attend » (+ SMS Mondial Relay) · Toi : notification'],
				['Colis retiré', 'Toi : notification « Colis retiré ! » · la commande passe en Terminée'],
			],
		},
	];

	const ship = [
		['Ouvre la commande', 'Le bloc « Expédition » affiche le nom du client, son téléphone et son Point Relais, avec un bouton Copier pour chaque info.'],
		['Crée l’étiquette sur Mondial Relay', 'Sur ton espace Mondial Relay Pro : nouvelle expédition, colle les infos, choisis le poids (taille indiquée dans la commande). Tu paies l’étiquette là-bas.'],
		['Imprime et colle l’étiquette', 'Emballe bien le colis, colle l’étiquette bien à plat.'],
		['Dépose le colis', 'Dans n’importe quel Point Relais ou Locker Mondial Relay près de chez toi.'],
		['Colle le n° de suivi', 'Dans la commande, colle le numéro de l’étiquette et clique sur « Colis envoyé ». Le client reçoit le suivi par e-mail.'],
	];
</script>

<div class="space-y-8">
	<!-- 1. Parcours -->
	<section class="rounded-2xl border bg-white p-5 shadow-sm">
		<h2 class="text-lg font-semibold">1. Le parcours d'une commande</h2>
		<p class="mb-4 text-sm text-muted-foreground">Selon le mode choisi par le client (paiement par carte).</p>
		<div class="space-y-5">
			{#each paths as p}
				<div>
					<p class="mb-2 inline-block rounded-full px-3 py-1 text-sm font-semibold {p.color}">{p.title}</p>
					<ol class="grid gap-2 md:grid-cols-4">
						{#each p.steps as st, i}
							<li class="relative rounded-xl border bg-[#FBF6F8] p-3 text-sm">
								<span class="mb-1 flex items-center gap-2 font-semibold"><span class="grid h-5 w-5 place-items-center rounded-full bg-[#7A4F60] text-[11px] text-white">{i + 1}</span>{st.label}</span>
								<span class="text-muted-foreground">{st.text}</span>
							</li>
						{/each}
					</ol>
				</div>
			{/each}
		</div>
		<p class="mt-4 text-xs text-muted-foreground">Panier avec plusieurs articles : « J'ai reçu le paiement » valide tout le panier d'un coup, et « Colis envoyé » passe tous les articles du colis en « Expédiée ».</p>
	</section>

	<!-- 2. Qui reçoit quoi -->
	<section class="rounded-2xl border bg-white p-5 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold">2. Qui reçoit quoi, et quand ?</h2>
		<div class="grid gap-3 md:grid-cols-3">
			{#each who as col}
				<div class="rounded-xl border p-3">
					<p class="mb-2 font-semibold">{col.title}</p>
					<ul class="space-y-2 text-sm">
						{#each col.rows as [when, what]}
							<li><span class="font-medium">{when}</span><br /><span class="text-muted-foreground">{what}</span></li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>

	<!-- 3. Envoyer un colis -->
	<section class="rounded-2xl border bg-white p-5 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold">3. Comment envoyer un colis en Point Relais</h2>
		<ol class="space-y-3">
			{#each ship as [title, text], i}
				<li class="flex gap-3 text-sm">
					<span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#7A4F60] font-semibold text-white">{i + 1}</span>
					<span><span class="font-semibold">{title}</span><br /><span class="text-muted-foreground">{text}</span></span>
				</li>
			{/each}
		</ol>
		<p class="mt-4 rounded-xl bg-[#FBF6F8] p-3 text-sm text-muted-foreground">
			Plus tard : un bouton « Créer l'étiquette » pourra faire les étapes 2 et 5 tout seul (avec ta clé Mondial Relay).
		</p>
	</section>
</div>
