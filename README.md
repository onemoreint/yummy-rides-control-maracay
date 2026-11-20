# Yummy Rides Control Maracay

Microapp administrativa privada para gestionar a los **conductores (motorizados)** y las **motocicletas** afiliados a la línea Yummy Rides en Maracay, estado Aragua, Venezuela.

**App publicada:** https://onemoreint.github.io/yummy-rides-control-maracay/ · **Supabase:** proyecto `asiceegyludqcfpqdkkh` (sa-east-1)

> Alcance v1: sólo administración. **No** incluye asignación de carreras, GPS, pagos, tarifas ni pasajeros.

## Funciones

| Módulo | Qué hace |
|---|---|
| **Conductores** | Asistente de 5 pasos (personales → contacto → moto → documentos → revisión), borradores que se retoman luego, código automático `YR-0001`, cédula V/E única, búsqueda por nombre/cédula/código, filtros por estado |
| **Motocicletas** | Código `MT-0001`, placa única (normalizada), 3 fotos, propietario independiente del conductor, historial de asignaciones, cambio de moto sin perder registros |
| **Documentos** | Tipos configurables, foto con cámara o PDF, vencimiento **opcional**, revisión (aprobado / pendiente / observado), alertas a 30, 15 y 7 días, descargas con URL firmada temporal |
| **Expediente digital** | Ficha completa con fotos, motos, documentos, afiliación e historial de modificaciones; imprimir y exportar PDF institucional con el logo Yummy |
| **Afiliaciones** | Activo / pendiente / suspendido / retirado, con fecha, motivo, responsable y observaciones; historial inalterable |
| **Panel** | Indicadores calculados en el servidor, buscador general, conductores recientes, vencimientos, actividad reciente |
| **Reportes** | 8 reportes, selección de columnas (datos personales desmarcados por defecto), exportación a Excel, PDF y CSV |
| **Usuarios y auditoría** | Roles administrador / operador, alta de usuarios sólo por el administrador, registro de auditoría automático |

## Tecnología

React 18 + TypeScript + Vite · Tailwind CSS · Lucide · React Hook Form + Zod · PWA instalable · Supabase (Auth, PostgreSQL con RLS, Storage privado, Edge Function).

## Seguridad (resumen)

- **RLS en todas las tablas.** La autorización la decide PostgreSQL con `is_staff()` / `is_admin()`; ocultar botones en la interfaz es sólo comodidad.
- **Usuarios inactivos o sin sesión no ven nada.** El rol `anon` no tiene permisos sobre ninguna tabla.
- **Sin registro público.** Las cuentas se crean desde la Edge Function `admin-users`, que verifica que quien llama es administrador. El rol se guarda en `app_metadata`, que el usuario no puede modificar.
- **Nadie borra conductores ni motos**, sólo se desactivan. El historial de afiliación y la auditoría no pueden editarse ni borrarse desde la API.
- **El estado de afiliación sólo cambia mediante `change_driver_status()`**, que exige motivo para suspensiones o retiros y escribe el historial. Un `UPDATE` directo del estado es rechazado.
- **La asignación de motos sólo se hace con `assign_motorcycle()` / `end_assignment()`.** Índices únicos garantizan una sola moto vigente por conductor y un solo conductor por moto.
- **Storage privado** (`yummy-private`, máximo 10 MB, sólo PDF/JPG/PNG/WEBP). Los archivos se ven con URL firmada de 5 minutos.
- **La PWA no guarda en caché datos ni documentos**, sólo la aplicación.
- **La clave `service_role` nunca está en el frontend.** Sólo la usa la Edge Function en el servidor.

Detalle en [`docs/SEGURIDAD.md`](docs/SEGURIDAD.md).

## Estructura

```
├── public/                    logo Yummy original e íconos PWA
├── src/
│   ├── auth/                  sesión y perfil
│   ├── components/            UI, layout, editor de motos, documentos, fotos
│   ├── lib/                   cliente Supabase, validaciones, exportadores, PDF
│   └── pages/                 panel, conductores, asistente, expediente, motos,
│                              documentos, reportes, usuarios, auditoría, configuración
├── supabase/
│   ├── migrations/            001 esquema · 002 seguridad/RLS/RPC · 003 storage y datos base
│   └── functions/admin-users/ alta y gestión de usuarios (Edge Function)
├── scripts/backup.sh          respaldo de base de datos y archivos
└── docs/                      administrador inicial, respaldo, seguridad
```

## Instalación local

Requisitos: Node 20+ y un proyecto de Supabase.

```bash
npm install
cp .env.example .env.local      # complete URL y clave publicable (anon)
npm run dev                     # http://localhost:5173
```

Sin `.env.local` la app muestra una pantalla de “Falta conectar la base de datos”. **Nunca simula datos.**

## Conectar Supabase (una sola vez)

1. **Crear el proyecto** en [supabase.com](https://supabase.com), en la región `sa-east-1` (São Paulo), la más cercana a Venezuela.
2. **Aplicar las migraciones** en este orden. Puede pegarlas en SQL Editor o usar el CLI:
   ```bash
   npx supabase link --project-ref <REF>
   npx supabase db push
   ```
3. **Desactivar el registro público:** Authentication → Sign In / Providers → desactive *Allow new users to sign up*.
4. **Desplegar la Edge Function:**
   ```bash
   npx supabase functions deploy admin-users
   # Opcional: restringir CORS al dominio publicado
   npx supabase secrets set ALLOWED_ORIGINS=https://<usuario>.github.io
   ```
5. **Crear el primer administrador** siguiendo [`docs/bootstrap-admin.sql`](docs/bootstrap-admin.sql).
6. **Copiar URL y clave publicable** (Project Settings → API) en `.env.local`.

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `VITE_SUPABASE_URL` | frontend | URL del proyecto (pública) |
| `VITE_SUPABASE_ANON_KEY` | frontend | Clave publicable / anon (pública; la seguridad la da RLS) |
| `VITE_BASE_PATH` | frontend | `/` en local; `/yummy-rides-control-maracay/` en GitHub Pages |
| `ALLOWED_ORIGINS` | secreto de la Edge Function | Orígenes permitidos para CORS, separados por coma |
| `SUPABASE_SERVICE_ROLE_KEY` | automática en Edge Functions | **Nunca** se coloca en el frontend ni en el repositorio |

## Despliegue en GitHub Pages

1. Suba el repositorio `yummy-rides-control-maracay` a GitHub.
2. En **Settings → Secrets and variables → Actions** cree `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. En **Settings → Pages → Source** elija **GitHub Actions**.
4. Cada `push` a `main` publica en `https://<usuario>.github.io/yummy-rides-control-maracay/`.
5. En Supabase → Authentication → URL Configuration, agregue esa URL como *Site URL*.

La app usa rutas con `#` (HashRouter), así que funciona en Pages sin configuración extra. El frontend es público, pero **los datos y documentos permanecen en Supabase** con control de acceso.

## Respaldo y recuperación

Ver [`docs/RESPALDO.md`](docs/RESPALDO.md). Resumen: `./scripts/backup.sh` genera un archivo cifrado con el esquema, los datos y los archivos privados. Nunca lo suba al repositorio (`backups/` está en `.gitignore`).

## Criterios de aceptación del MVP

| # | Criterio | Cómo se garantiza |
|---|---|---|
| 1 | Admin inicia sesión | Supabase Auth + perfil activo |
| 2–4 | Registrar, persistir, editar y buscar | Asistente + `drivers` + `search_text` con índice trigram |
| 5 | Cédula no duplicada | `unique (id_prefix, id_number)` |
| 6–7 | Moto asociada y cambio con historial | `assign_motorcycle()` + índices únicos parciales |
| 8 | Documentos privados | Bucket privado + URL firmada |
| 9 | Cambio de afiliación | `change_driver_status()` + `affiliation_history` |
| 10 | Auditoría | Triggers `audit_row()` + `log_event()` |
| 11 | Reportes reales | Consultas directas y exportación XLSX, PDF y CSV |
| 12 | Operador sin funciones de admin | RLS + RPC verifican el rol en el servidor |
| 13 | Sin sesión no hay expedientes | `anon` sin permisos; RLS exige perfil activo |
| 14 | Móvil | Diseño mobile-first, navegación inferior, cámara |
| 15 | Persistencia tras cerrar sesión | Todo vive en PostgreSQL / Storage |
