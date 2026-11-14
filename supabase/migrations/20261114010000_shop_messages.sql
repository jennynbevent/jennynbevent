-- Messages envoyés depuis la page Contact du site
CREATE TABLE IF NOT EXISTS public.shop_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  message text NOT NULL,
  photos text[] NOT NULL DEFAULT '{}',
  read_at timestamptz,
  replied_at timestamptz,
  reply_text text,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shop_messages_shop_created_idx ON public.shop_messages (shop_id, created_at DESC);
ALTER TABLE public.shop_messages ENABLE ROW LEVEL SECURITY;
