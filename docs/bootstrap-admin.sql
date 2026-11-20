-- Crear el PRIMER administrador principal (se hace una sola vez).
-- 1) En Supabase: Authentication → Users → "Add user" → "Create new user"
--    con su correo y una contraseña robusta (marque "Auto Confirm User").
-- 2) Ejecute esto en SQL Editor reemplazando el correo:
update public.users_profiles
   set role = 'admin', active = true, full_name = 'Nombre del Administrador'
 where email = 'correo-del-admin@ejemplo.com';
-- Verificación:
select email, role, active from public.users_profiles;
-- A partir de aquí, los demás usuarios se crean desde la app (menú Usuarios).
