-- Endurece los privilegios de las funciones SECURITY DEFINER.
--
-- Postgres concede EXECUTE a PUBLIC por defecto, y PostgREST expone las funciones del
-- esquema public como /rest/v1/rpc/*. Revocar sólo a `anon` no basta: hay que revocar a PUBLIC.
--
-- - handle_new_user: sólo la ejecuta el trigger sobre auth.users; nadie debe llamarla por la API.
-- - is_org_member / project_org / study_org: las usan las políticas RLS, así que los usuarios
--   con sesión (authenticated) conservan EXECUTE; `anon` no tiene políticas y no las necesita.
--   El aviso del linter "authenticated_security_definer_function_executable" sobre estas tres
--   es esperado e intencional.

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.project_org(uuid) from public, anon;
revoke execute on function public.study_org(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.project_org(uuid) to authenticated, service_role;
grant execute on function public.study_org(uuid) to authenticated, service_role;

alter function public.touch_updated_at() set search_path = public;
