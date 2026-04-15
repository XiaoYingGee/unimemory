#!/bin/bash
# Download LoCoMo dataset from snap-research/LoCoMo GitHub
# Dataset: https://github.com/snap-research/LoCoMo

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
mkdir -p "$DATA_DIR"

echo "Downloading LoCoMo dataset..."

# Try HuggingFace dataset API first (most reliable)
HF_URL="https://huggingface.co/datasets/snap-research/LoCoMo/resolve/main/locomo10_test.json"
GH_URL="https://raw.githubusercontent.com/snap-research/LoCoMo/main/data/locomo10_test.json"

if curl -fL "$HF_URL" -o "$DATA_DIR/locomo.json" 2>/dev/null; then
  echo "✓ Downloaded from HuggingFace"
elif curl -fL "$GH_URL" -o "$DATA_DIR/locomo.json" 2>/dev/null; then
  echo "✓ Downloaded from GitHub"
else
  echo "❌ Download failed. Please manually download from:"
  echo "   https://github.com/snap-research/LoCoMo"
  echo "   and save as: benchmarks/locomo/data/locomo.json"
  exit 1
fi

# Verify the file looks valid
if python3 -c "import json; d=json.load(open('$DATA_DIR/locomo.json')); print(f'✓ Valid JSON: {len(d)} conversations')" 2>/dev/null; then
  echo "Dataset ready."
else
  # Try to check with node
  node -e "const d=require('$DATA_DIR/locomo.json'); console.log('✓ Valid JSON:', Array.isArray(d) ? d.length : Object.keys(d).length, 'entries')" 2>/dev/null || \
  echo "⚠️  Could not validate JSON format — please check manually"
fi
