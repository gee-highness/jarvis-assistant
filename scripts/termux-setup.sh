#!/data/data/com.termux/files/usr/bin/bash
# Jarvis engine setup for Termux (run once):
#   curl -fsSL <raw-url-of-this-file> | bash      or copy-paste it into Termux
set -e

CHAT_MODEL="${CHAT_MODEL:-huihui_ai/Hermes-3-Llama-3.2-abliterated:3b}"
EMBED_MODEL="${EMBED_MODEL:-all-minilm}"

echo "▸ Updating packages…"
pkg update -y && pkg upgrade -y
pkg install -y ollama termux-api curl

echo "▸ Allowing Jarvis to start the engine for you…"
mkdir -p ~/.termux
grep -q "allow-external-apps" ~/.termux/termux.properties 2>/dev/null || echo "allow-external-apps = true" >> ~/.termux/termux.properties
termux-reload-settings || true

echo "▸ Auto-start Ollama whenever Termux opens…"
grep -q "ollama serve" ~/.bashrc 2>/dev/null || cat >> ~/.bashrc <<'EOF'
# --- Jarvis engine ---
export OLLAMA_ORIGINS='*'
export OLLAMA_KEEP_ALIVE=30m
if ! curl -s -m 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  termux-wake-lock
  nohup ollama serve > ~/ollama.log 2>&1 &
fi
EOF

export OLLAMA_ORIGINS='*'
termux-wake-lock || true
if ! curl -s -m 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  nohup ollama serve > ~/ollama.log 2>&1 &
  sleep 3
fi

echo "▸ Downloading models (use Wi-Fi)…"
ollama pull "$EMBED_MODEL"
ollama pull "$CHAT_MODEL"

echo
echo "✓ Jarvis engine ready at http://127.0.0.1:11434"
echo "  Tip: Android Settings → Apps → Termux → Battery → Unrestricted, so Android doesn't kill the engine."
