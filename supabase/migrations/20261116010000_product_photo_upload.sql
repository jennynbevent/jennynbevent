-- Option par article : le client peut joindre une photo (ex. panneau avec photo)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_photo_upload boolean DEFAULT false;
