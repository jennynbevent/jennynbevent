import { z } from 'zod';
import { createDynamicProductOrderSchema, createCartItemSchema } from '$lib/validations/schemas/order.js';

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

export function createCartSchema(fields: CustomField[]) {
	return createCartItemSchema(fields);
}
