#!/usr/bin/env bash
# Non-régression J1 → J6 — aucun npm, aucune dépendance à installer.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/5 : syntaxe Python et reconstruction du livrable =="
python3 - <<'PY'
from pathlib import Path
compile(Path('UI/AlphaStudio/build.py').read_text(encoding='utf-8'), 'build.py', 'exec')
PY
python3 UI/AlphaStudio/build.py

echo "== 2/5 : syntaxe JavaScript des sources =="
for f in \
  UI/AlphaStudio/src/app.js \
  UI/AlphaStudio/src/audio-core.js \
  UI/AlphaStudio/src/audio.js \
  UI/AlphaStudio/src/layout.js \
  UI/AlphaStudio/native-bridge.js \
  tests/support/harness.js \
  tests/j1-core.test.js \
  tests/j1-runtime.test.js \
  tests/j1-static.test.js \
  tests/j2-j6-native.test.js \
  tests/repair-0.5.test.js; do
  node --check "$f"
done

echo "== 3/5 : noyau C++17 J2 → J6, sans JUCE =="
g++ -std=c++17 -Wall -Wextra -O1 -o /tmp/alpha-core-tests tests/alpha-core.test.cpp
/tmp/alpha-core-tests

echo "== 4/5 : tests J1, livraison et pont WebView2 J2 → J6 =="
node --test tests/j1-core.test.js tests/j1-runtime.test.js tests/j1-static.test.js tests/j2-j6-native.test.js tests/repair-0.5.test.js

echo "== 5/5 : syntaxe C++17/JUCE, propreté et grep de contrôle =="
python3 - <<'PY'
from pathlib import Path
for name in ['Source/Main.cpp', 'Source/AlphaWebMain.h', 'Engines/ALPHA-Studio/Source/Engine.h',
             'Engines/ALPHA-Studio/Source/AlphaProjectCore.h', 'CMakeLists.txt',
             'ETAPES.md', 'docs/J1-contrat.md', 'docs/J2-J6-contrat.md',
             'installer/ALPHAStudio.iss', 'installer/THIRD_PARTY_NOTICES.md',
             'docs/INSTALLATION-0.5.0.md', 'docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md',
             'UI/AlphaStudio/src/layout.js',
             '.github/workflows/windows-build.yml', '.gitignore']:
    assert Path(name).exists(), 'fichier manquant : ' + name
PY
git diff --check
bash -n tests/juce-syntax.sh
bash tests/juce-syntax.sh
grep -q 'AudioContext' UI/AlphaStudio/alpha-studio.html
grep -q 'registerProcessor("alpha-mix"' UI/AlphaStudio/alpha-studio.html
grep -q 'ALPHA_AUDIO_METERS.fromNative' UI/AlphaStudio/alpha-studio.html
grep -q '__juce__invoke' UI/AlphaStudio/alpha-studio.html
grep -q 'if (A.setPlayhead) A.setPlayhead(A.state.pos);' UI/AlphaStudio/native-bridge.js
! grep -q '<script src=' UI/AlphaStudio/alpha-studio.html

echo "OK — J1 → J6 + réparation 0.5.0 + correctif interface : installateur, ASIO, fenêtre native, DPI, audit, sources et livrable vérifiés."
