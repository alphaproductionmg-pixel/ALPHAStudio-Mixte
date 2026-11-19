/* ALPHA Studio — pont natif JUCE 8 / WebView2 (J2→J6).
   Le fichier est inséré après l'interface et avant le repli Web Audio J1.
   Il n'active ALPHA_NATIVE que si WebView2 a injecté window.__JUCE__.backend. */
(function () {
  'use strict';
  const A = window.ALPHA;
  const juce = window.__JUCE__;
  const backend = juce && juce.backend;
  if (!A || !A.ACTIONS || !backend ||
      typeof backend.emitEvent !== 'function' ||
      typeof backend.addEventListener !== 'function') return;

  /* Protocole natif JUCE 8 : un événement __juce__invoke avec params=[commande, données],
     puis un événement __juce__complete { promiseId, result }. Le module JS JUCE n'est pas
     importé dans le HTML autonome : le pont implémente ici son petit gestionnaire de promesses. */
  const NATIVE_TIMEOUT_MS = 15000;
  const pending = new Map();
  let promiseId = 0;
  backend.addEventListener('__juce__complete', (event) => {
    if (!event) return;
    const id = Number(event.promiseId);
    const entry = pending.get(id);
    if (!entry) return; // réponse tardive, doublon ou identifiant inconnu.
    pending.delete(id);
    if (entry.timer !== null && typeof clearTimeout === 'function') clearTimeout(entry.timer);
    if (event.error) entry.reject(new Error(String(event.error)));
    else entry.resolve(event.result);
  });
  const nativeCall = (name, data) => new Promise((resolve, reject) => {
    const id = promiseId++;
    const entry = { resolve, reject, timer: null };
    if (typeof setTimeout === 'function') {
      entry.timer = setTimeout(() => {
        if (!pending.delete(id)) return;
        reject(new Error('Réponse native absente pour « ' + name + ' ».'));
      }, NATIVE_TIMEOUT_MS);
    }
    pending.set(id, entry);
    try {
      backend.emitEvent('__juce__invoke', {
        name: 'alphaCommand',
        params: [name, data || {}],
        resultId: id
      });
    } catch (error) {
      if (pending.delete(id) && entry.timer !== null && typeof clearTimeout === 'function') clearTimeout(entry.timer);
      reject(error);
    }
  });

  const num = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : (Number.isFinite(Number(fallback)) ? Number(fallback) : 0);
  };
  const clamp = (value, low, high, fallback) => Math.min(high, Math.max(low, num(value, fallback)));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const parseSnapshot = (value) => {
    if (!value) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    return typeof value === 'object' ? value : null;
  };
  const trackRows = () => (A.TRACKS || []).filter((t, i) => {
    if (i < 4 || !t) return false;
    return ['folder', 'video', 'marker', 'tempo', 'ruler', 'arrange'].indexOf(t.kind) < 0;
  });
  const nativeIndex = (id) => {
    const match = /^native_(\d+)$/.exec(String(id || ''));
    if (match) return Number(match[1]);
    const rows = trackRows();
    for (let i = 0; i < rows.length; i++) if (rows[i].id === id) return i;
    return -1;
  };
  const selectedIndex = () => Math.max(0, nativeIndex(A.state && A.state.selectedTrack));
  let lastSnapshot = null;
  let lastUiSignature = '';
  let lastHistorySignature = '';
  let lastProjectSignature = '';
  let applyingState = false;
  let commitTimer = null;
  let initialRequestDone = false;

  function normaliseTrack(t, i) {
    t = t || {};
    const clips = (t.clips || []).map((c, ci) => ({
      id: String((c && c.id) || ('nativeClip_' + i + '_' + ci)),
      name: String((c && c.name) || 'Audio'),
      media: String((c && c.media) || ''),
      startBars: clamp(c && c.startBars, 1, 100000, 1),
      lenBars: clamp(c && (c.lengthBars !== undefined ? c.lengthBars : c.lenBars), 0.001, 100000, 1),
      offsetBars: clamp(c && c.offsetBars, 0, 100000, 0),
      loop: !!(c && c.loop)
    }));
    return {
      id: 'native_' + i,
      name: String(t.name || ('Audio ' + (i + 1))),
      colour: String(t.colour || '#4f7fa8'),
      volumeDb: clamp(t.volumeDb, -60, 12, -6),
      pan: clamp(t.pan, -1, 1, 0),
      mute: !!t.mute, solo: !!t.solo, arm: !!t.arm,
      instrument: !!t.instrument,
      bus: Math.round(clamp(t.bus, 0, 3, 0)),
      sendDb: clamp(t.sendDb, -60, 12, 0),
      fx: clone(t.fx || {}),
      clips,
      midiNotes: clone(t.midiNotes || []),
      automation: clone(t.automation || [])
    };
  }
  function normaliseProject(snapshot) {
    snapshot = snapshot || {};
    const loopStart = clamp(snapshot.loopStartBars, 1, 100000, 1);
    const punchIn = clamp(snapshot.punchInBars, 1, 100000, 1);
    return {
      schema: 2,
      format: 'ALPHAPROJ',
      name: String(snapshot.name || 'Projet ALPHA Studio'),
      createdUtc: String(snapshot.createdUtc || ''),
      bpm: clamp(snapshot.bpm, 20, 300, 120),
      masterDb: clamp(snapshot.masterDb, -60, 12, 0),
      looping: !!snapshot.looping,
      metronome: !!snapshot.metronome,
      loopStartBars: loopStart,
      loopEndBars: Math.max(loopStart + 0.01, clamp(snapshot.loopEndBars, 1, 100000, 9)),
      punchEnabled: !!snapshot.punchEnabled,
      punchInBars: punchIn,
      punchOutBars: Math.max(punchIn, clamp(snapshot.punchOutBars, 1, 100000, 9)),
      precountBars: clamp(snapshot.precountBars, 0, 8, 1),
      latencyMs: clamp(snapshot.latencyMs, 0, 500, 0),
      tracks: (snapshot.tracks || []).map(normaliseTrack),
      buses: clone(snapshot.buses || []),
      markers: clone(snapshot.markers || []),
      templates: clone(snapshot.templates || []),
      preferences: clone(snapshot.preferences || {}),
      controlRoom: clone(snapshot.controlRoom || {}),
      videoEnabled: false
    };
  }
  function buildProjectState() {
    if (!lastSnapshot) return null;
    const base = normaliseProject(lastSnapshot);
    const rows = trackRows();
    const projectParts = (A.PARTS || []).filter((p) => p && nativeIndex(p.track) >= 0);
    base.tracks = rows.map((t, i) => {
      const src = normaliseTrack((lastSnapshot.tracks || [])[i], i);
      const clips = projectParts.filter((p) => nativeIndex(p.track) === i).map((p, ci) => {
        const c = p.nativeClip || {};
        return {
          id: String(p.nativeId || c.id || p.id || ('nativeClip_' + i + '_' + ci)),
          name: String(p.name || c.name || 'Audio'),
          media: String(p.media || c.media || ''),
          startBars: clamp(p.start, 1, 100000, 1),
          lenBars: clamp(p.len, 0.001, 100000, 1),
          offsetBars: clamp(p.offsetBars !== undefined ? p.offsetBars : c.offsetBars, 0, 100000, 0),
          loop: !!(p.loop !== undefined ? p.loop : c.loop)
        };
      }).sort((a, b) => a.startBars - b.startBars);
      return Object.assign({}, src, {
        id: 'native_' + i,
        name: String(t.name || src.name),
        colour: String(t.color || t.colour || src.colour),
        volumeDb: clamp(t.db, -60, 12, src.volumeDb),
        pan: clamp(t.pan, -1, 1, src.pan),
        mute: !!t.mute, solo: !!t.solo, arm: !!t.rec,
        instrument: t.kind === 'midi' || src.instrument,
        clips
      });
    });
    if (A.state) {
      if (Number.isFinite(Number(A.state.tempo))) base.bpm = clamp(A.state.tempo, 20, 300, base.bpm);
      if (typeof A.state.cycle === 'boolean') base.looping = A.state.cycle;
      if (typeof A.state.click === 'boolean') base.metronome = A.state.click;
      if (A.state.cycleL !== undefined) base.loopStartBars = clamp(A.state.cycleL, 1, 100000, base.loopStartBars);
      if (A.state.cycleR !== undefined) base.loopEndBars = Math.max(base.loopStartBars + 0.01, clamp(A.state.cycleR, 1, 100000, base.loopEndBars));
      if (typeof A.state.punchIn === 'boolean' && typeof A.state.punchOut === 'boolean') {
        base.punchEnabled = A.state.punchIn && A.state.punchOut;
        base.punchInBars = base.loopStartBars;
        base.punchOutBars = base.loopEndBars;
      }
    }
    base.videoEnabled = false;
    return base;
  }
  function commitUiState() {
    commitTimer = null;
    if (applyingState || !lastSnapshot) return;
    const project = buildProjectState();
    if (!project) return;
    const signature = JSON.stringify(project);
    if (signature === lastProjectSignature) return;
    lastProjectSignature = signature;
    send('replaceState', { state: project });
  }
  function scheduleCommit() {
    if (applyingState || commitTimer !== null) return;
    if (typeof window.setTimeout === 'function') commitTimer = window.setTimeout(commitUiState, 60);
    else commitUiState();
  }

  function send(name, data) {
    return nativeCall(name, data).then((result) => {
      const snapshot = parseSnapshot(result);
      if (snapshot && typeof snapshot === 'object') applyState(snapshot);
      return snapshot;
    }).catch((error) => {
      const message = 'Commande native « ' + name + ' » indisponible : ' +
                      ((error && error.message) || String(error));
      const status = document.getElementById('sbStatus');
      if (status) status.textContent = message;
      if (A.showToast) A.showToast(message, 'ALPHA Studio');
      return null;
    });
  }

  function applyDisplayMetrics(snapshot) {
    const root = document.documentElement;
    if (!root || !root.style || typeof root.style.setProperty !== 'function') return;
    const fontScale = clamp(snapshot.fontScale, 0.8, 2.0, 1);
    const uiScale = clamp(snapshot.uiScale, 0.60, 1.25, 1);
    const dpiScale = clamp(snapshot.dpiScale, 0.75, 3.0, 1);
    root.style.setProperty('--alpha-font-scale', String(fontScale / uiScale));
    root.style.setProperty('--alpha-ui-scale', String(uiScale));
    root.style.setProperty('--alpha-dpi-scale', String(dpiScale));
    const safe = snapshot.safeArea || {};
    const viewportW = Math.max(1, Number(window.innerWidth || safe.width || 1600));
    const viewportH = Math.max(1, Number(window.innerHeight || safe.height || 900));
    root.style.setProperty('--alpha-viewport-w', Math.ceil(viewportW / uiScale) + 'px');
    root.style.setProperty('--alpha-viewport-h', Math.ceil(viewportH / uiScale) + 'px');
    root.dataset.alphaNative = '1';
    root.dataset.alphaAsio = snapshot.asioAvailable ? '1' : '0';
    root.dataset.alphaVersion = String(snapshot.appVersion || '0.5.0');
  }

  function applyState(snapshot) {
    snapshot = parseSnapshot(snapshot);
    if (!snapshot || !Array.isArray(snapshot.tracks)) return;
    applyingState = true;
    try {
      lastSnapshot = clone(snapshot);
      applyDisplayMetrics(snapshot);
      lastProjectSignature = JSON.stringify(normaliseProject(snapshot));
      const signature = JSON.stringify(snapshot.tracks.map(t => ({
        name: t.name, volumeDb: t.volumeDb, pan: t.pan, mute: t.mute,
        solo: t.solo, arm: t.arm, colour: t.colour,
        clips: (t.clips || []).map(c => [c.id, c.name, c.media, c.startBars, c.lengthBars || c.lenBars, c.offsetBars])
      })));
      const nativeTracks = snapshot.tracks.map((t, i) => ({
        id: 'native_' + i, kind: t.instrument ? 'midi' : 'audio', num: String(i + 1).padStart(2, '0'),
        name: t.name || ('Audio ' + (i + 1)), h: 64,
        color: t.colour || '#4f7fa8', partColor: t.colour || '#8fb6d6',
        db: Number(t.volumeDb || 0), pan: Number(t.pan || 0),
        mute: !!t.mute, solo: !!t.solo, rec: !!t.arm, mon: false, vol: 70
      }));
      const nativeParts = [];
      snapshot.tracks.forEach((t, ti) => (t.clips || []).forEach((clip, ci) => {
        nativeParts.push({
          id: String(clip.id || ('nativeClip_' + ti + '_' + ci)),
          nativeId: String(clip.id || ('nativeClip_' + ti + '_' + ci)),
          nativeClip: clone(clip),
          track: 'native_' + ti,
          name: clip.name || 'Audio',
          start: Number(clip.startBars || 1),
          len: Math.max(0.001, Number(clip.lengthBars !== undefined ? clip.lengthBars : clip.lenBars) || 1),
          type: 'audio', wave: 'native'
        });
      }));
      if (signature !== lastUiSignature) {
        const displayTracks = nativeTracks.length ? nativeTracks : [{
          id: 'voix', kind: 'folder', name: 'Aucune piste', h: 26,
          color: '#4f7fa8', open: true, kids: []
        }];
        A.TRACKS.splice(4, A.TRACKS.length - 4, ...displayTracks);
        A.PARTS.splice(0, A.PARTS.length, ...nativeParts);
        A.state.selectedTrack = nativeTracks.length ? nativeTracks[0].id : 'voix';
        A.state.selTracks = nativeTracks.length ? [nativeTracks[0].id] : ['voix'];
        lastUiSignature = signature;
        A.refresh();
      }
      A.state.pos = Number(snapshot.positionBars || 1);
      /* J1 : position exacte, sans quantification de la grille (pas de dérive). */
      if (A.setPlayhead) A.setPlayhead(A.state.pos);
      else A.goto(A.state.pos);
      A.state.bars = Math.max(84, ...nativeParts.map(p => p.start + p.len + 8));
      A.state.playing = !!snapshot.playing;
      A.state.recording = !!snapshot.recording;
      A.state.cycle = !!snapshot.looping;
      A.state.click = !!snapshot.metronome;
      A.state.cycleL = Number(snapshot.loopStartBars || 1);
      A.state.cycleR = Number(snapshot.loopEndBars || 9);
      const playButton = document.getElementById('tpPlay');
      const recButton = document.getElementById('tpRec');
      const cycleButton = document.getElementById('tpCycleBtn');
      const clickButton = document.getElementById('tpClick');
      if (playButton) playButton.classList.toggle('active', A.state.playing && !A.state.recording);
      if (recButton) recButton.classList.toggle('active', A.state.recording);
      if (cycleButton) cycleButton.classList.toggle('active', A.state.cycle);
      if (clickButton) clickButton.classList.toggle('on', A.state.click);
      const status = document.getElementById('sbStatus');
      if (status) status.textContent = snapshot.status || snapshot.device || 'Moteur JUCE/WebView2';
      /* J1.d : les niveaux publiés par AlphaEngine animent les compteurs. */
      if (window.ALPHA_AUDIO_METERS && window.ALPHA_AUDIO_METERS.fromNative) {
        window.ALPHA_AUDIO_METERS.fromNative(snapshot);
      }
      const historySignature = JSON.stringify(snapshot.history || []) + ':' + String(snapshot.historyIndex || 0);
      if (historySignature !== lastHistorySignature) {
        lastHistorySignature = historySignature;
        refreshHistoryWindow();
      }
      window.ALPHA_NATIVE.state = lastSnapshot;
    } finally {
      applyingState = false;
    }
  }

  function esc(text) {
    return String(text === undefined || text === null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function refreshHistoryWindow() {
    const W = window.ALPHAWIN;
    if (!W || !W.REG || !W.REG.alphaHistory || !W.close || !W.open) return;
    try { W.close('alphaHistory'); W.open('alphaHistory'); } catch (e) {}
  }
  function installHistoryWindow() {
    const W = window.ALPHAWIN;
    if (!W || typeof W.register !== 'function') return;
    W.register({
      alphaHistory: {
        label: 'Historique illimité ALPHA Studio', x: 330, y: 180, w: 712, h: 362,
        build: () => {
          const entries = (lastSnapshot && lastSnapshot.history) || [];
          const rows = entries.length ? entries.map((h) =>
            '<tr data-hindex="' + esc(h.index) + '" class="' + (h.current ? 'sel' : '') + '">' +
            '<td>' + esc(h.index) + '</td><td class="nm">' + esc(h.label) + '</td>' +
            '<td>' + (h.current ? 'État courant' : (h.undoable ? 'Déjà appliqué' : 'Rétablissable')) + '</td></tr>'
          ).join('') : '<tr><td colspan="3" class="empty-cell">État initial.</td></tr>';
          return {
            title: 'Historique illimité <em>· JUCE / .alphaproj</em>',
            ac: '#5c6b7a',
            html: '<div class="w-toolbar"><span class="w-lbl">Historique du projet</span>' +
                  '<span style="flex:1"></span><span class="w-lbl">' + esc(entries.length) + ' niveau(x)</span></div>' +
                  '<div class="w-scroll"><table class="mk-table hist-table"><thead><tr>' +
                  '<th style="width:10%">N°</th><th style="width:62%">Opération</th><th style="width:28%">État</th>' +
                  '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
                  '<div class="aw-foot"><span>Cliquer sur une ligne appelle jumpHistory ; Ctrl+Z et Ctrl+Y appellent le noyau C++.</span></div>',
            after(body) {
              if (!body || !body.querySelectorAll) return;
              Array.prototype.slice.call(body.querySelectorAll('[data-hindex]')).forEach((row) => {
                row.addEventListener('click', () => {
                  send('jumpHistory', { index: Number(row.dataset.hindex) });
                  if (window.ALPHAWIN) window.ALPHAWIN.close('alphaHistory');
                });
              });
            }
          };
        }
      }
    });
  }

  function chooseTemplate() {
    const names = (lastSnapshot && lastSnapshot.templates) || ['Vide', 'Démo 4 pistes', 'Podcast', 'Mixage'];
    const name = typeof window.prompt === 'function'
      ? window.prompt('Modèle ALPHA Studio :\n' + names.join('\n'), names[1] || names[0])
      : (names[1] || names[0]);
    if (name) send('applyTemplate', { name });
  }
  function dropBars(event) {
    const ruler = document.getElementById('ruler-vp');
    const lanes = document.getElementById('lanes-vp');
    if (!ruler || !lanes || !ruler.getBoundingClientRect) return A.state.pos;
    const rect = ruler.getBoundingClientRect();
    const x = event.clientX - rect.left + (lanes.scrollLeft || 0);
    return Math.max(1, x / (A.state.barW || 64) + 1);
  }
  function importFile(file, startBars, trackIndex) {
    if (!file || typeof FileReader === 'undefined') return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      const lower = String(file.name || '').toLowerCase();
      if (/\.mid(i)?$/.test(lower)) send('importMidiData', { name: file.name, base64, startBars, trackIndex });
      else if (/\.(alphaproj|json)$/.test(lower)) send('importProjectData', { name: file.name, base64 });
      else if (/\.(wav|mp3|flac|ogg|aif|aiff)$/.test(lower)) send('importAudioData', { name: file.name, base64, startBars, trackIndex });
      else send('setStatus', { status: 'Format non pris en charge par le moteur : ' + file.name });
    };
    reader.readAsDataURL(file);
  }
  function installDropTarget() {
    if (!document.addEventListener) return;
    document.addEventListener('dragover', (event) => {
      if (event && event.dataTransfer) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
    });
    document.addEventListener('drop', (event) => {
      if (!event || !event.dataTransfer || !event.dataTransfer.files) return;
      event.preventDefault();
      const bars = dropBars(event);
      const index = selectedIndex();
      Array.prototype.slice.call(event.dataTransfer.files).forEach((file) => importFile(file, bars, index));
      send('setStatus', { status: 'Import par glisser-déposer transmis au moteur JUCE.' });
    });
  }

  window.ALPHA_NATIVE = Object.assign(window.ALPHA_NATIVE || {}, {
    send,
    requestState: () => send('getState'),
    applyState,
    getState: () => lastSnapshot,
    getHistory: () => (lastSnapshot && lastSnapshot.history) || [],
    commitUiState,
    pendingCount: () => pending.size,
    videoEnabled: false,
    state: null
  });

  const actions = A.ACTIONS;
  const direct = {
    play: 'play', stop: 'stop', record: 'record', rtz: 'rtz', end: 'end',
    newProject: 'newProject', loadDemo: 'loadDemo', openProject: 'openProject',
    saveProject: 'saveProject', saveAs: 'saveAs', saveNewVersion: 'saveNewVersion',
    saveTemplate: 'saveTemplate', loadTemplateFile: 'loadTemplateFile', revert: 'revert', restoreAutosave: 'restoreAutosave',
    backupProject: 'backupProject', autosave: 'autosave', quit: 'quit',
    importAudio: 'importAudio', importMidi: 'importMidi', exportMidi: 'exportMidi',
    importTrack: 'importTrack', importTrackArchive: 'importTrackArchive',
    importOmf: 'importOmf', importAaf: 'importAaf', importXml: 'importXml', importCd: 'importCd',
    exportmix: 'exportWav', exportTrack: 'exportTrack', exportStems: 'exportStems',
    addAudioTrack: 'addTrack', addTrack: 'addTrack', dupTracks: 'duplicateTrack',
    delTracks: 'removeTrack', snapshots: 'saveSnapshot', offline: 'exportWav',
    projectHistory: 'getHistory', exportVideo: 'setVideoEnabled', importVideo: 'setVideoEnabled',
    videoOut: 'setVideoEnabled', replaceAudioVideo: 'setVideoEnabled', extractAudio: 'setVideoEnabled'
  };
  Object.keys(direct).forEach((key) => {
    const command = direct[key];
    if (command === 'addTrack') actions[key] = () => send('addTrack', { name: 'Audio ' + (trackRows().length + 1) });
    else if (command === 'duplicateTrack') actions[key] = () => send('duplicateTrack', { index: selectedIndex() });
    else if (command === 'removeTrack') actions[key] = () => send('removeTrack', { index: selectedIndex() });
    else if (command === 'saveSnapshot') actions[key] = () => send('saveSnapshot');
    else if (command === 'getHistory') actions[key] = () => {
      if (window.ALPHAWIN && window.ALPHAWIN.open) window.ALPHAWIN.open('alphaHistory');
      else send('getHistory');
    };
    else if (command === 'setVideoEnabled') actions[key] = () => send('setVideoEnabled', { enabled: true });
    else if (key === 'rtz') actions[key] = () => send('seek', { bars: 1 });
    else if (key === 'end') actions[key] = () => send('seek', { bars: A.state.bars });
    else if (key === 'loadDemo') actions[key] = () => send('loadDemo');
    else if (command === 'importAudio' || command === 'importMidi' || command === 'importTrack' ||
             command === 'importTrackArchive' || command === 'importOmf' || command === 'importAaf' ||
             command === 'importXml' || command === 'importCd' || command === 'exportMidi') {
      actions[key] = () => send(command, { startBars: A.state.pos, trackIndex: selectedIndex() });
    } else {
      actions[key] = () => send(command);
    }
  });
  actions.play = () => send('play');
  actions.stop = () => send('stop');
  actions.record = () => send('record');
  actions.cycle = () => send('cycle', { enabled: !A.state.cycle });
  actions.click = () => send('metronome', { enabled: !A.state.click });
  actions.newFromTemplate = chooseTemplate;
  actions.applyTemplate = chooseTemplate;
  actions.loadTemplate = chooseTemplate;
  actions.undo = () => send('undo');
  actions.redo = () => send('redo');
  actions.saveProject = () => send('saveProject');
  actions.projectInfo = () => send('setStatus', {
    status: 'Projet ' + ((lastSnapshot && lastSnapshot.name) || 'ALPHA Studio') + ' · ' +
            ((lastSnapshot && lastSnapshot.tracks && lastSnapshot.tracks.length) || 0) + ' pistes · ' +
            ((lastSnapshot && lastSnapshot.bpm) || 120) + ' BPM · vidéo verrouillée.'
  });
  actions.fixedTempo = () => send('tempo', { bpm: 120 });
  actions.quantize = () => send('quantizeMidi', { trackIndex: selectedIndex(), grid: '1/16' });
  actions.midiLogical = () => send('quantizeMidi', { trackIndex: selectedIndex(), grid: '1/16' });
  actions.addFX = () => send('uiControl', { control: 'bus', index: 0, field: 'mute', value: false });
  actions.removeEmpty = () => send('setStatus', { status: 'Retirer les pistes vides : à vérifier dans le test intégral Windows.' });
  actions.closeProject = () => send('newProject');
  actions.saveAs = () => send('saveAs');
  actions.saveNewVersion = () => send('saveNewVersion');
  actions.clearRecent = () => send('setStatus', { status: 'Liste des projets récents : fonction non persistée.' });

  /* Fenêtre native, affichage Full HD/DPI et vrais réglages audio/ASIO. */
  actions.audioSettings = () => send('audioSettings');
  actions.asioPanel = () => send('asioPanel');
  actions.devices = () => send('audioSettings');
  actions.windowMinimize = () => send('windowMinimize');
  actions.windowMaximize = () => send('windowMaximize');
  actions.windowRestore = () => send('windowRestore');
  actions.windowFitToScreen = () => send('windowFitToScreen');
  actions.getDisplayMetrics = () => send('getDisplayMetrics');
  actions.uiZoomIn = () => send('uiScale', { delta: 0.05 });
  actions.uiZoomOut = () => send('uiScale', { delta: -0.05 });
  actions.textZoomIn = () => send('fontScale', { delta: 0.10 });
  actions.textZoomOut = () => send('fontScale', { delta: -0.10 });
  actions.resetLayout = () => send('resetLayout');

  /* Les stubs documentaires ne doivent plus répondre « étape 2 » sous WebView2 :
     ceux qui n'ont pas d'équivalent moteur envoient un statut explicite. */
  const stubs = A.MENU_STUBS || {};
  Object.keys(stubs).forEach((key) => {
    if (actions[key]) return;
    actions[key] = () => send('setStatus', {
      status: (stubs[key] && stubs[key][0]) || key
        ? 'Commande « ' + ((stubs[key] && stubs[key][0]) || key) + ' » : non implémentée dans ce test moteur.'
        : ''
    });
  });

  /* Contrôles de pistes : mute / solo / arm, faders, et édition locale. */
  document.addEventListener('click', (event) => {
    const button = event.target && event.target.closest && event.target.closest('[data-act][data-track]');
    if (!button) return;
    const index = nativeIndex(button.dataset.track);
    if (index < 0) return;
    const field = ({ mute: 'mute', solo: 'solo', rec: 'arm' })[button.dataset.act];
    if (!field) return;
    const track = A.trackById(button.dataset.track);
    if (!track) return;
    setTimeout(() => send('setTrack', {
      index, field, value: field === 'arm' ? !!track.rec : !!track[field]
    }), 0);
  });
  document.addEventListener('pointerup', (event) => {
    const fader = event.target && event.target.closest && event.target.closest('.tl-fader');
    const row = fader && fader.closest && fader.closest('.tl-row[data-track]');
    if (!row) return;
    const index = nativeIndex(row.dataset.track);
    const track = A.trackById(row.dataset.track);
    if (index >= 0 && track) send('setTrack', { index, field: 'volumeDb', value: Number(track.db || 0) });
  }, true);
  document.addEventListener('keydown', (event) => {
    if (!event || !(event.ctrlKey || event.metaKey)) return;
    const key = String(event.key || '').toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      send(key === 'z' ? 'undo' : 'redo');
    }
  }, true);
  ['click', 'pointerup', 'keyup', 'change'].forEach((type) => {
    document.addEventListener(type, () => scheduleCommit(), true);
  });
  const ruler = document.getElementById('ruler-vp');
  if (ruler) ruler.addEventListener('pointerup', () => send('seek', { bars: A.state.pos }), true);
  installHistoryWindow();
  installDropTarget();
  function requestInitialState() {
    if (initialRequestDone) return;
    initialRequestDone = true;
    send('getState');
  }
  /* audio.js est chargé juste après ce pont : attendre la fin de la tâche courante
     garantit que ALPHA_AUDIO_METERS existe avant le premier snapshot. */
  if (typeof window.setTimeout === 'function') window.setTimeout(requestInitialState, 0);
  else requestInitialState();
})();
