-- =====================================================================
-- Yummy Rides Control Maracay — Migración 2: seguridad
-- Roles, RLS, auditoría automática y funciones RPC controladas.
-- Toda la autorización se decide AQUÍ (servidor), no en la interfaz.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helpers de rol (security definer para evitar recursión de RLS)
-- ---------------------------------------------------------------------
create or replace function public.app_current_role()
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.users_profiles p
  where p.id = auth.uid() and p.active
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles p where p.id = auth.uid() and p.active)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.users_profiles p
                 where p.id = auth.uid() and p.active and p.role = 'admin')
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (s.value #>> '{}')::boolean from public.system_settings s where s.key = p_key), p_default)
$$;

-- ---------------------------------------------------------------------
-- Alta automática de perfil al crear un usuario en Supabase Auth.
-- El rol y el estado SÓLO se leen de app_metadata (que únicamente puede
-- escribir el service role / Edge Function), nunca de user_metadata.
-- Por defecto el perfil queda INACTIVO: sin acceso hasta que un admin lo active.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_role public.app_role := 'operator';
begin
  if (new.raw_app_meta_data ->> 'role') in ('admin', 'operator') then
    v_role := (new.raw_app_meta_data ->> 'role')::public.app_role;
  end if;
  insert into public.users_profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_app_meta_data ->> 'full_name', ''),
    v_role,
    coalesce((new.raw_app_meta_data ->> 'active')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Impide dejar el sistema sin administradores activos y que un usuario
-- se cambie su propio rol.
create or replace function public.users_profiles_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.id = auth.uid() and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'No puede cambiar su propio rol ni desactivarse a sí mismo.' using errcode = '42501';
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if (select count(*) from public.users_profiles where role = 'admin' and active and id <> old.id) = 0 then
      raise exception 'Debe existir al menos un administrador activo.' using errcode = '23514';
    end if;
  end if;
  new.email := old.email; -- el correo sólo se cambia desde Auth
  return new;
end $$;

create trigger trg_users_profiles_guard before update on public.users_profiles
  for each row execute function public.users_profiles_guard();

-- ---------------------------------------------------------------------
-- Autor de cada registro (no confiable si viene del cliente)
-- ---------------------------------------------------------------------
create or replace function public.set_actor_columns()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger trg_drivers_actor before insert or update on public.drivers
  for each row execute function public.set_actor_columns();
create trigger trg_motorcycles_actor before insert or update on public.motorcycles
  for each row execute function public.set_actor_columns();

create or replace function public.documents_before_write()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.uploaded_at := now();
    new.review_status := 'pendiente';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    -- campos inmutables tras la carga
    new.uploaded_by := old.uploaded_by;
    new.uploaded_at := old.uploaded_at;
    new.file_path := old.file_path;
    new.owner_type := old.owner_type;
    new.driver_id := old.driver_id;
    new.motorcycle_id := old.motorcycle_id;
    if new.review_status is distinct from old.review_status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    else
      new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at;
    end if;
  end if;
  return new;
end $$;

create trigger trg_documents_before_write before insert or update on public.documents
  for each row execute function public.documents_before_write();

-- ---------------------------------------------------------------------
-- Auditoría automática
-- ---------------------------------------------------------------------
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) - 'search_text' - 'updated_at' end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) - 'search_text' - 'updated_at' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_driver uuid;
  v_email text;
  v_summary text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new; -- sin cambios reales
  end if;

  v_driver := case tg_table_name
    when 'drivers' then (v_row ->> 'id')::uuid
    else nullif(v_row ->> 'driver_id', '')::uuid
  end;

  select email into v_email from public.users_profiles where id = auth.uid();

  v_summary := case tg_table_name
    when 'drivers' then case tg_op when 'INSERT' then 'Registro de conductor ' else 'Edición de conductor ' end
                        || coalesce(v_row ->> 'code', '')
    when 'motorcycles' then case tg_op when 'INSERT' then 'Registro de motocicleta ' else 'Edición de motocicleta ' end
                        || coalesce(v_row ->> 'plate', '')
    when 'documents' then case tg_op when 'INSERT' then 'Carga de documento '
                                     when 'DELETE' then 'Eliminación de documento '
                                     else 'Actualización de documento ' end || coalesce(v_row ->> 'doc_type', '')
    when 'driver_motorcycle_assignments' then case when tg_op = 'INSERT' then 'Asignación de motocicleta'
                                                   else 'Cierre de asignación de motocicleta' end
    when 'users_profiles' then 'Cambio en usuario ' || coalesce(v_row ->> 'email', '')
    when 'system_settings' then 'Cambio de configuración ' || coalesce(v_row ->> 'key', '')
    when 'document_types' then 'Cambio en tipo de documento ' || coalesce(v_row ->> 'key', '')
    else tg_table_name
  end;

  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, driver_id, summary, old_data, new_data)
  values (auth.uid(), v_email, tg_op, tg_table_name,
          nullif(v_row ->> 'id', '')::uuid, v_driver, v_summary, v_old, v_new);
  return coalesce(new, old);
end $$;

create trigger trg_audit_drivers after insert or update or delete on public.drivers
  for each row execute function public.audit_row();
create trigger trg_audit_motorcycles after insert or update or delete on public.motorcycles
  for each row execute function public.audit_row();
create trigger trg_audit_documents after insert or update or delete on public.documents
  for each row execute function public.audit_row();
create trigger trg_audit_assignments after insert or update on public.driver_motorcycle_assignments
  for each row execute function public.audit_row();
create trigger trg_audit_users after update on public.users_profiles
  for each row execute function public.audit_row();
create trigger trg_audit_settings after insert or update or delete on public.system_settings
  for each row execute function public.audit_row();
-- document_types usa "key" como PK (no uuid), se registra sin record_id
create trigger trg_audit_doc_types after insert or update or delete on public.document_types
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Control del estado de afiliación: sólo cambia por la RPC, que
-- obliga a dejar historial. Un UPDATE directo del campo status falla.
-- ---------------------------------------------------------------------
create or replace function public.drivers_status_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.status := 'pendiente';
    end if;
  elsif new.status is distinct from old.status
        and coalesce(current_setting('yummy.status_rpc', true), '') <> 'on' then
    raise exception 'El estado de afiliación sólo puede cambiarse desde "Cambiar estado" (queda registrado en el historial).'
      using errcode = '42501';
  end if;
  return new;
end $$;

create trigger trg_drivers_status_guard before insert or update on public.drivers
  for each row execute function public.drivers_status_guard();

create or replace function public.drivers_initial_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.affiliation_history (driver_id, previous_status, new_status, effective_date, reason,
                                          changed_by, changed_by_name)
  values (new.id, null, new.status, coalesce(new.join_date, current_date), 'Registro inicial',
          auth.uid(), (select full_name from public.users_profiles where id = auth.uid()));
  return new;
end $$;

create trigger trg_drivers_initial_history after insert on public.drivers
  for each row execute function public.drivers_initial_history();

create or replace function public.change_driver_status(
  p_driver_id uuid,
  p_new_status public.affiliation_status,
  p_reason text default null,
  p_notes text default null,
  p_effective_date date default current_date
) returns public.affiliation_history
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.affiliation_status;
  v_draft boolean;
  v_hist public.affiliation_history;
begin
  if not (public.is_admin() or (public.is_staff() and public.setting_bool('operator_can_change_status', false))) then
    raise exception 'No tiene permiso para cambiar estados de afiliación.' using errcode = '42501';
  end if;

  select status, is_draft into v_old, v_draft from public.drivers where id = p_driver_id for update;
  if not found then
    raise exception 'Conductor no encontrado.' using errcode = 'P0002';
  end if;
  if v_draft then
    raise exception 'Complete el registro (borrador) antes de cambiar su estado.' using errcode = '23514';
  end if;
  if v_old = p_new_status then
    raise exception 'El conductor ya tiene el estado "%".', p_new_status using errcode = '23514';
  end if;
  if p_new_status in ('suspendido', 'retirado') and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Debe indicar el motivo de la suspensión o retiro.' using errcode = '23514';
  end if;
  if p_effective_date is null or p_effective_date > current_date + 30 then
    raise exception 'Fecha efectiva no válida.' using errcode = '22007';
  end if;

  perform set_config('yummy.status_rpc', 'on', true);
  update public.drivers set status = p_new_status where id = p_driver_id;
  perform set_config('yummy.status_rpc', 'off', true);

  insert into public.affiliation_history (driver_id, previous_status, new_status, effective_date,
                                          reason, notes, changed_by, changed_by_name)
  values (p_driver_id, v_old, p_new_status, p_effective_date, nullif(trim(p_reason), ''),
          nullif(trim(p_notes), ''), auth.uid(),
          (select full_name from public.users_profiles where id = auth.uid()))
  returning * into v_hist;

  -- Al retirar, se cierra (no se borra) la asignación de moto vigente
  if p_new_status = 'retirado' then
    update public.driver_motorcycle_assignments
       set is_current = false, end_date = greatest(start_date, p_effective_date),
           end_reason = 'Retiro del conductor'
     where driver_id = p_driver_id and is_current;
  end if;

  insert into public.audit_logs (actor_id, actor_email, action, table_name, record_id, driver_id, summary, old_data, new_data)
  values (auth.uid(), (select email from public.users_profiles where id = auth.uid()), 'STATUS_CHANGE',
          'drivers', p_driver_id, p_driver_id,
          'Cambio de estado: ' || v_old || ' → ' || p_new_status,
          jsonb_build_object('status', v_old),
          jsonb_build_object('status', p_new_status, 'reason', p_reason, 'notes', p_notes,
                             'effective_date', p_effective_date));
  return v_hist;
end $$;

-- ---------------------------------------------------------------------
-- Asignación de motocicletas (sólo por RPC; conserva historial)
-- ---------------------------------------------------------------------
create or replace function public.assign_motorcycle(
  p_driver_id uuid,
  p_motorcycle_id uuid,
  p_start_date date default current_date,
  p_notes text default null
) returns public.driver_motorcycle_assignments
language plpgsql security definer set search_path = '' as $$
declare
  v_other uuid;
  v_status public.affiliation_status;
  v_row public.driver_motorcycle_assignments;
begin
  if not public.is_staff() then
    raise exception 'Sesión no autorizada.' using errcode = '42501';
  end if;

  select status into v_status from public.drivers where id = p_driver_id for update;
  if not found then raise exception 'Conductor no encontrado.' using errcode = 'P0002'; end if;
  if v_status = 'retirado' then
    raise exception 'No se puede asignar motocicleta a un conductor retirado.' using errcode = '23514';
  end if;
  perform 1 from public.motorcycles where id = p_motorcycle_id for update;
  if not found then raise exception 'Motocicleta no encontrada.' using errcode = 'P0002'; end if;

  select driver_id into v_other from public.driver_motorcycle_assignments
   where motorcycle_id = p_motorcycle_id and is_current;
  if v_other = p_driver_id then
    raise exception 'Esa motocicleta ya es la actual de este conductor.' using errcode = '23514';
  elsif v_other is not null then
    raise exception 'La motocicleta está asignada actualmente a otro conductor. Libérela primero.'
      using errcode = '23505';
  end if;

  update public.driver_motorcycle_assignments
     set is_current = false, end_date = greatest(start_date, coalesce(p_start_date, current_date)),
         end_reason = 'Cambio de motocicleta'
   where driver_id = p_driver_id and is_current;

  insert into public.driver_motorcycle_assignments (driver_id, motorcycle_id, start_date, notes, assigned_by, is_current)
  values (p_driver_id, p_motorcycle_id, coalesce(p_start_date, current_date), nullif(trim(p_notes), ''), auth.uid(), true)
  returning * into v_row;
  return v_row;
end $$;

create or replace function public.end_assignment(p_assignment_id uuid, p_reason text default null,
                                                 p_end_date date default current_date)
returns public.driver_motorcycle_assignments
language plpgsql security definer set search_path = '' as $$
declare v_row public.driver_motorcycle_assignments;
begin
  if not public.is_staff() then
    raise exception 'Sesión no autorizada.' using errcode = '42501';
  end if;
  update public.driver_motorcycle_assignments
     set is_current = false, end_date = greatest(start_date, coalesce(p_end_date, current_date)),
         end_reason = coalesce(nullif(trim(p_reason), ''), 'Liberada')
   where id = p_assignment_id and is_current
  returning * into v_row;
  if not found then raise exception 'Asignación no encontrada o ya cerrada.' using errcode = 'P0002'; end if;
  return v_row;
end $$;

-- ---------------------------------------------------------------------
-- Eventos de auditoría generados por el cliente (lista cerrada)
-- ---------------------------------------------------------------------
create or replace function public.log_event(p_action text, p_summary text, p_driver_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Sesión no autorizada.' using errcode = '42501';
  end if;
  if p_action not in ('LOGIN', 'LOGOUT', 'EXPORT', 'PRINT', 'DOWNLOAD', 'VIEW_DOCUMENT') then
    raise exception 'Acción de auditoría no permitida.' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, actor_email, action, table_name, driver_id, summary)
  values (auth.uid(), (select email from public.users_profiles where id = auth.uid()),
          p_action, 'app', p_driver_id, left(coalesce(p_summary, ''), 300));
end $$;

-- ---------------------------------------------------------------------
-- Dashboard: indicadores calculados desde datos reales
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.is_staff() then
    raise exception 'Sesión no autorizada.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'drivers_total',      (select count(*) from public.drivers where not is_draft),
    'drivers_activo',     (select count(*) from public.drivers where not is_draft and status = 'activo'),
    'drivers_pendiente',  (select count(*) from public.drivers where not is_draft and status = 'pendiente'),
    'drivers_suspendido', (select count(*) from public.drivers where not is_draft and status = 'suspendido'),
    'drivers_retirado',   (select count(*) from public.drivers where not is_draft and status = 'retirado'),
    'drivers_borrador',   (select count(*) from public.drivers where is_draft),
    'motorcycles_total',  (select count(*) from public.motorcycles),
    'docs_pending_review',(select count(*) from public.documents where review_status = 'pendiente'),
    'docs_expiring_30',   (select count(*) from public.documents
                            where expiry_date is not null and expiry_date between current_date and current_date + 30),
    'docs_expired',       (select count(*) from public.documents
                            where expiry_date is not null and expiry_date < current_date)
  ) into v;
  return v;
end $$;

-- Vista de alertas de vencimiento (respeta RLS del usuario que consulta)
create or replace view public.document_alerts
with (security_invoker = true) as
select d.id, d.owner_type, d.driver_id, d.motorcycle_id, d.doc_type, t.label as doc_label,
       d.expiry_date, (d.expiry_date - current_date) as days_left,
       case
         when d.expiry_date < current_date then 'vencido'
         when d.expiry_date <= current_date + 7 then '7'
         when d.expiry_date <= current_date + 15 then '15'
         else '30'
       end as alert_level,
       coalesce(dr.first_name || ' ' || dr.last_name, null) as driver_name,
       dr.code as driver_code,
       m.plate as motorcycle_plate
  from public.documents d
  join public.document_types t on t.key = d.doc_type
  left join public.drivers dr on dr.id = d.driver_id
  left join public.motorcycles m on m.id = d.motorcycle_id
 where d.expiry_date is not null and d.expiry_date <= current_date + 30;

-- Vista: moto actual por conductor (para tablas y reportes)
create or replace view public.driver_current_motorcycle
with (security_invoker = true) as
select a.driver_id, a.id as assignment_id, a.start_date, m.id as motorcycle_id, m.code as motorcycle_code,
       m.plate, m.brand, m.model, m.color, m.year
  from public.driver_motorcycle_assignments a
  join public.motorcycles m on m.id = a.motorcycle_id
 where a.is_current;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.users_profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.motorcycles enable row level security;
alter table public.driver_motorcycle_assignments enable row level security;
alter table public.document_types enable row level security;
alter table public.documents enable row level security;
alter table public.affiliation_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;

-- users_profiles
create policy "perfil propio o admin" on public.users_profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "admin actualiza perfiles" on public.users_profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- (sin INSERT ni DELETE: los perfiles los crea el trigger de Auth)

-- drivers (nadie borra: se desactivan)
create policy "staff lee conductores" on public.drivers
  for select to authenticated using (public.is_staff());
create policy "staff registra conductores" on public.drivers
  for insert to authenticated with check (public.is_staff());
create policy "staff edita conductores" on public.drivers
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- motorcycles
create policy "staff lee motos" on public.motorcycles
  for select to authenticated using (public.is_staff());
create policy "staff registra motos" on public.motorcycles
  for insert to authenticated with check (public.is_staff());
create policy "staff edita motos" on public.motorcycles
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- assignments: sólo lectura directa; escritura únicamente por RPC
create policy "staff lee asignaciones" on public.driver_motorcycle_assignments
  for select to authenticated using (public.is_staff());

-- document_types
create policy "staff lee tipos" on public.document_types
  for select to authenticated using (public.is_staff());
create policy "admin gestiona tipos" on public.document_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- documents
create policy "staff lee documentos" on public.documents
  for select to authenticated using (public.is_staff());
create policy "staff carga documentos" on public.documents
  for insert to authenticated with check (public.is_staff());
create policy "staff actualiza documentos" on public.documents
  for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "admin elimina documentos" on public.documents
  for delete to authenticated using (public.is_admin());

-- affiliation_history: sólo lectura (escritura por RPC/trigger)
create policy "staff lee historial afiliacion" on public.affiliation_history
  for select to authenticated using (public.is_staff());

-- audit_logs: sólo lectura; nadie puede editar ni borrar
create policy "staff lee auditoria" on public.audit_logs
  for select to authenticated using (public.is_staff());

-- system_settings
create policy "staff lee configuracion" on public.system_settings
  for select to authenticated using (public.is_staff());
create policy "admin gestiona configuracion" on public.system_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Privilegios: anon no tiene nada; authenticated limitado por RLS
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke insert, update, delete on public.driver_motorcycle_assignments from authenticated;
revoke insert, update, delete on public.affiliation_history from authenticated;
revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke insert, delete on public.users_profiles from authenticated;
revoke delete, truncate on public.drivers, public.motorcycles from authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.app_current_role(), public.is_staff(), public.is_admin(),
  public.change_driver_status(uuid, public.affiliation_status, text, text, date),
  public.assign_motorcycle(uuid, uuid, date, text),
  public.end_assignment(uuid, text, date),
  public.log_event(text, text, uuid),
  public.dashboard_stats()
to authenticated;
