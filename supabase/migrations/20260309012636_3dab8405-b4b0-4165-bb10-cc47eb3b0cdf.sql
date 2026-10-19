
-- Create storage buckets for school assets
INSERT INTO storage.buckets (id, name, public) VALUES ('school-assets', 'school-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for school assets (public read, anyone can upload for now)
CREATE POLICY "School assets are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'school-assets');

CREATE POLICY "Anyone can upload school assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'school-assets');

CREATE POLICY "Anyone can update school assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'school-assets');

CREATE POLICY "Anyone can delete school assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'school-assets');

-- Create school_config table (single-tenant: one school per deployment)
CREATE TABLE public.school_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name TEXT NOT NULL DEFAULT '',
  school_address TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  country TEXT DEFAULT '',
  currency TEXT DEFAULT 'USD',
  tagline TEXT DEFAULT '',
  school_type TEXT DEFAULT 'mixed' CHECK (
    school_type IN ('primary', 'junior_high', 'senior_high', 'college', 'university', 'mixed')
  ),
  academic_year_format TEXT DEFAULT 'semester' CHECK (
    academic_year_format IN ('semester', 'trimester', 'quarter', 'annual')
  ),
  grading_system TEXT DEFAULT 'percentage' CHECK (
    grading_system IN ('percentage', 'gpa_4', 'gpa_5', 'letter', 'custom')
  ),
  logo_url TEXT DEFAULT '',
  banner_url TEXT DEFAULT '',
  primary_color TEXT DEFAULT '#2563eb',
  setup_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_config ENABLE ROW LEVEL SECURITY;

-- Public read access (school info appears across all portals)
CREATE POLICY "School config is publicly readable"
ON public.school_config FOR SELECT
USING (true);

-- Allow insert for initial setup
CREATE POLICY "Anyone can create school config"
ON public.school_config FOR INSERT
WITH CHECK (true);

-- Allow updates
CREATE POLICY "Anyone can update school config"
ON public.school_config FOR UPDATE
USING (true);

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_school_config_updated_at
BEFORE UPDATE ON public.school_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
