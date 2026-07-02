#!/usr/bin/env bash
# Client-data guard: fails if raw client data, secrets, or client identifiers
# are staged (mode=staged) or tracked at HEAD (mode=tracked).
# This repo is PUBLIC. See README.md (Security model).
set -euo pipefail

MODE="${1:-tracked}"

if [ "$MODE" = "staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACMR)
else
  FILES=$(git ls-files)
fi

[ -z "$FILES" ] && exit 0

FAIL=0

# 1) Forbidden file types and paths.
#    Spreadsheets, CSVs and PDFs are never committed (only *.enc artifacts).
#    Anything under data/ is local-only. .env must never be committed.
while IFS= read -r f; do
  case "$f" in
    *.xlsx|*.xls|*.csv|*.pdf)
      echo "GUARD FAIL: forbidden file type staged/tracked: $f"; FAIL=1 ;;
    data/*)
      echo "GUARD FAIL: file under data/ must never be committed: $f"; FAIL=1 ;;
    .env|.env.*)
      if [ "$f" != ".env.example" ]; then
        echo "GUARD FAIL: environment/secret file staged/tracked: $f"; FAIL=1
      fi ;;
  esac
  # Payload directory may contain only encrypted artifacts.
  case "$f" in
    site/public/payload/*)
      case "$f" in
        *.enc) : ;;
        *) echo "GUARD FAIL: non-encrypted file in payload dir: $f"; FAIL=1 ;;
      esac ;;
  esac
done <<< "$FILES"

# 2) Client identifier must not appear in any committed text.
#    The token is stored base64-encoded so this script does not flag itself.
BANNED=$(printf 'cmV0YWJldA==' | base64 -d)
while IFS= read -r f; do
  [ "$f" = "scripts/guard.sh" ] && continue
  if [ "$MODE" = "staged" ]; then
    CONTENT=$(git show ":$f" 2>/dev/null || true)
  else
    CONTENT=$(cat "$f" 2>/dev/null || true)
  fi
  if printf '%s' "$CONTENT" | grep -qiI "$BANNED" 2>/dev/null; then
    echo "GUARD FAIL: client identifier found in: $f"; FAIL=1
  fi
done <<< "$FILES"

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "Commit blocked: raw client data, secrets or client identifiers detected."
  echo "Only encrypted artifacts (*.enc) may carry client data. See README.md."
  exit 1
fi

echo "guard: OK ($MODE)"
