-- Panier : les commandes d'un même panier partagent la même référence
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cart_ref text;
CREATE INDEX IF NOT EXISTS orders_cart_ref_idx ON public.orders (cart_ref);
