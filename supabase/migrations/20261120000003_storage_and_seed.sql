-- =====================================================================
-- Yummy Rides Control Maracay — Migración 3: almacenamiento privado y datos base
-- =====================================================================

-- Bucket PRIVADO: los archivos sólo se leen con URL firmada temporal.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('yummy-private', 'yummy-private', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Estructura de rutas:
--   drivers/<driver_id>/photo/<archivo>
--   drivers/<driver_id>/docs/<archivo>
--   motorcycles/<moto_id>/photos/<archivo>
--   motorcycles/<moto_id>/docs/<archivo>
create policy "staff lee archivos privados" on storage.objects
  for select to authenticated
  using (bucket_id = 'yummy-private' and (select public.is_staff()));

create policy "staff sube archivos privados" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'yummy-private' and (select public.is_staff())
              and (storage.foldername(name))[1] in ('drivers', 'motorcycles'));

create policy "staff reemplaza archivos privados" on storage.objects
  for update to authenticated
  using (bucket_id = 'yummy-private' and (select public.is_staff()))
  with check (bucket_id = 'yummy-private' and (select public.is_staff()));

create policy "admin elimina archivos privados" on storage.objects
  for delete to authenticated
  using (bucket_id = 'yummy-private' and (select public.is_admin()));

-- ---------------------------------------------------------------------
-- Tipos de documento iniciales (configurables desde la app)
-- ---------------------------------------------------------------------
insert into public.document_types (key, label, applies_to, has_expiry, sort_order) values
  ('cedula',            'Cédula de identidad',              'driver',     false, 10),
  ('licencia',          'Licencia de conducir',             'driver',     true,  20),
  ('certificado_medico','Certificado médico',               'driver',     true,  30),
  ('otro_conductor',    'Otro documento del conductor',     'driver',     false, 90),
  ('titulo_propiedad',  'Documento de propiedad del vehículo','motorcycle', false, 10),
  ('carnet_circulacion','Carnet de circulación',            'motorcycle', false, 20),
  ('seguro',            'Seguro (RCV)',                     'motorcycle', true,  30),
  ('autorizacion_uso',  'Autorización del propietario',     'motorcycle', false, 40),
  ('otro_moto',         'Otro documento de la motocicleta', 'motorcycle', false, 90)
on conflict (key) do nothing;

insert into public.system_settings (key, value, description) values
  ('operator_can_change_status', 'false'::jsonb,
   'Permite que los operadores cambien el estado de afiliación'),
  ('expiry_alert_days', '[30, 15, 7]'::jsonb,
   'Días de anticipación para alertas de vencimiento'),
  ('organization_name', '"Yummy Rides Maracay"'::jsonb, 'Nombre institucional en fichas y reportes'),
  ('default_state', '"Aragua"'::jsonb, 'Estado por defecto en el formulario')
on conflict (key) do nothing;
