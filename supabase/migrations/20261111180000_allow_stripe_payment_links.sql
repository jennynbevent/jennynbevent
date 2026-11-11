-- Autoriser le paiement par carte (Stripe) à côté de PayPal, Revolut et Wero
ALTER TABLE public.payment_links DROP CONSTRAINT IF EXISTS payment_links_provider_type_check;
ALTER TABLE public.payment_links ADD CONSTRAINT payment_links_provider_type_check
  CHECK (provider_type = ANY (ARRAY['paypal'::text, 'revolut'::text, 'stripe'::text, 'wero'::text]));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_provider_check
  CHECK (payment_provider IS NULL OR payment_provider = ANY (ARRAY['paypal'::text, 'revolut'::text, 'stripe'::text, 'wero'::text]));
