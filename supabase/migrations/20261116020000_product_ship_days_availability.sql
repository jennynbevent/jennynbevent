-- Délai d'envoi Colissimo propre à chaque article (vide = délai de commande minimum)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ship_days integer;
-- Disponibilité en boutique : available / soon (bientôt de retour) / unavailable
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS availability text DEFAULT 'available';
