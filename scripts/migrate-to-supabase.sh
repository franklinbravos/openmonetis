#!/usr/bin/env bash
# ==============================================================
# migrate-to-supabase.sh
# Migra dados do PostgreSQL atual (Coolify/local) para Supabase.
#
# Fluxo:
#   1. Valida conexões origem/destino
#   2. Gera dump de dados (schema public)
#   3. Aplica schema atual no Supabase (drizzle db:push)
#   4. Limpa dados do destino e restaura
#   5. Verifica contagens origem × destino
#
# Uso:
#   pnpm run db:migrate-supabase
#   pnpm run db:migrate-supabase -- --yes          # sem confirmação
#   pnpm run db:migrate-supabase -- --dry-run      # só diagnóstico + dump
#   pnpm run db:migrate-supabase -- --skip-schema  # destino já tem schema
# ==============================================================
set -euo pipefail
export TZ="America/Sao_Paulo"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=false
SKIP_SCHEMA=false
ASSUME_YES=false

for arg in "$@"; do
	case "$arg" in
		--dry-run) DRY_RUN=true ;;
		--skip-schema) SKIP_SCHEMA=true ;;
		--yes | -y) ASSUME_YES=true ;;
		--|--help | -h)
			if [[ "$arg" == "--help" || "$arg" == "-h" ]]; then
				sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
				exit 0
			fi
			;;
		*)
			echo "Argumento desconhecido: $arg (use --help)" >&2
			exit 1
			;;
	esac
done

if [[ -f "$PROJECT_DIR/.env" ]]; then
	set -a
	# shellcheck disable=SC1091
	source "$PROJECT_DIR/.env"
	set +a
else
	echo "ERRO: .env não encontrado em $PROJECT_DIR" >&2
	exit 1
fi

log() { echo "[$(date '+%H:%M:%S')] $*"; }
die() { echo "ERRO: $*" >&2; exit 1; }

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório não encontrado: $1"
}

mask_url() {
	local url="$1"
	echo "$url" | sed -E 's#(postgresql://[^:/]+):([^@]+)@#\1:****@#'
}

ensure_sslmode_psql() {
	local url="$1"
	if [[ "$url" == *"sslmode="* ]]; then
		echo "$url"
	elif [[ "$url" == *"?"* ]]; then
		echo "${url}&sslmode=require"
	else
		echo "${url}?sslmode=require"
	fi
}

ensure_sslmode_node() {
	local url="$1"
	if [[ "$url" == *"sslmode="* ]]; then
		if [[ "$url" != *"uselibpqcompat="* ]]; then
			echo "${url}&uselibpqcompat=true"
		else
			echo "$url"
		fi
	elif [[ "$url" == *"?"* ]]; then
		echo "${url}&sslmode=require&uselibpqcompat=true"
	else
		echo "${url}?sslmode=require&uselibpqcompat=true"
	fi
}

resolve_source_url() {
	local url="${MIGRATION_SOURCE_DATABASE_URL:-${DATABASE_URL:-}}"
	[[ -n "$url" ]] || die "Defina DATABASE_URL ou MIGRATION_SOURCE_DATABASE_URL no .env"
	echo "$url"
}

resolve_migration_target_url() {
	if [[ -n "${MIGRATION_TARGET_DATABASE_URL:-}" ]]; then
		echo "$(ensure_sslmode_psql "$MIGRATION_TARGET_DATABASE_URL")"
		return
	fi

	if [[ -n "${SUPABASE_DATABASE_URL:-}" ]]; then
		echo "$(ensure_sslmode_psql "$SUPABASE_DATABASE_URL")"
		return
	fi

	local app_url="${DATABASE_URL:-}"
	if [[ -n "$app_url" && "$app_url" == *"db."*".supabase.co"* ]]; then
		echo "$(ensure_sslmode_psql "$app_url")"
		return
	fi

	die "Defina DATABASE_URL (direct db.*.supabase.co:5432) ou MIGRATION_TARGET_DATABASE_URL"
}

resolve_target_url_for_node() {
	local base_url="${1:-}"
	ensure_sslmode_node "$base_url"
}

count_public_tables() {
	local url="$1"
	psql "$url" -v ON_ERROR_STOP=1 -Atqc \
		"SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';"
}

print_row_counts() {
	local label="$1"
	local url="$2"
	log "Contagem em $label:"
	psql "$url" -v ON_ERROR_STOP=1 -c "
		SELECT c.relname AS tabela, c.reltuples::bigint AS linhas_aprox
		FROM pg_class c
		JOIN pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'public' AND c.relkind = 'r'
		ORDER BY c.relname;
	"
}

SOURCE_URL="$(resolve_source_url)"
TARGET_URL="$(resolve_migration_target_url)"

require_cmd psql
require_cmd pg_dump
require_cmd pg_restore

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
WORK_DIR="$PROJECT_DIR/backup/migration_${TIMESTAMP}"
DATA_DUMP="$WORK_DIR/openmonetis.data.dump"
FULL_DUMP="$WORK_DIR/openmonetis.full.dump"
MANIFEST="$WORK_DIR/manifest.txt"

mkdir -p "$WORK_DIR"

log "=== Migração OpenMonetis → Supabase ==="
log "Origem:  $(mask_url "$SOURCE_URL")"
log "Destino: $(mask_url "$TARGET_URL")"
log "Pasta:   $WORK_DIR"

log "Testando conexão com origem..."
psql "$SOURCE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1;" >/dev/null

log "Testando conexão com destino..."
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT 1;" >/dev/null

SOURCE_TABLES="$(count_public_tables "$SOURCE_URL")"
TARGET_TABLES="$(count_public_tables "$TARGET_URL")"
log "Tabelas public — origem: $SOURCE_TABLES | destino: $TARGET_TABLES"

print_row_counts "origem" "$SOURCE_URL"

if [[ "$ASSUME_YES" != true ]]; then
	echo ""
	echo "Esta operação vai:"
	echo "  • gerar backup local em $WORK_DIR"
	if [[ "$SKIP_SCHEMA" != true ]]; then
		echo "  • aplicar schema atual no Supabase (pnpm db:push)"
	fi
	echo "  • APAGAR todos os dados das tabelas public no Supabase"
	echo "  • restaurar os dados da origem no Supabase"
	echo ""
	read -r -p "Continuar? [y/N] " confirm
	[[ "$confirm" =~ ^[Yy]$ ]] || die "Migração cancelada pelo usuário."
fi

log "Gerando dump completo (public + drizzle)..."
pg_dump \
	--format=custom \
	--no-owner \
	--no-privileges \
	--schema=public \
	--schema=drizzle \
	"$SOURCE_URL" >"$FULL_DUMP"

log "Gerando dump somente dados (public)..."
pg_dump \
	--format=custom \
	--data-only \
	--no-owner \
	--no-privileges \
	--schema=public \
	"$SOURCE_URL" >"$DATA_DUMP"

{
	echo "timestamp=$TIMESTAMP"
	echo "source=$(mask_url "$SOURCE_URL")"
	echo "target=$(mask_url "$TARGET_URL")"
	echo "full_dump=$(basename "$FULL_DUMP")"
	echo "data_dump=$(basename "$DATA_DUMP")"
} >"$MANIFEST"

if [[ "$DRY_RUN" == true ]]; then
	log "DRY-RUN concluído. Nenhuma alteração no Supabase."
	log "Arquivos gerados em: $WORK_DIR"
	exit 0
fi

if [[ "$SKIP_SCHEMA" != true ]]; then
	log "Aplicando schema no Supabase (drizzle db:push via pooler)..."
	(
		cd "$PROJECT_DIR"
		pnpm exec drizzle-kit push --force
	)
fi

log "Limpando dados existentes no destino (public)..."
psql "$TARGET_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
	row RECORD;
BEGIN
	FOR row IN
		SELECT tablename
		FROM pg_tables
		WHERE schemaname = 'public'
	LOOP
		EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', row.tablename);
	END LOOP;
END $$;
SQL

log "Restaurando dados no Supabase..."
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "SET session_replication_role = replica;"
pg_restore \
	--data-only \
	--no-owner \
	--no-privileges \
	--dbname="$TARGET_URL" \
	"$DATA_DUMP"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "SET session_replication_role = DEFAULT;"
psql "$TARGET_URL" -v ON_ERROR_STOP=1 -c "ANALYZE;"

log "Verificando contagens finais..."
print_row_counts "destino" "$TARGET_URL"

log "Comparando totais (origem vs destino)..."
SOURCE_TOTAL=$(psql "$SOURCE_URL" -Atqc "
	SELECT COALESCE(SUM(c.reltuples::bigint), 0)
	FROM pg_class c
	JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = 'public' AND c.relkind = 'r';
")
TARGET_TOTAL=$(psql "$TARGET_URL" -Atqc "
	SELECT COALESCE(SUM(c.reltuples::bigint), 0)
	FROM pg_class c
	JOIN pg_namespace n ON n.oid = c.relnamespace
	WHERE n.nspname = 'public' AND c.relkind = 'r';
")
log "Total aproximado de linhas — origem: $SOURCE_TOTAL | destino: $TARGET_TOTAL"

cat <<EOF

✓ Migração concluída.

Próximos passos:
  1. No .env, confirme DATABASE_URL na conexão direct (db.*.supabase.co:5432)
  2. Mantenha SUPABASE_TRANSACTION_POOLER só para drizzle-kit (db:push)
  3. Defina SUPABASE_STORAGE_BUCKET=openmonetis-attachments

Backup local desta migração: $WORK_DIR
EOF
