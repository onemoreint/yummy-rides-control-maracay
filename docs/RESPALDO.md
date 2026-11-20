# Procedimiento de respaldo y recuperación

Los respaldos contienen **datos personales** de conductores (cédulas, teléfonos, direcciones, fotos y documentos). Trátelos como información confidencial.

## Qué se respalda

| Elemento | Contenido | Herramienta |
|---|---|---|
| Esquema | Tablas, funciones, triggers, políticas RLS | `supabase db dump` |
| Datos | Conductores, motos, asignaciones, documentos (metadatos), historial, auditoría | `supabase db dump --data-only` |
| Archivos | Fotos y documentos del bucket `yummy-private` | `supabase storage cp` |

> El código fuente y las migraciones viven en GitHub. Las cuentas de usuario (`auth.users`) están en la base de datos y se respaldan con el dump completo de Supabase (ver la opción B).

## Frecuencia recomendada

- **Semanal:** `./scripts/backup.sh`, guardado en un disco o nube privada **cifrada**.
- **Antes de cualquier migración** o cambio importante: un respaldo manual.
- Conserve al menos las últimas 4 copias semanales y 3 mensuales.
- Una vez al trimestre, **pruebe la restauración** en un proyecto de Supabase de prueba.

En planes pagos, Supabase ofrece respaldos diarios automáticos y PITR (Database → Backups). En el plan gratuito **no hay respaldos descargables automáticos**: por eso el script es obligatorio.

## Opción A: script incluido

```bash
export SUPABASE_DB_URL="postgresql://postgres.<ref>:<clave>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
npx supabase login
npx supabase link --project-ref <ref>
./scripts/backup.sh
```

Resultado: `backups/AAAAMMDD-HHMM.tar.gz.gpg`, cifrado con la frase que usted indique. **Guarde esa frase en un lugar seguro: sin ella no se puede restaurar.**

## Opción B: respaldo completo con roles y Auth

```bash
npx supabase db dump --db-url "$SUPABASE_DB_URL" --role-only -f roles.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f schema.sql
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f data.sql
```

## Restauración

1. Cree un proyecto nuevo de Supabase (o use uno vacío).
2. Descifre: `gpg -d backup.tar.gz.gpg | tar -xz`
3. Restaure en este orden:
   ```bash
   psql "$NUEVO_DB_URL" -f roles.sql      # si usó la opción B
   psql "$NUEVO_DB_URL" -f schema.sql
   psql "$NUEVO_DB_URL" -c "SET session_replication_role = replica" -f data.sql
   ```
   `session_replication_role = replica` evita que los triggers de auditoría dupliquen registros al restaurar.
4. Suba los archivos: `npx supabase storage cp -r ./storage ss:///yummy-private --experimental`
5. Despliegue la Edge Function y actualice `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en GitHub.
6. Inicie sesión con un administrador y verifique en el panel que los totales coinciden con el reporte previo.

## Opción manual para archivos

Si el CLI no copia Storage: Supabase → Storage → `yummy-private` → descargue las carpetas `drivers/` y `motorcycles/`.
