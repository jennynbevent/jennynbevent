/** Calcul des options choisies et du prix d'un article (côté serveur, prix de confiance) */

export type CustomField = {
	id: string;
	label: string;
	type: 'short-text' | 'long-text' | 'number' | 'single-select' | 'multi-select';
	required?: boolean;
	options?: Array<{ label: string; price?: number }>;
};

export function buildSelectedOptions(customFields: CustomField[], customizationData: Record<string, any> | undefined) {
	const selectedOptions: Record<string, any> = {};
	Object.entries(customizationData || {}).forEach(([fieldId, value]) => {
		const field = customFields.find((f) => f.id === fieldId);
		if (!field) return;
		const key = field.label;
		if (['short-text', 'long-text', 'number'].includes(field.type)) {
			if (value === undefined || value === null || String(value).trim() === '') return;
			selectedOptions[key] = { value, type: field.type, price: 0, fieldId, fieldType: field.type };
		} else if (field.type === 'single-select' && Array.isArray(field.options)) {
			const option = field.options.find((opt) => opt.label === value);
			if (option)
				selectedOptions[key] = { value: option.label, type: field.type, price: option.price || 0, fieldId, fieldType: field.type };
		} else if (field.type === 'multi-select' && Array.isArray(value) && Array.isArray(field.options)) {
			const values = value
				.map((label: string) => {
					const option = field.options!.find((opt) => opt.label === label);
					return option ? { label: option.label, price: option.price || 0 } : null;
				})
				.filter(Boolean) as Array<{ label: string; price: number }>;
			if (!values.length) return;
			selectedOptions[key] = {
				values,
				type: field.type,
				price: values.reduce((s, v) => s + (v.price || 0), 0),
				fieldId,
				fieldType: field.type,
			};
		}
	});
	return selectedOptions;
}

export function totalWithOptions(basePrice: number, selectedOptions: Record<string, any>) {
	let total = Number(basePrice) || 0;
	Object.values(selectedOptions).forEach((v: any) => {
		total += Number(v?.price) || 0;
	});
	return Math.round(total * 100) / 100;
}

/** Résumé lisible des options (pour le panier et les e-mails) */
export function optionLines(selectedOptions: Record<string, any>): string[] {
	return Object.entries(selectedOptions || {})
		.filter(([key]) => key !== 'Mode de remise')
		.map(([key, v]: [string, any]) => {
			if (Array.isArray(v?.values)) return `${key} : ${v.values.map((x: any) => x.label).join(', ')}`;
			return `${key} : ${v?.value ?? ''}`;
		})
		.filter((l) => l.length < 300);
}

export const REMISE_EMAIL = 'Par e-mail (fichier à imprimer, sous 48 h)';
export const REMISE_RETRAIT = 'Retrait à Andrésy (78)';
