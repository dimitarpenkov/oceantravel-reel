#!/usr/bin/env bash
# Installs the oceantravel-reel skill for Codex (macOS / Linux).
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${CODEX_HOME:-$HOME/.codex}/skills/oceantravel-reel"

mkdir -p "$DEST"
# keep the shared stress dictionary if the agency has already grown it
if [ -f "$DEST/references/stress-bg.json" ]; then cp "$DEST/references/stress-bg.json" "$DEST/references/stress-bg.json.keep"; fi
cp -R "$SRC/." "$DEST/"
if [ -f "$DEST/references/stress-bg.json.keep" ]; then
  node "$DEST/scripts/merge-dict.mjs" "$DEST/references/stress-bg.json" "$DEST/references/stress-bg.json.keep"
  rm "$DEST/references/stress-bg.json.keep"
fi
rm -f "$DEST/install.sh" "$DEST/install.ps1"

mkdir -p "$HOME/OceanTravel-videos" "$HOME/.ocean-video"
CFG="$HOME/.ocean-video/config.env"
if [ ! -f "$CFG" ]; then
  cat > "$CFG" <<'EOF'
# Ключове за видеата на Ocean Travel. Попълни след "=" без кавички.
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=M1ydWt7KnBCiuv4CnEDC
POSTFORME_API_KEY=
POSTFORME_ACCOUNTS=
PEXELS_API_KEY=
HF_API_KEY_ID=
HF_API_KEY_SECRET=
EOF
  chmod 600 "$CFG"
fi

echo "✓ Skill: $DEST"
echo "✓ Видеата: $HOME/OceanTravel-videos"
echo "✓ Ключове: $CFG  ← попълни го"
node "$DEST/scripts/doctor.mjs" || true
