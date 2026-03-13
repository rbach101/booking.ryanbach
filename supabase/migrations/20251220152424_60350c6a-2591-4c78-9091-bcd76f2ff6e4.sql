-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'staff');

-- Profiles table for authenticated users
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- User roles table (separate for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (prevents recursive RLS)
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

-- Admins can manage roles
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Practitioners table
CREATE TABLE public.practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  bio TEXT,
  image_url TEXT,
  specialties TEXT[] DEFAULT '{}',
  color TEXT DEFAULT 'hsl(150, 35%, 45%)',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.practitioners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view practitioners"
  ON public.practitioners FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage practitioners"
  ON public.practitioners FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can update their own practitioner record"
  ON public.practitioners FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Rooms table
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER DEFAULT 1,
  amenities TEXT[] DEFAULT '{}',
  color TEXT DEFAULT 'hsl(200, 60%, 55%)',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view rooms"
  ON public.rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage rooms"
  ON public.rooms FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Calendar connections for Google Calendar OAuth
CREATE TABLE public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type TEXT NOT NULL CHECK (owner_type IN ('practitioner', 'room', 'main')),
  owner_id UUID, -- null for 'main' calendar
  google_calendar_id TEXT,
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry TIMESTAMP WITH TIME ZONE,
  connected_by UUID REFERENCES auth.users(id),
  is_connected BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Only the connected user or admins can view their calendar connections
CREATE POLICY "Users can view their own calendar connections"
  ON public.calendar_connections FOR SELECT
  TO authenticated
  USING (
    connected_by = auth.uid() 
    OR public.has_role(auth.uid(), 'admin')
    OR (owner_type = 'practitioner' AND owner_id IN (
      SELECT id FROM public.practitioners WHERE user_id = auth.uid()
    ))
  );

CREATE POLICY "Users can manage their own calendar connections"
  ON public.calendar_connections FOR ALL
  TO authenticated
  USING (
    connected_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  duration INTEGER NOT NULL, -- in minutes
  price DECIMAL(10,2) NOT NULL,
  deposit_required DECIMAL(10,2) DEFAULT 0,
  category TEXT,
  image_url TEXT,
  is_outcall BOOLEAN DEFAULT false,
  is_couples BOOLEAN DEFAULT false,
  is_local BOOLEAN DEFAULT false,
  practitioner_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active services"
  ON public.services FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can view all services"
  ON public.services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage services"
  ON public.services FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  client_phone TEXT,
  notes TEXT,
  practitioner_id UUID REFERENCES public.practitioners(id),
  room_id UUID REFERENCES public.rooms(id),
  service_id UUID REFERENCES public.services(id),
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  google_event_id TEXT, -- synced calendar event ID
  deposit_paid BOOLEAN DEFAULT false,
  total_amount DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Authenticated staff can view all bookings
CREATE POLICY "Staff can view all bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (true);

-- Admins can manage all bookings
CREATE POLICY "Admins can manage bookings"
  ON public.bookings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Staff can manage bookings for their practitioner
CREATE POLICY "Staff can manage their own bookings"
  ON public.bookings FOR ALL
  TO authenticated
  USING (
    practitioner_id IN (
      SELECT id FROM public.practitioners WHERE user_id = auth.uid()
    )
  );

-- Public can create bookings (for client-facing booking)
CREATE POLICY "Anyone can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (true);

-- Availability blocks (for custom availability)
CREATE TABLE public.availability_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES public.practitioners(id) ON DELETE CASCADE,
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sunday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view availability"
  ON public.availability_blocks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage all availability"
  ON public.availability_blocks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can manage their own availability"
  ON public.availability_blocks FOR ALL
  TO authenticated
  USING (
    practitioner_id IN (
      SELECT id FROM public.practitioners WHERE user_id = auth.uid()
    )
  );

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_practitioners_updated_at
  BEFORE UPDATE ON public.practitioners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();