#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if rg -n --pcre2 \
  --glob '!src/app/globals.css' \
  --glob '!*.svg' \
  --glob '!DESIGN.md' \
  --glob '!docs/**' \
  --glob '!src/app/manifest.json' \
  --glob '!src/shared/lib/design/allowed-colors.ts' \
  --glob '!src/shared/utils/category-colors.ts' \
  -e '(?<!&)#[0-9a-fA-F]{3,8}\b' \
  -e '\b(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]{2,3}\b' \
  "$ROOT/src" >/tmp/design-token-violations-raw.txt; then
  # Remove linhas com exceção documentada no mesmo arquivo (comentário design-token: ALLOWED)
  violations=""
  while IFS= read -r line; do
    file="${line%%:*}"
    if rg -q 'design-token: ALLOWED' "$file" 2>/dev/null; then
      continue
    fi
    violations+="${line}"$'\n'
  done </tmp/design-token-violations-raw.txt

  if [[ -n "${violations// }" ]]; then
    echo "Design token violations found:"
    printf '%s' "$violations"
    exit 1
  fi
fi

echo "Design token check passed."
