#!/bin/bash
# ==============================================================
# openmonetis-docker-build-push.sh
# Build local da imagem Docker e push para registry (Coolify, VPS, etc.)
#
# Uso:
#   pnpm docker:build:push
#   pnpm docker:build:local
#
# Variáveis (opcionais):
#   DOCKER_USERNAME   usuário Docker Hub ou org no GHCR (padrão: franklinbravos)
#   IMAGE_NAME        nome da imagem (padrão: openmonetis)
#   IMAGE_TAG         tag (padrão: latest)
#   IMAGE_REGISTRY    docker.io | ghcr.io (padrão: docker.io)
#   BUILD_PLATFORM    plataforma do servidor (padrão: linux/amd64)
# ==============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DOCKER_USERNAME="${DOCKER_USERNAME:-franklinbravos}"
IMAGE_NAME="${IMAGE_NAME:-openmonetis}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-docker.io}"
BUILD_PLATFORM="${BUILD_PLATFORM:-linux/amd64}"
USE_REGISTRY_CACHE="${USE_REGISTRY_CACHE:-true}"

MODE="push"

print_usage() {
  cat <<EOF
Uso: $(basename "$0") [opções]

Opções:
  --load      build local e carrega no Docker da máquina (sem push)
  --push      build e envia para o registry (padrão)
  --dry-run   mostra o comando sem executar
  -h, --help  exibe esta ajuda

Exemplos:
  pnpm docker:build:push
  DOCKER_USERNAME=franklinbravos IMAGE_TAG=2.7.12 pnpm docker:build:push
  IMAGE_REGISTRY=ghcr.io pnpm docker:build:push
  pnpm docker:build:local

Coolify (após o push):
  Tipo: Docker Image
  Imagem: <image-ref abaixo>
  Porta: 3000
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --load)
      MODE="load"
      shift
      ;;
    --push)
      MODE="push"
      shift
      ;;
    --dry-run)
      MODE="dry-run"
      shift
      ;;
    -h | --help)
      print_usage
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $1" >&2
      print_usage >&2
      exit 1
      ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: Docker não encontrado. Instale Docker Desktop ou Colima." >&2
  exit 1
fi

if [[ "$IMAGE_REGISTRY" == "ghcr.io" ]]; then
  IMAGE_REF="ghcr.io/${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}"
  CACHE_REF="ghcr.io/${DOCKER_USERNAME}/${IMAGE_NAME}:buildcache"
else
  IMAGE_REF="${DOCKER_USERNAME}/${IMAGE_NAME}:${IMAGE_TAG}"
  CACHE_REF="${DOCKER_USERNAME}/${IMAGE_NAME}:buildcache"
fi

BUILDX_CMD=(docker-buildx)
if ! command -v docker-buildx >/dev/null 2>&1; then
  BUILDX_CMD=(docker buildx)
fi

BUILD_ARGS=(
  "${BUILDX_CMD[@]}"
  build
  --file "$PROJECT_DIR/Dockerfile"
  --platform "$BUILD_PLATFORM"
  --tag "$IMAGE_REF"
)

if [[ "$USE_REGISTRY_CACHE" == "true" && "$MODE" == "push" ]]; then
  BUILD_ARGS+=(--cache-from "type=registry,ref=${CACHE_REF}")
  BUILD_ARGS+=(--cache-to "type=registry,ref=${CACHE_REF},mode=max")
fi

if [[ "$MODE" == "push" ]]; then
  BUILD_ARGS+=(--push)
elif [[ "$MODE" == "load" ]]; then
  BUILD_ARGS+=(--load)
fi

BUILD_ARGS+=("$PROJECT_DIR")

log() {
  echo "[docker-build] $*"
}

run_build() {
  log "Projeto:  $PROJECT_DIR"
  log "Imagem:   $IMAGE_REF"
  log "Plataforma: $BUILD_PLATFORM"
  log "Modo:     $MODE"
  echo

  if [[ "$MODE" == "dry-run" ]]; then
    echo "docker ${BUILD_ARGS[*]}"
    return 0
  fi

  if ! "${BUILDX_CMD[@]}" version >/dev/null 2>&1; then
    echo "ERRO: docker buildx não disponível." >&2
    exit 1
  fi

  if ! "${BUILDX_CMD[@]}" inspect openmonetis-builder >/dev/null 2>&1; then
    log "Criando builder buildx: openmonetis-builder"
    "${BUILDX_CMD[@]}" create --name openmonetis-builder --use >/dev/null
  else
    "${BUILDX_CMD[@]}" use openmonetis-builder >/dev/null
  fi

  "${BUILD_ARGS[@]}"
}

run_build

if [[ "$MODE" == "dry-run" ]]; then
  exit 0
fi

echo
log "Concluído."

if [[ "$MODE" == "push" ]]; then
  cat <<EOF

Próximo passo no Coolify:
  1. Novo recurso → Docker Image (não Dockerfile)
  2. Imagem: $IMAGE_REF
  3. Porta: 3000
  4. Variáveis: DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL

Login no registry (se ainda não fez):
  docker login
  # GHCR: docker login ghcr.io -u $DOCKER_USERNAME
EOF
fi

if [[ "$MODE" == "load" ]]; then
  cat <<EOF

Teste local:
  docker run --rm -p 3000:3000 --env-file .env $IMAGE_REF

Health check:
  curl http://localhost:3000/api/health
EOF
fi
