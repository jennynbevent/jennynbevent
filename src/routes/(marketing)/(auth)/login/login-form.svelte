<script lang="ts">
	import { page } from '$app/stores';
	import * as Form from '$lib/components/ui/form';
	import { Input } from '$lib/components/ui/input';
	import InputOtp from '$lib/components/ui/input-otp.svelte';
	import {
		superForm,
		type Infer,
		type SuperValidated,
	} from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import LoaderCircle from '~icons/lucide/loader-circle';
	import { formSchema, loginOtpSchema, type FormSchema, type LoginOtpSchema } from './schema';

	export let form: SuperValidated<Infer<FormSchema>>;
	export let otpForm: SuperValidated<Infer<LoginOtpSchema>>;
	export let step: 'code' | null;
	export let email: string | null;

	const emailForm = superForm(form, {
		validators: zodClient(formSchema),
	});

	const otpFormInstance = superForm(otpForm, {
		validators: zodClient(loginOtpSchema),
	});

	const { form: formData, enhance, submitting, message } = emailForm;
	const {
		form: otpFormData,
		enhance: enhanceOtp,
		submitting: submittingOtp,
	} = otpFormInstance;

	function onOtpChange(event: CustomEvent<{ value: string }>) {
		// Mettre à jour le store du formulaire pour que le bouton « Se connecter » s’active
		otpFormInstance.form.update((f) => ({ ...f, code: event.detail.value }));
	}
</script>

{#if step === 'code' && email}
	<!-- Étape 2 : saisie du code OTP à 6 chiffres -->
	<div class="space-y-6">
		<p class="rounded-lg bg-green-50 p-3 text-sm text-green-800">
			Un code à 6 chiffres a été envoyé à <strong>{email}</strong>. Saisis-le ci-dessous.
		</p>

		<form
			method="POST"
			action="?/verifyOtp"
			use:enhanceOtp
			class="grid gap-6"
		>
			<Form.Errors form={otpFormInstance} />
			<input type="hidden" name="email" value={email} />
			<Form.Field form={otpFormInstance} name="code">
				<Form.Control let:attrs>
					<input {...attrs} type="hidden" name="code" bind:value={$otpFormData.code} />
					<div class="flex justify-center">
						<InputOtp
							value={$otpFormData.code}
							length={6}
							disabled={$submittingOtp}
							on:change={onOtpChange}
						/>
					</div>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>
			<Form.Button
				class="h-12 w-full rounded-xl bg-[#BC90A5] text-base font-medium text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#BE85A5] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={$submittingOtp || $otpFormData.code.length !== 6}
			>
				{#if $submittingOtp}
					<LoaderCircle class="mr-2 h-5 w-5 animate-spin" />
					Connexion…
				{:else}
					Se connecter
				{/if}
			</Form.Button>
		</form>

		<div class="text-center text-sm text-neutral-500">
			Tu n’as pas reçu le code ?
			<form method="POST" action="?/sendOtp{$page.url.search}" class="inline" use:enhance>
				<input type="hidden" name="email" value={email} />
				<button
					type="submit"
					class="text-[#BC90A5] underline hover:text-[#BE85A5]"
				>
					Renvoyer le code
				</button>
			</form>
		</div>
	</div>
{:else}
	<!-- Étape 1 : email puis envoi du code -->
	<form method="POST" action="?/sendOtp" use:enhance class="grid gap-6">
		<Form.Errors form={emailForm} />
		{#if $message}
			<p class="rounded-lg bg-green-50 p-3 text-sm text-green-800">
				{$message}
			</p>
		{/if}
		<Form.Field form={emailForm} name="email">
			<Form.Control let:attrs>
				<Form.Label class="mb-2 text-sm font-medium text-neutral-700">Email</Form.Label>
				<Input
					{...attrs}
					type="email"
					placeholder="ton@email.com"
					required
					bind:value={$formData.email}
					class="h-12 rounded-xl border-neutral-300 bg-white text-base transition-all duration-200 focus:border-[#BC90A5] focus:ring-2 focus:ring-[#BC90A5]/20"
				/>
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Button
			class="h-12 w-full rounded-xl bg-[#BC90A5] text-base font-medium text-white shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-[#BE85A5] hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
			disabled={$submitting}
		>
			{#if $submitting}
				<LoaderCircle class="mr-2 h-5 w-5 animate-spin" />
				Envoi en cours…
			{:else}
				Recevoir le code
			{/if}
		</Form.Button>
	</form>
{/if}
