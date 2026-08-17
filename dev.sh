#!/usr/bin/env bash
# ==============================================================
# dev.sh — Sobe o ambiente de desenvolvimento do OpenMonetis
#
# - Carrega APP_PORT do .env (padrão: 3050)
# - Encerra qualquer processo na porta configurada
# - Aplica migrations do Supabase (supabase/migrations/), se possível
# - Inicia o Next.js com Turbopack
#
# Migrations (uma das opções):
#   SUPABASE_DB_URL no .env (Connection string → Postgres, porta 5432)
#   ou projeto linkado: supabase link
#
# Uso:
#   bash dev.sh
#   bash dev.sh --skip-migrations
# ==============================================================
set -euo pipefail
export TZ="America/Sao_Paulo"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
SKIP_MIGRATIONS=false

for arg in "$@"; do
	case "$arg" in
		--skip-migrations) SKIP_MIGRATIONS=true ;;
		--help | -h)
			sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "Argumento desconhecido: $arg (use --help)" >&2
			exit 1
			;;
	esac
done

log() { echo "[$(date '+%H:%M:%S')] $*"; }
warn() { echo "[$(date '+%H:%M:%S')] AVISO: $*" >&2; }
die() { echo "ERRO: $*" >&2; exit 1; }

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "Comando obrigatório não encontrado: $1"
}

if [[ ! -f "$PROJECT_DIR/.env" ]]; then
	die ".env não encontrado. Copie .env.example para .env e configure o projeto."
fi

# Carrega variáveis do .env via Node/dotenv (evita expansão de $ pelo bash, ex.: senhas de teste).
read_env() {
	local key="$1"
	node -r dotenv/config -e "const v=process.env['$key']; if(v!=null) process.stdout.write(String(v))" \
		dotenv_config_path="$PROJECT_DIR/.env" 2>/dev/null
}

APP_PORT="$(read_env APP_PORT)"
APP_PORT="${APP_PORT:-3050}"

require_cmd pnpm
require_cmd lsof

if [[ ! -d "$PROJECT_DIR/node_modules" ]]; then
	log "node_modules não encontrado — instalando dependências..."
	(cd "$PROJECT_DIR" && pnpm install)
fi

kill_port() {
	local port="$1"
	local pids=""

	pids="$(lsof -ti:"$port" 2>/dev/null || true)"
	if [[ -z "$pids" ]]; then
		return 0
	fi

	log "Encerrando processo(s) na porta $port..."
	# shellcheck disable=SC2086
	kill -9 $pids 2>/dev/null || true
	sleep 0.5
}

normalize_migration_db_url() {
	local url="$1"

	# Pooler transaction (:6543) não serve para supabase db push — usar session (:5432).
	if [[ "$url" == *":6543/"* ]]; then
		warn "SUPABASE_DB_URL usa pooler :6543; migrations usarão :5432 (session)."
		url="${url//:6543\//:5432/}"
	fi

	echo "$url"
}

reload_postgrest_schema() {
	local db_url="$1"

	if ! command -v psql >/dev/null 2>&1; then
		warn "psql não encontrado — não foi possível recarregar o schema do PostgREST."
		return
	fi

	if psql "$db_url" -v ON_ERROR_STOP=0 -c "NOTIFY pgrst, 'reload schema';" >/dev/null 2>&1; then
		log "PostgREST: reload do schema solicitado."
	else
		warn "Não foi possível enviar NOTIFY pgrst (reload do schema)."
	fi
}

resolve_migration_db_url() {
	local url=""

	url="$(read_env SUPABASE_DB_URL)"
	if [[ -n "$url" ]]; then
		normalize_migration_db_url "$url"
		return
	fi

	url="$(read_env SUPABASE_DATABASE_URL)"
	if [[ -n "$url" ]]; then
		normalize_migration_db_url "$url"
		return
	fi

	url="$(read_env DATABASE_URL)"
	if [[ -n "$url" ]]; then
		normalize_migration_db_url "$url"
	fi
}

run_migrations() {
	local db_url=""
	local migration_count=""

	db_url="$(resolve_migration_db_url)"

	if [[ -n "$db_url" ]]; then
		log "Aplicando migrations via connection string do .env..."
		migration_count="$(find "$PROJECT_DIR/supabase/migrations" -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')"
		if (cd "$PROJECT_DIR" && pnpm exec supabase db push --db-url "$db_url" --yes); then
			log "Migrations Supabase OK (${migration_count} arquivos em supabase/migrations/)."
			reload_postgrest_schema "$db_url"
		else
			warn "supabase db push falhou — migrations NÃO foram aplicadas."
			warn "Verifique SUPABASE_DB_URL (Postgres, porta 5432) e rode:"
			warn "  pnpm exec supabase db push --db-url \"\$SUPABASE_DB_URL\" --yes"
		fi
		return
	fi

	log "Aplicando migrations via Supabase CLI (projeto linkado)..."
	if (cd "$PROJECT_DIR" && pnpm exec supabase db push --yes); then
		migration_count="$(find "$PROJECT_DIR/supabase/migrations" -maxdepth 1 -name '*.sql' 2>/dev/null | wc -l | tr -d ' ')"
		log "Migrations Supabase OK (${migration_count} arquivos em supabase/migrations/)."
		db_url="$(resolve_migration_db_url)"
		if [[ -n "$db_url" ]]; then
			reload_postgrest_schema "$db_url"
		fi
		return
	fi

	warn "migrations não aplicadas — o dev server vai subir mesmo assim."
	warn "Para habilitar migrations no dev.sh, use uma destas opções:"
	warn "  1. SUPABASE_DB_URL no .env (Postgres → Connection string, porta 5432)"
	warn "  2. supabase link (na raiz do projeto)"
}

cd "$PROJECT_DIR"

kill_port "$APP_PORT"

if [[ "$SKIP_MIGRATIONS" == false ]]; then
	run_migrations
else
	log "Pulando migrations (--skip-migrations)."
fi

log "Iniciando dev server em http://localhost:${APP_PORT}"

exec pnpm exec next dev --turbopack -p "$APP_PORT"
