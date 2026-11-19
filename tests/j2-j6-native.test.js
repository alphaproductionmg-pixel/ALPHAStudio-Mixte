'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHarness } = require('./support/harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));

function fx() {
  return {
    eqEnabled: true,
    eq: [
      { freq: 100, gainDb: 0, q: 0.707, enabled: true, lowShelf: true, highShelf: false },
      { freq: 500, gainDb: 0, q: 0.707, enabled: true, lowShelf: false, highShelf: false },
      { freq: 2400, gainDb: 0, q: 0.707, enabled: true, lowShelf: false, highShelf: false },
      { freq: 8000, gainDb: 0, q: 0.707, enabled: true, lowShelf: false, highShelf: true }
    ],
    dynamics: { thresholdDb: -18, ratio: 3, attackMs: 5, releaseMs: 80, makeupDb: 0, enabled: false }
  };
}

function makeSnapshot() {
  return {
    schema: 2,
    format: 'ALPHAPROJ',
    name: 'Test moteur J2-J6',
    createdUtc: '2026-11-19T00:00:00Z',
    modifiedUtc: '2026-11-19T00:00:00Z',
    bpm: 120,
    masterDb: 0,
    looping: true,
    metronome: false,
    loopStartBars: 9,
    loopEndBars: 17,
    punchEnabled: false,
    punchInBars: 1,
    punchOutBars: 9,
    precountBars: 1,
    latencyMs: 0,
    tracks: [{
      id: 'native_0',
      name: 'Voix native',
      colour: '#4f7fa8',
      volumeDb: -2.5,
      pan: 0,
      mute: false,
      solo: false,
      arm: false,
      instrument: false,
      bus: 0,
      sendDb: 0,
      fx: fx(),
      clips: [{
        id: 'clip-voix-0',
        name: 'Prise voix',
        media: 'Media/Voix.wav',
        startBars: 9,
        lenBars: 4,
        lengthBars: 4,
        offsetBars: 0,
        loop: false,
        type: 'audio'
      }],
      midiNotes: [],
      automation: [],
      levelL: 0,
      levelR: 0,
      peak: 0,
      lufs: -70
    }],
    buses: [
      { name: 'Bus A', volumeDb: 0, pan: 0, mute: false },
      { name: 'Bus B', volumeDb: 0, pan: 0, mute: false },
      { name: 'Bus C', volumeDb: 0, pan: 0, mute: false },
      { name: 'Bus D', volumeDb: 0, pan: 0, mute: false }
    ],
    markers: [
      { bars: 1, endBars: 1, name: 'Intro', cycle: false },
      { bars: 9, endBars: 9, name: 'Couplet 1', cycle: false }
    ],
    media: ['Media/Voix.wav'],
    templates: ['Vide', 'Démo 4 pistes', 'Podcast', 'Mixage'],
    preferences: {
      autoSave: true, keyboardAccess: true, highContrast: false, largeText: false,
      autoSaveSeconds: 30, latencyMs: 0, precountBars: 1, theme: 'Nuendo 4'
    },
    controlRoom: { monitorDb: 0, dim: false, mono: false, source: 'Mix' },
    positionBars: 9,
    playing: false,
    recording: false,
    looping: true,
    metronome: false,
    sampleRate: 48000,
    device: 'Carte simulée',
    status: 'Moteur JUCE/WebView2 prêt',
    projectPath: '',
    autosavePath: '',
    projectLengthBars: 84,
    history: [
      { index: 0, label: 'État initial', current: false, undoable: false, redoable: true },
      { index: 1, label: 'Ajouter une piste', current: true, undoable: false, redoable: false },
      { index: 2, label: 'Réglage de piste', current: false, undoable: true, redoable: false }
    ],
    historyCount: 3,
    historyIndex: 1,
    canUndo: true,
    canRedo: true,
    dirty: false,
    masterLevelL: 0,
    masterLevelR: 0,
    masterPeak: 0,
    masterLufs: -70,
    videoEnabled: false,
    videoPolicy: 'after_final_confirmed_test'
  };
}

async function readyHarness(options) {
  const h = createHarness(Object.assign({ nativeBridge: true }, options || {}));
  h.runTimers(0);
  assert.equal(h.native.calls[0].name, 'getState');
  const snapshot = makeSnapshot();
  h.native.completeNative(snapshot);
  await h.flush();
  return { h, snapshot };
}

test('j2a — protocole JUCE 8, priorité native, snapshot et compteurs par identifiant', async () => {
  const { h, snapshot } = await readyHarness();
  assert.equal(h.window.ALPHA_AUDIO.mode, 'native');
  assert.equal(h.contexts.length, 0);
  assert.equal(h.A.TRACKS[4].id, 'native_0');
  assert.equal(h.A.PARTS[0].track, 'native_0');
  assert.equal(h.A.state.pos, 9);
  assert.match(h.status.textContent, /Moteur JUCE/);
  assert.equal(h.window.ALPHA_NATIVE.videoEnabled, false);
  assert.equal(h.window.ALPHA_NATIVE.getState().videoPolicy, 'after_final_confirmed_test');
  const levels = h.meters.fromNative({
    tracks: [{ id: 'voix', levelL: 0.4, levelR: 0.2 }],
    masterLevelL: 0, masterPeak: 0
  });
  assert.ok(levels.voix.peak > 0);
  assert.ok(levels.native_0.peak > 0);
  assert.ok(levels.master.rms > 0);

  h.A.ACTIONS.play();
  h.A.ACTIONS.stop();
  h.A.ACTIONS.record();
  h.A.ACTIONS.cycle();
  h.A.ACTIONS.click();
  h.A.ACTIONS.saveProject();
  h.A.ACTIONS.saveTemplate();
  h.A.ACTIONS.loadTemplateFile();
  h.A.ACTIONS.newFromTemplate();
  const names = h.native.calls.slice(1).map((c) => c.name);
  assert.deepEqual(names, ['play', 'stop', 'record', 'cycle', 'metronome', 'saveProject',
                           'saveTemplate', 'loadTemplateFile', 'applyTemplate']);
  assert.equal(h.native.calls[1].resultId, 1);
  assert.equal(snapshot.videoEnabled, false);
  h.native.completeNative(snapshot);
  await h.flush();
});

test('j2b — Ctrl+Z / Ctrl+Y, historique visuel et verrou vidéo', async () => {
  const { h, snapshot } = await readyHarness({ windows: true });
  h.A.ACTIONS.undo();
  h.A.ACTIONS.redo();
  h.document.dispatchEvent({
    type: 'keydown', key: 'z', ctrlKey: true,
    preventDefault() {}, stopImmediatePropagation() {}
  });
  h.A.ACTIONS.importVideo();
  h.A.ACTIONS.exportVideo();
  h.A.ACTIONS.videoOut();
  let names = h.native.calls.slice(1).map((c) => c.name);
  assert.deepEqual(names, ['undo', 'redo', 'undo', 'setVideoEnabled', 'setVideoEnabled', 'setVideoEnabled']);

  h.A.ACTIONS.projectHistory();
  assert.ok(h.window.ALPHAWIN.REG.alphaHistory);
  assert.equal(h.window.ALPHAWIN.lastRows.length, snapshot.history.length);
  h.window.ALPHAWIN.lastRows[1].dispatchEvent({ type: 'click' });
  names = h.native.calls.map((c) => c.name);
  assert.equal(names[names.length - 1], 'jumpHistory');
  assert.equal(h.native.calls[h.native.calls.length - 1].data.index, 1);
  assert.equal(h.window.ALPHAWIN.REG.alphaHistory, undefined);
  h.native.completeNative(snapshot);
  await h.flush();
});

test('j2c — édition locale envoyée une seule fois par replaceState', async () => {
  const { h, snapshot } = await readyHarness();
  const before = h.native.calls.length;
  h.A.PARTS[0].start = 12;
  h.document.dispatchEvent({ type: 'pointerup', target: { closest: () => null } });
  h.runTimers(60);
  const replacements = h.native.calls.filter((c) => c.name === 'replaceState');
  assert.equal(replacements.length, 1);
  const project = replacements[0].data.state;
  assert.equal(project.format, 'ALPHAPROJ');
  assert.equal(project.tracks.length, 1);
  assert.equal(project.tracks[0].clips[0].startBars, 12);
  assert.equal(project.videoEnabled, false);

  const updated = clone(snapshot);
  Object.assign(updated, clone(project));
  updated.positionBars = 12;
  updated.status = 'Édition native appliquée.';
  updated.tracks[0].clips[0].lengthBars = updated.tracks[0].clips[0].lenBars;
  h.native.completeNative(updated);
  await h.flush();

  h.document.dispatchEvent({ type: 'pointerup', target: { closest: () => null } });
  h.runTimers(60);
  assert.equal(h.native.calls.filter((c) => c.name === 'replaceState').length, 1); // pas de faux niveau d'historique.
  assert.equal(h.native.calls.length, before + 1);
  h.native.completeNative(updated);
  await h.flush();
});

test('j2d — glisser-déposer WAV, MIDI et .alphaproj vers le moteur', async () => {
  const { h, snapshot } = await readyHarness();
  const files = [
    { name: 'Voix.wav', type: 'audio/wav', base64: 'QVdB' },
    { name: 'Part.mid', type: 'audio/midi', base64: 'TVRoZA==' },
    { name: 'Projet.alphaproj', type: 'application/json', base64: 'eyJmb3JtYXQiOiJBTFBIQVBST0oifQ==' }
  ];
  h.document.dispatchEvent({
    type: 'drop',
    clientX: 256,
    preventDefault() {},
    dataTransfer: { files, dropEffect: '' }
  });
  const names = h.native.calls.slice(1).map((c) => c.name);
  assert.deepEqual(names, ['importAudioData', 'importMidiData', 'importProjectData', 'setStatus']);
  assert.equal(h.native.calls[1].data.startBars, 5);
  assert.equal(h.native.calls[1].data.trackIndex, 0);
  assert.equal(h.native.calls[1].data.base64, 'QVdB');
  assert.equal(h.native.calls[2].data.base64, 'TVRoZA==');
  assert.equal(h.native.calls[3].data.name, 'Projet.alphaproj');
  h.native.completeNative(snapshot);
  await h.flush();
});

test('j2e — les stubs purement documentaires envoient un statut explicite, sans « étape 2 »', async () => {
  const h = createHarness({
    nativeBridge: true,
    menuStubs: { docManual: ['Manuel Nuendo 4', 'Message historique.'] }
  });
  h.runTimers(0);
  const snapshot = makeSnapshot();
  h.native.completeNative(snapshot);
  await h.flush();
  h.A.ACTIONS.docManual();
  const call = h.native.calls[h.native.calls.length - 1];
  assert.equal(call.name, 'setStatus');
  assert.match(call.data.status, /Manuel Nuendo 4/);
  assert.match(call.data.status, /non implémentée/);
  assert.ok(!/étape 2/i.test(call.data.status));
  h.native.completeNative(snapshot);
  await h.flush();
});

test('audit v6 — les commandes d’échange et de bibliothèque appellent le moteur réel', async () => {
  const h = createHarness({ nativeBridge: true });
  h.runTimers(0);
  const snapshot = makeSnapshot();
  h.native.completeNative(snapshot);
  await h.flush();

  const expected = {
    newLibrary: 'newLibrary',
    newFolder: 'newFolder',
    clearRecent: 'clearRecents',
    closeProject: 'closeProject',
    print: 'print',
    pageSetup: 'pageSetup',
    exportScore: 'exportScore',
    exportOmf: 'exportOmf',
    omf: 'exportOmf',
    exportXml: 'exportXml',
    exportCd: 'exportCd',
    exportPerf: 'exportPerf',
    importOmf: 'importOmf',
    importAaf: 'importAaf',
    importXml: 'importXml',
    importCd: 'importCd',
    removeEmpty: 'removeEmptyTracks',
    addFX: 'addFX'
  };
  Object.keys(expected).forEach((key) => {
    h.A.ACTIONS[key]();
    const call = h.native.calls[h.native.calls.length - 1];
    assert.equal(call.name, expected[key], 'commande « ' + key + ' » mal reliée');
    assert.notEqual(call.name, 'setStatus', 'commande « ' + key + ' » encore détournée vers setStatus');
    h.native.completeNative(snapshot);
  });

  // Les imports d’échange transmettent réellement la position et la piste.
  h.A.ACTIONS.importOmf();
  const omf = h.native.calls[h.native.calls.length - 1];
  assert.equal(typeof omf.data.startBars, 'number');
  assert.equal(typeof omf.data.trackIndex, 'number');
  h.native.completeNative(snapshot);

  // L’export de partition vise la piste réellement sélectionnée.
  h.A.ACTIONS.exportScore();
  const score = h.native.calls[h.native.calls.length - 1];
  assert.equal(typeof score.data.trackIndex, 'number');
  h.native.completeNative(snapshot);
  await h.flush();
});

test('audit v6 — l’éditeur logique MIDI ouvre la fenêtre réelle, sans statut de repli', async () => {
  const h = createHarness({ nativeBridge: true });
  h.runTimers(0);
  const snapshot = makeSnapshot();
  h.native.completeNative(snapshot);
  await h.flush();

  const opened = [];
  h.window.ALPHAWIN = { open: (id) => { opened.push(id); return { id }; } };
  h.A.ACTIONS.midiLogical();
  assert.deepEqual(opened, ['logical']);
  const names = h.native.calls.map((c) => c.name);
  assert.ok(!names.includes('quantizeMidi'), 'midiLogical ne doit plus être détourné vers quantizeMidi');
  h.native.completeNative(snapshot);
  await h.flush();
});

test('s7 — délai natif, erreur explicite, réponses tardives et nettoyage', async () => {
  const { h, snapshot } = await readyHarness();
  const missing = h.window.ALPHA_NATIVE.send('noReply');
  assert.equal(h.window.ALPHA_NATIVE.pendingCount(), 1);
  h.runTimers(15000);
  await h.flush();
  assert.equal(await missing, null);
  assert.equal(h.window.ALPHA_NATIVE.pendingCount(), 0);
  assert.match(h.status.textContent, /Réponse native absente/);

  const failed = h.window.ALPHA_NATIVE.send('nativeError');
  h.native.failNative('Erreur native simulée');
  await h.flush();
  assert.equal(await failed, null);
  assert.equal(h.window.ALPHA_NATIVE.pendingCount(), 0);
  assert.match(h.status.textContent, /Erreur native simulée/);

  h.native.completeNative(snapshot); // doublon / réponse tardive : ignoré.
  await h.flush();
  assert.equal(h.window.ALPHA_NATIVE.pendingCount(), 0);
});

test('j2f — sources J2-J6, workflow et livrable cohérents', () => {
  const html = read('UI/AlphaStudio/alpha-studio.html');
  assert.ok(html.includes('__juce__invoke'));
  assert.ok(html.includes('replaceState'));
  assert.ok(html.includes('after_final_confirmed_test') === false || html.includes('videoEnabled'));
  assert.ok(Buffer.byteLength(html, 'utf8') > 987000);

  const bridge = read('UI/AlphaStudio/native-bridge.js');
  for (const needle of ['__juce__complete', 'replaceState', 'jumpHistory', 'importAudioData',
                        'importMidiData', 'importProjectData', 'loadTemplateFile', 'videoEnabled: false',
                        'ALPHA_AUDIO_METERS.fromNative']) {
    assert.ok(bridge.includes(needle), 'pont natif : ' + needle);
  }

  const core = read('Engines/ALPHA-Studio/Source/AlphaProjectCore.h');
  assert.match(core, /after_final_confirmed_test/);
  assert.match(core, /parseSmf/);
  assert.match(core, /makeSmf/);
  assert.match(core, /replaceState/);
  const engine = read('Engines/ALPHA-Studio/Source/Engine.h');
  assert.match(engine, /AlphaProjectCore\.h/);
  assert.match(engine, /saveTemplate/);
  assert.match(engine, /renderOffline/);
  assert.match(engine, /stateJson/);
  const main = read('Source/Main.cpp');
  assert.match(main, /withNativeFunction/);
  assert.match(main, /openDialog/);
  assert.match(main, /exportWav/);
  const cmake = read('CMakeLists.txt');
  assert.match(cmake, /NEEDS_WEBVIEW2 TRUE/);
  assert.match(cmake, /JUCE_USE_WIN_WEBVIEW2=1/);
  assert.match(cmake, /juce::juce_dsp/);

  const etapes = read('ETAPES.md');
  assert.match(etapes, /Méthode verrouillée/);
  assert.match(etapes, /un seul push\/compile GitHub à la fin/);
  assert.match(etapes, /Vidéo \| \*\*Exclue\*\*/);
  const contract = read('docs/J2-J6-contrat.md');
  assert.match(contract, /Windows \/ JUCE 8 \/ WebView2/);
  assert.match(contract, /after_final_confirmed_test/);
  assert.match(contract, /Aucun élément n'est à 100 %/);
  const workflow = read('.github/workflows/windows-build.yml');
  assert.match(workflow, /windows-2022/);
  assert.match(workflow, /cmake -S \. -B build/);
  assert.match(workflow, /cmake --build build/);
  assert.doesNotMatch(workflow, /CMAKE_BUILD_TYPE/);
  assert.match(workflow, /Microsoft\.Web\.WebView2/);
  assert.match(workflow, /WebView2Loader\.dll/);
  assert.match(workflow, /ALPHAStudio-Setup-0\.5\.0-x64/);
  assert.match(workflow, /ASIO-SDK_2\.3\.4/);
  assert.match(workflow, /Inno Setup/);
  assert.ok(read('.gitignore').includes('__pycache__/'));
  const runner = read('tests/run.sh');
  assert.match(runner, /g\+\+.*alpha-core\.test\.cpp/);
  assert.match(runner, /j2-j6-native\.test\.js/);
  assert.match(runner, /juce-syntax\.sh/);
  assert.match(runner, /repair-0\.5\.test\.js/);
  assert.ok(!runner.includes('npm install'));
});
