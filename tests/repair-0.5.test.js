'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

test('réparation 0.5.0 — installateur Inno Setup, WebView2 Evergreen et CI Windows', () => {
  const iss = read('installer/ALPHAStudio.iss');
  assert.match(iss, /ALPHAStudio-Setup-0\.5\.0-x64/);
  assert.match(iss, /#define MyAppVersion "0\.5\.0"/);
  assert.match(iss, /Source: "payload\\\*"/);
  assert.match(iss, /MicrosoftEdgeWebview2Setup\.exe/);
  assert.match(iss, /IsWebView2Installed/);
  assert.match(iss, /\/silent \/install/);
  assert.match(iss, /waituntilterminated skipifsilent; Check: WebView2BootstrapNeeded/);
  assert.match(iss, /uninstallexe|unins000\.exe/);

  const workflow = read('.github/workflows/windows-build.yml');
  assert.match(workflow, /windows-2022/);
  assert.match(workflow, /ASIO-SDK_2\.3\.4_2025-10-15\.zip/);
  assert.match(workflow, /ALPHA_ASIO_SDK_DIR/);
  assert.match(workflow, /MicrosoftEdgeWebview2Setup\.exe/);
  assert.match(workflow, /Inno Setup/);
  assert.match(workflow, /ISCC\.exe/);
  assert.match(workflow, /Installation silencieuse/);
  assert.match(workflow, /Désinstallation silencieuse/);
  assert.match(workflow, /\/DIR=\$install/);
  assert.doesNotMatch(workflow, /DIR=\\\"/);
  assert.ok(workflow.indexOf("name: Publier l'installateur Windows 0.5.0") < workflow.indexOf('name: Test silencieux installation / désinstallation'));
  assert.match(workflow, /ALPHAStudio-Setup-0\.5\.0-x64\.exe/);
  assert.match(workflow, /name: ALPHAStudio-Setup-0\.5\.0-x64/);
  assert.doesNotMatch(workflow, /CMAKE_BUILD_TYPE/);

  assert.ok(exists('installer/THIRD_PARTY_NOTICES.md'));
  assert.match(read('installer/THIRD_PARTY_NOTICES.md'), /SDK.*non redistribué|Steinberg/s);
  assert.match(read('docs/INSTALLATION-0.5.0.md'), /version installable Windows/);
  assert.match(read('.gitignore'), /installer\/payload\//);
  assert.ok(!exists('Engines/ALPHA-Studio/Source/iasiodrv.h'));
  assert.ok(!exists('installer/ASIO-SDK_2.3.4_2025-10-15.zip'));
});

test('réparation 0.5.0 — ASIO réel, version et fenêtre native Full HD/DPI/polices', () => {
  const cmake = read('CMakeLists.txt');
  assert.match(cmake, /VERSION 0\.5\.0/);
  assert.match(cmake, /JUCE_ASIO=1/);
  assert.match(cmake, /ALPHA_ASIO_SDK_DIR/);
  assert.match(cmake, /iasiodrv\.h/);
  assert.match(cmake, /juce_audio_devices/);

  const main = read('Source/Main.cpp');
  assert.match(main, /0\.5\.0/);
  assert.match(main, /alphaInitialWindowBounds/);
  assert.match(main, /alphaWindowsTextScale/);
  assert.match(main, /TextScaleFactor/);
  assert.match(main, /getDisplayMetrics/);
  assert.match(main, /windowMinimize/);
  assert.match(main, /windowMaximize/);
  assert.match(main, /windowRestore/);
  assert.match(main, /windowFitToScreen/);
  assert.match(main, /windowDrag/);
  assert.match(main, /uiScale/);
  assert.match(main, /fontScale/);
  assert.match(main, /AudioDeviceSelectorComponent/);
  assert.match(main, /showControlPanel/);
  assert.match(main, /engineOwner/);
  assert.match(main, /AlphaExportDoneSignal/);
  assert.doesNotMatch(main, /wait \(5000\.0\)/);
  assert.doesNotMatch(main, /auto\* self = this/);

  const engine = read('Engines/ALPHA-Studio/Source/Engine.h');
  assert.match(engine, /setCurrentAudioDeviceType \("ASIO", true\)/);
  assert.match(engine, /audioDeviceTypes/);
  assert.match(engine, /asioAvailable/);
  assert.match(engine, /hasControlPanel/);
  assert.match(engine, /currentDeviceType/);

  const bridge = read('UI/AlphaStudio/native-bridge.js');
  assert.match(bridge, /audioSettings/);
  assert.match(bridge, /asioPanel/);
  assert.match(bridge, /windowFitToScreen/);
  assert.match(bridge, /applyDisplayMetrics/);
  assert.match(bridge, /--alpha-viewport-w/);
  assert.match(bridge, /NATIVE_TIMEOUT_MS/);
  assert.match(bridge, /pendingCount/);

  assert.ok(exists('UI/AlphaStudio/src/layout.js'));
  const layout = read('UI/AlphaStudio/src/layout.js');
  assert.match(layout, /windowDrag/);
  assert.match(layout, /audioSettings/);
  assert.match(layout, /asioPanel/);
  const body = read('UI/AlphaStudio/src/body.html');
  assert.match(body, /data-alpha-command="windowFitToScreen"/);
  assert.match(body, /data-alpha-ui-command="audioSettings"/);
  assert.match(body, /data-alpha-ui-command="asioPanel"/);
  const app = read('UI/AlphaStudio/src/app.js');
  assert.match(app, /nativeWindow\('quit'\)/);
  const windows2 = read('UI/AlphaStudio/src/windows2.js');
  assert.doesNotMatch(windows2, /Alpha ASIO Driver/);
  assert.match(windows2, /deviceState\(\)/);
  assert.match(windows2, /nativeSend\('asioPanel'\)/);
});

test('réparation 0.5.0 — interface fluide, sans largeur fixe ni polices figées', () => {
  const cssNames = ['style.css', 'windows.css', 'windows2.css', 'windows3.css', 'windows5.css'];
  const css = cssNames.map((n) => read('UI/AlphaStudio/src/' + n)).join('\n');
  assert.match(css, /--alpha-font-scale:1/);
  assert.match(css, /--alpha-ui-scale:1/);
  assert.match(css, /zoom:var\(--alpha-ui-scale\)/);
  assert.match(css, /--alpha-viewport-w:100vw/);
  assert.match(css, /width:var\(--alpha-viewport-w\)/);
  assert.doesNotMatch(css, /min-width:1080px/);
  assert.doesNotMatch(css, /font-size:[0-9]+(?:\.[0-9]+)?px(?! *\*)/);
  assert.match(css, /font-size:calc\(11px \* var\(--alpha-font-scale\)\)/);
  assert.match(read('UI/AlphaStudio/build.py'), /js_after_bridge = \["audio\.js", "layout\.js"\]/);
});

test('réparation 0.5.0 — corrections du rapport d’audit A1→S9', () => {
  const core = read('Engines/ALPHA-Studio/Source/AlphaProjectCore.h');
  assert.match(core, /partie décimale incomplète/);
  assert.match(core, /exposant incomplet/);
  assert.match(core, /nombre JSON non fini ou invalide/);
  assert.match(core, /paire de substituts UTF-16 incomplète/);
  assert.match(core, /substitut bas UTF-16 isolé/);
  assert.match(core, /Longueur MTrk supérieure aux données/);
  assert.match(core, /Division SMPTE non prise en charge/);
  assert.match(core, /0, 0x80/);
  assert.match(core, /Note Off est toujours écrit avant Note On/);

  const engine = read('Engines/ALPHA-Studio/Source/Engine.h');
  assert.match(engine, /AlphaAudioCallback/);
  assert.match(engine, /traité en deux segments/);
  assert.match(engine, /std::array<LiveNote, 128> liveNotes/);
  assert.doesNotMatch(engine, /liveNotes\.erase/);
  assert.match(engine, /AutoCurveRT/);
  assert.match(engine, /inPrecount/);
  assert.match(engine, /totalOut/);
  assert.doesNotMatch(engine, /block - 4/);
  assert.match(engine, /importAudioData \(const String& name, const String& base64, double startBars, int trackIndex/);
  assert.match(engine, /importProjectData \(const String& base64, const File& sourceRoot/);
  assert.match(engine, /alphaAudioSuffix/);
  assert.match(engine, /média\(s\) introuvable|référence\(s\) introuvable/);
  assert.match(engine, /audioCallback/);
  assert.doesNotMatch(engine, /AudioProcessorPlayer player/);

  const main = read('Source/Main.cpp');
  assert.match(main, /file\.getParentDirectory\(\)/);
  assert.match(main, /engineRef->renderOffline/);
  assert.match(main, /return aliveFlag->load\(\)/);
});
