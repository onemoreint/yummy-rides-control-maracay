-- =====================================================================
-- Yummy Rides Control Maracay — Migración 1: esquema base
-- Tablas, tipos, secuencias, restricciones e índices.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos enumerados
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'operator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.affiliation_status as enum ('activo', 'pendiente', 'suspendido', 'retirado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_status as enum ('pendiente', 'aprobado', 'observado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.doc_owner as enum ('driver', 'motorcycle');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Función genérica updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- users_profiles: perfil y rol de cada usuario de Supabase Auth.
-- Las contraseñas las gestiona Supabase Auth; aquí NO se guardan.
-- ---------------------------------------------------------------------
create table if not exists public.users_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null default '',
  role        public.app_role not null default 'operator',
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger trg_users_profiles_updated before update on public.users_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- drivers: conductores afiliados
-- ---------------------------------------------------------------------
create sequence if not exists public.driver_code_seq start 1;

create table if not exists public.drivers (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique
                          default ('YR-' || lpad(nextval('public.driver_code_seq')::text, 4, '0')),
  first_name              text not null check (length(trim(first_name)) > 0),
  middle_name             text,
  last_name               text not null check (length(trim(last_name)) > 0),
  second_last_name        text,
  id_prefix               char(1) not null check (id_prefix in ('V', 'E')),
  id_number               text not null check (id_number ~ '^[0-9]{5,10}$'),
  birth_date              date check (birth_date is null or birth_date > date '1900-01-01'),
  phone                   text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  whatsapp                text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{7,15}$'),
  address                 text,
  municipality            text,
  parish                  text,
  state                   text default 'Aragua',
  photo_path              text,
  emergency_name          text,
  emergency_relationship  text,
  emergency_phone         text check (emergency_phone is null or emergency_phone ~ '^\+?[0-9]{7,15}$'),
  join_date               date,
  status                  public.affiliation_status not null default 'pendiente',
  is_draft                boolean not null default false,
  draft_step              smallint,
  internal_notes          text,
  search_text             text,
  created_by              uuid references public.users_profiles(id) on delete set null,
  updated_by              uuid references public.users_profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint drivers_cedula_unique unique (id_prefix, id_number),
  -- Un registro completo (no borrador) debe tener los obligatorios
  constraint drivers_complete_when_not_draft check (
    is_draft or (phone is not null and address is not null and municipality is not null
                 and parish is not null and state is not null and join_date is not null)
  )
);

create index if not exists drivers_status_idx on public.drivers (status) where not is_draft;
create index if not exists drivers_draft_idx on public.drivers (is_draft);
create index if not exists drivers_join_date_idx on public.drivers (join_date);
create index if not exists drivers_search_trgm on public.drivers using gin (search_text extensions.gin_trgm_ops);
create index if not exists drivers_id_number_idx on public.drivers (id_number);

create or replace function public.drivers_before_write()
returns trigger language plpgsql as $$
begin
  new.first_name := initcap(trim(new.first_name));
  new.last_name  := initcap(trim(new.last_name));
  new.middle_name := nullif(initcap(trim(coalesce(new.middle_name, ''))), '');
  new.second_last_name := nullif(initcap(trim(coalesce(new.second_last_name, ''))), '');
  new.id_number := regexp_replace(coalesce(new.id_number, ''), '[^0-9]', '', 'g');
  new.search_text := lower(extensions.unaccent(concat_ws(' ',
      new.code, new.first_name, new.middle_name, new.last_name, new.second_last_name,
      new.id_prefix || new.id_number, new.id_prefix || '-' || new.id_number, new.id_number,
      new.phone, new.whatsapp)));
  if not new.is_draft then new.draft_step := null; end if;
  return new;
end $$;

create trigger trg_drivers_before_write before insert or update on public.drivers
  for each row execute function public.drivers_before_write();
create trigger trg_drivers_updated before update on public.drivers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- motorcycles
-- ---------------------------------------------------------------------
create sequence if not exists public.moto_code_seq start 1;

create table if not exists public.motorcycles (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique
                    default ('MT-' || lpad(nextval('public.moto_code_seq')::text, 4, '0')),
  brand             text not null check (length(trim(brand)) > 0),
  model             text not null check (length(trim(model)) > 0),
  year              smallint check (year is null or year between 1950 and 2100),
  color             text,
  plate             text not null check (plate ~ '^[A-Z0-9]{4,10}$'),
  chassis_serial    text,
  engine_serial     text,
  displacement_cc   smallint check (displacement_cc is null or displacement_cc between 25 and 3000),
  owner_name        text not null,
  owner_id_doc      text,
  photo_front_path  text,
  photo_side_path   text,
  photo_plate_path  text,
  notes             text,
  search_text       text,
  created_by        uuid references public.users_profiles(id) on delete set null,
  updated_by        uuid references public.users_profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint motorcycles_plate_unique unique (plate)
);

create unique index if not exists motorcycles_chassis_unique
  on public.motorcycles (chassis_serial) where chassis_serial is not null;
create index if not exists motorcycles_search_trgm on public.motorcycles using gin (search_text extensions.gin_trgm_ops);

create or replace function public.motorcycles_before_write()
returns trigger language plpgsql as $$
begin
  -- Placa normalizada: mayúsculas, sin espacios ni guiones (evita duplicados disfrazados)
  new.plate := upper(regexp_replace(coalesce(new.plate, ''), '[^A-Za-z0-9]', '', 'g'));
  new.brand := trim(new.brand);
  new.model := trim(new.model);
  new.chassis_serial := nullif(upper(trim(coalesce(new.chassis_serial, ''))), '');
  new.engine_serial  := nullif(upper(trim(coalesce(new.engine_serial, ''))), '');
  new.search_text := lower(extensions.unaccent(concat_ws(' ', new.code, new.plate, new.brand, new.model,
      new.color, new.owner_name, new.chassis_serial)));
  return new;
end $$;

create trigger trg_motorcycles_before_write before insert or update on public.motorcycles
  for each row execute function public.motorcycles_before_write();
create trigger trg_motorcycles_updated before update on public.motorcycles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- driver_motorcycle_assignments: historial de asignaciones
-- ---------------------------------------------------------------------
create table if not exists public.driver_motorcycle_assignments (
  id             uuid primary key default gen_random_uuid(),
  driver_id      uuid not null references public.drivers(id) on delete restrict,
  motorcycle_id  uuid not null references public.motorcycles(id) on delete restrict,
  start_date     date not null default current_date,
  end_date       date,
  is_current     boolean not null default true,
  notes          text,
  end_reason     text,
  assigned_by    uuid references public.users_profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint assignment_dates_ok check (end_date is null or end_date >= start_date),
  constraint assignment_current_open check (not is_current or end_date is null)
);
-- Un conductor sólo puede tener UNA moto actual y una moto sólo UN conductor actual
create unique index if not exists assignments_one_current_per_driver
  on public.driver_motorcycle_assignments (driver_id) where is_current;
create unique index if not exists assignments_one_current_per_moto
  on public.driver_motorcycle_assignments (motorcycle_id) where is_current;
create index if not exists assignments_driver_idx on public.driver_motorcycle_assignments (driver_id, start_date desc);
create index if not exists assignments_moto_idx on public.driver_motorcycle_assignments (motorcycle_id, start_date desc);

-- ---------------------------------------------------------------------
-- document_types: tipos configurables por el administrador
-- ---------------------------------------------------------------------
create table if not exists public.document_types (
  key            text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  label          text not null,
  applies_to     public.doc_owner not null,
  has_expiry     boolean not null default false,
  active         boolean not null default true,
  sort_order     smallint not null default 100,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  owner_type      public.doc_owner not null,
  driver_id       uuid references public.drivers(id) on delete restrict,
  motorcycle_id   uuid references public.motorcycles(id) on delete restrict,
  doc_type        text not null references public.document_types(key) on update cascade,
  file_path       text not null unique,
  file_name       text not null,
  mime_type       text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  size_bytes      integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  issue_date      date,
  expiry_date     date,
  review_status   public.review_status not null default 'pendiente',
  notes           text,
  uploaded_by     uuid references public.users_profiles(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  reviewed_by     uuid references public.users_profiles(id) on delete set null,
  reviewed_at     timestamptz,
  updated_at      timestamptz not null default now(),
  constraint documents_owner_ok check (
    (owner_type = 'driver' and driver_id is not null and motorcycle_id is null) or
    (owner_type = 'motorcycle' and motorcycle_id is not null and driver_id is null)
  ),
  constraint documents_dates_ok check (issue_date is null or expiry_date is null or expiry_date >= issue_date)
);
create index if not exists documents_driver_idx on public.documents (driver_id);
create index if not exists documents_moto_idx on public.documents (motorcycle_id);
create index if not exists documents_expiry_idx on public.documents (expiry_date) where expiry_date is not null;
create index if not exists documents_review_idx on public.documents (review_status);
create trigger trg_documents_updated before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- affiliation_history: historial de estados de afiliación
-- ---------------------------------------------------------------------
create table if not exists public.affiliation_history (
  id              uuid primary key default gen_random_uuid(),
  driver_id       uuid not null references public.drivers(id) on delete restrict,
  previous_status public.affiliation_status,
  new_status      public.affiliation_status not null,
  effective_date  date not null default current_date,
  reason          text,
  notes           text,
  changed_by      uuid references public.users_profiles(id) on delete set null,
  changed_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists affiliation_driver_idx on public.affiliation_history (driver_id, created_at desc);

-- ---------------------------------------------------------------------
-- audit_logs: registro de auditoría (sólo lo escriben triggers)
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid,
  actor_email  text,
  action       text not null,          -- INSERT / UPDATE / DELETE / STATUS_CHANGE / ASSIGN / LOGIN ...
  table_name   text not null,
  record_id    uuid,
  driver_id    uuid,                    -- para mostrar el historial en el expediente
  summary      text,
  old_data     jsonb,
  new_data     jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_driver_idx on public.audit_logs (driver_id, created_at desc);
create index if not exists audit_record_idx on public.audit_logs (table_name, record_id);

-- ---------------------------------------------------------------------
-- system_settings: configuración clave/valor
-- ---------------------------------------------------------------------
create table if not exists public.system_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.users_profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create trigger trg_settings_updated before update on public.system_settings
  for each row execute function public.set_updated_at();
