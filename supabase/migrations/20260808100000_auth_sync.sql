-- Sincroniza auth.users com a tabela public.user (legado Better Auth) para manter FKs existentes.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public."user" (
    id,
    name,
    email,
    "emailVerified",
    must_change_password,
    image,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    NEW.id::text,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    (NEW.email_confirmed_at IS NOT NULL),
    COALESCE((NEW.raw_user_meta_data->>'must_change_password')::boolean, false),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    "emailVerified" = EXCLUDED."emailVerified",
    image = EXCLUDED.image,
    "updatedAt" = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Health check via RPC (usado pelo /api/health)
CREATE OR REPLACE FUNCTION public.health_check()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT true;
$$;

GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated, service_role;
