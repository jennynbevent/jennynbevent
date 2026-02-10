<script lang="ts">
	export let customizations:
		| {
				text_color: string;
				secondary_text_color: string;
				button_color?: string;
		  }
		| undefined = undefined;
	export let shopSlug: string | undefined = undefined;
	export let hasPolicies: boolean = false;

	$: textStyle = customizations ? `color: ${customizations.text_color};` : '';
	$: secondaryTextStyle = customizations
		? `color: ${customizations.secondary_text_color};`
		: '';
</script>

<footer class="mt-auto px-4 py-6 text-center sm:py-8">
	<div class="space-y-4">
		{#if hasPolicies}
			<p class="text-xs sm:text-sm" style={secondaryTextStyle}>
				<a href={shopSlug ? `/${shopSlug}/policies` : '/policies'} class="font-medium hover:underline" style={textStyle}>
					Conditions de vente
				</a>
			</p>
		{/if}
	</div>
</footer>
