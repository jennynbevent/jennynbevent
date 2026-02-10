import { z } from 'zod';
import { createDynamicProductOrderSchema } from '$lib/validations/schemas/order.js';

export interface CustomField {
	id: string;
	label: string;
	type: 'short-text' | 'long-text' | 'number' | 'single-select' | 'multi-select';
	required: boolean;
	options?: Array<{ label: string; price?: number }>;
}

export function createLocalDynamicSchema(fields: CustomField[]) {
	return createDynamicProductOrderSchema(fields);
}
