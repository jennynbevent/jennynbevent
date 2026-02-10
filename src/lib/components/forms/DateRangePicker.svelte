<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import 'daterangepicker/daterangepicker.css';

	export let selectedStartDate: string | undefined = undefined;
	export let selectedEndDate: string | undefined = undefined;
	export let minDaysNotice: number = 0;
	export let availabilities: {
		day: number;
		is_open: boolean;
		daily_order_limit?: number | null;
	}[] = [];
	export let unavailabilities: { start_date: string; end_date: string }[] = [];
	export let datesWithLimitReached: string[] = [];
	export let minReservationDays: number = 0;
	export let reservedRanges: Array<{ start_date: string; end_date: string }> = [];

	const dispatch = createEventDispatcher<{
		startSelected: string;
		endSelected: string;
		invalidRange: { message: string };
	}>();

	let inputEl: HTMLInputElement;
	let pickerInstance: any = null;
	// Set in onMount (browser only) so we never load jQuery/moment during SSR
	let jqLib: any = null;
	let momentLib: any = null;

	function toDateString(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	onMount(async () => {
		const jQuery = (await import('jquery')).default;
		const moment = (await import('moment')).default;
		jqLib = jQuery;
		momentLib = moment;
		(window as any).jQuery = jQuery;
		(window as any).$ = jQuery;
		(window as any).moment = moment;
		await import('daterangepicker');

		const minDate = moment().add(minDaysNotice, 'days').startOf('day');

		const isInvalidDate = (date: any) => {
			const d = date.toDate ? date.toDate() : new Date(date);
			const dayOfWeek = d.getDay();
			const availability = availabilities.find((a) => a.day === dayOfWeek);
			if (!availability || !availability.is_open) return true;
			const dateStr = toDateString(d);
			if (datesWithLimitReached.includes(dateStr)) return true;
			const dNorm = new Date(d.getFullYear(), d.getMonth(), d.getDate());
			for (const unav of unavailabilities) {
				const start = new Date(unav.start_date);
				const end = new Date(unav.end_date);
				start.setHours(0, 0, 0, 0);
				end.setHours(0, 0, 0, 0);
				if (dNorm >= start && dNorm <= end) return true;
			}
			for (const range of reservedRanges) {
				const start = new Date(range.start_date);
				const end = new Date(range.end_date);
				start.setHours(0, 0, 0, 0);
				end.setHours(0, 0, 0, 0);
				if (dNorm >= start && dNorm <= end) return true;
			}
			if (minDate && date.isBefore(minDate, 'day')) return true;
			return false;
		};

		let startM = selectedStartDate ? moment(selectedStartDate, 'YYYY-MM-DD') : minDate.clone();
		let endM = selectedEndDate ? moment(selectedEndDate, 'YYYY-MM-DD') : minDate.clone();
		if (endM.isBefore(startM)) endM = startM.clone();

		const options = {
			startDate: startM,
			endDate: endM,
			minDate,
			locale: {
				format: 'DD/MM/YYYY',
				separator: ' - ',
				applyLabel: 'Valider',
				cancelLabel: 'Annuler',
				daysOfWeek: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
				monthNames: [
					'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
					'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
				],
				firstDay: 1,
				customRangeLabel: 'Plage personnalisée',
			},
			autoUpdateInput: true,
			autoApply: true,
			isInvalidDate,
			opens: 'left' as const,
		};

		const callback = (start: any, end: any) => {
			const durationDays = 1 + end.diff(start, 'days');
			if (minReservationDays > 0 && durationDays < minReservationDays) {
				const prevStart = selectedStartDate ? moment(selectedStartDate, 'YYYY-MM-DD') : minDate.clone();
				let prevEnd = selectedEndDate ? moment(selectedEndDate, 'YYYY-MM-DD') : minDate.clone();
				if (prevEnd.isBefore(prevStart)) prevEnd = prevStart.clone();
				pickerInstance.setStartDate(prevStart);
				pickerInstance.setEndDate(prevEnd);
				if (inputEl) {
					if (selectedStartDate && selectedEndDate) {
						inputEl.value = prevStart.format('DD/MM/YYYY') + ' - ' + prevEnd.format('DD/MM/YYYY');
					} else {
						inputEl.value = '';
					}
				}
				setTimeout(() => pickerInstance.show(), 0);
				dispatch('invalidRange', {
					message: `La réservation doit couvrir au moins ${minReservationDays} jour(s).`
				});
				return;
			}
			dispatch('startSelected', start.format('YYYY-MM-DD'));
			dispatch('endSelected', end.format('YYYY-MM-DD'));
		};

		jQuery(inputEl).daterangepicker(options, callback);
		pickerInstance = jQuery(inputEl).data('daterangepicker');

		// Sync input display with current selection
		if (selectedStartDate && selectedEndDate) {
			const m1 = moment(selectedStartDate, 'YYYY-MM-DD');
			const m2 = moment(selectedEndDate, 'YYYY-MM-DD');
			jQuery(inputEl).val(m1.format('DD/MM/YYYY') + ' - ' + m2.format('DD/MM/YYYY'));
		} else {
			jQuery(inputEl).val('');
		}
	});

	onDestroy(() => {
		if (jqLib && inputEl) {
			const drp = jqLib(inputEl).data('daterangepicker');
			if (drp && typeof drp.remove === 'function') drp.remove();
		}
	});

	// When props change (e.g. form reset), sync picker and input (browser only, uses momentLib set in onMount)
	$: if (pickerInstance && inputEl && momentLib) {
		const minDate = momentLib().add(minDaysNotice, 'days').startOf('day');
		if (selectedStartDate && selectedEndDate) {
			const startM = momentLib(selectedStartDate, 'YYYY-MM-DD');
			const endM = momentLib(selectedEndDate, 'YYYY-MM-DD');
			pickerInstance.setStartDate(startM);
			pickerInstance.setEndDate(endM);
			inputEl.value = startM.format('DD/MM/YYYY') + ' - ' + endM.format('DD/MM/YYYY');
		} else {
			pickerInstance.setStartDate(minDate);
			pickerInstance.setEndDate(minDate);
			inputEl.value = '';
		}
	}
</script>

<div class="daterangepicker-wrapper w-fit">
	<p class="mb-2 text-sm text-muted-foreground">
		Choisissez la date de début, puis la date de fin (plage de réservation).
	</p>
	<input
		bind:this={inputEl}
		type="text"
		readonly
		class="w-full min-w-[280px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
		placeholder="Choisir une plage"
		aria-label="Information de réservation"
	/>
</div>

<style>
	/* Picker is rendered in body; hide the empty left ranges column globally */
	:global(.daterangepicker .ranges) {
		display: none;
	}
</style>
