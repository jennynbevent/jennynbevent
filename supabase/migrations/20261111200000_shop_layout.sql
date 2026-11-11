-- Disposition de la boutique : ordre des catégories et 4 images de la page d'accueil
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS position integer;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS hero_product_ids uuid[];
