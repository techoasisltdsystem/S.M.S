
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'teacher', 'student', 'parent');
CREATE TYPE public.user_status AS ENUM ('active', 'suspended', 'banned', 'inactive');
CREATE TYPE public.audit_action AS ENUM (
  'user_created', 'user_updated', 'user_deleted', 'user_banned', 
  'user_suspended', 'user_activated', 'role_changed', 'config_updated',
  'login', 'logout', 'password_reset', 'permission_changed'
);

-- Profiles table (core user data)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  status user_status NOT NULL DEFAULT 'active',
  date_of_birth DATE,
  address TEXT,
  emergency_contact TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (security best practice - separate from profiles)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_by UUID REFERENCES public.profiles(id),
  UNIQUE (user_id, role)
);

-- Audit logs table
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_id UUID REFERENCES public.profiles(id),
  actor_name TEXT,
  action audit_action NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  target_name TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies (permissive for now since using mock auth)
CREATE POLICY "Profiles are publicly readable" ON public.profiles
FOR SELECT USING (true);

CREATE POLICY "Anyone can create profiles" ON public.profiles
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update profiles" ON public.profiles
FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete profiles" ON public.profiles
FOR DELETE USING (true);

-- User roles policies
CREATE POLICY "User roles are publicly readable" ON public.user_roles
FOR SELECT USING (true);

CREATE POLICY "Anyone can manage user roles" ON public.user_roles
FOR ALL USING (true);

-- Audit logs policies (read-only for viewing, insert for logging)
CREATE POLICY "Audit logs are readable" ON public.audit_logs
FOR SELECT USING (true);

CREATE POLICY "Anyone can create audit logs" ON public.audit_logs
FOR INSERT WITH CHECK (true);

-- Trigger for updated_at on profiles
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_profiles_status ON public.profiles(status);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
CREATE INDEX idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
