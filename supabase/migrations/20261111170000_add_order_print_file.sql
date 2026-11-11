-- Fichier PDF à imprimer envoyé au client avec l'e-mail « commande prête »
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_file_url text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_file_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS print_file_sent_at timestamptz;
