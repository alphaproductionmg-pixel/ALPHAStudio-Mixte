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

test('correctif interface — une seule fenêtre native et export de piste réel', () => {
  const css = read('UI/AlphaStudio/src/style.css');
  assert.match(css, /html\[data-alpha-native="1"\] #titlebar\{display:none\}/);
  assert.match(css, /html\[data-alpha-native="1"\] body\{background:var\(--chrome-3\)\}/);
  assert.match(css, /html\[data-alpha-native="1"\] #app\{border-top:0\}/);

  const html = read('UI/AlphaStudio/src/body.html');
  assert.match(html, /ALPHA Studio 0\.5\.0/);
  assert.doesNotMatch(html, /ALPHA Studio 1\.0 \(interface\)/);
  assert.match(html, /data-alpha-ui-command="windowFitToScreen"/);

  const builder = read('UI/AlphaStudio/build.py');
  assert.match(builder, /document\.documentElement\.dataset\.alphaNative/);

  const main = read('Source/Main.cpp');
  assert.match(main, /withStatusBarDisabled/);
  assert.match(main, /withBuiltInErrorPageDisabled/);
  assert.match(main, /withBackgroundColour/);
  assert.match(main, /payload\.getProperty \(Identifier \("trackIndex"\), -1\)/);
  assert.match(main, /renderOffline \(target\.withFileExtension \("wav"\), 48000\.0, 24, progress, onlyTrack\)/);
  assert.match(read('Source/AlphaWebMain.h'), /exportWav \(bool stems, int singleTrack = -1\)/);
});

test('audit v6 — la couche « non disponible » est supprimée de toute l’interface', () => {
  const css = read('UI/AlphaStudio/src/style.css');
  const app = read('UI/AlphaStudio/src/app.js');
  const bridge = read('UI/AlphaStudio/native-bridge.js');

  [css, app, bridge].forEach((source) => {
    assert.doesNotMatch(source, /alpha-unavailable/);
    assert.doesNotMatch(source, /unavailableActions/);
    assert.doesNotMatch(source, /markUnavailableMenus/);
    assert.doesNotMatch(source, /installMenuAvailability/);
    assert.doesNotMatch(source, /non disponible/i);
    assert.doesNotMatch(source, /non implémentée \/ non disponible/);
  });
  assert.doesNotMatch(app, /Fonction non disponible/);
  // Les entrées de menus désormais réelles ne doivent plus annoncer « étape 2 ».
  ['newLibrary', 'newFolder', 'clearRecent', 'closeProject', 'importOmf', 'importAaf',
   'importXml', 'importCd', 'exportScore', 'exportOmf', 'exportXml', 'exportCd',
   'exportPerf', 'pageSetup', 'print', 'addFX', 'removeEmpty', 'midiLogical'].forEach((key) => {
    const stub = new RegExp('^\\s+' + key + ':\\s*\\[', 'm');
    assert.ok(!stub.test(app), 'MENU_STUBS contient encore « ' + key + ' »');
  });
});

test('audit v6 — échanges de fichiers réels câblés du menu jusqu’au moteur', () => {
  const bridge = read('UI/AlphaStudio/native-bridge.js');
  assert.match(bridge, /actions\.newFolder = \(\) => send\('newFolder'\)/);
  assert.match(bridge, /actions\.closeProject = \(\) => send\('closeProject'\)/);
  assert.match(bridge, /actions\.clearRecent = \(\) => send\('clearRecents'\)/);
  assert.match(bridge, /actions\.newLibrary = \(\) => send\('newLibrary'\)/);
  assert.match(bridge, /actions\.print = \(\) => send\('print'\)/);
  assert.match(bridge, /actions\.pageSetup = \(\) => send\('pageSetup'\)/);
  assert.match(bridge, /actions\.exportScore = \(\) => send\('exportScore', \{ trackIndex: selectedIndex\(\) \}\)/);
  assert.match(bridge, /actions\.exportOmf = \(\) => send\('exportOmf'\)/);
  assert.match(bridge, /actions\.exportXml = \(\) => send\('exportXml'\)/);
  assert.match(bridge, /actions\.exportCd = \(\) => send\('exportCd'\)/);
  assert.match(bridge, /actions\.exportPerf = \(\) => send\('exportPerf'\)/);
  assert.match(bridge, /actions\.importOmf = \(\) => send\('importOmf', \{ startBars: A\.state\.pos, trackIndex: selectedIndex\(\) \}\)/);
  assert.match(bridge, /actions\.importAaf = \(\) => send\('importAaf'/);
  assert.match(bridge, /actions\.importXml = \(\) => send\('importXml'/);
  assert.match(bridge, /actions\.importCd = \(\) => send\('importCd'/);
  assert.match(bridge, /actions\.removeEmpty = \(\) => send\('removeEmptyTracks'\)/);
  assert.match(bridge, /actions\.addFX = \(\) => send\('addFX', \{ trackIndex: selectedIndex\(\) \}\)/);
  assert.match(bridge, /window\.ALPHAWIN\.open\('logical'\)/);
  assert.doesNotMatch(bridge, /actions\.closeProject = \(\) => send\('newProject'\)/);
  assert.doesNotMatch(bridge, /actions\.addFX = \(\) => send\('uiControl'/);
  assert.doesNotMatch(bridge, /actions\.midiLogical = \(\) => send\('quantizeMidi'/);

  const main = read('Source/Main.cpp');
  // Chaque commande d’échange ouvre un vrai sélecteur de fichiers Windows.
  ['newFolder', 'exportOmf', 'exportCd', 'exportXml', 'exportScore', 'exportPerf',
   'importOmf', 'importAaf', 'importXml', 'importCd', 'printSheet'].forEach((kind) => {
    assert.ok(main.includes('"' + kind + '"'), 'Main.cpp ne traite pas « ' + kind + ' »');
  });
  assert.match(main, /std::make_unique<FileChooser> \(title, initial, filters\)/);
  assert.match(main, /canSelectDirectories/);
  assert.match(main, /eng\.createProjectFolder \(result, result\.getFileName\(\)\)/);
  assert.match(main, /eng\.exportFcpXml \(f\)/);
  assert.match(main, /eng\.importFcpXml \(result, error\)/);
  assert.match(main, /eng\.importOmfOrAaf \(result, trackIndex, startBars\)/);
  assert.match(main, /eng\.importCdTracks \(result, trackIndex, startBars\)/);
  assert.match(main, /eng\.exportMusicXml \(f, trackIndex\)/);
  assert.match(main, /eng\.exportPerformanceLog \(f\)/);
  assert.match(main, /eng\.writeProjectSheet \(f\)/);
  assert.match(main, /safe->printDocument \(f\)/);
  assert.match(main, /runHeavyExchange \(kind, result\)/);
  assert.match(main, /engineRef->exportOmfPackage \(target, report\)/);
  assert.match(main, /engineRef->exportCdImage \(target, report\)/);
  assert.match(main, /window\.print\(\)/);
  assert.doesNotMatch(main, /Format d'échange non pris en charge/);

  const header = read('Source/AlphaWebMain.h');
  ['runHeavyExchange', 'printDocument', 'showPluginBrowser', 'showProjectLibrary', 'choosePluginFolder']
    .forEach((m) => assert.ok(header.includes(m), 'AlphaWebMain.h ne déclare pas ' + m));
});

test('audit v6 — greffons, périphériques et fenêtres natives réels', () => {
  const main = read('Source/Main.cpp');
  assert.match(main, /class AlphaPluginBrowser final/);
  assert.match(main, /ListBoxModel/);
  assert.match(main, /engine->knownPlugins\.getTypes\(\)/);
  assert.match(main, /engine->startPluginScan \(false\)/);
  assert.match(main, /engine->addInsertReal \(targetTrack, String \(d\.uniqueId\)\.toStdString\(\), -1, MemoryBlock\(\)\)/);
  assert.match(main, /engine->openPluginEditorReal \(track, index\)/);
  assert.match(main, /class AlphaProjectLibrary final/);
  assert.match(main, /findChildFiles \(found, File::findFiles, true, "\*\.alphaproj"\)/);
  assert.match(main, /engine->loadProjectJson \(f\)/);
  assert.match(main, /DocumentWindow \(TR \("Greffons — piste "\)/);
  assert.match(main, /command == "addFX" \|\| command == "pluginBrowser"/);
  assert.match(main, /command == "newLibrary" \|\| command == "projectLibrary"/);
  assert.match(main, /command == "print" \|\| command == "pageSetup"/);
  assert.doesNotMatch(main, /AlertWindow::showMessageBoxAsync \(MessageBoxIconType::WarningIcon, "ALPHA Studio",\s*"Commande/);

  const engine = read('Engines/ALPHA-Studio/Source/Engine.h');
  ['startPluginScan', 'pluginListJson', 'addInsertReal', 'removeInsertReal', 'moveInsertReal',
   'setInsertBypassReal', 'setInsertParameterReal', 'openPluginEditorReal', 'reconcileInsertsWithCore',
   'audioDevicesJson', 'setAudioDeviceTypeReal', 'setAudioDeviceReal', 'midiDevicesJson',
   'refreshMidiInputs', 'setMidiInputReal', 'midiMonitorJson', 'spectrumJson', 'statisticsJson',
   'performanceJson', 'exportPerformanceLog', 'exportFcpXml', 'importFcpXml', 'exportMusicXml',
   'exportCdImage', 'importCdTracks', 'exportOmfPackage', 'importOmfOrAaf', 'detectTempoFromFile',
   'storeWorkspaceReal', 'recallWorkspaceReal', 'projectLibraryJson', 'createProjectFolder',
   'closeProjectReal', 'clearRecentsReal', 'addRecentReal', 'writeProjectSheet']
    .forEach((m) => assert.ok(engine.includes(m), 'Engine.h ne contient pas ' + m));
  assert.match(engine, /j\["lastLogicalTouched"\] = alpha::JsonValue \(core\.state\.lastLogicalTouched\)/);
  assert.match(engine, /isPluginScanRunning\(\) const/);
});

test('audit v6 — plus aucune simulation dans les fenêtres d’analyse et MIDI', () => {
  const w2 = read('UI/AlphaStudio/src/windows2.js');
  const w5 = read('UI/AlphaStudio/src/windows5.js');

  assert.doesNotMatch(w2, /Math\.random/);
  assert.doesNotMatch(w5, /Math\.random/);
  assert.doesNotMatch(w2, /Données simulées/);
  assert.doesNotMatch(w2, /Valeurs simulées/);
  assert.doesNotMatch(w2, /monitoring simulé/);
  assert.doesNotMatch(w2, /\(simulation\)/);
  assert.doesNotMatch(w5, /\(démonstration\)/);
  assert.doesNotMatch(w5, /\(audition\)/);

  // Performances VST : lecture du callback audio réel.
  assert.match(w2, /nativeSend\('getPerformance'\)/);
  assert.match(w2, /pf\.cpuPercent/);
  assert.match(w2, /pf\.diskMegaBytesPerSecond/);
  assert.match(w2, /nativeCheckedSay\('resetPerformancePeaks'/);
  // Analyseur de spectre et statistiques : analyse réelle du moteur.
  assert.match(w2, /nativeSend\('getSpectrum'\)/);
  assert.match(w2, /n\.send\('getStatistics'/);
  assert.match(w2, /r\.crestFactorDb/);
  // Espaces de travail : preset réellement instancié.
  assert.doesNotMatch(w2, /instancié \(démonstration\)/);

  // Moniteur MIDI : événements du callback natif, plus de génération aléatoire.
  assert.match(w5, /nativeSend\('getMidiMonitor', \{ maxEvents: 200 \}\)/);
  assert.match(w5, /nativeSend\('clearMidiMonitor'\)/);
  assert.match(w5, /mm\.events/);
  // Quick Controls et modificateurs MIDI : écriture réelle dans le noyau.
  assert.match(w5, /nativeSend\('setQuickControl'/);
  assert.match(w5, /nativeSend\('applyQuickControl'/);
  assert.match(w5, /nativeSend\('storeMidiModifier'/);
  assert.match(w5, /nativeSend\('applyMidiModifier'/);

  // Éditeur logique : règles réellement stockées puis appliquées.
  const w3 = read('UI/AlphaStudio/src/windows3.js');
  assert.match(w3, /nativeSend\('storeLogicalRule', payload\)/);
  assert.match(w3, /nativeSend\('applyLogicalEdit', \{ ruleIndex: index, allTracks: false \}\)/);
  assert.match(w3, /deviceState\(\)\.lastLogicalTouched/);
  assert.doesNotMatch(w3, /Modification réelle à l’étape 2/);
  assert.doesNotMatch(w3, /\(simulation\)/);

  // Espaces de travail mémorisés/rappelés dans le projet C++.
  const w1 = read('UI/AlphaStudio/src/windows.js');
  assert.match(w1, /nativeSend\('storeWorkspace'/);
  assert.match(w1, /nativeSend\('recallWorkspace'/);
  assert.doesNotMatch(w1, /aucun conflit de port détecté \(simulation\)/);

  const app = read('UI/AlphaStudio/src/app.js');
  assert.doesNotMatch(app, /Gestion de fenêtres simulée/);
});

test('audit v6 — chaque fonction prévue est développée ou remplacée par un équivalent réel', () => {
  const app = read('UI/AlphaStudio/src/app.js');
  const w1 = read('UI/AlphaStudio/src/windows.js');
  const w2 = read('UI/AlphaStudio/src/windows2.js');
  const w3 = read('UI/AlphaStudio/src/windows3.js');
  const eng = read('Engines/ALPHA-Studio/Source/Engine.h');
  const html = read('UI/AlphaStudio/alpha-studio.html');

  /* plus aucune commande renvoyée à plus tard : le libellé seul ne suffit pas */
  assert.ok(!/version ult\u00e9rieure/.test(app));
  assert.ok(!/version ult\u00e9rieure/.test(w2));
  assert.ok(!/version ult\u00e9rieure/.test(w3));

  /* le moteur expose réellement les commandes appelées par l'interface */
  ['processClip', 'detectSilence', 'detectTransients', 'splitAtSilences', 'markersFromSilences',
   'stretchClip', 'indexMediaFolder', 'importMediaFile', 'removeMedia', 'renameMedia',
   'cancelRender', 'closeGaps', 'verifyMedia', 'getPeaks', 'resetMeters'].forEach((c) => {
    assert.ok(eng.indexOf('cmd == "' + c + '"') >= 0, 'commande moteur manquante : ' + c);
  });

  /* l'interface les appelle vraiment (livrable reconstruit inclus) */
  ['processClip', 'detectSilence', 'detectTransients', 'splitAtSilences', 'markersFromSilences',
   'stretchClip', 'importMediaFile', 'removeMedia', 'renameMedia', 'cancelRender', 'closeGaps',
   'verifyMedia', 'getPeaks', 'resetMeters', 'setPreferences', 'setUiLayout', 'setMidiNotes',
   'addMarker', 'removeMarker', 'renameMarker', 'storeWorkspace', 'recallWorkspace'].forEach((c) => {
    assert.ok(html.indexOf("'" + c + "'") >= 0, 'commande non appelée par l\u2019interface : ' + c);
  });

  /* MENU_STUBS ne conserve que des entrées documentaires */
  const stubs = app.slice(app.indexOf('const MENU_STUBS'), app.indexOf('Object.keys(MENU_STUBS)'));
  const n = (stubs.match(/\n    [A-Za-z0-9_]+: \[/g) || []).length;
  assert.ok(n <= 2, 'MENU_STUBS doit rester documentaire, trouvé : ' + n);

  /* les éditeurs passent réellement par le moteur */
  assert.match(w1, /processClip/);
  assert.match(w1, /detectTransients/);
  assert.match(w1, /setMidiNotes/);
  assert.match(w2, /setMidiNotes/);
  assert.match(w3, /splitAtSilences/);

  /* équivalent réel VÉRIFIÉ : le livrable contient le protocole de
     confirmation moteur (commandResult + sendChecked) et l'exécution
     séquentielle du traitement par lot — vérifié fonctionnellement par
     tests/verified-results.test.js (résultats, pas noms de commandes). */
  ['sendChecked', 'commandResult', 'nativeChecked', 'runBatch', 'data-batchfoot'].forEach((m) => {
    assert.ok(html.indexOf(m) >= 0, 'protocole de vérification absent du livrable : ' + m);
  });
  assert.match(eng, /commandResult/);
  assert.match(eng, /String writeClipToDisk/);
});

test('audit v6 — matrice de triage par point, sans acceptation finale', () => {
  assert.ok(exists('docs/AUDIT-V6-MATRICE.md'));
  const matrix = read('docs/AUDIT-V6-MATRICE.md');
  assert.match(matrix, /A01/);
  assert.match(matrix, /A136/);
  assert.match(matrix, /CORRIGÉ/);
  assert.match(matrix, /NON RÉSOLU|PARTIEL/);
  assert.match(matrix, /Aucune acceptation finale/);

  assert.ok(exists('docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md'));
  const triage = read('docs/TRIAGE-AUDIT-UTILISATEUR-0.5.0.md');
  assert.match(triage, /A01/);
  assert.match(triage, /W01/);
  assert.match(triage, /Aucune acceptation finale/);
  assert.match(triage, /AUDIT-V6-MATRICE\.md/);
});
