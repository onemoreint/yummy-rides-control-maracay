-- Supabase concede EXECUTE directamente al rol authenticated: se retira en funciones
-- internas (triggers y helpers) para que no sean invocables vía /rest/v1/rpc.
revoke execute on function
  public.audit_row(), public.drivers_initial_history(), public.drivers_status_guard(),
  public.handle_new_auth_user(), public.users_profiles_guard(), public.setting_bool(text, boolean),
  public.app_current_role(), public.set_actor_columns(), public.documents_before_write(),
  public.drivers_before_write(), public.motorcycles_before_write(), public.set_updated_at()
from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;
