-- Sous-titre des catégories, affiché sur la page d'accueil de la boutique
ALTER TABLE public.categories
	ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.categories
	DROP CONSTRAINT IF EXISTS categories_description_check;

ALTER TABLE public.categories
	ADD CONSTRAINT categories_description_check CHECK (char_length(description) <= 120);
