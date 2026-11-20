#!/usr/bin/env bash
# Respaldo completo de Yummy Rides Control Maracay: base de datos + archivos privados.
# Uso:
#   export SUPABASE_DB_URL="postgresql://postgres.<ref>:<clave>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#   ./scripts/backup.sh
# Requisitos: Supabase CLI (npx supabase) con sesión iniciada y "supabase link" hecho.
# Los respaldos contienen DATOS PERSONALES: guárdelos cifrados y fuera del repositorio.
set -euo pipefail

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL (Project Settings → Database → Connection string)}"
STAMP=$(date +%Y%m%d-%H%M)
DIR="backups/$STAMP"
mkdir -p "$DIR"

echo "→ Esquema (roles, tablas, funciones, políticas)…"
npx supabase db dump --db-url "$SUPABASE_DB_URL" -f "$DIR/schema.sql"

echo "→ Datos…"
npx supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy -f "$DIR/data.sql"

echo "→ Archivos del bucket privado (fotos y documentos)…"
npx supabase storage cp -r ss:///yummy-private "$DIR/storage" --experimental || \
  echo "  (Aviso) No se pudo copiar Storage con el CLI. Ver docs/RESPALDO.md, opción manual."

echo "→ Comprimiendo y cifrando…"
tar -czf "$DIR.tar.gz" -C backups "$STAMP"
rm -rf "$DIR"
if command -v gpg >/dev/null; then
  gpg --symmetric --cipher-algo AES256 "$DIR.tar.gz" && rm "$DIR.tar.gz"
  echo "✓ Respaldo cifrado: $DIR.tar.gz.gpg"
else
  echo "✓ Respaldo: $DIR.tar.gz  (instale gpg para cifrarlo)"
fi
