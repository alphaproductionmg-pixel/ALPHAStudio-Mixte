#!/usr/bin/env bash
# Vérification de syntaxe C++17/JUCE 8 hors Windows, sans CMake ni MSVC.
# Définir JUCE_MODULES_DIR=/chemin/vers/JUCE pour l'activer ; sinon la vérification est ignorée.
set -euo pipefail
cd "$(dirname "$0")/.."
JUCE_MODULES_DIR="${JUCE_MODULES_DIR:-/tmp/JUCE}"
if [ ! -d "$JUCE_MODULES_DIR/modules/juce_core" ]; then
  echo "Syntaxe JUCE ignorée : aucun dossier modules dans JUCE_MODULES_DIR=$JUCE_MODULES_DIR"
  exit 0
fi
STUB=$(mktemp -d)
trap 'rm -rf "$STUB"' EXIT
cat > "$STUB/JuceHeader.h" <<'EOF'
#pragma once
#define JUCE_GLOBAL_MODULE_SETTINGS_INCLUDED 1
#define JUCE_MODULE_AVAILABLE_juce_core 1
#define JUCE_MODULE_AVAILABLE_juce_data_structures 1
#define JUCE_MODULE_AVAILABLE_juce_events 1
#define JUCE_MODULE_AVAILABLE_juce_graphics 1
#define JUCE_MODULE_AVAILABLE_juce_gui_basics 1
#define JUCE_MODULE_AVAILABLE_juce_gui_extra 1
#define JUCE_MODULE_AVAILABLE_juce_audio_basics 1
#define JUCE_MODULE_AVAILABLE_juce_audio_devices 1
#define JUCE_MODULE_AVAILABLE_juce_audio_formats 1
#define JUCE_MODULE_AVAILABLE_juce_audio_processors 1
#define JUCE_MODULE_AVAILABLE_juce_audio_utils 1
#define JUCE_MODULE_AVAILABLE_juce_dsp 1
#define JUCE_WEB_BROWSER 1
#define JUCE_USE_WIN_WEBVIEW2 1
#define JUCE_MODAL_LOOPS_PERMITTED 1
#define JUCE_PLUGINHOST_VST3 1
#define JUCE_PLUGINHOST_VST 0
#define JUCE_PLUGINHOST_AU 0
#define JUCE_USE_CURL 0
#define JUCE_USE_XSHM 0
#define JUCE_USE_XINERAMA 0
#define JUCE_USE_XCURSOR 0
#define JUCE_USE_XRANDR 0
#define JUCE_USE_XRENDER 0
#include <juce_core/juce_core.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_dsp/juce_dsp.h>
EOF
cat > "$STUB/engine-syntax.cpp" <<'EOF'
#include "Engines/ALPHA-Studio/Source/Engine.h"
int main() { return 0; }
EOF
CXX="${CXX:-g++}"
COMMON=(-std=c++17 -Wall -Wextra -Werror -fsyntax-only
        -I"$STUB" -I"$JUCE_MODULES_DIR/modules" -I"$PWD")
"$CXX" "${COMMON[@]}" "$STUB/engine-syntax.cpp"
"$CXX" "${COMMON[@]}" Source/Main.cpp
"$CXX" "${COMMON[@]}" -IEngines/ALPHA-Studio/Source -IEngines/ALPHA-Studio/ReferenceApp \
  Engines/ALPHA-Studio/ReferenceApp/Main.cpp
echo "OK — syntaxe JUCE 8 : Engine.h, hôte WebView2 et application de référence."
