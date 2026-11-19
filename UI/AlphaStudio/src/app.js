/* =========================================================================
   ALPHA Studio — Étape 1 : interface
   Rendu de la fenêtre de projet, interactions visuelles, panneau Transport.
   Le moteur audio (lecture, enregistrement, mixage) sera branché à l'étape 2.
   ========================================================================= */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.prototype.slice.call(document.querySelectorAll(s));

  /* ------------------------------------------------------------------ ÉTAT */
  const state = {
    barW: 64,
    bars: 84,
    grid: 'Barre',
    gridSteps: { 'Barre': 1, 'Temps': 0.25, '1/8': 0.125, '1/16': 0.0625 },
    tool: 'pointer',
    tools: {
      pointer: 'Flèche', range: 'Plage', split: 'Ciseaux', glue: 'Colle',
      erase: 'Gomme', zoom: 'Zoom', mute: 'Silencieux', draw: 'Crayon', audition: 'Écoute'
    },
    snap: true,
    cycle: true,
    pos: 9,                 /* position en barres, 1 = mesure 1 */
    cycleL: 9,
    cycleR: 17,
    selectedTrack: 'voix',
    selectedPart: 'p-voix-2',
    fmt: 'bars',
    click: false, sync: false, autoR: false, autoW: false,
    punchIn: false, punchOut: false, autoScroll: true,
    playing: false, recording: false,
    /* ---- lot 5 : accrochage, règle, ligne d'info ---- */
    snapMode: 'Grille',
    snapEvents: true,
    snapZero: false,
    rulerTime: 'bars',      /* bars | time */
    rulerFmt2: 'bars',      /* format d'une piste de règle supplémentaire */
    rulers: [],             /* pistes de règle : [{ id, fmt }] */
    autoMode: 'Auto-Latch',
    rootKey: 'C',
    quantizeVal: '1/16',
    colorIdx: 0,
    constrain: false,
    multiInfo: false,
    transpose: 0,
    velocity: 0,
    /* ---- lot 6 : pistes ---- */
    selTracks: ['voix'],
    enlarge: false,
    snapHeights: true,
    autoTrackH: 64,
    /* ---- lot 7 : outils ---- */
    resizeMode: 'normal',    /* normal | contents | stretch */
    lineMode: 'Line',
    subTool: {},
    /* ---- lot 8 : transport ---- */
    jogSpeed: 0,
    keepVis: false,
    rulerSub: true
  };

  /* ------------------------------------------------ SÉLECTION DE PISTES */
  /* state.selTracks = pistes sélectionnées (Ctrl/Maj+clic dans la liste) ;
     state.selectedTrack = dernière piste touchée, celle que montre l'inspecteur. */
  function isTrackSel(id) { return state.selTracks.indexOf(id) >= 0; }
  function setTrackSel(ids) {
    state.selTracks = ids.filter((id) => !!trackById(id));
    if (!state.selTracks.length) state.selTracks = [state.selectedTrack];
  }
  function clickTrack(id, e) {
    if (e && (e.shiftKey || e.metaKey) && state._lastTrackClick) {
      const vis = visibleTracks().map((t) => t.id);
      const a = vis.indexOf(state._lastTrackClick), b = vis.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const add = !!e.ctrlKey || !!e.metaKey;
        setTrackSel(add ? state.selTracks.concat(vis.slice(lo, hi + 1)) : vis.slice(lo, hi + 1));
        state.selectedTrack = id;
        return;
      }
    }
    if (e && (e.ctrlKey || e.metaKey)) {
      const has = isTrackSel(id);
      const next = has ? state.selTracks.filter((x) => x !== id) : state.selTracks.concat([id]);
      setTrackSel(next.length ? next : [id]);
    } else {
      setTrackSel([id]);
    }
    state._lastTrackClick = id;
    state.selectedTrack = id;
  }
  /* pistes sélectionnées -> événements sélectionnés (selectAll, suppression…) */
  function selPartIds() { return PARTS.filter((p) => p.sel).map((p) => p.id); }

  /* ------------------------------------------------ DISPOSITION / PANNEAUX */
  const panels = { toolbar:true, infoline:true, overview:true, inspector:true, transport:true, statusbar:true, rz:false };
  function applyPanels() {
    const app = $('#app');
    app.classList.toggle('no-toolbar', !panels.toolbar);
    app.classList.toggle('no-infoline', !panels.infoline);
    app.classList.toggle('no-overview', !panels.overview);
    app.classList.toggle('no-inspector', !panels.inspector);
    app.classList.toggle('no-transport', !panels.transport);
    app.classList.toggle('no-statusbar', !panels.statusbar);
    app.classList.toggle('show-rz', !!panels.rz);
    if (typeof renderOverview === 'function') setTimeout(renderOverview, 30);
  }
  function setPanel(k, v) { panels[k] = !!v; applyPanels(); }
  function getPanels() { return Object.assign({}, panels); }
  const keymap = Object.create(null);

  /* ---------------------------------------------------------------- PISTES */
  const TRACKS = [
    { id: 'markers',   kind: 'marker', name: 'Marqueurs', h: 26, color: '#b28f4c' },
    { id: 'tempoT',    kind: 'tempo',  name: 'Piste de tempo', h: 26, color: '#8a8d90' },
    { id: 'rulerT',    kind: 'ruler',  name: 'Règle (Secondes)', h: 22, color: '#8a8d90' },
    { id: 'arrT',      kind: 'arrange',name: 'Arrangement', h: 30, color: '#7d7f52' },
    { id: 'folderMus', kind: 'folder', name: 'MUSIQUE',  h: 26, color: '#b28f4c', open: true,
      kids: ['drums', 'busdrums', 'basse', 'gtrR', 'gtrS', 'keys', 'voix', 'choeurs', 'perc'] },

    { id: 'drums',   kind: 'midi',  num: '01', name: 'DRUMS',          h: 64, color: '#5d87a3', partColor: '#93b7cd', db: -3.2, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 68 },
    { id: 'busdrums',kind: 'group', num: '02', name: 'BUS DRUMS',      h: 58, color: '#4f7188', partColor: '#7f9fb4', db: -1.8, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 72 },
    { id: 'basse',   kind: 'audio', num: '03', name: 'BASSE',          h: 64, color: '#61865e', partColor: '#9dbf9b', db: -4.1, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 64 },
    { id: 'gtrR',    kind: 'audio', num: '04', name: 'GUITARE RYTH.',  h: 64, color: '#9a8450', partColor: '#c9b98f', db: -5.4, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 60 },
    { id: 'gtrS',    kind: 'audio', num: '05', name: 'GUITARE SOLO',   h: 64, color: '#a5754d', partColor: '#d0a889', db: -3.0, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 66 },
    { id: 'keys',    kind: 'audio', num: '06', name: 'PIANO RHODES',   h: 64, color: '#7466a0', partColor: '#b0a6c9', db: -6.2, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 58 },
    { id: 'voix',    kind: 'audio', num: '07', name: 'VOIX LEAD',      h: 64, color: '#4f7fa8', partColor: '#8fb6d6', db: -2.5, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 70 },
    { id: 'choeurs', kind: 'audio', num: '08', name: 'CHŒURS',         h: 64, color: '#7c5f95', partColor: '#b6a0c6', db: -7.0, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 55 },
    { id: 'perc',    kind: 'audio', num: '09', name: 'PERCUSSIONS',    h: 64, color: '#77874f', partColor: '#b9c8a0', db: -8.4, parent: 'folderMus', mute: false, solo: false, rec: false, mon: false, vol: 52 },

    { id: 'folderFx',kind: 'folder', name: 'EFFETS', h: 26, color: '#8a8f95', open: false, kids: ['fx'] },
    { id: 'fx',      kind: 'fx',     num: '10', name: 'FX · RÉVERB',   h: 58, color: '#6f7d86', partColor: '#9fb2bb', db: -9.5, parent: 'folderFx', mute: false, solo: false, rec: false, mon: false, vol: 50 },

    { id: 'amb',     kind: 'audio',  num: '11', name: 'AMBIANCE',      h: 64, color: '#6c7c84', partColor: '#a4b0b6', db: -12.0, mute: false, solo: false, rec: false, mon: false, vol: 42 },

    /* piste vidéo (Nuendo 4 : piste vidéo = image + bande son) */
    { id: 'video',   kind: 'video',  num: 'V', name: 'FILM · Séquence finale', h: 56, color: '#5a5f6b', partColor: '#8d95a3',
      db: 0, mute: false, solo: false, rec: false, mon: false, vol: 50, timebase: 'linear' },
    /* piste instrument (VSTi) */
    { id: 'inst',    kind: 'instrument', num: '12', name: 'AlphaKeys EP', h: 64, color: '#6a6a9a', partColor: '#a9a9cf',
      db: -6.0, mute: false, solo: false, rec: false, mon: false, vol: 60, timebase: 'musical' }
  ];

  /* propriétés de piste (Nuendo 4 : p. 26) — valeurs par défaut */
  TRACKS.forEach((t) => {
    if (t.timebase === undefined) t.timebase = 'musical';
    t.lock = !!t.lock;
    t.frozen = !!t.frozen;
    t.autShown = !!t.autShown;
    t.autParam = t.autParam || 'Volume';
  });

  const trackById = (id) => TRACKS.find((t) => t.id === id);

  /* ----------------------------------------------------------- ÉVÉNEMENTS */
  const PARTS = [
    { id: 'p-dr-1', track: 'drums', name: 'Intro Kit',       start: 1,  len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-2', track: 'drums', name: 'Couplet A',       start: 9,  len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-3', track: 'drums', name: 'Refrain A',       start: 17, len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-4', track: 'drums', name: 'Couplet B',       start: 25, len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-5', track: 'drums', name: 'Refrain B',       start: 33, len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-6', track: 'drums', name: 'Pont',            start: 41, len: 8,  type: 'midi',  loop: true },
    { id: 'p-dr-7', track: 'drums', name: 'Final',           start: 49, len: 12, type: 'midi',  loop: true },

    { id: 'p-ba-1', track: 'basse', name: 'Basse Couplet 1', start: 9,  len: 8, wave: 'bass',   loop: true },
    { id: 'p-ba-2', track: 'basse', name: 'Basse Refrain 1', start: 17, len: 8, wave: 'bass',   loop: true },
    { id: 'p-ba-3', track: 'basse', name: 'Basse Couplet 2', start: 25, len: 8, wave: 'bass',   loop: true },
    { id: 'p-ba-4', track: 'basse', name: 'Basse Refrain 2', start: 33, len: 8, wave: 'bass',   loop: true },
    { id: 'p-ba-5', track: 'basse', name: 'Basse Pont',      start: 41, len: 8, wave: 'bass',   loop: true },
    { id: 'p-ba-6', track: 'basse', name: 'Basse Final',     start: 49, len: 12, wave: 'bass' },

    { id: 'p-gr-1', track: 'gtrR', name: 'Gtr Rythm C1',    start: 9,  len: 8, wave: 'guitar', loop: true },
    { id: 'p-gr-2', track: 'gtrR', name: 'Gtr Rythm R1',    start: 17, len: 8, wave: 'guitar', loop: true },
    { id: 'p-gr-3', track: 'gtrR', name: 'Gtr Rythm C2',    start: 25, len: 8, wave: 'guitar', loop: true },
    { id: 'p-gr-4', track: 'gtrR', name: 'Gtr Rythm R2',    start: 33, len: 8, wave: 'guitar', loop: true },
    { id: 'p-gr-5', track: 'gtrR', name: 'Gtr Pont',        start: 41, len: 8, wave: 'guitar' },
    { id: 'p-gr-6', track: 'gtrR', name: 'Gtr Final',       start: 49, len: 12, wave: 'guitar' },

    { id: 'p-gs-1', track: 'gtrS', name: 'Solo Thème',      start: 17, len: 8, wave: 'guitarSolo' },
    { id: 'p-gs-2', track: 'gtrS', name: 'Solo Refrain',    start: 33, len: 8, wave: 'guitarSolo' },
    { id: 'p-gs-3', track: 'gtrS', name: 'Solo Final',      start: 49, len: 6, wave: 'guitarSolo' },

    { id: 'p-ke-1', track: 'keys', name: 'Rhodes C1',       start: 9,  len: 8, wave: 'rhodes', loop: true },
    { id: 'p-ke-2', track: 'keys', name: 'Rhodes R1',       start: 17, len: 8, wave: 'rhodes', loop: true },
    { id: 'p-ke-3', track: 'keys', name: 'Rhodes C2',       start: 25, len: 8, wave: 'rhodes', loop: true },
    { id: 'p-ke-4', track: 'keys', name: 'Rhodes R2',       start: 33, len: 8, wave: 'rhodes', loop: true },
    { id: 'p-ke-5', track: 'keys', name: 'Rhodes Pont',     start: 41, len: 8, wave: 'rhodes' },
    { id: 'p-ke-6', track: 'keys', name: 'Rhodes Final',    start: 49, len: 12, wave: 'rhodes' },

    { id: 'p-vo-1', track: 'voix', name: 'Voix Couplet 01', start: 9,  len: 8, wave: 'vocal' },
    { id: 'p-voix-2', track: 'voix', name: 'Voix Refrain 01', start: 17, len: 8, wave: 'vocal' },
    { id: 'p-vo-3', track: 'voix', name: 'Voix Couplet 02', start: 25, len: 8, wave: 'vocal' },
    { id: 'p-vo-4', track: 'voix', name: 'Voix Refrain 02', start: 33, len: 8, wave: 'vocal' },
    { id: 'p-vo-5', track: 'voix', name: 'Voix Pont',       start: 41, len: 8, wave: 'vocal' },
    { id: 'p-vo-6', track: 'voix', name: 'Voix Final',      start: 49, len: 12, wave: 'vocal' },

    { id: 'p-ch-1', track: 'choeurs', name: 'Chœurs Refrain 1', start: 17, len: 8,  wave: 'choir' },
    { id: 'p-ch-2', track: 'choeurs', name: 'Chœurs Refrain 2', start: 33, len: 8,  wave: 'choir' },
    { id: 'p-ch-3', track: 'choeurs', name: 'Chœurs Final',     start: 49, len: 12, wave: 'choir' },

    { id: 'p-pe-1', track: 'perc', name: 'Perc Refrain 1',  start: 17, len: 8,  wave: 'perc' },
    { id: 'p-pe-2', track: 'perc', name: 'Perc Refrain 2',  start: 33, len: 8,  wave: 'perc' },
    { id: 'p-pe-3', track: 'perc', name: 'Perc Final',      start: 49, len: 12, wave: 'perc' },

    { id: 'p-am-1', track: 'amb', name: 'Amb Nappe',        start: 1,  len: 16, wave: 'amb', loop: true },
    { id: 'p-am-2', track: 'amb', name: 'Amb Nappe B',      start: 33, len: 24, wave: 'amb' }
  ].map((p) => Object.assign({ type: 'audio' }, p));

  PARTS.forEach((p) => { if (p.id === state.selectedPart) p.sel = true; });

  const MARKERS = [
    [1, 'Intro'], [9, 'Couplet 1'], [17, 'Refrain 1'], [25, 'Couplet 2'],
    [33, 'Refrain 2'], [41, 'Pont'], [49, 'Final'], [57, 'Fin']
  ];

  /* ------------------------------------------------------------- UTILS */
  const pad = (n, l) => String(Math.floor(n)).padStart(l, '0');

  function fmtPos(p) {
    const total = Math.max(0, p - 1);
    const bar = Math.floor(total) + 1;
    const bf = (total - Math.floor(total)) * 4;
    const beat = Math.floor(bf) + 1;
    const sf = (bf - Math.floor(bf)) * 4;
    const six = Math.floor(sf) + 1;
    const ticks = Math.floor((sf - Math.floor(sf)) * 960);
    return pad(bar, 4) + '.' + pad(beat, 2) + '.' + pad(six, 2) + '.' + pad(ticks, 3);
  }
  function fmtShortPos(p) {
    const total = Math.max(0, p - 1);
    const bar = Math.floor(total) + 1;
    const bf = (total - Math.floor(total)) * 4;
    return bar + '.' + (Math.floor(bf) + 1);
  }
  function fmtDb(db) {
    return (db < 0 ? '\u2212' : '') + Math.abs(db).toFixed(2).replace('.', ',') + ' dB';
  }
  function dbToPct(db) {
    return Math.min(93, Math.max(6, 72 + db * 3.4));
  }
  function fmtTime(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60), ms = Math.round((sec - Math.floor(sec)) * 1000);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(ms, 3);
  }
  /* position x d'une barre dans la timeline : linéaire (Bars+Beats) ou courbe (Time Linear) */
  function barToPx(bar) {
    if (state.rulerTime !== 'time') return (bar - 1) * state.barW;
    const t = bar - 1;
    return (t + (state.warp || 0.06) * t * t / 8) * state.barW;
  }

  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* --- formats de la règle (Nuendo 4, p. 31) --------------------------------- */
  function fmtFeet(sec, per) {
    const fps = per === 16 ? 40 : 16;
    const total = sec * fps;
    const feet = Math.floor(total / fps);
    const fr = Math.floor(total % fps);
    return feet + "'" + pad(fr, 2) + (per === 16 ? '¼' : '');
  }
  function fmtUser(sec) {
    const fps = state.userFps || 25;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    const s2 = Math.floor(sec % 60), f = Math.floor((sec - Math.floor(sec)) * fps);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s2, 2) + ':' + pad(f, 2);
  }
  function rulerLabel(bar, fmt) {
    const sec = (bar - 1) * (240 / 120);
    switch (fmt) {
      case 'tc': return fmtTc(sec);
      case 'sec': return sec.toFixed(1).replace('.', ',') + ' s';
      case 'smp': return Math.round(sec * 48000).toLocaleString('fr-FR');
      case 'ft16': return fmtFeet(sec, 16);
      case 'ft35': return fmtFeet(sec, 35);
      case 'user': return fmtUser(sec);
      default: return String(bar);
    }
  }

  function fmtTc(sec) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60), f = Math.floor((sec - Math.floor(sec)) * 25);
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + ':' + pad(f, 2);
  }
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* --------------------------------------------------------- FORMES D'ONDE */
  function ampAt(type, t, r) {
    let ph, a;
    switch (type) {
      case 'bass':
        ph = (t * 6) % 1;
        a = 0.4 + 0.45 * Math.pow(Math.abs(Math.sin(Math.PI * ph)), 0.7);
        a *= 0.84 + 0.16 * r();
        if (((t * 24) % 1) < 0.05) a *= 0.35;
        return a;
      case 'guitar':
        ph = (t * 10) % 1;
        a = 0.16 + 0.72 * Math.exp(-ph * 3.2);
        return a * (0.86 + 0.16 * r());
      case 'guitarSolo': {
        ph = (t * 2.2) % 1;
        const vib = 0.10 * Math.sin(Math.PI * 2 * t * 26);
        a = 0.10 + 0.34 * Math.pow(Math.sin(Math.PI * ph), 0.8) + vib;
        a *= 0.82 + 0.22 * r();
        if (((t * 11) % 1) < 0.06) a *= 0.45;
        return Math.min(0.92, Math.max(0.08, a));
      }
      case 'vocal': {
        ph = (t * 3.15 + 0.06) % 1;
        const env = Math.pow(Math.sin(Math.PI * ph), 0.55);
        const syll = 0.62 + 0.38 * Math.pow(Math.abs(Math.sin(Math.PI * t * 19)), 0.5);
        const gate = ((t * 9) % 1) < 0.87 ? 1 : 0.34;
        return Math.min(0.98, 0.13 + 0.82 * env * syll * gate * (0.9 + 0.12 * r()));
      }
      case 'choir': {
        const swell = 0.16 + 0.22 * Math.pow(Math.abs(Math.sin(Math.PI * t * 1.6)), 0.7);
        a = swell + 0.07 * Math.sin(Math.PI * 2 * t * 19) + 0.09 * r();
        a *= ((t * 6) % 1) < 0.9 ? 1 : 0.55;
        return Math.min(0.78, Math.max(0.09, a));
      }
      case 'rhodes':
        ph = (t * 8) % 1;
        a = 0.18 + 0.55 * Math.exp(-ph * 2.2);
        return a * (0.78 + 0.3 * r());
      case 'perc':
        ph = (t * 20) % 1;
        a = 0.08 + 0.82 * Math.pow(Math.exp(-ph * 5), 1.6);
        return a * (0.68 + 0.5 * r());
      default: {
        a = 0.34 + 0.2 * Math.sin(Math.PI * 2 * t * 1.2) + 0.11 * Math.sin(Math.PI * 2 * t * 7.3) + 0.1 * r();
        return Math.min(0.8, Math.max(0.12, a));
      }
    }
  }

  function wavePath(w, h, type, seed, amp) {
    const gain = amp === undefined ? 1 : amp;
    const n = Math.max(60, Math.min(1200, Math.round(w * 1.35)));
    const r = mulberry(seed);
    const mid = h / 2;
    const scale = h / 2 - 1.5;
    const top = [];
    const bot = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let a = Math.max(0.03, Math.min(1, ampAt(type, t, r) * gain));
      /* enveloppe globale douce en début / fin d'événement */
      if (type !== 'perc') {
        const edge = Math.min(1, Math.min(t, 1 - t) * 26);
        a *= 0.35 + 0.65 * edge;
      }
      const x = (i / (n - 1)) * w;
      top.push(x.toFixed(1) + ',' + (mid - a * scale).toFixed(1));
      bot.push(x.toFixed(1) + ',' + (mid + a * scale).toFixed(1));
    }
    bot.reverse();
    return 'M' + top.join(' L') + ' L' + bot.join(' L') + ' Z';
  }

  function midiNotes(w, h, seed) {
    const r = mulberry(seed);
    const rows = 6;
    const top = Math.max(13, h * 0.24);
    const avail = h - top - 3;
    const rowH = avail / rows;
    let out = '';
    const steps = Math.max(8, Math.round(w / 6));
    for (let i = 0; i < steps; i++) {
      const x = i * 6 + 1;
      for (let row = 0; row < rows; row++) {
        const prob = row === 2 ? 0.78 : row === 0 ? 0.62 : row === 3 ? 0.4 : row === 4 ? 0.24 : 0.18;
        if (r() < prob * 0.5) {
          const len = Math.min(5, 2.4 + r() * 4);
          const y = top + row * rowH + rowH / 2 - 1.9;
          out += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + len.toFixed(1) +
            '" height="3.6" rx="1" fill="#16344a" opacity="' + (0.5 + r() * 0.4).toFixed(2) + '"/>';
        }
      }
    }
    return out;
  }

  /* --------------------------------------------------------------- RENDU */
  function visibleTracks() {
    return TRACKS.filter((t) => !t.hidden && (!t.parent || (trackById(t.parent) && trackById(t.parent).open)));
  }

  function renderTracks() {
    const html = visibleTracks().map((t, i) => {
      const sel = isTrackSel(t.id) ? ' sel' : '';
      const alt = i % 2 ? ' alt' : '';
      const col = '<div class="tl-color" style="background:' + t.color + '"></div>';
      const grab = '<div class="tl-grab" data-grab="' + t.id + '" title="Glisser pour changer la hauteur (Ctrl = toutes les pistes)"></div>';

      if (t.kind === 'marker') {
        return '<div class="tl-row small marker-row" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
          '<div class="tl-color" style="background:' + t.color + '"></div>' +
          '<div class="tl-inner"><div class="tl-line1" style="padding-left:2px">' +
          '<svg class="tl-marker-ico" style="width:11px;height:11px;color:#e0c07a"><use href="#i-flag"/></svg>' +
          '<span class="tl-name">MARQUEURS</span><span style="font-size:8px;color:#6a685f;margin-left:auto">' + MARKERS.length + '</span>' +
          '</div></div>' + grab + '</div>';
      }
      if (t.kind === 'tempo') {
        return '<div class="tl-row small special-row" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
          '<div class="tl-color" style="background:' + t.color + '"></div>' +
          '<div class="tl-inner"><div class="tl-line1" style="padding-left:2px">' +
          '<svg class="tl-spec-ico" style="color:#dfe4e8"><use href="#i-tempo"/></svg>' +
          '<span class="tl-name">TEMPO</span><span class="tl-sys">TRACK</span>' +
          '<span style="font-size:8px;color:#6a685f;margin-left:auto">120,000</span>' +
          '</div></div>' + grab + '</div>';
      }
      if (t.kind === 'ruler') {
        return '<div class="tl-row small special-row" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
          '<div class="tl-color" style="background:' + t.color + '"></div>' +
          '<div class="tl-inner"><div class="tl-line1" style="padding-left:2px">' +
          '<svg class="tl-spec-ico" style="color:#dfe4e8"><use href="#i-ruler"/></svg>' +
          '<span class="tl-name">RÈGLE 2</span><span class="tl-sys">SEC</span>' +
          '<span style="font-size:8px;color:#6a685f;margin-left:auto">Secondes</span>' +
          '</div></div>' + grab + '</div>';
      }
      if (t.kind === 'arrange') {
        return '<div class="tl-row small special-row" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
          '<div class="tl-color" style="background:' + t.color + '"></div>' +
          '<div class="tl-inner"><div class="tl-line1" style="padding-left:2px">' +
          '<svg class="tl-spec-ico" style="color:#e6e6b4"><use href="#i-arranger"/></svg>' +
          '<span class="tl-name">ARRANGEMENT</span><span class="tl-sys">CHAÎNE A</span>' +
          '</div></div>' + grab + '</div>';
      }
      if (t.kind === 'folder') {
        const kids = (t.kids || []).map((k) => trackById(k)).filter(Boolean);
        const chips = !t.open ? '<span class="tl-kids">' + kids.map((k) =>
          '<i style="background:' + k.partColor + '"></i>').join('') + '</span>' : '';
        return '<div class="tl-row small' + sel + alt + '" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
          col +
          '<div class="tl-inner"><div class="tl-line1">' +
          '<button class="tl-caret' + (t.open ? ' open' : '') + '" data-folder="' + t.id + '" title="Replier / déplier le dossier">' +
          '<svg><use href="#i-arrow-sm"/></svg></button>' +
          '<svg class="tl-folder" style="color:' + (t.open ? '#e3c479' : '#c3a45e') + '"><use href="#i-folder"/></svg>' +
          '<span class="tl-name">' + t.name + '</span>' + chips +
          '</div></div>' + grab + '</div>';
      }

      const isGroup = t.kind === 'group';
      const isFx = t.kind === 'fx';
      const isVideo = t.kind === 'video';
      const isInst = t.kind === 'instrument';
      const sysTag = isGroup ? '<span class="tl-sys">GRP</span>' : isFx ? '<span class="tl-sys">FX</span>'
        : isVideo ? '<span class="tl-sys">VID</span>' : isInst ? '<span class="tl-sys">INST</span>' : '';
      const grpCls = (isGroup || isFx) ? ' grp' : '';

      /* --- contrôles de piste (Nuendo 4 p. 26) --- */
      const ctlOn = TRACK_CTL.visible;
      const has = (k) => ctlOn.indexOf(k) >= 0;
      const btnM = '<button class="tiny' + (t.mute ? ' on-m' : '') + '" data-act="mute" data-track="' + t.id + '" title="Mute — silencieux">M</button>';
      const btnS = '<button class="tiny' + (t.solo ? ' on-s' : '') + '" data-act="solo" data-track="' + t.id + '" title="Solo">S</button>';
      const btnW = (isGroup || isFx) ? '' : '<button class="tiny rw' + (t.autoW ? ' on-rw' : '') + '" data-act="autow" data-track="' + t.id + '" title="Automatisation — écriture (W)">W</button>';
      const btnR2 = (isGroup || isFx) ? '' : '<button class="tiny rw' + (t.autoR ? ' on-rw' : '') + '" data-act="autor" data-track="' + t.id + '" title="Automatisation — lecture (R)">R</button>';
      const btnRec = (isGroup || isFx) ? '' :
        '<button class="tiny' + (t.rec ? ' on-r' : '') + ' rec-empty" data-act="rec" data-track="' + t.id + '" title="Enregistrement armé"><span class="dot"></span></button>';
      const btnMon = (isGroup || isFx) ? '' :
        '<button class="tiny' + (t.mon ? ' on-mon' : '') + '" data-act="mon" data-track="' + t.id + '" title="Écoute (monitor)"><svg><use href="#i-monitor"/></svg></button>';
      const btnLock = '<button class="tiny' + (t.lock ? ' on-lock' : '') + '" data-act="lock" data-track="' + t.id + '" title="Verrouiller la piste">' +
        '<svg><use href="#i-lock"/></svg></button>';
      const btnAuto = (isGroup || isFx) ? '' :
        '<button class="tiny' + (t.autShown ? ' on-auto' : '') + '" data-act="autoshow" data-track="' + t.id + '" title="Afficher / masquer l’automatisation">' +
        '<svg><use href="#i-autom"/></svg></button>';
      const tb = '<button class="tiny tb' + (t.timebase === 'linear' ? ' lin' : '') + '" data-act="timebase" data-track="' + t.id +
        '" title="Base de temps : ' + (t.timebase === 'linear' ? 'linéaire (temps)' : 'musicale (tempo)') + '">' +
        (t.timebase === 'linear' ? 'L' : 'M') + '</button>';
      const lane = '<button class="tiny lane" data-act="lane" data-track="' + t.id + '" title="Type d’affichage des pistes (lanes)">' +
        '<svg><use href="#i-lane"/></svg></button>';
      const act = '<i class="tl-act' + (t.mute ? '' : '') + '" title="Activité de la piste"></i>';
      /* contrôles supplémentaires choisis dans Track Controls Settings (p. 507) */
      const extra = [];
      if (t.autShown === null) t.autShown = false;
      if (has('vol')) extra.push('<button class="tiny tb" data-act="vol" data-track="' + t.id + '" title="Volume de la piste">Vol</button>');
      if (has('pan')) extra.push('<button class="tiny tb" data-act="pan" data-track="' + t.id + '" title="Panoramique">Pan</button>');
      if (has('ins')) extra.push('<button class="tiny tb" data-act="ins" data-track="' + t.id + '" title="Inserts (2 utilisés)">Ins</button>');
      if (has('eq')) extra.push('<button class="tiny tb" data-act="eq" data-track="' + t.id + '" title="Égaliseur">EQ</button>');
      if (has('sends')) extra.push('<button class="tiny tb" data-act="sends" data-track="' + t.id + '" title="Départs FX (2 actifs)">Snd</button>');
      if (has('routing')) extra.push('<button class="tiny tb" data-act="routing" data-track="' + t.id + '" title="Routage">Rout</button>');
      if (has('notepad')) extra.push('<button class="tiny tb" data-act="notepad" data-track="' + t.id + '" title="Bloc-notes de la piste">Nt</button>');
      const extraHTML = extra.join('');

      const fader = (isGroup || isFx) ? '' :
        '<div class="tl-fader"><div class="bg"></div><div class="fl" style="width:calc(' + dbToPct(t.db) + '% - 2px)"></div>' +
        '<div class="cap" style="--p:' + dbToPct(t.db) + '%"></div></div>' +
        '<span class="tl-db">' + (t.db < 0 ? '\u2212' : '') + Math.abs(t.db).toFixed(1).replace('.', ',') + '</span>';

      const row1 = '<div class="tl-line1">' +
        '<span class="tl-num">' + t.num + '</span>' +
        '<span class="tl-name">' + t.name + sysTag + '</span>' + act + '</div>';
      const row2 = '<div class="tl-line2">' +
        (has('rw') ? btnW + btnR2 : '') +
        (has('mute') ? btnM + btnS : '') +
        (has('fader') ? fader : '') +
        (has('rec') ? btnRec : '') +
        (has('monitor') ? btnMon : '') +
        (has('auto') ? btnAuto : '') +
        (has('timebase') ? tb : '') +
        (has('lane') ? lane : '') +
        (has('lock') ? btnLock : '') +
        '<button class="tiny" data-act="chan" data-track="' + t.id + '" title="Réglages du canal">e</button>' +
        extraHTML + '</div>';

      /* --- sous-piste d'automatisation (affichée sous la piste) --- */
      let autRow = '';
      if (t.autShown && !isGroup && !isFx) {
        autRow = '<div class="tl-row aut-sub" data-track="' + t.id + '" data-sub="1" style="height:22px">' +
          '<div class="tl-color" style="background:' + t.color + ';opacity:.55"></div>' +
          '<div class="tl-inner"><div class="tl-line1 aut-line">' +
          '<button class="tl-caret open" title="Replier l’automatisation" data-autoshow="' + t.id + '"><svg><use href="#i-arrow-sm"/></svg></button>' +
          '<button class="tiny" data-autoparam="' + t.id + '" title="Paramètre automatisé">' + esc(t.autParam) + ' <i class="arr">▾</i></button>' +
          '<button class="tiny rw on-rw" title="Lecture (R)">R</button>' +
          '<button class="tiny rw" title="Écriture (W)">W</button>' +
          '<button class="tiny" title="Verrouiller">◇</button>' +
          '<button class="tiny" data-autoadd="' + t.id + '" title="Ajouter une sous-piste d’automatisation">+</button>' +
          '</div></div>' + grab + '</div>';
      }

      return '<div class="tl-row' + grpCls + sel + alt + (t.mute ? ' muted' : '') + (t.frozen ? ' frozen' : '') +
        (TRACK_CTL.wrap ? ' wrap' : '') + (t.lock ? ' locked' : '') +
        '" data-track="' + t.id + '" style="height:' + t.h + 'px">' +
        col + '<div class="tl-inner">' + row1 + row2 + '</div>' + grab + '</div>' + autRow;
    }).join('');

    $('#tracklist-inner').innerHTML = html;
  }

  /* contrôles de piste visibles (Track Controls Settings), par défaut ceux de Nuendo 4 */
  const TRACK_CTL = {
    visible: ['rw', 'mute', 'fader', 'rec', 'monitor', 'auto', 'timebase', 'lane', 'lock'],
    hidden: [],
    all: ['rw', 'mute', 'fader', 'rec', 'monitor', 'auto', 'timebase', 'lane', 'lock', 'freeze', 'activity', 'volume']
  };
  const CTL_NAMES = {
    rw: 'Automatisation R/W', mute: 'Mute / Solo', fader: 'Fader + valeur (dB)', rec: 'Enregistrement',
    monitor: 'Écoute (monitor)', auto: 'Afficher l’automatisation', timebase: 'Base de temps',
    lane: 'Type d’affichage (lanes)', lock: 'Verrouiller', freeze: 'Freeze de la piste',
    activity: 'Indicateur d’activité', volume: 'Volume (dB)'
  };

  function renderPart(p, track, laneH) {
    const left = barToPx(p.start);
    const width = Math.max(10, barToPx(p.start + p.len) - left - 1);
    const height = laneH - 7;
    const cls = 'part ' + (p.type || 'audio') + (p.sel ? ' selected' : '') + (p.muted ? ' muted' : '') +
      (p.locked ? ' locked' : '');
    const pcol = p.color || track.partColor;
    const style = 'left:' + left.toFixed(1) + 'px;width:' + width.toFixed(1) + 'px;height:' + height.toFixed(1) +
      'px;--pb:' + pcol + (p.evol ? ';--evol:' + p.evol : '');
    const name = '<div class="p-name">' + esc(p.name) + (p.evol ? ' <b class="p-ev">' + (p.evol > 0 ? '+' : '') + String(p.evol).replace('.', ',') + ' dB</b>' : '') + '</div>';
    const loop = p.loop ? '<svg class="p-loop" viewBox="0 0 12 12"><use href="#i-loopmini"/></svg>' : '';
    const stretch = p.stretch ? '<i class="p-stretch" title="Contenu étiré (Sizing Applies Time Stretch)">Ø</i>' : '';

    let graphic = '';
    if (p.type === 'midi') {
      const hh = height - 14;
      graphic = '<svg class="p-wave" viewBox="0 0 ' + width.toFixed(1) + ' ' + hh.toFixed(1) +
        '" preserveAspectRatio="none">' + midiNotes(width, hh, p.start * 97 + p.len) + '</svg>';
    } else {
      const hh = height - 14;
      const d = wavePath(width, hh, p.wave || 'vocal', p.start * 131 + p.len * 7, (state.waveZ || 100) / 100);
      graphic = '<svg class="p-wave" viewBox="0 0 ' + width.toFixed(1) + ' ' + hh.toFixed(1) +
        '" preserveAspectRatio="none"><path d="' + d + '" fill="#14301d" opacity=".62"/>' +
        '<line x1="0" y1="' + (hh / 2) + '" x2="' + width + '" y2="' + (hh / 2) + '" stroke="#14301d" stroke-opacity=".28"/></svg>';
    }

    /* fondus dessinés (p. 87) : triangle d'entrée / de sortie */
    const fw = (v) => Math.max(0, Math.min(width / 2, barToPx(1 + (v || 0)) - barToPx(1)));
    const fi = fw(p.fadeIn), fo = fw(p.fadeOut);
    const fadeSvg = (fi || fo) ? '<svg class="p-fade" viewBox="0 0 ' + width.toFixed(1) + ' ' + height.toFixed(1) + '" preserveAspectRatio="none">' +
      (fi ? '<path d="M0 ' + height + 'L' + fi + ' 0" stroke="#14222c" stroke-width="1" fill="none" opacity=".75"/>' : '') +
      (fo ? '<path d="M' + (width - fo) + ' 0L' + width + ' ' + height + '" stroke="#14222c" stroke-width="1" fill="none" opacity=".75"/>' : '') +
      '</svg>' : '';

    /* poignées : fondu en haut à gauche / à droite, volume en haut au centre, bords pour redimensionner */
    const handles =
      '<div class="pf-h in" data-fh="in" title="Fondu entrant — glisser (double-clic : fondu automatique)"></div>' +
      '<div class="pf-h out" data-fh="out" title="Fondu sortant — glisser"></div>' +
      '<div class="pv-h" title="Volume de l’événement — glisser verticalement"></div>' +
      '<div class="p-edge l" data-edge="start" title="Redimensionner par le début"></div>' +
      '<div class="p-edge r" data-edge="end" title="Redimensionner par la fin"></div>';

    return '<div class="' + cls + '" data-part="' + p.id + '" style="' + style + '" title="' + esc(p.name) + '">' +
      fadeSvg + name + loop + stretch + graphic + handles + '</div>';
  }

  function renderLanes() {
    const tracks = visibleTracks();
    let total = 0;
    const lanes = tracks.map((t, i) => {
      let inner = '';
      if (t.kind === 'marker') {
        inner = MARKERS.map((m) =>
          '<div class="mk' + (m[2] === 'cycle' ? ' cycle' : '') + '" data-mk="' + m[0] + '" style="left:' + (barToPx(m[0]) + 3) + 'px">' +
          '<div class="flag"></div><span class="lab">' + esc(m[1]) + '</span></div>').join('');
      } else if (t.kind === 'tempo') {
        /* courbe de tempo : une ligne horizontale + un point par événement */
        inner = '<svg class="tempo-lane" viewBox="0 0 ' + barToPx(state.bars + 1) + ' ' + t.h + '" preserveAspectRatio="none">' +
          '<path d="M0 ' + (t.h / 2) + 'H' + barToPx(state.bars + 1) + '" stroke="#e8e2ae" stroke-width="1" fill="none"/>' +
          '<circle cx="4" cy="' + (t.h / 2) + '" r="3" fill="#f2e6a0" stroke="#6b6a2f"/>' +
          '<text x="10" y="' + (t.h / 2 + 3) + '" fill="#f2e6a0" font-size="8">120,000</text></svg>';
      } else if (t.kind === 'ruler') {
        inner = '<div class="ruler-lane"></div>';
      } else if (t.kind === 'arrange') {
        const blocks = [['Intro', 1, 8, '#8c8a52'], ['Couplet A', 9, 8, '#9a9758'], ['Refrain A', 17, 8, '#adaa63'],
                        ['Couplet B', 25, 8, '#9a9758'], ['Refrain B', 33, 8, '#adaa63'], ['Pont', 41, 8, '#86834d'], ['Final', 49, 8, '#b3b06a']];
        inner = blocks.map((x) =>
          '<div class="arr-block" style="left:' + barToPx(x[1]) + 'px;width:' + (barToPx(x[1] + x[2]) - barToPx(x[1]) - 1) +
          'px;background:' + x[3] + '">' + x[0] + '</div>').join('');
      } else if (t.kind === 'video') {
        inner = '<div class="vid-lane">' +
          PARTS.filter((p) => p.track === t.id).map((p) => {
            const left = barToPx(p.start), w = Math.max(10, barToPx(p.start + p.len) - left - 1);
            return '<div class="part video" data-part="' + p.id + '" style="left:' + left + 'px;width:' + w + 'px;height:' + (t.h - 7) +
              'px;--pb:' + t.partColor + '"><div class="p-name">' + esc(p.name) + '</div>' +
              '<div class="film">' + Array.from({ length: Math.max(1, Math.round(w / 26)) },
                (_, k) => '<i>' + String(k + 1).padStart(3, '0') + '</i>').join('') + '</div></div>';
          }).join('') + '</div>';
      } else if (t.kind !== 'folder') {
        inner = PARTS.filter((p) => p.track === t.id)
          .map((p) => renderPart(p, t, t.h)).join('');
      }
      const cls = ['lane'];
      if (i % 2) cls.push('alt');
      if (t.kind === 'folder') cls.push('folder-lane');
      if (t.kind === 'group') cls.push('group-lane');
      if (t.kind === 'marker') cls.push('marker-lane');
      if (t.kind === 'tempo') cls.push('tempo-lane-row');
      if (t.kind === 'ruler') cls.push('ruler-lane-row');
      if (t.kind === 'arrange') cls.push('arrange-lane');
      if (t.kind === 'video') cls.push('video-lane');
      if (t.kind === 'fx') cls.push('group-lane');
      if (isTrackSel(t.id)) cls.push('sel');

      total += t.h;
      let out = '<div class="' + cls.join(' ') + '" data-track="' + t.id + '" style="height:' + t.h + 'px">' + inner + '</div>';

      /* sous-piste d'automatisation : courbe de volume */
      if (t.autShown && t.kind !== 'folder' && t.kind !== 'group' && t.kind !== 'fx' && t.kind !== 'marker') {
        const W = barToPx(state.bars + 1), H = 22;
        const pts = automationPoints(t);
        const d = pts.map((p, k) => (k ? 'L' : 'M') + barToPx(p[0]) + ' ' + (H - 3 - p[1] * (H - 8))).join(' ');
        out += '<div class="lane aut-lane" data-track="' + t.id + '" data-sub="1" style="height:' + H + 'px">' +
          '<svg class="aut-curve" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
          '<path d="' + d + '" fill="none" stroke="#e2c46a" stroke-width="1.2"/>' +
          pts.map((p) => '<rect x="' + (barToPx(p[0]) - 1.6) + '" y="' + (H - 3 - p[1] * (H - 8) - 1.6) +
            '" width="3.2" height="3.2" fill="#f4e6b0" stroke="#6a5b22"/>').join('') + '</svg></div>';
        total += H;
      }
      return out;
    }).join('');

    const contentW = barToPx(state.bars + 1);
    const inner = $('#lanes-inner');
    inner.style.width = contentW + 'px';
    inner.style.height = total + 'px';
    inner.innerHTML = lanes +
      gridOverlay(tracks) +
      '<div class="cycle-ov" style="left:' + barToPx(state.cycleL) + 'px;width:' + (barToPx(state.cycleR) - barToPx(state.cycleL)) + 'px"></div>' +
      cycleMarkersHTML() +
      '<div class="cursor-line" style="left:' + barToPx(state.pos) + 'px"></div>';
    inner.classList.toggle('time-linear', state.rulerTime === 'time');
  }

  /* en Time Linear, la grille CSS ne correspond plus : on trace les barres en DOM */
  function gridOverlay(tracks) {
    if (state.rulerTime !== 'time') return '';
    let h = 0;
    tracks.forEach((t) => { h += t.h; if (t.autShown) h += 22; });
    let out = '<div class="grid-ov" style="height:' + h + 'px">';
    for (let b = 1; b <= state.bars; b++) out += '<i class="' + (b % 4 === 1 ? 'major' : '') + '" style="left:' + barToPx(b) + 'px"></i>';
    return out + '</div>';
  }

  /* marqueurs de cycle (Nuendo 4 : piste de marqueurs, repères de plage) */
  function cycleMarkersHTML() {
    return MARKERS.filter((m) => m[2] === 'cycle' && m[3]).map((m) =>
      '<div class="cycle-mk" style="left:' + barToPx(m[0]) + 'px;width:' + (barToPx(m[3]) - barToPx(m[0])) + 'px">' +
      '<span>' + esc(m[1]) + '</span></div>').join('');
  }

  /* courbe d'automatisation factice mais stable (une piste = une courbe) */
  function automationPoints(t) {
    if (t._aut) return t._aut;
    const seed = t.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rnd = mulberry(seed * 977);
    const n = 7 + Math.floor(rnd() * 4);
    const pts = [];
    for (let k = 0; k < n; k++) pts.push([1 + k * (64 / (n - 1)), 0.25 + rnd() * 0.62]);
    t._aut = pts;
    return pts;
  }

  function renderRuler() {
    const w = barToPx(state.bars + 1);
    const step = state.barW >= 46 ? 1 : state.barW >= 26 ? 2 : 4;
    /* Bars+Beats Linear : les barres gardent un écart constant ; Time Linear : elles
       s'espacent selon le tempo (ici le tempo est constant, on simule une rampe). */
    const barX = barToPx;
    let html = '';
    for (let bar = 1; bar <= state.bars; bar++) {
      const x = barX(bar);
      html += '<div class="rb' + (bar % 4 === 1 ? ' major' : '') + '" style="left:' + x + 'px"></div>';
      if ((bar - 1) % step === 0) {
        html += '<div class="rl" style="left:' + (x + 3) + 'px">' + rulerLabel(bar, state.fmt) + '</div>';
      }
      if (state.barW >= 34) {
        for (let b = 1; b < 4; b++) {
          html += '<div class="rt beat" style="left:' + (x + (b * state.barW) / 4) + 'px"></div>';
        }
      }
    }
    /* marqueurs cliquables (p. 109-111) */
    MARKERS.forEach((m, i) => {
      html += '<div class="r-mark' + (m[2] === 'cycle' ? ' cycle' : '') + (m[2] === 'cycle' && m[3]
        ? ' span' : '') + '" data-rk="' + i + '" title="' + esc(m[1]) + ' — double-clic : renommer, glisser : déplacer" style="left:' +
        ((m[0] - 1) * state.barW) + 'px' + (m[2] === 'cycle' && m[3] ? ';width:' + ((m[3] - m[0]) * state.barW) + 'px' : '') + '">' +
        (m[2] === 'cycle' ? '<span>' + esc(m[1]) + '</span>' : '') + '</div>';
    });
    html += '<div class="r-cycle" style="left:' + ((state.cycleL - 1) * state.barW) + 'px;width:' +
      ((state.cycleR - state.cycleL) * state.barW) + 'px"></div>';
    html += '<div class="r-loc" style="left:' + ((state.cycleL - 1) * state.barW - 3) + 'px"></div>';
    html += '<div class="r-loc right" style="left:' + ((state.cycleR - 1) * state.barW - 3) + 'px"></div>';
    html += '<div class="r-cursor" style="left:' + ((state.pos - 1) * state.barW) + 'px"></div>';
    const inner = $('#ruler-inner');
    inner.style.width = w + 'px';
    inner.innerHTML = html;

    /* piste de règle 2 (indépendante, p. 32) */
    const sub = $('#ruler-sub');
    if (sub) {
      let sh = '';
      for (let bar = 1; bar <= state.bars; bar++) {
        const x = (bar - 1) * state.barW;
        sh += '<div class="rb' + (bar % 4 === 1 ? ' major' : '') + '" style="left:' + x + 'px"></div>';
        if ((bar - 1) % step === 0) sh += '<div class="rl" style="left:' + (x + 3) + 'px">' + rulerLabel(bar, state.rulerFmt2) + '</div>';
      }
      sh += '<div class="r-cursor" style="left:' + ((state.pos - 1) * state.barW) + 'px"></div>';
      sub.innerHTML = '<div class="ruler-sub-inner" style="width:' + w + 'px">' + sh + '</div>';
      sub.style.display = state.rulerSub ? '' : 'none';
      $('#ruler-vp').classList.toggle('has-sub2', !!state.rulerSub);
    }
    syncScroll();
  }

  /* ------------------------------------------------------- APERÇU */
  function renderOverview() {
    const inner = $('#overview-inner');
    if (!inner) return;
    const host = $('#overview-vp');
    const W = Math.max(120, host.clientWidth);
    const tracks = visibleTracks().filter((t) => t.kind === 'audio' || t.kind === 'midi');
    if (!tracks.length) { inner.innerHTML = ''; updateOverviewFrame(); return; }
    const avail = host.clientHeight - 6;
    const rowH = Math.max(2, Math.min(4, avail / tracks.length - 1.2));
    const gap = Math.max(0.8, (avail - rowH * tracks.length) / Math.max(1, tracks.length - 1));
    let html = '';
    tracks.forEach((t, i) => {
      const y = 3 + i * (rowH + gap);
      PARTS.filter((p) => p.track === t.id).forEach((p) => {
        const x = ((p.start - 1) / state.bars) * (W - 2);
        const w = Math.max(2, (p.len / state.bars) * (W - 2));
        html += '<div class="ov-item" style="left:' + x.toFixed(1) + 'px;width:' + w.toFixed(1) +
          'px;top:' + y.toFixed(1) + 'px;height:' + rowH.toFixed(1) + 'px;background:' + t.partColor + '"></div>';
      });
    });
    html += '<div class="ov-cycle" style="left:' + (((state.cycleL - 1) / state.bars) * W).toFixed(1) +
      'px;width:' + (((state.cycleR - state.cycleL) / state.bars) * W).toFixed(1) + 'px"></div>';
    html += '<div class="ov-cursor" style="left:' + (((state.pos - 1) / state.bars) * W).toFixed(1) + 'px"></div>';
    inner.innerHTML = html;
    inner.style.setProperty('--ov-grid', Math.max(18, (W / state.bars) * 4) + 'px');
    updateOverviewFrame();
  }

  function updateOverviewFrame() {
    const frame = $('#overview-frame');
    const host = $('#overview-vp');
    const vp = $('#lanes-vp');
    if (!frame || !host) return;
    const W = host.clientWidth;
    const contentW = state.bars * state.barW;
    const L = (vp.scrollLeft / contentW) * W;
    const R = ((vp.scrollLeft + vp.clientWidth) / contentW) * W;
    frame.style.left = Math.max(0, L) + 'px';
    frame.style.width = Math.max(24, Math.min(W, R - L)) + 'px';
  }

  function bindOverview() {
    const host = $('#overview-vp');
    let drag = false;
    const moveTo = (e) => {
      const r = host.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const vp = $('#lanes-vp');
      const contentW = state.bars * state.barW;
      vp.scrollLeft = Math.max(0, ratio * contentW - vp.clientWidth / 2);
      syncScroll();
    };
    host.addEventListener('pointerdown', (e) => {
      drag = true; host.setPointerCapture(e.pointerId); moveTo(e);
      $('#sbStatus').textContent = 'Vue déplacée via la ligne d\u2019aperçu';
    });
    host.addEventListener('pointermove', (e) => { if (drag) moveTo(e); });
    const up = () => { drag = false; };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }

  function syncScroll() {
    const vp = $('#lanes-vp');
    $('#ruler-inner').style.transform = 'translateX(' + (-vp.scrollLeft) + 'px)';
    const sub = $('#ruler-sub .ruler-sub-inner');
    if (sub) sub.style.transform = 'translateX(' + (-vp.scrollLeft) + 'px)';
    $('#tracklist-inner').style.transform = 'translateY(' + (-vp.scrollTop) + 'px)';
    syncTlThumb();
    if (typeof updateOverviewFrame === 'function') updateOverviewFrame();
  }

  /* ---------------------------------------------------- AFFICHEURS / INFOS */
  function updateLcd() {
    const sec = (state.pos - 1) * 2; /* 120 BPM : 1 mesure 4/4 = 2 s */
    $('#lcdPos').textContent = fmtPos(state.pos);
    $('#lcdTime').textContent = fmtTime(sec);
    $('#lcdTc').textContent = fmtTc(sec);
    $('#lcdLocL').textContent = fmtPos(state.cycleL).replace(/\.\d{3}$/, '');
    $('#lcdLocR').textContent = fmtPos(state.cycleR).replace(/\.\d{3}$/, '');
  }

  function updateCursor() {
    const x = barToPx(state.pos);
    const oc = $('#overview-inner .ov-cursor');
    if (oc) oc.style.left = (((state.pos - 1) / state.bars) * $('#overview-vp').clientWidth).toFixed(1) + 'px';
    const rc = $('#ruler-inner .r-cursor');
    const cl = $('#lanes-inner .cursor-line');
    if (rc) rc.style.left = x + 'px';
    if (cl) cl.style.left = x + 'px';
    updateLcd();
  }

  function updateInfoLine() {
    const sel = PARTS.filter((p) => p.sel);
    const part = (sel.length > 1 ? sel[0] : (PARTS.find((p) => p.id === state.selectedPart) || sel[0]));
    const track = trackById(state.selectedTrack);
    const multi = sel.length > 1 || state.multiInfo;
    $('#infoMulti').classList.toggle('show', multi);
    document.getElementById('infoline').classList.toggle('is-multi', multi);
    if (part) {
      $('#infoName').value = part.name;
      $('#infoStart').value = fmtPos(part.start);
      $('#infoEnd').value = fmtPos(part.start + part.len);
      $('#infoLen').value = String(part.len).replace('.', ',') + '.0.0';
      $('#infoOff').value = '0.0.0.0';
      /* Transpose / Velocity / Fondamentale : seulement pour les parties MIDI (p. 31) */
      const isMidi = part.type === 'midi';
      $$('#infoline .il-midi').forEach((el) => el.classList.toggle('show', isMidi));
      $('#infoTranspose').value = String(part.transpose || 0);
      $('#infoVelocity').value = String(part.velocity || 0);
      $('#infoRoot').value = part.root || (track ? (track.rootKey || 'C') : 'C');
    } else {
      $('#infoName').value = track ? track.name : '';
      $('#infoStart').value = '\u2014';
      $('#infoEnd').value = '\u2014';
      $('#infoLen').value = '\u2014';
      $('#infoOff').value = '\u2014';
      $$('#infoline .il-midi').forEach((el) => el.classList.remove('show'));
    }
    /* libellé de l'élément en tête de ligne */
    const tag = $('#infoline .il-tag');
    if (tag) tag.textContent = multi ? 'Sélection (' + sel.length + ')' : (part ? (part.type === 'midi' ? 'Partie MIDI' : 'Événement audio') : 'Piste');
  }

  function updateInspector() {
    const t = trackById(state.selectedTrack) || trackById('voix');
    $('#inspHead').style.setProperty('--tc', t.color);
    $('#inspNum').textContent = t.num || '\u2014';
    $('#inspName').textContent = t.name;
    const kinds = {
      audio: 'Piste audio · Stéréo', midi: 'Piste MIDI · Stéréo', group: 'Piste groupe · Stéréo',
      fx: 'Piste FX · Stéréo', folder: 'Piste dossier', marker: 'Piste de marqueurs',
      instrument: 'Piste instrument · VSTi', video: 'Piste vidéo', tempo: 'Piste de tempo',
      arrange: 'Piste d’arrangeur', ruler: 'Piste de règle'
    };
    $('#inspType').textContent = kinds[t.kind] || 'Piste';
    updateInspectSections(t);
    $('#inspDb').textContent = fmtDb(t.db || 0);
    $('#volDbread').textContent = fmtDb(t.db || 0);
    $('#inspFader').style.setProperty('--p', dbToPct(t.db || 0) + '%');
    $('#inspM').className = 'tiny' + (t.mute ? ' on-m' : '');
    $('#inspS').className = 'tiny' + (t.solo ? ' on-s' : '');
    $('#inspR').className = 'tiny' + (t.rec ? ' on-r' : '');
    $('#sbTrack').textContent = (t.num ? t.num + ' · ' : '') + t.name;
  }

  function updateStatus() {
    $('#sbTool').textContent = state.tools[state.tool];
    $('#sbSnap').textContent = state.snap ? (state.snapMode + ' · ' + state.grid) : 'Désactivé';
    if ($('#snapModeVal')) $('#snapModeVal').textContent = state.snapMode;
    if ($('#quantVal')) $('#quantVal').textContent = state.quantizeVal;
    if ($('#autoModeVal')) $('#autoModeVal').textContent = state.autoMode;
    if ($('#rootVal')) $('#rootVal').textContent = state.rootKey;
    if ($('#colorSw')) $('#colorSw').style.background = COLORS[state.colorIdx % COLORS.length][1];
    if ($('#btnSnapZero')) $('#btnSnapZero').classList.toggle('active', state.snapZero);
    if ($('#btnConstrain')) $('#btnConstrain').classList.toggle('active', state.constrain);
    $('#gridPill').textContent = state.grid;
    $('#zoomVal').textContent = Math.round((state.barW / 64) * 100) + ' %';
    $('#infoZoom').value = Math.round((state.barW / 64) * 100) + ' %';
    $('#btnSnap').classList.toggle('active', state.snap);
    $('#btnCycle').classList.toggle('active', state.cycle);
    $('#tpCycleBtn').classList.toggle('active', state.cycle);
    $('#btnAutoScroll').classList.toggle('active', state.autoScroll);
    $('#btnPunchIn').classList.toggle('active', state.punchIn);
    $('#btnPunchOut').classList.toggle('active', state.punchOut);
    $('#tpPunchIn').classList.toggle('on', state.punchIn);
    $('#tpPunchOut').classList.toggle('on', state.punchOut);
    $('#tpClick').classList.toggle('on', state.click);
    $('#tpSync').classList.toggle('on', state.sync);
    $('#tpAutoR').classList.toggle('on', state.autoR);
    $('#tpAutoW').classList.toggle('on', state.autoW);
    $$('#toolGroup .tbtn').forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
  }

  /* --------------------------------------------------------- SÉLECTIONS */
  function selectTrack(id) {
    state.selectedTrack = id;
    const t = trackById(id);
    /* sélection d'une piste -> ses événements ne sont pas sélectionnés d'office */
    renderTracks();
    renderLanes();
    updateInspector();
    updateCursor();
    if (window.ALPHAWIN && window.ALPHAWIN.refreshSelections) window.ALPHAWIN.refreshSelections();
    $('#sbStatus').textContent = t ? 'Piste sélectionnée : ' + t.name : 'Prêt';
  }

  function selectPart(id, additive) {
    if (!additive) PARTS.forEach((p) => { p.sel = false; });
    const p = PARTS.find((x) => x.id === id);
    if (!p) return;
    p.sel = additive ? !p.sel : true;
    state.selectedPart = p.sel ? p.id : null;
    state.selectedTrack = p.track;
    renderTracks();
    renderLanes();
    updateInspector();
    updateInfoLine();
    updateCursor();
    $('#sbStatus').textContent = 'Événement sélectionné : ' + p.name;
  }

  /* ------------------------------------------------------------- TOASTS */
  let toastTimer = null;
  function toast(msg, title) {
    const el = $('#toast');
    $('#toast .tt').textContent = title || 'ALPHA Studio';
    $('#toastMsg').innerHTML = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  /* -------------------------------------------------------------- MENUS */
  const WINSET = {
    mix: 'mixer', chan: 'channel', auto: 'automation', sample: 'sample', key: 'key',
    mediabay: 'mediabay', pool: 'pool', vstinstr: 'vstinstr', conns: 'connections',
    markers: 'markers', history: 'history', shortcuts: 'shortcuts', projman: 'projman',
    perf: 'perf', tempo: 'tempo', browser: 'browser', tracksheet: 'tracksheet',
    setup: 'setup', prefs: 'prefs', devices: 'devices', keycmd: 'keycmd', video: 'video',
    croom: 'croom', exportmix: 'exportmix', fade: 'fade', crossfade: 'crossfade', detect: 'detect',
    spectrum: 'spectrum', stats: 'stats', audiopart: 'audiopart', listeditor: 'listeditor',
    loops: 'loops', sounds: 'sounds', layout: 'layout', workspaces: 'workspaces',
    /* lot 3 — fenêtres manquantes de Nuendo 4 */
    plugini: 'plugininfo', logical: 'logical', inputtrans: 'inputtrans', projlogical: 'projlogical',
    mididev: 'mididevice', trackpre: 'trackpresets', quant: 'quantize', beatcalc: 'beatcalc',
    impmed: 'importmedium', omf: 'omf', batch: 'batch', surround: 'surround',
    sync: 'sync', machine: 'machine', syslink: 'syslink', rewire: 'rewire'
  };
  const SEP = null;
  /* Raccourcis d’écriture des menus : mi(libellé, raccourci, action, argument) et ms(libellé, sous-menu) */
  const mi = (t, sc, act, a) => ({ t: t, sc: sc || '', act: act || '', a: a });
  const ms = (t, items) => ({ t: t, items: items });
  const mk = (t, sc, act, chk, val) => ({ t: t, sc: sc || '', act: act || '', chk: chk, val: val });

  const MENUS = [
    /* ------------------------------------------------------------- FICHIER */
    { label: 'Fichier', items: [
      mi('Nouveau projet\u2026', 'Ctrl+N', 'newProject'),
      ms('Nouveau', [
        mi('Projet vierge\u2026', '', 'newProject'),
        mi('Projet depuis un mod\u00e8le\u2026', '', 'newFromTemplate'),
        mi('Biblioth\u00e8que de projets\u2026', '', 'newLibrary'),
        mi('Dossier de projet\u2026', '', 'newFolder')
      ]),
      mi('Ouvrir\u2026', 'Ctrl+O', 'openProject'),
      ms('Ouvrir r\u00e9cemment', [
        mi('D\u00e9mo_Alpha_01', '', 'recent', 'D\u00e9mo_Alpha_01'),
        mi('Session_Mars_v3', '', 'recent', 'Session_Mars_v3'),
        mi('Montage_Pub_30s', '', 'recent', 'Montage_Pub_30s'),
        mi('Maquette_Album_02', '', 'recent', 'Maquette_Album_02'),
        SEP,
        mi('Vider la liste', '', 'clearRecent')
      ]),
      mi('Fermer', 'Ctrl+W', 'closeProject'),
      SEP,
      mi('Enregistrer', 'Ctrl+S', 'saveProject'),
      mi('Enregistrer sous\u2026', 'Ctrl+Maj+S', 'saveAs'),
      mi('Enregistrer une nouvelle version', 'Ctrl+Alt+S', 'saveNewVersion'),
      mi('Enregistrer comme mod\u00e8le\u2026', '', 'saveTemplate'),
      mi('Revenir \u00e0 la version enregistr\u00e9e', '', 'revert'),
      SEP,
      ms('Importer', [
        mi('Fichier audio\u2026', '', 'importAudio'),
        mi('Fichier MIDI\u2026', '', 'importMidi'),
        mi('Fichier vid\u00e9o\u2026', '', 'importVideo'),
        SEP,
        mi('Piste depuis un projet\u2026', '', 'importTrack'),
        mi('Piste d\u2019archive\u2026', '', 'importTrackArchive'),
        mi('Fichier OMF\u2026', '', 'importOmf'),
        mi('Fichier AAF\u2026', '', 'importAaf'),
        mi('Fichier XML (ancien)\u2026', '', 'importXml'),
        mi('Audio CD\u2026', '', 'importCd')
      ]),
      ms('Exporter', [
        mi('Mixage audio\u2026', '', 'exportmix'),
        mi('Piste s\u00e9lectionn\u00e9e\u2026', '', 'exportTrack'),
        mi('Fichier MIDI\u2026', '', 'exportMidi'),
        mi('Notation\u2026', '', 'exportScore'),
        mi('OMF / AAF\u2026', '', 'omf'),
        mi('AES31 / OpenTL\u2026', '', 'omf', 'aes31'),
        mi('Fichier XML (ancien)\u2026', '', 'exportXml'),
        mi('Vid\u00e9o\u2026', '', 'exportVideo'),
        mi('Audio CD\u2026', '', 'exportCd'),
        mi('Temps de traitement\u2026', '', 'exportPerf')
      ]),
      mi('Remplacer l\u2019audio dans un fichier vid\u00e9o\u2026', '', 'replaceAudioVideo'),
      mi('Extraire l\u2019audio d\u2019une vid\u00e9o\u2026', '', 'extractAudio'),
      SEP,
      mi('Configuration du projet\u2026', 'Maj+S', 'setup'),
      mi('Informations sur le projet\u2026', '', 'projectInfo'),
      mi('Historique du projet\u2026', '', 'projectHistory'),
      mi('Nettoyage\u2026', '', 'projman'),
      SEP,
      mi('Mise en page\u2026', '', 'pageSetup'),
      mi('Imprimer\u2026', 'Ctrl+P', 'print'),
      SEP,
      mi('Commandes clavier\u2026', '', 'keycmd'),
      mi('Pr\u00e9f\u00e9rences\u2026', '', 'prefs'),
      SEP,
      mi('Quitter', 'Alt+F4', 'quit')
    ]},

    /* ------------------------------------------------------------- ÉDITION */
    { label: '\u00c9dition', items: [
      mi('Annuler', 'Ctrl+Z', 'undo'),
      mi('R\u00e9tablir', 'Ctrl+Maj+Z', 'redo'),
      mi('Historique des traitements hors ligne\u2026', '', 'history'),
      SEP,
      mi('Couper', 'Ctrl+X', 'cut'),
      mi('Copier', 'Ctrl+C', 'copy'),
      mi('Coller', 'Ctrl+V', 'paste'),
      mi('Coller \u00e0 la position du curseur', 'Alt+V', 'pasteAtCursor'),
      mi('Supprimer', 'Suppr', 'del'),
      mi('Supprimer le temps\u2026', '', 'delTime'),
      mi('Dupliquer', 'Ctrl+D', 'duplicate'),
      mi('R\u00e9p\u00e9ter\u2026', '', 'repeat'),
      mi('Remplir la boucle', '', 'fillLoop'),
      mi('Diviser la boucle', '', 'splitLoop'),
      mi('Diviser au curseur', 'Alt+X', 'splitAtCursor'),
      mi('Muter', 'M', 'mute'),
      mi('D\u00e9muter', '', 'unmute'),
      mi('Renommer\u2026', '', 'rename'),
      mi('Verrouiller\u2026', '', 'lock'),
      mi('D\u00e9verrouiller', '', 'unlock'),
      SEP,
      ms('S\u00e9lectionner', [
        mi('Tout', 'Ctrl+A', 'selectAll'),
        mi('Rien', 'Ctrl+Maj+A', 'deselectAll'),
        mi('Tous les \u00e9v\u00e9nements de la piste', '', 'selectTrack'),
        mi('Dans la boucle', '', 'selectLoop'),
        mi('Du curseur \u00e0 la fin', '', 'selectFromCursor'),
        mi('\u00c0 gauche du curseur', '', 'selectToLeft'),
        mi('\u00c0 droite du curseur', '', 'selectToRight'),
        SEP,
        mi('\u00c9v\u00e9nement suivant', '', 'nextSel'),
        mi('\u00c9v\u00e9nement pr\u00e9c\u00e9dent', '', 'prevSel'),
        mi('Sous le curseur de la souris', '', 'underMouse')
      ]),
      ms('D\u00e9placer vers', [
        mi('Plan avant', '', 'moveFront'),
        mi('Plan arri\u00e8re', '', 'moveBack')
      ]),
      mi('Convertir en copie r\u00e9elle', '', 'toRealCopy'),
      SEP,
      mi('Fondu\u2026', 'A', 'fade'),
      mi('Fondu encha\u00een\u00e9\u2026', 'X', 'crossfade'),
      mi('Supprimer les fondus', '', 'removeFades'),
      mi('R\u00e9glages des fondus automatiques\u2026', '', 'autoFade'),
      SEP,
      ms('Outils', [
        mk('Fl\u00e8che', '1', 'useTool', 'tool', 'pointer'),
        mk('Plage', '2', 'useTool', 'tool', 'range'),
        mk('Ciseaux', '3', 'useTool', 'tool', 'split'),
        mk('Colle', '4', 'useTool', 'tool', 'glue'),
        mk('Gomme', '5', 'useTool', 'tool', 'erase'),
        mk('Zoom', '6', 'useTool', 'tool', 'zoom'),
        mk('Silencieux', '7', 'useTool', 'tool', 'mute'),
        mk('Crayon', '8', 'useTool', 'tool', 'draw'),
        mk('\u00c9coute', '9', 'useTool', 'tool', 'audition')
      ]),
      ms('Zoom', [
        mi('Zoom avant', '+', 'zoomBy', 1),
        mi('Zoom arri\u00e8re', '\u2212', 'zoomBy', -1),
        mi('Zoom plein', '', 'zoomFull'),
        mi('Zoom sur la s\u00e9lection', '', 'zoomSel'),
        mi('Zoom sur la boucle', '', 'zoomLoop'),
        mi('Zoom sur l\u2019\u00e9v\u00e9nement', '', 'zoomEvent'),
        SEP,
        mi('Zoom vertical +', '', 'zoomVert', 1),
        mi('Zoom vertical \u2212', '', 'zoomVert', -1),
        mi('Zoom des formes d\u2019onde +', '', 'waveZoom', 1),
        mi('Zoom des formes d\u2019onde \u2212', '', 'waveZoom', -1),
        SEP,
        mi('Restaurer le zoom', 'Maj+Z', 'zoomReset')
      ]),
      ms('Accrochage', [
        mk('Activer l\u2019accrochage', 'J', 'snap', 'snap'),
        SEP,
        mk('Barre', '', 'useGrid', 'grid', 'Barre'),
        mk('Temps', '', 'useGrid', 'grid', 'Temps'),
        mk('1/8', '', 'useGrid', 'grid', '1/8'),
        mk('1/16', '', 'useGrid', 'grid', '1/16'),
        SEP,
        mi('Accrocher aux \u00e9v\u00e9nements', '', 'snapEvents'),
        mi('Grille magn\u00e9tique\u2026', '', 'magneticGrid')
      ]),
      ms('Enveloppes', [
        mi('Afficher les enveloppes', '', 'envShow'),
        mi('Volume', '', 'envVolume'),
        mi('Panoramique', '', 'envPan'),
        mi('Fondu', '', 'envFade'),
        mi('Automatisation', '', 'envAuto')
      ]),
      ms('Ouvrir dans l\u2019\u00e9diteur', [
        mi('\u00c9diteur d\u2019\u00e9chantillons', 'Ctrl+E', 'sample'),
        mi('\u00c9diteur de clavier', '', 'key'),
        mi('\u00c9diteur de batterie (NEK)', '', 'nek'),
        mi('\u00c9diteur de partitions (NEK)', '', 'nek'),
        mi('\u00c9diteur de liste', '', 'listeditor'),
        mi('\u00c9diteur de parties audio', '', 'audiopart')
      ]),
      mi('\u00c9dition en place', 'Ctrl+Maj+I', 'inplace'),
      SEP,
      ms('Outils d\u2019\u00e9dition', [
        mi('Fl\u00e8che (Normal Sizing)', '', 'setResize', 'normal'),
        mi('Sizing Moves Contents', '', 'setResize', 'contents'),
        mi('Sizing Applies Time Stretch', '', 'setResize', 'stretch'),
        SEP,
        mi('Line tool\u2026', '', 'toolLine'),
        mi('Couleur (Color tool)', '', 'toolColor'),
        mi('Time Warp', '', 'toolWarp'),
        mi('Lecture / Scrub', '', 'toolScrub'),
        SEP,
        mi('Snap to Zero Crossings', '', 'snapZero'),
        mi('Snap Track Heights', '', 'snapHeights')
      ]),
      SEP,
      mi('Project Logical Editor\u2026', '', 'projectLogical'),
      mi('\u00c9diteur logique\u2026', '', 'logical'),
      mi('Input Transformer\u2026', '', 'inputtrans')
    ]},

    /* -------------------------------------------------------------- PROJET */
    { label: 'Projet', items: [
      ms('Ajouter une piste', [
        mi('Audio', '', 'addTrack', 'audio'),
        mi('MIDI', '', 'addTrack', 'midi'),
        mi('Instrument', '', 'addTrack', 'instrument'),
        mi('Piste de marqueurs', '', 'addTrack', 'markers'),
        mi('Piste d\u2019arrangeur', '', 'addTrack', 'arranger'),
        mi('Piste de tempo', '', 'addTrack', 'tempo'),
        mi('Piste vid\u00e9o', '', 'addTrack', 'video'),
        SEP,
        mi('Piste de dossier', '', 'addTrack', 'folder'),
        mi('Piste de groupe', '', 'addTrack', 'group'),
        mi('Piste d\u2019automatisation', '', 'addTrack', 'automation'),
        mi('Piste d\u2019\u00e9chantillonnage', '', 'addTrack', 'sampler')
      ]),
      ms('Ajouter un canal FX', [
        mi('Mono', '', 'addFX', 'mono'),
        mi('St\u00e9r\u00e9o', '', 'addFX', 'stereo'),
        mi('Surround 5.1', '', 'addFX', 'surround')
      ]),
      mi('Dupliquer les pistes', '', 'dupTracks'),
      mi('Supprimer les pistes', '', 'delTracks'),
      mi('Retirer les pistes vides', '', 'removeEmpty'),
      SEP,
      mi('Marqueurs', 'Ctrl+M', 'markers'),
      mi('Piste de marqueurs', '', 'markerTrack'),
      mi('Navigateur de projet\u2026', 'Ctrl+B', 'browser'),
      mi('Feuille de pistes\u2026', '', 'tracksheet'),
      SEP,
      mi('\u00c9diteur de piste de tempo', 'Ctrl+T', 'tempo'),
      mi('Beat Calculator\u2026', '', 'beatCalc'),
      mi('Pool', 'Ctrl+P', 'pool'),
      mi('MediaBay', 'F5', 'mediabay'),
      SEP,
      mi('Mixer', 'F3', 'mix'),
      mi('Panneau d\u2019automatisation', 'Alt+A', 'auto'),
      mi('R\u00e9glages de canal', 'E', 'chan'),
      mi('Mixer Control Room', '', 'croom'),
      SEP,
      mi('Configuration du projet\u2026', '', 'setup'),
      mi('R\u00e9glages des fondus automatiques\u2026', '', 'autoFade'),
      mi('Snapshots\u2026', '', 'snapshots'),
      mi('Suivre la s\u00e9lection', '', 'followSel'),
      mi('Project Logical Editor\u2026', '', 'projlogical'),
      mi('Beat Calculator\u2026', '', 'beatcalc'),
      mi('Presets de piste\u2026', '', 'trackpre'),
      mi('Setup de quantize\u2026', '', 'quant'),
      SEP,
      ms('Arrangeur', [
        mi('Cr\u00e9er une cha\u00eene arranger', '', 'arranger', 'create'),
        mi('Aplatir la cha\u00eene', '', 'arranger', 'flatten'),
        mi('Mode Live', '', 'arranger', 'live'),
        mi('Arranger \u00e0 la vid\u00e9o\u2026', '', 'arranger', 'video')
      ]),
      mi('Importer un mod\u00e8le de piste\u2026', '', 'trackTemplate'),
      mi('Exporter une piste comme mod\u00e8le\u2026', '', 'trackTemplateOut'),
      SEP,
      mi('Nettoyage\u2026', '', 'projman'),
      mi('Fermer toutes les fen\u00eatres', '', 'closeAll')
    ]},

    /* --------------------------------------------------------------- AUDIO */
    { label: 'Audio', items: [
      ms('Traitement', [
        mi('Gain\u2026', '', 'process', 'gain'),
        mi('Normaliser\u2026', '', 'process', 'normalize'),
        mi('Fondu entrant', '', 'process', 'fadein'),
        mi('Fondu sortant', '', 'process', 'fadeout'),
        mi('Enveloppe de volume\u2026', '', 'process', 'envelope'),
        mi('Inverser la phase', '', 'process', 'invert'),
        mi('Silence', '', 'process', 'silence'),
        mi('Supprimer le d\u00e9calage DC', '', 'process', 'dc'),
        SEP,
        mi('D\u00e9tection des silences\u2026', '', 'detect'),
        mi('Statistiques\u2026', '', 'stats'),
        mi('Analyseur de spectre\u2026', '', 'spectrum')
      ]),
      ms('Plug-ins', [
        mi('Reverb Space', '', 'plugins', 'space'),
        mi('Compression Alpha', '', 'plugins', 'comp'),
        mi('De-Esser Pro', '', 'plugins', 'deess'),
        mi('Channel EQ', '', 'plugins', 'eq'),
        mi('Distortion', '', 'plugins', 'dist'),
        mi('Modulation', '', 'plugins', 'mod'),
        mi('Pitch Shift', '', 'plugins', 'pitch'),
        SEP,
        mi('Informations sur les plug-ins\u2026', '', 'plugini')
      ]),
      ms('Traitement hors ligne', [
        mi('Process Project Logical Editor', '', 'projectLogical'),
        mi('D\u00e9tection des silences\u2026', '', 'detect'),
        mi('Traitement par lots\u2026', '', 'batch'),
        mi('G\u00e9rer les traitements par lots\u2026', '', 'batch', 'manage'),
        mi('Freeze Edits\u2026', '', 'freeze'),
        mi('Historique des traitements\u2026', '', 'history'),
        SEP,
        mi('Surround Panner\u2026', '', 'surround'),
        mi('MixConvert\u2026', '', 'surround', 'converter')
      ]),
      mi('Freeze Edits\u2026', '', 'freeze'),
      mi('Mettre \u00e0 jour l\u2019origine', '', 'updateOrigin'),
      mi('Fusionner la s\u00e9lection', '', 'bounce'),
      mi('Fermer les \u00e9carts', '', 'closeGaps'),
      mi('\u00c9v\u00e9nements en partie', '', 'eventsToPart'),
      mi('Dissoudre la partie', '', 'dissolvePart'),
      mi('Supprimer les fondus', '', 'removeFades'),
      mi('Fondu encha\u00een\u00e9', 'X', 'crossfade'),
      SEP,
      ms('Audio Warp', [
        mi('Tempo matching\u2026', '', 'warp', 'tempo'),
        mi('Straighten Up', '', 'warp', 'straight'),
        mi('Marquer les hitpoints', '', 'hitpoints', 'mark'),
        mi('Aplatir le traitement', '', 'warp', 'flatten'),
        mi('Outils de d\u00e9formation', '', 'warp', 'tools')
      ]),
      ms('Hitpoints', [
        mi('D\u00e9tecter les hitpoints', '', 'hitpoints', 'detect'),
        mi('Tout supprimer', '', 'hitpoints', 'clear'),
        mi('D\u00e9couper en slices', '', 'hitpoints', 'slice'),
        mi('Cr\u00e9er des r\u00e9gions\u2026', '', 'hitpoints', 'regions')
      ]),
      SEP,
      mi('Analyseur de spectre\u2026', '', 'spectrum'),
      mi('Statistiques\u2026', '', 'stats'),
      mi('D\u00e9tection des silences\u2026', '', 'detect'),
      mi('Traitement par lots\u2026', '', 'batch'),
      SEP,
      mi('Extraire l\u2019audio d\u2019une vid\u00e9o\u2026', '', 'extractAudio')
    ]},

    /* ----------------------------------------------------------- TRANSPORT */
    { label: 'Transport', items: [
      mi('Lecture', 'Espace', 'play'),
      mi('Arr\u00eat', '0', 'stop'),
      mi('Enregistrement', '*', 'record'),
      mk('Cycle', '/', 'cycle', 'cycle'),
      SEP,
      mi('Retour au point z\u00e9ro', 'D\u00e9but', 'rtz'),
      mi('Aller \u00e0 la fin', 'Fin', 'end'),
      ms('Localisateurs', [
        mi('Localisateur gauche au curseur', '', 'locL'),
        mi('Localisateur droit au curseur', '', 'locR'),
        mi('Localisateurs sur la s\u00e9lection', '', 'locToSel'),
        mi('Aller au localisateur gauche', '', 'gotoL'),
        mi('Aller au localisateur droit', '', 'gotoR'),
        SEP,
        mi('Punch In / Punch Out', '', 'autoPunch')
      ]),
      ms('Nudge', [
        mi('D\u00e9caler \u00e0 gauche', '', 'nudge', -1),
        mi('D\u00e9caler \u00e0 droite', '', 'nudge', 1)
      ]),
      SEP,
      mi('Panneau Transport', 'F2', 'transport'),
      mk('M\u00e9tronome', 'C', 'click', 'click'),
      mk('Pr\u00e9compte (Precount)', '', 'precount', 'click'),
      SEP,
      mk('Punch In', '', 'punchIn', 'punchIn'),
      mk('Punch Out', '', 'punchOut', 'punchOut'),
      mi('Auto Punch', '', 'autoPunch'),
      mi('Mode \u00c9dition (Edit Mode)', '', 'editMode'),
      mk('Utiliser la synchronisation externe', '', 'extSync', 'sync'),
      SEP,
      mi('Tempo fixe\u2026', '', 'fixedTempo'),
      mi('\u00c9diteur de piste de tempo', 'Ctrl+T', 'tempo'),
      SEP,
      ms('Mode d\u2019enregistrement', [
        mi('Remplacer', '', 'setRecMode', 'Remplacer'),
        mi('Conserver', '', 'setRecMode', 'Conserver'),
        mi('Prises (lanes)', '', 'setRecMode', 'Prises')
      ]),
      ms('Enregistrement en cycle', [
        mi('Mix (superposition)', '', 'setCycleRec', 'Mix'),
        mi('Remplacer', '', 'setCycleRec', 'Remplacer'),
        mi('Conserver', '', 'setCycleRec', 'Conserver')
      ]),
      ms('Jog / Shuttle', [
        mi('Arr\u00eat (0\u00d7)', '', 'jogShuttle', 0),
        mi('0,25\u00d7', '', 'jogShuttle', 0.25),
        mi('0,5\u00d7', '', 'jogShuttle', 0.5),
        mi('1\u00d7', '', 'jogShuttle', 1),
        mi('2\u00d7', '', 'jogShuttle', 2)
      ]),
      ms('Auto-Quantize', [
        mi('D\u00e9sactiv\u00e9', '', 'autoQ', 'off'),
        mi('1/8', '', 'autoQ', '1/8'),
        mi('1/16', '', 'autoQ', '1/16'),
        mi('1/32', '', 'autoQ', '1/32')
      ]),
      ms('Pr\u00e9 / Post-roll', [
        mi('Pr\u00e9-roll +1 s', '', 'setPre', 1),
        mi('Post-roll +1 s', '', 'setPost', 1),
        mi('Effacer les deux', '', 'clearRolls', '')
      ]),
      mi('Marqueur pr\u00e9c\u00e9dent', 'Ctrl+Fl\u00e8che gauche', 'prevMarker'),
      mi('Marqueur suivant', 'Ctrl+Fl\u00e8che droite', 'nextMarker'),
      SEP,
      mi('Performances VST\u2026', 'F12', 'perf'),
      mi('Configuration de synchronisation\u2026', '', 'sync'),
      mi('Machine Control\u2026', '', 'machine'),
      mi('VST System Link\u2026', '', 'syslink'),
      mi('ReWire\u2026', '', 'rewire'),
      mi('Fen\u00eatre vid\u00e9o', 'F8', 'video'),
      SEP,
      mi('Mute global', '', 'muteAll'),
      mi('Solo global', '', 'soloAll')
    ]},

    /* --------------------------------------------------------------- MÉDIA */
    { label: 'M\u00e9dia', items: [
      mi('MediaBay', 'F5', 'mediabay'),
      mi('Loop Browser', 'F6', 'loops'),
      mi('Sound Browser', 'F7', 'sounds'),
      mi('Pool du projet', 'Ctrl+P', 'pool'),
      SEP,
      mi('Import Medium\u2026', '', 'impmed'),
      mi('Importer un fichier audio\u2026', '', 'importAudio'),
      mi('Importer un fichier MIDI\u2026', '', 'importMidi'),
      mi('Importer une vid\u00e9o\u2026', '', 'importVideo'),
      mi('Importer une piste depuis un projet\u2026', '', 'importTrack'),
      SEP,
      mi('Conform Files\u2026', '', 'conform'),
      mi('Minimiser le fichier', '', 'minimize'),
      mi('Nouvelle version\u2026', '', 'newVersion'),
      mi('Pr\u00e9parer l\u2019archive', '', 'prepareArchive'),
      mi('Vider la corbeille', '', 'emptyTrash'),
      mi('S\u00e9lectionner dans le projet', '', 'selectInProject'),
      ms('Gestion des m\u00e9dias', [
        mi('V\u00e9rifier les fichiers manquants', '', 'mediaMgmt', 'missing'),
        mi('Rechercher les fichiers\u2026', '', 'mediaMgmt', 'search'),
        mi('Convertir les fichiers\u2026', '', 'mediaMgmt', 'convert'),
        mi('Relier les fichiers\u2026', '', 'mediaMgmt', 'relink'),
        mi('Rafra\u00eechir le MediaBay', '', 'mediaMgmt', 'refresh')
      ]),
      SEP,
      mi('Remplacer l\u2019audio dans un fichier vid\u00e9o\u2026', '', 'replaceAudioVideo'),
      mi('Extraire l\u2019audio d\u2019une vid\u00e9o\u2026', '', 'extractAudio'),
      SEP,
      ms('MIDI', [
        mi('Ouvrir le moniteur MIDI', '', 'midimonitor'),
        mi('Reset des contr\u00f4leurs MIDI', '', 'midiReset'),
        mi('Retirer les notes doubl\u00e9es', '', 'midiDup'),
        mi('Modificateurs MIDI\u2026', '', 'midiMods'),
        mi('Quantifier les longueurs\u2026', '', 'midiQLen'),
        mi('Transposer\u2026', '', 'transpose'),
        mi('V\u00e9locit\u00e9\u2026', '', 'velocity'),
        mi('Legato', '', 'legato'),
        SEP,
        mi('Panneau de configuration MIDI\u2026', '', 'midiSetup')
      ])
    ]},

    /* -------------------------------------------------------- PÉRIPHÉRIQUES */
    { label: 'P\u00e9riph\u00e9riques', items: [
      mi('Instruments VST', 'F11', 'vstinstr'),
      mi('Mixer', 'F3', 'mix'),
      mi('Connexions VST', 'F4', 'conns'),
      mi('Mixer Control Room', '', 'croom'),
      SEP,
      mi('Configuration des p\u00e9riph\u00e9riques\u2026', '', 'devices'),
      mi('MIDI Device Manager\u2026', '', 'mididev'),
      ms('P\u00e9riph\u00e9riques Remote', [
        mi('Generic Remote', '', 'remotes', 'generic'),
        mi('Alphatrack', '', 'remotes', 'alphatrack'),
        mi('Apprendre (Learn)', '', 'remotes', 'learn'),
        mi('Enregistrer la configuration\u2026', '', 'remotes', 'save')
      ]),
      ms('Quick Controls', [
        mi('Panneau Quick Controls\u2026', '', 'quickControls', 'config'),
        mi('Configurer les 8 param\u00e8tres\u2026', '', 'quickControls', 'config'),
        mi('Apprendre\u2026', '', 'quickControls', 'learn'),
        mi('Envoyer les noms de param\u00e8tres', '', 'quickControls', 'names'),
        SEP,
        mi('Affectation du contr\u00f4leur tactile (8 / 16 / 24 voies)', '', 'touchAssign'),
        mi('Page pr\u00e9c\u00e9dente / page suivante', '', 'touchPage')
      ]),
      mi('Informations sur les plug-ins\u2026', '', 'plugini'),
      SEP,
      mi('Video Player', 'F8', 'video'),
      ms('Sortie vid\u00e9o', [
        mi('Fen\u00eatre \u00e0 l\u2019\u00e9cran', '', 'videoOut', 'window'),
        mi('FireWire', '', 'videoOut', 'firewire'),
        mi('Carte graphique (overlay)', '', 'videoOut', 'overlay'),
        mi('Plein \u00e9cran', '', 'videoOut', 'fullscreen')
      ]),
      mi('Panneau de configuration ASIO\u2026', '', 'asioPanel'),
      SEP,
      mi('Configuration de synchronisation du projet\u2026', '', 'sync'),
      mi('Machine Control\u2026', '', 'machine'),
      mi('VST System Link\u2026', '', 'syslink'),
      mi('ReWire\u2026', '', 'rewire'),
      mi('Performances VST\u2026', 'F12', 'perf'),
      SEP,
      mi('Commandes clavier\u2026', '', 'keycmd'),
      mi('Pr\u00e9f\u00e9rences\u2026', '', 'prefs')
    ]},

    /* ------------------------------------------------------------ FENÊTRES */
    { label: 'Fen\u00eatres', right: true, items: [
      mi('Projet', 'Alt+1', 'focus'),
      mi('Mixer', 'F3', 'mix'),
      mi('R\u00e9glages de canal', 'E', 'chan'),
      mi('Panneau d\u2019automatisation', 'Alt+A', 'auto'),
      mi('Mixer Control Room', '', 'croom'),
      mi('Marqueurs', 'Ctrl+M', 'markers'),
      mi('Vid\u00e9o', 'F8', 'video'),
      mi('Performances VST', 'F12', 'perf'),
      SEP,
      ms('\u00c9diteurs', [
        mi('\u00c9diteur d\u2019\u00e9chantillons', 'Ctrl+E', 'sample'),
        mi('\u00c9diteur de clavier', '', 'key'),
        mi('\u00c9diteur de liste', '', 'listeditor'),
        mi('\u00c9diteur de parties audio', '', 'audiopart'),
        mi('\u00c9diteur de batterie (NEK)', '', 'nek'),
        mi('\u00c9diteur de partitions (NEK)', '', 'nek')
      ]),
      ms('M\u00e9dias', [
        mi('MediaBay', 'F5', 'mediabay'),
        mi('Loop Browser', 'F6', 'loops'),
        mi('Sound Browser', 'F7', 'sounds'),
        mi('Pool', 'Ctrl+P', 'pool'),
        mi('Navigateur de projet', 'Ctrl+B', 'browser')
      ]),
      ms('Console', [
        mi('Mixer', 'F3', 'mix'),
        mi('R\u00e9glages de canal', 'E', 'chan'),
        mi('Connexions VST', 'F4', 'conns'),
        mi('Instruments VST', 'F11', 'vstinstr'),
        mi('Mixer Control Room', '', 'croom'),
        mi('Panneau d\u2019automatisation', 'Alt+A', 'auto')
      ]),
      ms('R\u00e9glages', [
        mi('Configuration du projet\u2026', 'Maj+S', 'setup'),
        mi('Pr\u00e9f\u00e9rences\u2026', '', 'prefs'),
        mi('Configuration des p\u00e9riph\u00e9riques\u2026', '', 'devices'),
        mi('Commandes clavier\u2026', '', 'keycmd'),
        mi('Configuration des \u00e9l\u00e9ments (Setup)\u2026', 'Alt+U', 'layout'),
        mi('Feuille de pistes\u2026', '', 'tracksheet'),
        mi('\u00c9diteur de piste de tempo', 'Ctrl+T', 'tempo')
      ]),
      ms('Outils', [
        mi('Fondu\u2026', 'A', 'fade'),
        mi('Fondu encha\u00een\u00e9\u2026', 'X', 'crossfade'),
        mi('D\u00e9tection des silences\u2026', '', 'detect'),
        mi('Analyseur de spectre\u2026', '', 'spectrum'),
        mi('Statistiques\u2026', '', 'stats'),
        mi('Exportation du mixage audio\u2026', '', 'exportmix'),
        mi('Historique des traitements hors ligne\u2026', '', 'history'),
        mi('Nettoyage\u2026', '', 'projman')
      ]),
      ms('Espaces de travail', [
        mi('Organiser les espaces de travail\u2026', 'W', 'workspaces'),
        SEP,
        mi('Espace 1 \u2014 \u00c9dition', 'Alt+1', 'wsRecall', 1),
        mi('Espace 2 \u2014 Mixage', 'Alt+2', 'wsRecall', 2),
        mi('Espace 3 \u2014 Montage vid\u00e9o', 'Alt+3', 'wsRecall', 3),
        SEP,
        mi('M\u00e9moriser l\u2019espace actif', '', 'wsStore'),
        mi('Verrouiller l\u2019espace actif', '', 'wsLock')
      ]),
      SEP,
      ms('Pistes', [
        mi('Track Controls Settings\u2026', '', 'trackControls'),
        mi('Enlarge Selected Track', 'B', 'enlargeSelected'),
        mi('Inverser le pli des dossiers', '', 'invertFold'),
        mi('Tout replier', '', 'foldTracks'),
        mi('Tout d\u00e9plier', '', 'unfoldTracks'),
        mi('Snap Track Heights', '', 'snapHeights')
      ]),
      ms('Inspecteur', [
        mi('Inspector Setup\u2026', '', 'inspSetup'),
        mi('Quick Controls', '', 'quickControls', 'config'),
        mi('Modificateurs MIDI\u2026', '', 'midiMods'),
        mi('Afficher / masquer l\u2019inspecteur', 'Alt+I', 'toggleInspector')
      ]),
      SEP,
      mi('Fermer toutes les fen\u00eatres', '', 'closeAll'),
      mi('R\u00e9duire toutes les fen\u00eatres', '', 'minimizeAll'),
      mi('Configuration des \u00e9l\u00e9ments (Setup)\u2026', 'Alt+U', 'layout')
    ]},

    /* ---------------------------------------------------------------- AIDE */
    { label: 'Aide', right: true, items: [
      mi('Documentation ALPHA', 'F1', 'about'),
      mi('Aide-m\u00e9moire des raccourcis (ajout ALPHA)', '', 'shortcuts'),
      mi('Personnaliser les menus\u2026', '', 'menuSetup'),
      mi('Commandes clavier\u2026', '', 'keycmd'),
      SEP,
      mi('\u00c0 propos d\u2019ALPHA Studio\u2026', '', 'about'),
      mi('Diagnostic syst\u00e8me', '', 'perf'),
      SEP,
      mi('Manuel Nuendo 4 (documentation d\u2019origine)', '', 'docManual'),
      mi('Site Steinberg \u2014 support Nuendo', '', 'docSite'),
      SEP,
      mi('Signaler un probl\u00e8me\u2026', '', 'report')
    ]}
  ];

  function renderMenus() {
    const bar = $('#menubar');
    function itemHTML(it) {
      if (it === SEP) return '<div class="dd-sep"></div>';
      const hasSub = !!it.items;
      const cls = 'dd-item' + (hasSub ? ' arrow has-sub' : '') + (!it.act && !hasSub ? ' stub' : '');
      let attrs = '';
      if (WINSET[it.act]) attrs += ' data-win="' + WINSET[it.act] + '"';
      if (it.chk) attrs += ' data-chk="' + it.chk + '"';
      if (it.val !== undefined && it.val !== null) attrs += ' data-val="' + it.val + '"';
      attrs += ' data-act="' + (it.act || '') + '"';
      if (it.a !== undefined && it.a !== null) attrs += ' data-arg="' + it.a + '"';
      attrs += ' data-label="' + String(it.t).replace(/"/g, '&quot;') + '"';
      return '<div class="' + cls + '"' + attrs + '>' +
        '<span class="dd-t">' + it.t + '</span>' +
        (it.sc ? '<span class="sc">' + it.sc + '</span>' : '') +
        (hasSub ? '<div class="dd-sub">' + it.items.map(itemHTML).join('') + '</div>' : '') +
        '</div>';
    }
    bar.innerHTML = MENUS.map((m, i) =>
      '<div class="menu' + (m.right ? ' right' : '') + '" data-menu="' + i + '">' +
      '<button>' + m.label + '</button><div class="dropdown">' +
      m.items.map(itemHTML).join('') + '</div></div>'
    ).join('');

    function syncChecks(menu) {
      const reg = (window.ALPHAWIN && window.ALPHAWIN.REG) || {};
      Array.prototype.forEach.call(menu.querySelectorAll('[data-win]'), (it) => it.classList.toggle('checked', !!reg[it.dataset.win]));
      Array.prototype.forEach.call(menu.querySelectorAll('[data-chk]'), (it) => {
        const k = it.dataset.chk;
        let on = false;
        if (k === 'tool') on = state.tool === it.dataset.val;
        else if (k === 'grid') on = state.grid === it.dataset.val;
        else on = !!state[k];
        it.classList.toggle('checked', on);
      });
    }
    /* replie un sous-menu vers la gauche et le remonte s’il sort de l’écran */
    function placeSub(item) {
      const sub = item.querySelector('.dd-sub');
      if (!sub) return;
      item.classList.remove('flip');
      sub.style.marginTop = '0px';
      sub.style.display = 'block';
      const r = sub.getBoundingClientRect();
      if (r.right > window.innerWidth - 4) item.classList.add('flip');
      if (r.bottom > window.innerHeight - 6) sub.style.marginTop = (window.innerHeight - 6 - r.bottom) + 'px';
      if (r.top < 2) sub.style.marginTop = (2 - r.top) + 'px';
      sub.style.display = '';
    }
    /* si le menu est plus haut que la fenêtre, il défile (la barre reste cliquable) */
    function placeMenu(menu) {
      const dd = menu.querySelector('.dropdown');
      if (!dd) return;
      dd.style.maxHeight = '';
      dd.style.overflowY = '';
      const r = dd.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 6) {
        dd.style.maxHeight = Math.max(160, window.innerHeight - r.top - 8) + 'px';
        dd.style.overflowY = 'auto';
      }
    }

    bar.addEventListener('click', (e) => {
      const btn = e.target.closest('.menu > button');
      const item = e.target.closest('.dd-item');
      if (btn) {
        const menu = btn.parentElement;
        const isOpen = menu.classList.contains('open');
        syncChecks(menu);
        const byHover = menu.dataset.hover === '1';
        delete menu.dataset.hover;
        $$('.menu').forEach((m) => m.classList.remove('open'));
        if (!isOpen || byHover) { menu.classList.add('open'); placeMenu(menu); }
        return;
      }
      if (item) {
        if (item.classList.contains('has-sub')) { e.stopPropagation(); return; }
        $$('.menu').forEach((m) => m.classList.remove('open'));
        const act = item.dataset.act;
        let raw = item.dataset.arg;
        if (raw === undefined || raw === '') raw = item.dataset.val;
        let arg = raw;
        if (raw !== undefined && raw !== '' && !isNaN(Number(raw))) arg = Number(raw);
        if (act && ACTIONS[act]) ACTIONS[act](arg);
        else toast('\u00ab\u00a0' + item.dataset.label + '\u00a0\u00bb sera reli\u00e9 \u00e0 l\u2019\u00e9tape 2 (moteur audio, \u00e9dition et mixage).', 'Fonction \u00e0 venir');
      }
    });
    bar.addEventListener('mouseover', (e) => {
      const subItem = e.target.closest('.dd-item.has-sub');
      if (subItem) placeSub(subItem);
      const btn = e.target.closest('.menu > button');
      if (!btn) return;
      if (!$$('.menu.open').length) return;
      $$('.menu').forEach((m) => m.classList.remove('open'));
      btn.parentElement.classList.add('open');
      btn.parentElement.dataset.hover = '1';
      syncChecks(btn.parentElement);
      placeMenu(btn.parentElement);
    });
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#menubar')) $$('.menu').forEach((m) => m.classList.remove('open'));
    });
  }

  /* ------------------------------------------------------------ ACTIONS */
  function WIN(id, arg) {
    if (window.ALPHAWIN) window.ALPHAWIN.open(id, arg);
    else toast('Chargement des fenêtres…');
  }

  function flash(el, ms) {
    if (!el) return;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), ms || 260);
  }

  function ensureVisible() {
    const vp = $('#lanes-vp');
    const x = (state.pos - 1) * state.barW;
    if (x < vp.scrollLeft + 40) vp.scrollLeft = Math.max(0, x - 60);
    else if (x > vp.scrollLeft + vp.clientWidth - 80) vp.scrollLeft = x - vp.clientWidth + 140;
    syncScroll();
  }

  const ACTIONS = {
    about: openAbout,
    undo: () => toast('Aucune modification dans l\u2019historique. L\u2019édition sera active à l\u2019étape 2.'),
    redo: () => toast('Rien à rétablir pour le moment.'),
    mix: () => WIN('mixer'),
    chan: () => WIN('channel', state.selectedTrack),
    auto: () => WIN('automation'),
    sample: () => {
      const p = (state.selectedPart && PARTS.find((x) => x.id === state.selectedPart)) ||
        PARTS.find((x) => x.track === state.selectedTrack) || PARTS[0];
      WIN(p.type === 'midi' ? 'key' : 'sample', p.id);
    },
    key: () => {
      const p = (state.selectedPart && PARTS.find((x) => x.id === state.selectedPart && x.type === 'midi')) ||
        PARTS.find((x) => x.type === 'midi');
      WIN('key', p.id);
    },
    mediabay: () => WIN('mediabay'),
    pool: () => WIN('pool'),
    vstinstr: () => WIN('vstinstr'),
    conns: () => WIN('connections'),
    markers: () => WIN('markers'),
    history: () => WIN('history'),
    shortcuts: () => WIN('shortcuts'),
    projman: () => WIN('projman'),
    perf: () => WIN('perf'),
    tempo: () => WIN('tempo'),
    browser: () => WIN('browser'),
    tracksheet: () => WIN('tracksheet'),
    setup: () => WIN('setup'),
    prefs: () => WIN('prefs'),
    devices: () => WIN('devices'),
    keycmd: () => WIN('keycmd'),
    video: () => WIN('video'),
    croom: () => WIN('croom'),
    exportmix: () => WIN('exportmix'),
    fade: () => WIN('fade'),
    crossfade: () => WIN('crossfade'),
    detect: () => WIN('detect'),
    spectrum: () => WIN('spectrum'),
    stats: () => WIN('stats'),
    audiopart: () => WIN('audiopart'),
    listeditor: () => WIN('listeditor'),
    loops: () => WIN('loops'),
    sounds: () => WIN('sounds'),
    layout: () => WIN('layout'),
    workspaces: () => WIN('workspaces'),
    /* lot 3 : fenêtres manquantes de Nuendo 4 */
    plugini: () => WIN('plugininfo'),
    logical: () => WIN('logical'),
    inputtrans: () => WIN('inputtrans'),
    projlogical: () => WIN('projlogical'),
    mididev: () => WIN('mididevice'),
    trackpre: () => WIN('trackpresets'),
    quant: () => WIN('quantize'),
    beatcalc: () => WIN('beatcalc'),
    impmed: () => WIN('importmedium'),
    omf: () => WIN('omf'),
    batch: (a) => { WIN('batch'); if (a === 'manage') toast('G\u00e9rer les traitements : liste des traitements enregistr\u00e9s, op\u00e9rations de chacun, Renommer et Supprimer.', 'Traitement par lot'); },
    surround: (a) => { WIN('surround'); if (a === 'converter') toast('MixConvert : conversion multicanale (5.1 \u2192 st\u00e9ro par exemple), ins\u00e9r\u00e9 automatiquement quand la destination a moins de canaux que la source.', 'MixConvert'); },
    sync: () => WIN('sync'),
    machine: () => WIN('machine'),
    syslink: () => WIN('syslink'),
    rewire: () => WIN('rewire'),
    inplace: () => { WIN('key'); toast('Édition en place : la grille MIDI s\u2019ouvre par-dessus la fenêtre de projet (version complète à l\u2019étape 2).', 'Édition en place'); },
    nek: () => toast('Les éditeurs de batterie et de partition font partie du <b>Nuendo Expansion Kit</b> (extension payante de Nuendo 4) : ils ne sont pas inclus dans ALPHA.', 'Nuendo Expansion Kit'),
    toggleInspector: () => { setPanel('inspector', !panels.inspector); toast('Inspecteur ' + (panels.inspector ? 'affiché' : 'masqué') + ' (Alt+I).', 'Affichage'); },
    toggleOverview: () => { setPanel('overview', !panels.overview); toast('Ligne d\u2019aperçu ' + (panels.overview ? 'affichée' : 'masquée') + ' (Alt+O).', 'Affichage'); },
    toggleInfoline: () => { setPanel('infoline', !panels.infoline); toast('Ligne d\u2019info ' + (panels.infoline ? 'affichée' : 'masquée') + ' (Ctrl+I).', 'Affichage'); },
    /* ---------------- lot 5 : barre d'outils, accrochage, règle ---------------- */
    setSnapMode: (m) => {
      state.snapMode = m; updateStatus();
      const txt = {
        'Grille': 'les événements s’aimantent sur la grille choisie',
        'Grille relative': 'la grille donne le pas de déplacement, sans aimantation',
        'Événements': 'l’accrochage se fait sur les bords des événements et des marqueurs',
        'Curseur magnétique': 'les événements s’alignent sur le curseur de projet',
        'Shuffle': 'glisser un événement au-delà du suivant échange leur ordre',
        'Grille + curseur': 'grille et curseur combinés',
        'Événements + curseur': 'bords d’événements et curseur combinés',
        'Événements + grille + curseur': 'les trois modes ensemble'
      }[m] || '';
      toast('Mode d’accrochage : <b>' + m + '</b> — ' + txt + '.', 'Accrochage');
    },
    setQuant: (q) => { state.quantizeVal = q; updateStatus(); $('#sbStatus').textContent = 'Valeur de quantification : ' + q; },
    setAutoMode: (m) => { state.autoMode = m; updateStatus(); toast('Mode d’automatisation : <b>' + m + '</b>. Le mode s’applique aux pistes dont le bouton W est actif.', 'Automatisation'); },
    setRoot: (k) => { state.rootKey = k; updateStatus(); $('#sbStatus').textContent = 'Fondamentale du projet : ' + k; },
    setColorIdx: (i) => {
      state.colorIdx = i;
      const c = COLORS[i];
      TRACKS.forEach((t) => { if (isTrackSel(t.id) && t.kind !== 'marker') { t.color = c[1]; t.partColor = c[2]; } });
      updateStatus(); renderTracks(); renderLanes(); renderOverview();
      $('#sbStatus').textContent = 'Couleur « ' + c[0] + ' » appliquée aux pistes sélectionnées';
    },
    setResize: (m) => {
      state.resizeMode = m; updateStatus();
      const txt = { normal: 'Normal Sizing : le contenu reste fixe, on révèle ou on masque', contents: 'Sizing Moves Contents : le contenu suit le bord déplacé', stretch: 'Sizing Applies Time Stretch : le contenu est étiré pour tenir' }[m];
      toast('Mode de redimensionnement : <b>' + txt + '</b>.', 'Redimensionner');
    },
    setLine: (m) => { state.lineMode = m; updateStatus(); $('#sbStatus').textContent = 'Line tool : mode ' + m; },
    toggleToolbarItem: (k) => {
      const i = TOOLBAR_HIDDEN.indexOf(k);
      if (i >= 0) TOOLBAR_HIDDEN.splice(i, 1); else TOOLBAR_HIDDEN.push(k);
      applyToolbarItems();
      const nm = (TOOLBAR_ITEMS.find((x) => x[0] === k) || [k, k])[1];
      $('#sbStatus').textContent = 'Barre d’outils : « ' + nm + ' » ' + (i >= 0 ? 'affiché' : 'masqué');
    },
    toolbarShowAll: () => { TOOLBAR_HIDDEN.length = 0; applyToolbarItems(); $('#sbStatus').textContent = 'Barre d’outils : tous les éléments affichés'; },
    toolbarDefault: () => { TOOLBAR_HIDDEN.length = 0; TOOLBAR_HIDDEN.push('automode', 'root', 'color', 'quant'); applyToolbarItems(); $('#sbStatus').textContent = 'Barre d’outils : disposition par défaut'; },
    setRulerFmt: (f) => {
      state.fmt = f;
      renderRuler(); updateInfoLine();
      const names = { bars: 'Barres + temps', tc: 'Timecode', sec: 'Secondes', smp: 'Échantillons', ft16: 'Pieds + images 16 mm', ft35: 'Pieds + images 35 mm', user: 'User (image/s personnalisable)' };
      $('#sbStatus').textContent = 'Format de la règle : ' + (names[f] || f);
    },
    setRulerTime: (t) => {
      state.rulerTime = t;
      renderRuler(); renderLanes(); renderOverview(); updateCursor();
      toast(t === 'time'
        ? 'Règle en <b>Time Linear</b> : la distance entre les barres varie avec les changements de tempo de la piste Tempo.'
        : 'Règle en <b>Bars+Beats Linear</b> : la distance entre les barres reste constante, même si le tempo change.', 'Règle');
    },
    setRulerFmt2: (f) => { state.rulerFmt2 = f; renderRuler(); $('#sbStatus').textContent = 'Règle 2 : format changé'; },
    toggleRulerSub: () => { state.rulerSub = !state.rulerSub; renderRuler(); $('#sbStatus').textContent = 'Piste de règle 2 ' + (state.rulerSub ? 'affichée' : 'masquée'); },
    addRulerTrack: () => {
      state.rulerSub = true;
      const t = trackById('rulerT');
      if (t) delete t.hidden;
      renderRuler(); renderTracks(); renderLanes();
      toast('Une piste de règle a été ajoutée à la liste des pistes : elle a son propre format, indépendant de la règle principale (Nuendo 4, p. 32).', 'Pistes de règle');
    },
    /* ---------------- lot 6 : pistes ---------------- */
    toggleAutoShow: () => {
      const t = trackById(state.selectedTrack);
      if (t) toggleAuto(t.id);
    },
    setAutParam: (arg) => {
      const [id, p] = String(arg).split('|');
      const t = trackById(id); if (!t) return;
      t.autParam = p;
      renderTracks(); renderLanes();
      $('#sbStatus').textContent = 'Paramètre automatisé : ' + p;
    },
    enlargeSelected: () => {
      state.enlarge = !state.enlarge;
      TRACKS.forEach((t) => { if (t.h) t.h = t.h0 || t.h; });
      if (state.enlarge) {
        TRACKS.forEach((t) => { if (t.num && !t.h0) t.h0 = t.h; });
        const t = trackById(state.selectedTrack);
        if (t) t.h = Math.min(160, (t.h || 64) * 1.7);
      } else {
        TRACKS.forEach((t) => { if (t.h0) { t.h = t.h0; delete t.h0; } });
      }
      renderTracks(); renderLanes(); updateCursor();
      $('#sbStatus').textContent = 'Agrandir la piste sélectionnée : ' + (state.enlarge ? 'activé' : 'désactivé');
    },
    foldTracks: () => {
      TRACKS.forEach((t) => { if (t.kind === 'folder') t.open = false; });
      renderTracks(); renderLanes(); renderOverview();
      $('#sbStatus').textContent = 'Tous les dossiers sont repliés';
    },
    unfoldTracks: () => {
      TRACKS.forEach((t) => { if (t.kind === 'folder') t.open = true; });
      renderTracks(); renderLanes(); renderOverview();
      $('#sbStatus').textContent = 'Tous les dossiers sont dépliés';
    },
    invertFold: () => {
      TRACKS.forEach((t) => { if (t.kind === 'folder') t.open = !t.open; });
      renderTracks(); renderLanes(); renderOverview();
      $('#sbStatus').textContent = 'État des dossiers inversé';
    },
    toggleSelFold: () => {
      TRACKS.forEach((t) => { if (t.kind === 'folder' && isTrackSel(t.id)) t.open = !t.open; });
      renderTracks(); renderLanes(); renderOverview();
    },
    selectAllTracks: () => {
      setTrackSel(visibleTracks().map((t) => t.id));
      renderTracks(); renderLanes(); updateStatus();
      $('#sbStatus').textContent = state.selTracks.length + ' pistes sélectionnées';
    },
    deselectTracks: () => { setTrackSel([state.selectedTrack]); renderTracks(); renderLanes(); },
    trackControls: (id) => {
      WIN('trackctl', id || state.selectedTrack);
    },
    snapHeights: () => ACTIONS.toggleSnapHeights(),
    toggleSnapHeights: () => {
      state.snapHeights = !state.snapHeights;
      toast('Snap Track Heights ' + (state.snapHeights ? 'activé : la hauteur de piste change par paliers de 8 px' : 'désactivé : redimensionnement libre') + '.', 'Hauteur de piste');
    },
    addTrack: (a) => {
      const kind = typeof a === 'string' ? a : 'audio';
      const NAMES = {
        audio: ['Piste audio', '#7a8f6a', '#b3c3a4'], midi: ['Piste MIDI', '#5d87a3', '#93b7cd'],
        instrument: ['Piste instrument', '#6a6a9a', '#a9a9cf'], group: ['Piste groupe', '#4f7188', '#7f9fb4'],
        fx: ['Canal FX', '#6f7d86', '#9fb2bb'], folder: ['Dossier', '#b28f4c', '#d8c48e'],
        marker: ['Piste de marqueurs', '#b28f4c', '#d8c48e'], tempo: ['Piste de tempo', '#8a8d90', '#c9ccce'],
        video: ['Piste vidéo', '#5a5f6b', '#8d95a3'], arranger: ['Piste d’arrangeur', '#7d7f52', '#b3b574'],
        ruler: ['Piste de règle', '#8a8d90', '#c9ccce'], automation: ['Piste d’automatisation', '#8a7f5e', '#cfc09a'],
        sampler: ['Piste d’échantillonnage', '#8a6f84', '#c9aec2']
      };
      if (kind === 'marker') { toast('Il ne peut y avoir qu’une piste de marqueurs par projet.', 'Ajouter une piste'); return; }
      if (kind === 'ruler') { ACTIONS.addRulerTrack(); return; }
      const nm = NAMES[kind] || NAMES.audio;
      const id = kind + (TRACKS.length + 1);
      const track = {
        id: id, kind: (kind === 'arranger' ? 'arrange' : kind === 'tempo' ? 'tempo' : kind === 'video' ? 'video' : kind),
        num: String(TRACKS.filter((t) => t.num).length + 1).padStart(2, '0'),
        name: nm[0].toUpperCase() + ' ' + (TRACKS.filter((t) => t.kind === kind).length + 1),
        h: kind === 'folder' ? 26 : 64, color: nm[1], partColor: nm[2],
        db: 0, mute: false, solo: false, rec: false, mon: false, vol: 60, timebase: 'musical',
        autShown: false, autParam: 'Volume', lock: false
      };
      TRACKS.push(track);
      setTrackSel([id]);
      state.selectedTrack = id;
      renderTracks(); renderLanes(); renderOverview(); updateInspector(); updateStatus();
      toast('Piste « ' + track.name + ' » créée en bas de la liste. Les pistes de type <b>' + nm[0].toLowerCase() +
        '</b> existent dans Nuendo 4 et se gèrent comme les autres (Projet ▸ Ajouter une piste).', 'Ajouter une piste');
    },
    /* ---------------- lot 8 : transport ---------------- */
    setRecMode: (m) => {
      state.recMode = m;
      $('#tpRecMode b').textContent = m;
      toast('Mode d’enregistrement : <b>' + m + '</b>' + (m === 'Remplacer' ? ' — le nouvel enregistrement remplace ce qui est déjà là.' : ' — les prises sont empilées sur des lanes séparées.'), 'Enregistrement');
    },
    setCycleRec: (m) => { state.cycleRec = m; $('#tpCycleRec b').textContent = m; $('#sbStatus').textContent = 'Enregistrement en cycle : ' + m; },
    setPre: (s) => { state.pre = s; $('#tpPre b').textContent = s + ' s'; $('#sbStatus').textContent = 'Pré-roll : ' + s + ' s'; },
    setPost: (s) => { state.post = s; $('#tpPost b').textContent = s + ' s'; $('#sbStatus').textContent = 'Post-roll : ' + s + ' s'; },
    setJog: (v) => {
      const n = Number(v) || 0;
      state.jogSpeed = n;
      const el = $('#tpJogVal');
      if (el) el.textContent = n.toFixed(2).replace('.', ',') + '×';
    },
    prevMarker: () => {
      const x = (state.pos - 1) * state.barW;
      const back = MARKERS.filter((m) => (m[0] - 1) * state.barW < x - 1).sort((a, b) => b[0] - a[0]);
      setPos(back.length ? back[0][0] : 1);
      $('#sbStatus').textContent = back.length ? 'Marqueur « ' + back[0][1] + ' »' : 'Début du projet';
    },
    nextMarker: () => {
      const x = (state.pos - 1) * state.barW;
      const fwd = MARKERS.filter((m) => (m[0] - 1) * state.barW > x + 1).sort((a, b) => a[0] - b[0]);
      setPos(fwd.length ? fwd[0][0] : 61);
      $('#sbStatus').textContent = fwd.length ? 'Marqueur « ' + fwd[0][1] + ' »' : 'Fin du projet';
    },
    showMarkers: () => { WIN('markers'); },
    projectLogical: () => WIN('projlogical'),
    beatCalc: () => WIN('beatcalc'),
    midiSetup: () => {
      WIN('devices');
      toast('Panneau de configuration MIDI : Périphériques ▸ Configuration des périphériques ▸ onglet MIDI (entrées, sorties, « Toutes les entrées MIDI », suivi de tempo).', 'MIDI');
    },
    trackTemplateOut: () => toast('Modèle de piste exporté : le fichier .trackpreset contient les inserts, départs et contrôles de la piste sélectionnée.', 'Presets de piste'),
    renameMarker: (i) => renameMarker(i),
    gotoMarker: (bar) => { setPos(bar); $('#sbStatus').textContent = 'Aller au marqueur : ' + fmtPos(bar); },
    delMarker: (i) => {
      if (i < 0 || !MARKERS[i]) return;
      const m = MARKERS.splice(i, 1)[0];
      renderRuler(); renderLanes(); renderOverview();
      toast('Marqueur « ' + m[1] + ' » supprimé.', 'Marqueurs');
    },
    cycleFromMarker: (bar) => {
      state.cycleL = bar; state.cycleR = bar + 8; state.cycle = true;
      renderRuler(); renderLanes(); renderOverview(); updateStatus();
      toast('Boucle de cycle définie à partir du marqueur : ' + fmtPos(state.cycleL) + ' → ' + fmtPos(state.cycleR), 'Marqueurs');
    },
    /* ---------------- lot 7 : outils et modes ---------------- */
    toolLine: () => {
      state.tool = 'line'; updateStatus();
      const r = $('#lanes-inner').getBoundingClientRect();
      toast('Line tool actif : tracez une ligne dans l’événement pour dessiner l’automatisation ou la vélocité. ' +
        'Second clic sur l’outil dans la barre pour choisir le mode (Line, Parabola, Sine, Triangle, Square) — p. 236.', 'Line tool');
    },
    toolColor: () => {
      state.tool = 'color'; updateStatus();
      toast('Color tool : un clic sur un événement lui applique la couleur suivante de la palette. ' +
        'Les couleurs suivent les Préférences ▸ Événements ▸ Couleurs (p. 291).', 'Color tool');
    },
    toolWarp: () => {
      state.tool = 'warp'; updateStatus();
      toast('Time Warp : déplacez un point de la règle ou un marqueur pour étirer le temps de la piste Tempo ' +
        '(p. 284). Les bases de temps musicales suivent, les pistes linéaires non.', 'Time Warp');
    },
    toolScrub: () => {
      state.tool = 'audition'; updateStatus();
      toast('Lecture / Scrub : maintenez le bouton enfoncé et glissez pour faire défiler le son autour du curseur ' +
        '(p. 42). Le son sera produit à l’étape 2.', 'Scrub');
    },
    snapZero: () => {
      state.snapZero = !state.snapZero; updateStatus();
      $('#sbStatus').textContent = 'Snap to Zero Crossings ' + (state.snapZero ? 'activé' : 'désactivé');
    },
    /* ---------------- lot 8 : transport, MIDI, inspecteur ---------------- */
    autoQ: (v) => {
      state.autoQ = v !== 'off';
      state.autoQVal = v;
      $('#tpAutoQBtn').classList.toggle('on', state.autoQ);
      const el = $('#tpAutoQ'); if (el) { el.classList.toggle('on', state.autoQ); el.querySelector('b').textContent = v === 'off' ? '—' : v; }
      $('#sbStatus').textContent = 'Auto-Quantize : ' + (v === 'off' ? 'désactivé' : v);
    },
    clearRolls: () => { ACTIONS.setPre(0); ACTIONS.setPost(0); toast('Pré-roll et post-roll remis à 0 s.', 'Transport'); },
    quickControls: (a) => {
      if (a === 'learn') { toast('Apprentissage du contrôleur : cliquez un paramètre Quick Control puis bougez le contrôleur (mode Learn).', 'Quick Controls'); return; }
      if (a === 'names') { toast('Les noms des 8 paramètres Quick Controls ont été envoyés au contrôleur.', 'Quick Controls'); return; }
      WIN('qcontrols');
    },
    inspSetup: () => WIN('inspsetup'),
    midiMods: () => WIN('midimods'),
    trackControls: () => WIN('trackctl'),
    setTrackWrap: (on) => {
      TRACK_CTL.wrap = !!on;
      /* le wrap ajoute une ligne de contrôles : la piste gagne un peu de hauteur,
         et la lane suit (liste et timeline restent alignées) */
      TRACKS.forEach((t) => {
        if (!t.num) return;
        if (on) { if (!t._hW) t._hW = t.h; t.h = Math.max(t._hW, 82); }
        else if (t._hW) { t.h = t._hW; delete t._hW; }
      });
      renderTracks(); renderLanes(); updateCursor();
      $('#sbStatus').textContent = 'Contrôles de piste sur ' + (on ? 'deux lignes (wrap)' : 'une seule ligne');
    },
    menuSetup: () => WIN('menusetup'),
    midimonitor: () => WIN('midimonitor'),
    midiReset: () => toast('Reset envoyé : tous les contrôleurs MIDI de la piste sélectionnée sont réinitialisés (modulation, pitch bend, volume).', 'MIDI'),
    midiDup: () => toast('Notes doublées retirées : les notes commençant à la même position et de même hauteur sont fusionnées.', 'MIDI'),
    midiQLen: () => toast('Quantifier les longueurs : les fins de notes sont alignées sur la valeur de quantification choisie.', 'MIDI'),
    legato: () => toast('Legato : chaque note est prolongée jusqu’au début de la suivante (notes liées).', 'MIDI'),
    transpose: () => WIN('transpose'),
    transposeMidi: (v) => {
      const sel = PARTS.filter((p) => p.sel && p.type === 'midi');
      const list = sel.length ? sel : PARTS.filter((p) => p.type === 'midi');
      list.forEach((p) => { p.transpose = (p.transpose || 0) + v; });
      renderLanes(); updateInfoLine();
      $('#sbStatus').textContent = 'Transposition ' + (v > 0 ? '+' : '') + v + ' sur ' + list.length + ' partie(s) MIDI';
    },
    velocity: () => WIN('velocitydlg'),
    touchAssign: () => toast('Contrôleur tactile : choisissez le nombre de voies (8, 16 ou 24) dans Périphériques ▸ Périphériques Remote. L’affectation des 8 Quick Controls est envoyée au contrôleur.', 'Périphériques Remote'),
    touchPage: () => toast('Page de Quick Controls suivante (le contrôleur affiche les paramètres suivants de la banque).', 'Périphériques Remote'),
    jogShuttle: (v) => {
      ACTIONS.setJog(Number(v) || 0);
      toast('Vitesse de shuttle : <b>' + String(v).replace('.', ',') + '×</b> — la molette bloquée avance ou recule à cette vitesse (le moteur audio suivra à l’étape 2).', 'Jog / Shuttle');
    },
    snap: () => { state.snap = !state.snap; updateStatus(); $('#sbStatus').textContent = state.snap ? 'Accrochage activé : ' + state.grid : 'Accrochage désactivé'; },
    selectAll: () => { PARTS.forEach((p) => { p.sel = true; }); renderLanes(); updateInfoLine(); toast('Tous les événements visibles sont sélectionnés (' + PARTS.length + ').', 'Sélection'); },
    del: () => {
      const ids = selPartIds();
      if (!ids.length) { toast('Rien n’est sélectionné : cliquez un événement, ou Ctrl+A pour tout sélectionner.', 'Supprimer'); return; }
      removeParts(ids);
    },
    cut: () => { state.clip = selPartIds().map((id) => PARTS.find((p) => p.id === id)).filter(Boolean); ACTIONS.del(); toast(state.clip.length + ' événement(s) coupé(s) dans le presse-papiers interne.', 'Couper'); },
    copy: () => { state.clip = selPartIds().map((id) => PARTS.find((p) => p.id === id)).filter(Boolean); toast(state.clip.length + ' événement(s) copié(s) — Coller les place au curseur.', 'Copier'); },
    paste: () => {
      if (!state.clip || !state.clip.length) { toast('Le presse-papiers est vide : coupez ou copiez d’abord des événements.', 'Coller'); return; }
      const at = Math.min.apply(null, state.clip.map((p) => p.start));
      const to = state.pos;
      state.clip.forEach((src) => {
        const p = Object.assign({}, src, { id: src.id + '-cp' + (Math.random() * 1e6 | 0), start: to + (src.start - at), sel: true });
        PARTS.push(p);
      });
      renderLanes(); renderOverview(); updateInfoLine();
      toast(state.clip.length + ' événement(s) collé(s) à ' + fmtPos(to) + '.', 'Coller');
    },
    duplicate: () => {
      const ids = selPartIds();
      if (!ids.length) { toast('Sélectionnez d’abord des événements.', 'Dupliquer'); return; }
      ids.map((id) => PARTS.find((p) => p.id === id)).filter(Boolean).forEach((src) => {
        PARTS.push(Object.assign({}, src, { id: src.id + '-dup' + (Math.random() * 1e6 | 0), start: src.start + src.len, sel: false }));
      });
      renderLanes(); renderOverview(); updateInfoLine();
      toast(ids.length + ' événement(s) dupliqué(s) à la suite.', 'Dupliquer');
    },
    undo: () => undoOnce(),
    splitAtCursor: () => {
      PARTS.filter((p) => p.start < state.pos && p.start + p.len > state.pos).forEach((p) => splitAt(p, state.pos));
    },
    mute: () => {
      const sel = PARTS.filter((p) => p.sel);
      if (!sel.length) { toast('Sélectionnez d’abord des événements.', 'Muter'); return; }
      const all = sel.every((p) => p.muted);
      sel.forEach((p) => { p.muted = !all; });
      renderLanes();
      $('#sbStatus').textContent = sel.length + ' événement(s) ' + (all ? 'réactivé(s)' : 'rendu(s) muet(s)');
    },
    rename: () => {
      const p = PARTS.find((x) => x.sel);
      if (!p) { toast('Sélectionnez un événement puis utilisez le champ Nom de la ligne d’info.', 'Renommer'); return; }
      const v = window.prompt('Nom de l’événement :', p.name);
      if (v === null) return;
      p.name = v || p.name;
      renderLanes(); updateInfoLine();
    },
    lock: () => {
      PARTS.filter((p) => p.sel).forEach((p) => { p.locked = true; });
      renderLanes(); $('#sbStatus').textContent = 'Événements sélectionnés verrouillés';
    },
    unlock: () => {
      PARTS.filter((p) => p.sel).forEach((p) => { p.locked = false; });
      renderLanes(); $('#sbStatus').textContent = 'Événements sélectionnés déverrouillés';
    },
    nudge: (a) => nudgeParts(a || 1),
    unmute: () => {
      PARTS.forEach((p) => { if (p.sel) p.muted = false; });
      renderLanes(); $('#sbStatus').textContent = 'Événements sélectionnés réactivés';
    },
    pasteAtCursor: () => ACTIONS.paste(),
    underMouse: () => toast('« Sélectionner sous la souris » : dans Nuendo 4, l’événement survolé est sélectionné par <b>Ctrl + clic</b> (ou avec l’outil Flèche + Alt).', 'Sélection'),
    moveFront: () => {
      PARTS.filter((p) => p.sel).forEach((p) => { p.z = 2; p.order = (p.order || 0) + 1; });
      renderLanes(); $('#sbStatus').textContent = 'Événements sélectionnés au premier plan';
    },
    moveBack: () => {
      PARTS.filter((p) => p.sel).forEach((p) => { p.z = 0; });
      renderLanes(); $('#sbStatus').textContent = 'Événements sélectionnés au plan arrière';
    },
    toRealCopy: () => toast('Les copies partagées (Alt+glisser) deviennent indépendantes : la commande existe, le lien de partage sera géré à l’étape 2.', 'Copie partagée'),
    removeFades: () => {
      const sel = PARTS.filter((p) => p.sel);
      sel.forEach((p) => { p.fadeIn = 0; p.fadeOut = 0; });
      renderLanes();
      $('#sbStatus').textContent = sel.length ? 'Fondus supprimés sur ' + sel.length + ' événement(s)' : 'Sélectionnez d’abord des événements';
    },
    autoFade: () => WIN('fade'),
    deselectAll: () => { state.selectedPart = null; PARTS.forEach((p) => { p.sel = false; }); renderLanes(); updateInfoLine(); },
    play: () => {
      flash($('#tpPlay'), 400);
      if (state.playing) { ACTIONS.stop(); return; }
      state.playing = true;
      $('#tpPlay').classList.add('active');
      $('#sbStatus').textContent = 'Lecture (curseur) — le son arrive à l’étape 2';
      clearInterval(state.timer);
      state.timer = setInterval(() => {
        if (!state.playing) return;
        let p = state.pos + 0.035;
        if (state.cycle && p >= state.cycleR) p = state.cycleL;
        if (p > state.bars) { ACTIONS.stop(); return; }
        state.pos = p;
        updateCursor();
        if (state.autoScroll) ensureVisible();
      }, 90);
    },
    stop: () => {
      flash($('#tpStop'), 260);
      state.playing = false;
      clearInterval(state.timer);
      $('#tpPlay').classList.remove('active');
      $('#tpRec').classList.remove('active');
      $('#sbStatus').textContent = 'Arrêt — position ' + fmtPos(state.pos);
    },
    record: () => { flash($('#tpRec'), 900); toast('L\u2019enregistrement sera branché à l\u2019étape 2 (entrées micro, punch in/out, précompte).', 'Enregistrement'); },
    cycle: toggleCycle,
    click: toggleClick,
    rtz: () => { setPos(1); },
    end: () => { setPos(61); },
    transport: toggleTransport,
    focus: () => { $('#lanes-vp').scrollTo({ left: 0, top: 0, behavior: 'smooth' }); setPos(state.pos); },

    /* ---- commandes de menu : outils, grille, zoom, localisateurs ---- */
    useTool: (a) => {
      if (!state.tools[a]) return;
      state.tool = a;
      updateStatus();
      const cursorMap = { pointer: '', range: 'cell', split: 'crosshair', glue: 'alias', erase: 'not-allowed', zoom: 'zoom-in', mute: 'not-allowed', draw: 'crosshair', audition: 'pointer' };
      $('#lanes-inner').style.cursor = cursorMap[a] || '';
      $('#sbStatus').textContent = 'Outil : ' + state.tools[a];
    },
    useGrid: (a) => {
      state.grid = a;
      updateStatus();
      renderLanes();
      $('#sbStatus').textContent = 'Grille : ' + a + (state.snap ? '' : ' (accrochage désactivé)');
    },
    zoomBy: (a) => zoom(a),
    zoomFull: () => { setBarW(26); $('#sbStatus').textContent = 'Zoom plein : tout le projet visible'; },
    zoomReset: () => { setBarW(64); $('#sbStatus').textContent = 'Zoom restauré à 100 %'; },
    zoomSel: () => {
      const p = state.selectedPart && PARTS.filter((x) => x.id === state.selectedPart)[0];
      if (!p) { toast('Sélectionnez d’abord un événement dans la fenêtre de projet.', 'Zoom'); return; }
      setBarW(Math.min(176, Math.max(26, ($('#lanes-vp').clientWidth - 40) / Math.max(0.5, p.len))));
      setPos(p.start);
    },
    zoomEvent: () => ACTIONS.zoomSel(),
    zoomLoop: () => {
      const span = Math.max(0.5, state.cycleR - state.cycleL);
      setBarW(Math.min(176, Math.max(26, ($('#lanes-vp').clientWidth - 40) / span)));
      setPos(state.cycleL);
    },
    zoomVert: (a) => {
      TRACKS.forEach((t) => { if (t.num) t.h = Math.max(34, Math.min(140, (t.h || 62) + a * 12)); });
      renderTracks(); renderLanes(); updateCursor();
      $('#sbStatus').textContent = 'Hauteur des pistes : ' + (TRACKS.filter((t) => t.num)[0] || { h: 62 }).h + ' px';
    },
    waveZoom: (a) => {
      state.waveZ = Math.max(50, Math.min(300, (state.waveZ || 100) + a * 25));
      renderLanes();
      $('#sbStatus').textContent = 'Zoom des formes d\u2019onde : ' + state.waveZ + ' %';
    },
    locL: () => {
      state.cycleL = Math.min(state.pos, state.cycleR - 0.25);
      renderRuler(); renderLanes(); renderOverview(); updateStatus();
      $('#sbStatus').textContent = 'Localisateur gauche : ' + fmtPos(state.cycleL);
    },
    locR: () => {
      state.cycleR = Math.max(state.pos, state.cycleL + 0.25);
      renderRuler(); renderLanes(); renderOverview(); updateStatus();
      $('#sbStatus').textContent = 'Localisateur droit : ' + fmtPos(state.cycleR);
    },
    locToSel: () => {
      const sel = PARTS.filter((p) => p.sel);
      const l = sel.length ? sel : PARTS.filter((p) => p.id === state.selectedPart);
      if (!l.length) { toast('Sélectionnez d’abord des événements.', 'Localisateurs'); return; }
      state.cycleL = Math.min.apply(null, l.map((p) => p.start));
      state.cycleR = Math.max.apply(null, l.map((p) => p.start + p.len));
      renderRuler(); renderLanes(); renderOverview();
      $('#sbStatus').textContent = 'Localisateurs sur la sélection : ' + fmtPos(state.cycleL) + ' → ' + fmtPos(state.cycleR);
    },
    gotoL: () => setPos(state.cycleL),
    gotoR: () => setPos(state.cycleR),
    nudge: (a) => {
      const step = state.snap ? state.gridSteps[state.grid] : 0.25;
      setPos(state.pos + a * step);
      $('#sbStatus').textContent = 'Nudge ' + (a < 0 ? 'gauche' : 'droite') + ' : ' + fmtPos(state.pos);
    },
    punchIn: () => { state.punchIn = !state.punchIn; updateStatus(); $('#sbStatus').textContent = 'Punch In ' + (state.punchIn ? 'activé' : 'désactivé'); },
    punchOut: () => { state.punchOut = !state.punchOut; updateStatus(); $('#sbStatus').textContent = 'Punch Out ' + (state.punchOut ? 'activé' : 'désactivé'); },
    autoPunch: () => {
      state.punchIn = state.punchOut = !(state.punchIn && state.punchOut);
      updateStatus();
      $('#sbStatus').textContent = 'Punch In / Punch Out ' + (state.punchIn ? 'activés' : 'désactivés');
    },
    precount: () => { state.precount = !state.precount; updateStatus(); toast('Précompte ' + (state.precount ? 'activé (1 mesure)' : 'désactivé') + '.', 'Transport'); },
    editMode: () => { state.editMode = !state.editMode; toast('Mode Édition ' + (state.editMode ? 'activé : le curseur suit les sélections et les éditions' : 'désactivé') + '.', 'Transport'); },
    extSync: () => { state.sync = !state.sync; updateStatus(); toast('Synchronisation externe ' + (state.sync ? 'activée (ASIO / MTC)' : 'désactivée') + '.', 'Synchronisation'); },
    muteAll: () => { TRACKS.forEach((t) => { if (t.num) t.mute = true; }); renderTracks(); toast('Mute global : toutes les pistes sont muettes.', 'Mixer'); },
    soloAll: () => { TRACKS.forEach((t) => { if (t.num) t.solo = false; }); renderTracks(); toast('Solo global annulé sur toutes les pistes.', 'Mixer'); },

    /* ---- fenêtres de travail et projets ---- */
    closeAll: () => { if (window.ALPHAWIN) window.ALPHAWIN.closeAll(); },
    minimizeAll: () => { if (window.ALPHAWIN) Object.keys(window.ALPHAWIN.REG).forEach((k) => { const w = window.ALPHAWIN.REG[k]; if (!w.maxed) w.el.classList.add('min'); }); },
    wsRecall: (n) => {
      if (!window.ALPHAWIN || !window.ALPHAWIN.recallWorkspace || !window.ALPHAWIN.recallWorkspace(n)) {
        toast('Aucun espace de travail n’est encore enregistré sous le numéro ' + n + ' : ouvrez « Organiser les espaces de travail » (W) pour en créer un.', 'Espaces de travail');
      }
    },
    wsStore: () => {
      if (window.ALPHAWIN && window.ALPHAWIN.saveWorkspace) window.ALPHAWIN.saveWorkspace('Espace ' + ((window.ALPHAWIN.WS ? window.ALPHAWIN.WS.seq : 0) + 1));
      toast('Disposition actuelle mémorisée comme nouvel espace de travail.', 'Espaces de travail');
    },
    wsLock: () => {
      if (window.ALPHAWIN && window.ALPHAWIN.WS) {
        window.ALPHAWIN.WS.locked = !window.ALPHAWIN.WS.locked;
        toast('Espace de travail ' + (window.ALPHAWIN.WS.locked ? 'verrouillé' : 'déverrouillé') + '.', 'Espaces de travail');
      }
    },
    selectTrack: () => {
      const list = PARTS.filter((p) => p.track === state.selectedTrack);
      PARTS.forEach((p) => { p.sel = false; });
      list.forEach((p) => { p.sel = true; });
      if (list.length) state.selectedPart = list[0].id;
      renderLanes();
      $('#sbStatus').textContent = list.length + ' événement(s) sélectionné(s) sur la piste';
    },
    selectLoop: () => {
      PARTS.forEach((p) => { p.sel = p.start < state.cycleR && p.start + p.len > state.cycleL; });
      renderLanes();
      $('#sbStatus').textContent = PARTS.filter((p) => p.sel).length + ' événement(s) dans la boucle';
    },
    selectFromCursor: () => {
      PARTS.forEach((p) => { p.sel = p.start >= state.pos; });
      renderLanes();
    },
    selectToLeft: () => { PARTS.forEach((p) => { p.sel = p.start + p.len <= state.pos; }); renderLanes(); },
    selectToRight: () => { PARTS.forEach((p) => { p.sel = p.start >= state.pos; }); renderLanes(); },
    nextSel: () => {
      const list = PARTS.filter((p) => p.track === state.selectedTrack).sort((a, b) => a.start - b.start);
      const cur = list.findIndex((p) => p.id === state.selectedPart);
      const nx = list[Math.min(list.length - 1, cur + 1)];
      if (nx) { state.selectedPart = nx.id; PARTS.forEach((p) => { p.sel = p.id === nx.id; }); renderLanes(); updateInfoLine(); }
    },
    prevSel: () => {
      const list = PARTS.filter((p) => p.track === state.selectedTrack).sort((a, b) => a.start - b.start);
      const cur = list.findIndex((p) => p.id === state.selectedPart);
      const pv = list[Math.max(0, cur - 1)];
      if (pv) { state.selectedPart = pv.id; PARTS.forEach((p) => { p.sel = p.id === pv.id; }); renderLanes(); updateInfoLine(); }
    },
    snap: () => { state.snap = !state.snap; updateStatus(); $('#sbStatus').textContent = state.snap ? 'Accrochage activé : ' + state.grid : 'Accrochage désactivé'; },
    useFmt: (a) => { state.fmt = a; renderRuler(); renderLanes(); toast('Format d’affichage de la règle : ' + ({ bars: 'Barres + temps', tc: 'Timecode', sec: 'Secondes', smp: 'Échantillons' }[a] || a) + '.', 'Règle'); },
    recent: (a) => toast('Ouverture du projet « ' + a + ' » : la gestion de plusieurs projets arrive à l’étape 2.', 'Fichier'),

    /* ---- actions des menus contextuels ---- */
    auditionEvent: () => toast('Audition de l’événement : la lecture réelle arrive avec le moteur audio (étape 2).', 'Audition'),
    eventProps: () => toast('Propriétés de l’événement : nom, position, longueur, décalage, volume, fondu — modifiables dans la ligne d’info.', 'Événement'),
    renameEvent: () => {
      const p = PARTS.filter((x) => x.id === state.selectedPart)[0];
      if (!p) { toast('Sélectionnez un événement.', 'Renommer'); return; }
      toast('Renommer : « ' + p.name + ' » — le champ de saisie s’ouvre dans la ligne d’info (étape 2).', 'Renommer');
    },
    trackHeight: (h) => {
      const t = trackById(state.selectedTrack);
      if (!t) return;
      t.h = Number(h);
      renderTracks(); renderLanes(); updateCursor();
      $('#sbStatus').textContent = 'Hauteur de « ' + t.name + ' » : ' + t.h + ' px';
    },
    trackColor: (a) => {
      const [id, col, part] = String(a).split('|');
      const t = trackById(id);
      if (!t) return;
      t.color = col; if (part) t.partColor = part;
      renderTracks(); renderLanes(); updateInspector();
      $('#sbStatus').textContent = 'Couleur de « ' + t.name + ' » modifiée';
    },
    renameTrack: (id) => {
      const t = trackById(id);
      const row = document.querySelector('.tl-row[data-track="' + id + '"] .tl-name, .tl-row[data-track="' + id + '"] .tl-line1');
      if (!t || !row) return;
      const inp = document.createElement('input');
      inp.className = 'tl-rename';
      inp.value = t.name;
      inp.style.cssText = 'position:absolute;left:6px;right:26px;top:4px;height:16px;font:9px Tahoma;z-index:40;' +
        'background:#fffef8;border:1px solid #3c6088;padding:0 3px;color:#1d2b36';
      row.style.position = 'relative';
      row.appendChild(inp);
      inp.focus(); inp.select();
      let closed = false;
      const done = (ok) => {
        if (closed) return;
        closed = true;
        const v = inp.value.trim();
        if (ok && v) { t.name = v.toUpperCase(); selectTrack(t.id); }
        renderTracks(); renderLanes(); updateInspector();
      };
      inp.addEventListener('keydown', (e2) => {
        e2.stopPropagation();
        if (e2.key === 'Enter') done(true);
        if (e2.key === 'Escape') done(false);
      });
      inp.addEventListener('blur', () => done(true));
    },
    toggleTrack: (a) => {
      const [f, id] = String(a).split('|');
      const t = trackById(id);
      if (!t) return;
      t[f] = !t[f];
      renderTracks(); renderLanes(); updateInspector(); updateStatus();
      $('#sbStatus').textContent = t.name + ' : ' + f + ' ' + (t[f] ? 'activé' : 'désactivé');
    },
    toggleAuto: (f) => {
      state[f] = !state[f];
      updateStatus();
      toast((f === 'autoW' ? 'Écriture' : 'Lecture') + ' de l’automatisation ' + (state[f] ? 'activée' : 'désactivée') + '.', 'Automatisation');
    },
    dupTrack: (id) => {
      const i = TRACKS.findIndex((t) => t.id === id);
      if (i < 0) return;
      const src = TRACKS[i];
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = src.id + '_copy' + (Date.now() % 1000);
      copy.name = src.name.replace(/\s*\(copie.*\)$/, '') + ' (copie)';
      if (copy.num) copy.num = String(TRACKS.filter((t) => t.num).length + 1).padStart(2, '0');
      TRACKS.splice(i + 1, 0, copy);
      PARTS.filter((p) => p.track === id).forEach((p) => {
        PARTS.push(Object.assign({}, p, { id: p.id + '_c' + (Date.now() % 10000), track: copy.id }));
      });
      renderTracks(); renderLanes(); updateStatus();
      $('#sbStatus').textContent = 'Piste dupliquée : ' + copy.name;
    },
    delTrack: (id) => {
      const i = TRACKS.findIndex((t) => t.id === id);
      if (i < 0) return;
      const name = TRACKS[i].name;
      TRACKS.splice(i, 1);
      for (let k = PARTS.length - 1; k >= 0; k--) if (PARTS[k].track === id) PARTS.splice(k, 1);
      if (state.selectedTrack === id) state.selectedTrack = (TRACKS.filter((t) => t.num)[0] || {}).id;
      renderTracks(); renderLanes(); updateInspector(); updateStatus();
      $('#sbStatus').textContent = 'Piste supprimée : ' + name;
    },
    hideTrack: (id) => {
      const t = trackById(id);
      if (!t) return;
      t.hidden = true;
      renderTracks(); renderLanes();
      $('#sbStatus').textContent = 'Piste masquée : ' + t.name + ' (Tout afficher pour la retrouver)';
    },
    showAllTracks: () => {
      TRACKS.forEach((t) => { delete t.hidden; });
      renderTracks(); renderLanes();
      $('#sbStatus').textContent = 'Toutes les pistes sont affichées';
    },
    disableTrack: (id) => {
      const t = trackById(id);
      if (!t) return;
      t.disabled = !t.disabled;
      renderTracks(); renderLanes();
      toast('Piste « ' + t.name + ' » ' + (t.disabled ? 'désactivée (libère le processeur)' : 'réactivée') + '.', 'Pistes');
    },
    toggleFolder: (id) => {
      const t = trackById(id);
      if (!t) return;
      t.open = !t.open;
      renderTracks(); renderLanes();
    },
    addMarkerAtCursor: () => {
      MARKERS.push([Math.round(state.pos), 'Marqueur ' + (MARKERS.length + 1)]);
      renderLanes(); renderOverview(); updateStatus();
      toast('Marqueur ajouté à ' + fmtPos(state.pos) + '.', 'Marqueurs');
    },
    setTimecode: () => toast('« Set Timecode at Cursor » : le décalage de début du projet sera réglé sur la position du curseur (étape 2).', 'Timecode'),
    quantize: () => { state.quantize = true; toast('Quantification appliquée aux notes sélectionnées (' + state.grid + ').', 'MIDI'); },
    quantizeSetup: () => { if (window.ALPHAWIN) window.ALPHAWIN.open('quantize'); },
    transpose: () => toast('Transposer : la fenêtre de transposition (demi-tons, gammes) arrive à l’étape 2.', 'MIDI'),
    velocities: () => toast('Insert Velocities : insère des valeurs de vélocité dans l’éditeur de clavier (étape 2).', 'MIDI')
  };

  /* Commandes de menu dont le libellé suffit : chacune répond par un message précis. */
  const MENU_STUBS = {
    newProject: ['Nouveau projet', 'Un projet vierge sera créé à l’étape 2 (nom, dossier, fréquence d’échantillonnage).'],
    newFromTemplate: ['Projet depuis un modèle', 'Les modèles de projet (stéréo, surround 5.1, montage vidéo) seront proposés à l’étape 2.'],
    newLibrary: ['Bibliothèque de projets', 'La bibliothèque regroupera plusieurs projets ouverts en même temps (étape 2).'],
    newFolder: ['Dossier de projet', 'Le dossier de projet contient Audio, Edits, Images, Fades et le fichier .npr (étape 2).'],
    openProject: ['Ouvrir un projet', 'La boîte de dialogue d’ouverture de fichier arrive avec la gestion des projets (étape 2).'],
    clearRecent: ['Vider la liste', 'La liste des projets récents sera vidée.'],
    closeProject: ['Fermer le projet', 'Le projet se ferme après proposition d’enregistrement (étape 2).'],
    saveProject: ['Enregistrer', 'L’enregistrement du projet (.npr) sera actif à l’étape 2.'],
    saveAs: ['Enregistrer sous', 'L’enregistrement sous un autre nom sera actif à l’étape 2.'],
    saveNewVersion: ['Enregistrer une nouvelle version', 'Chaque enregistrement créera une nouvelle version numérotée (étape 2).'],
    saveTemplate: ['Enregistrer comme modèle', 'Le projet courant sera enregistré comme modèle réutilisable (étape 2).'],
    revert: ['Revenir à la version enregistrée', 'Le projet sera rechargé depuis le dernier enregistrement (étape 2).'],
    importAudio: ['Importer un fichier audio', 'L’import audio (WAV, AIFF, MP3) sera branché à l’étape 2.'],
    importMidi: ['Importer un fichier MIDI', 'L’import MIDI (pistes, tempo, marqueurs) sera branché à l’étape 2.'],
    importVideo: ['Importer une vidéo', 'L’import vidéo alimentera la piste vidéo et la fenêtre Vidéo (F8) — étape 2.'],
    importTrack: ['Importer une piste depuis un projet', 'Les pistes d’un autre projet seront importables avec leurs inserts et réglages (étape 2).'],
    importTrackArchive: ['Importer une piste d’archive', 'Les pistes d’archive (.trackarchive) seront relues à l’étape 2.'],
    importOmf: ['Importer un OMF', 'L’échange OMF/AAF avec les stations de montage sera traité à l’étape 2.'],
    importAaf: ['Importer un AAF', 'L’échange AAF sera traité à l’étape 2.'],
    importXml: ['Importer un XML', 'L’ancien format XML de Cubase sera relu à l’étape 2.'],
    importCd: ['Importer un Audio CD', 'L’extraction Audio CD sera ajoutée à l’étape 2.'],
    exportTrack: ['Exporter une piste', 'L’export d’une seule piste utilisera les mêmes réglages que l’export du mixage (étape 2).'],
    exportMidi: ['Exporter un fichier MIDI', 'L’export MIDI (pistes, tempo, marqueurs) sera branché à l’étape 2.'],
    exportScore: ['Exporter la notation', 'L’export de partition dépend du Nuendo Expansion Kit.'],
    exportOmf: ['Exporter en OMF / AAF', 'L’échange OMF/AAF avec les stations de montage sera traité à l’étape 2.'],
    exportXml: ['Exporter en XML', 'L’ancien format XML sera écrit à l’étape 2.'],
    exportVideo: ['Exporter la vidéo', 'L’export vidéo avec la bande sonore mélangée sera branché à l’étape 2.'],
    exportCd: ['Exporter un Audio CD', 'La gravure Audio CD sera ajoutée à l’étape 2.'],
    exportPerf: ['Exporter les temps de traitement', 'Le relevé des temps de traitement sera produit à l’étape 2.'],
    replaceAudioVideo: ['Remplacer l’audio dans un fichier vidéo', 'Fichier ▸ Remplacer l’audio dans un fichier vidéo : réécrit la piste son d’un film (étape 2).'],
    extractAudio: ['Extraire l’audio d’une vidéo', 'L’audio du film sera extrait dans le format d’enregistrement du projet (étape 2).'],
    projectInfo: ['Informations sur le projet', 'Résumé du projet : pistes, durée, fichiers, réglages de la session.'],
    projectHistory: ['Historique du projet', 'L’historique du projet liste les états enregistrés et les versions successives.'],
    pageSetup: ['Mise en page', 'La mise en page d’impression (portrait / paysage, échelle) sera proposée à l’étape 2.'],
    print: ['Imprimer', 'L’impression concernera la feuille de pistes, la notation et les aides-mémoire (étape 2).'],
    quit: ['Quitter', 'ALPHA Studio se ferme après proposition d’enregistrement (étape 2).'],

    delTime: ['Supprimer le temps', 'Supprimer le temps referme l’espace entre deux positions, tous les événements suivants glissent (étape 2).'],
    repeat: ['Répéter', 'Répéter crée un nombre de copies choisi des événements sélectionnés (étape 2).'],
    fillLoop: ['Remplir la boucle', 'Les événements seront répétés pour remplir la zone de cycle (étape 2).'],
    splitLoop: ['Diviser la boucle', 'Les événements à cheval sur les bords de la boucle seront divisés (étape 2).'],

    addFX: ['Ajouter un canal FX', 'Un canal FX sera ajouté au Mixer et apparaîtra dans les départs (étape 2).'],
    dupTracks: ['Dupliquer les pistes', 'Les pistes sélectionnées seront dupliquées avec leurs inserts et réglages (étape 2).'],
    delTracks: ['Supprimer les pistes', 'Les pistes sélectionnées seront supprimées (étape 2).'],
    removeEmpty: ['Retirer les pistes vides', 'Les pistes sans événement seront retirées du projet (étape 2).'],
    markerTrack: ['Piste de marqueurs', 'La piste de marqueurs affiche les repères sous la règle (étape 2).'],
    snapshots: ['Snapshots', 'Les snapshots mémorisent l’état des pistes et du mixage, rappelables ensuite (étape 2).'],
    followSel: ['Suivre la sélection', 'La vue du projet défilera vers l’événement sélectionné (étape 2).'],
    arranger: ['Arrangeur', 'La piste d’arrangeur permet d’ordonner des blocs de morceau et de dérouler une chaîne (étape 2).'],
    trackTemplate: ['Importer un modèle de piste', 'Un modèle de piste (.tracktemplate) sera applicable à une piste existante (étape 2).'],
    midiLogical: ['Éditeur logique MIDI', 'L’éditeur logique MIDI transforme les événements MIDI par règles (étape 2).'],
    snapEvents: ['Accrocher aux événements', 'L’accrochage pourra se faire sur les bords des événements, pas seulement sur la grille (étape 2).'],
    magneticGrid: ['Grille magnétique', 'La grille magnétique attire le curseur vers les positions proches (étape 2).'],
    envShow: ['Afficher les enveloppes', 'Les enveloppes de fondu et de volume s’affichent sur les événements (étape 2).'],
    envVolume: ['Enveloppe de volume', 'Les points d’enveloppe de volume se dessinent directement sur l’événement (étape 2).'],
    envPan: ['Enveloppe de panoramique', 'L’enveloppe de panoramique se dessine sur l’événement (étape 2).'],
    envFade: ['Enveloppe de fondu', 'L’enveloppe de fondu se manipule comme une courbe de points (étape 2).'],
    envAuto: ['Enveloppe d’automatisation', 'L’automatisation d’un paramètre de plug-in se dessine sur la piste (étape 2).'],

    process: ['Traitement audio', 'Le traitement choisi s’appliquera aux événements sélectionnés (étape 2).'],
    plugins: ['Traitement par plug-in', 'Le plug-in s’appliquera aux événements sélectionnés (étape 2).'],
    offline: ['Traitement hors ligne', 'Le traitement hors ligne s’inscrit ensuite dans l’historique des traitements (étape 2).'],
    freeze: ['Freeze Edits', 'Freeze Edits fige les traitements hors ligne d’un clip pour libérer le processeur (étape 2).'],
    updateOrigin: ['Mettre à jour l’origine', 'Recalcule le point d’origine du clip après déplacement (étape 2).'],
    bounce: ['Fusionner la sélection', 'Les événements sélectionnés seront fusionnés en un seul fichier audio (étape 2).'],
    closeGaps: ['Fermer les écarts', 'Les silences entre événements seront supprimés en déplaçant les suivants (étape 2).'],
    eventsToPart: ['Événements en partie', 'Les événements sélectionnés seront regroupés dans une partie audio (étape 2).'],
    dissolvePart: ['Dissoudre la partie', 'Une partie audio sera remplacée par ses événements d’origine (étape 2).'],
    warp: ['Audio Warp', 'Le Time Stretch et le Pitch Shift en temps réel seront actifs à l’étape 2.'],
    hitpoints: ['Hitpoints', 'La détection des transitoires et les slices arrivent avec le moteur audio (étape 2).'],
    batch: ['Traitement par lots', 'Le traitement par lots applique une chaîne de traitements à plusieurs fichiers (étape 2).'],

    fixedTempo: ['Tempo fixe', 'Le tempo fixe remplace la piste de tempo : une seule valeur pour tout le projet (étape 2).'],
    wsLockUnused: ['', ''],
    conform: ['Conform Files', 'Les fichiers seront conformés au format du projet (fréquence, profondeur) (étape 2).'],
    minimize: ['Minimiser le fichier', 'Réécrit un fichier audio trop long ou fragmenté (étape 2).'],
    newVersion: ['Nouvelle version de fichier', 'Crée une nouvelle version du fichier audio sans toucher à l’original (étape 2).'],
    prepareArchive: ['Préparer l’archive', 'Rassemble tous les fichiers du projet dans un dossier unique prêt à être archivé (étape 2).'],
    emptyTrash: ['Vider la corbeille', 'Les fichiers placés dans la corbeille du Pool seront supprimés du disque (étape 2).'],
    selectInProject: ['Sélectionner dans le projet', 'Le fichier choisi sera sélectionné dans la fenêtre de projet (étape 2).'],
    mediaMgmt: ['Gestion des médias', 'Vérification, recherche, conversion et reliage des fichiers du projet (étape 2).'],
    remotes: ['Périphériques Remote', 'Les surfaces de contrôle (Generic Remote, Alphatrack) se configurent dans Device Setup (étape 2).'],
    quickControls: ['Quick Controls', 'Les 8 paramètres rapides de la piste suivent les contrôleurs assignés (étape 2).'],
    videoOut: ['Sortie vidéo', 'Le choix de la sortie vidéo (fenêtre, FireWire, carte graphique) se règle dans Device Setup ▸ Video Player.'],
    asioPanel: ['Panneau de configuration ASIO', 'Le panneau du pilote ASIO appartient à la carte son : tampon, latence, horloge.'],
    docManual: ['Manuel Nuendo 4', 'Le manuel d’origine (PDF, 700 pages) sert de référence aux fenêtres et aux menus d’ALPHA Studio.'],
    docSite: ['Support Steinberg', 'La documentation Nuendo 4 est également disponible sur le site de Steinberg.'],
    report: ['Signaler un problème', 'Ouvre une note de rapport avec la version du prototype et la fenêtre concernée (étape 2).']
  };
  Object.keys(MENU_STUBS).forEach((k) => {
    if (!ACTIONS[k]) {
      ACTIONS[k] = () => toast(MENU_STUBS[k][1], MENU_STUBS[k][0]);
    }
  });

  function toggleCycle() {
    state.cycle = !state.cycle;
    if ($('#tpCycleBtn')) $('#tpCycleBtn').classList.toggle('active', state.cycle);
    updateStatus();
    $('#sbStatus').textContent = state.cycle ? 'Cycle activé' : 'Cycle désactivé';
  }
  function toggleClick() {
    state.click = !state.click;
    updateStatus();
    $('#sbStatus').textContent = state.click ? 'Métronome activé (audible à l\u2019étape 2)' : 'Métronome désactivé';
  }
  function toggleTransport() {
    $('#transport').classList.toggle('hidden');
  }
  function openAbout() { $('#overlay').classList.add('show'); }
  function closeAbout() { $('#overlay').classList.remove('show'); }

  /* ------------------------------------------------------------- RÈGLE */
  function setPos(p, noScroll) {
    const step = state.snap ? state.gridSteps[state.grid] : 0;
    let v = p;
    if (step) v = Math.round((v - 1) / step) * step + 1;
    state.pos = Math.min(state.bars, Math.max(1, v));
    updateCursor();
    if (!noScroll) ensureVisible();
  }

  /* J1 : curseur piloté par une horloge audio. Contrairement à setPos(),
     cette entrée ne quantifie pas la position : elle suit currentTime sans dérive. */
  function setPlayhead(p, follow) {
    const v = Number(p);
    state.pos = Math.min(state.bars, Math.max(1, Number.isFinite(v) ? v : 1));
    updateCursor();
    if (follow !== false && state.autoScroll) ensureVisible();
    return state.pos;
  }

  function posFromRulerEvent(e) {
    const vp = $('#ruler-vp').getBoundingClientRect();
    const x = e.clientX - vp.left + $('#lanes-vp').scrollLeft;
    return x / state.barW + 1;
  }

  function bindRuler() {
    let dragging = false;
    const vp = $('#ruler-vp');
    vp.addEventListener('pointerdown', (e) => {
      dragging = true;
      vp.setPointerCapture(e.pointerId);
      setPos(posFromRulerEvent(e));
      $('#sbStatus').textContent = 'Position : ' + fmtPos(state.pos);
    });
    vp.addEventListener('pointermove', (e) => {
      if (dragging) setPos(posFromRulerEvent(e));
    });
    vp.addEventListener('pointerup', () => { dragging = false; });
    vp.addEventListener('pointercancel', () => { dragging = false; });
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = $('#lanes-vp');
      /* Ctrl+molette sur la règle = zoom horizontal (Nuendo, manuel p. 34) */
      if (e.ctrlKey || e.metaKey) { zoom(e.deltaY < 0 ? 1 : -1); return; }
      v.scrollLeft += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
      syncScroll();
    }, { passive: false });
  }

  /* ---------------------------------------------------------- INTERACTIONS */
  /* pouce de défilement de la liste des pistes (lot 6) */
  function syncTlThumb() {
    const bar = $('#tl-scroll'), thumb = $('#tl-thumb'), vp = $('#lanes-vp');
    if (!bar || !thumb) return;
    const total = $('#tracklist-inner').offsetHeight || 1;
    const visible = vp.clientHeight;
    if (total <= visible + 2) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    const w = bar.clientWidth;
    const tw = Math.max(24, w * visible / total);
    const max = total - visible;
    const x = (vp.scrollTop / max) * (w - tw);
    thumb.style.width = tw + 'px';
    thumb.style.left = Math.max(0, Math.min(w - tw, x)) + 'px';
  }
  function bindTlScroll() {
    const bar = $('#tl-scroll'), thumb = $('#tl-thumb'), vp = $('#lanes-vp');
    if (!bar) return;
    let d = null;
    bar.addEventListener('pointerdown', (e) => {
      const r = bar.getBoundingClientRect();
      const tw = thumb.offsetWidth;
      const x = e.clientX - r.left;
      d = { off: (e.target === thumb) ? x - thumb.offsetLeft : tw / 2, w: r.width };
      bar.setPointerCapture(e.pointerId);
      if (e.target !== thumb) moveTo(x);
      e.preventDefault();
    });
    function moveTo(x) {
      const r = bar.getBoundingClientRect();
      const tw = thumb.offsetWidth;
      const t = Math.max(0, Math.min(1, (x - d.off) / Math.max(1, r.width - tw)));
      vp.scrollTop = t * (($('#tracklist-inner').offsetHeight || 0) - vp.clientHeight);
      syncScroll();
    }
    bar.addEventListener('pointermove', (e) => { if (d) moveTo(e.clientX - bar.getBoundingClientRect().left); });
    const up = () => { d = null; };
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    window.addEventListener('resize', syncTlThumb);
  }

  /* =====================================================================
     ÉDITION À LA SOURIS (lots 6 et 7) : déplacement, redimensionnement,
     fondus, volume d'événement, sélection par rectangle, hauteur de piste.
     ===================================================================== */
  function barAt(clientX) {
    const r = $('#lanes-vp').getBoundingClientRect();
    return (clientX - r.left + $('#lanes-vp').scrollLeft) / state.barW + 1;
  }
  function snapVal(v, ev) {
    if (!state.snap) return v;
    /* mode Événements : on accroche aux bords des événements (p. 56) */
    if ((state.snapMode === 'Événements' || state.snapMode === 'Événements + curseur' ||
         state.snapMode === 'Événements + grille + curseur') && ev) {
      let best = v, dist = 0.22;
      PARTS.forEach((p) => {
        [p.start, p.start + p.len].forEach((e) => {
          if (Math.abs(e - v) < dist) { dist = Math.abs(e - v); best = e; }
        });
      });
      if (best !== v) return best;
    }
    if (state.snapMode === 'Curseur magnétique' || state.snapMode === 'Grille + curseur' ||
        state.snapMode === 'Événements + curseur' || state.snapMode === 'Événements + grille + curseur') {
      if (Math.abs(state.pos - v) < 0.2) return state.pos;
    }
    if (state.snapMode === 'Grille relative' || state.snapMode === 'Shuffle') {
      return v; /* pas d'aimantation : le pas est appliqué au déplacement */
    }
    const step = state.gridSteps[state.grid] || 1;
    return Math.round(v / step) * step;
  }
  function snapStep() { return state.snap ? (state.gridSteps[state.grid] || 1) : 0; }

  /* --- sélection : clic, Ctrl (ajout), double-clic --- */
  function editingBindings() {
    const vp = $('#lanes-vp');
    const inner = $('#lanes-inner');
    let drag = null;

    /* ---- pointerdown : prépare le geste ---- */
    inner.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const partEl = e.target.closest('[data-part]');
      const hand = e.target.closest('.pf-h');
      const volH = e.target.closest('.pv-h');
      const edge = e.target.closest('.p-edge');

      if (partEl) {
        const p = PARTS.find((x) => x.id === partEl.dataset.part);
        if (!p) return;
        const additive = e.ctrlKey || e.metaKey || e.shiftKey;
        if (e.shiftKey && state.selectedPart) {
          const a = PARTS.find((x) => x.id === state.selectedPart);
          if (a && a.track === p.track) {
            const lo = Math.min(a.start, p.start), hi = Math.max(a.start + a.len, p.start + p.len);
            PARTS.forEach((x) => { if (x.track === p.track && x.start >= lo && x.start + x.len <= hi) x.sel = true; });
            renderLanes(); updateInfoLine();
            $('#sbStatus').textContent = 'Plage sélectionnée : ' + PARTS.filter((x) => x.sel).length + ' événement(s)';
            return;
          }
        }

        /* --- outil Gomme --- */
        if (state.tool === 'erase') {
          removeParts([p.id]);
          return;
        }
        /* --- outil Ciseaux --- */
        if (state.tool === 'split') {
          splitAt(p, barAt(e.clientX));
          return;
        }
        /* --- outil Mute --- */
        if (state.tool === 'mute') {
          p.muted = !p.muted;
          renderLanes(); $('#sbStatus').textContent = 'Événement « ' + p.name + ' » ' + (p.muted ? 'muet' : 'audible');
          return;
        }
        if (state.tool === 'color') {
          const i = COLORS.findIndex((x) => x[1] === p.color);
          const c = COLORS[(i + 1) % COLORS.length];
          p.color = c[1]; renderLanes();
          $('#sbStatus').textContent = 'Couleur de l’événement « ' + p.name + ' » : ' + c[0];
          toast('Couleur « ' + c[0] + ' » appliquée à l’événement. Palette tirée des Préférences ▸ Événements ▸ Couleurs (p. 291).', 'Color tool');
          return;
        }
        if (!p.sel || additive) selectPart(p.id, additive);

        if (hand) {
          drag = { kind: 'fade', p: p, side: hand.dataset.fh, x0: e.clientX, f0: hand.dataset.fh === 'in' ? (p.fadeIn || 0) : (p.fadeOut || 0) };
        } else if (volH) {
          drag = { kind: 'vol', p: p, x0: e.clientX, v0: p.evol === undefined ? 0 : p.evol };
        } else if (edge) {
          drag = { kind: 'size', p: p, side: edge.dataset.edge, x0: e.clientX, s0: p.start, l0: p.len };
        } else {
          const sel = PARTS.filter((x) => x.sel);
          drag = { kind: 'move', list: sel.length ? sel : [p], x0: e.clientX, orig: (sel.length ? sel : [p]).map((x) => [x, x.start]) };
        }
        vp.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      /* ---- outil Lecture / Scrub : glisser déplace le curseur de projet (p. 42) ---- */
      if (state.tool === 'audition') {
        state.scrubbing = true;
        setPos(barAt(e.clientX), true);
        updateCursor();
        $('#sbStatus').textContent = 'Scrub : lecture autour du curseur — ' + fmtPos(state.pos);
        vp.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      /* ---- outil Time Warp : glisser sur la règle étire le temps (p. 284) ---- */
      if (state.tool === 'warp') {
        const lane = e.target.closest('[data-track]');
        drag = { kind: 'warp', x0: e.clientX, w0: state.warp || 0.06 };
        vp.setPointerCapture(e.pointerId);
        e.preventDefault();
        state.rulerTime = 'time';
        renderRuler(); renderLanes(); updateCursor();
        return;
      }

      /* ---- outil Line : trace une courbe dans la piste survolée (p. 236) ---- */
      if (state.tool === 'line') {
        const lane = e.target.closest('[data-track]');
        if (lane && !lane.dataset.sub) {
          const r = lane.getBoundingClientRect();
          drag = { kind: 'line', t: trackById(lane.dataset.track), x1: e.clientX - r.left, y1: e.clientY - r.top, x2: e.clientX - r.left, y2: e.clientY - r.top, h: r.height };
          vp.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }

      /* ---- clic dans le vide : sélection par rectangle, ou curseur ---- */
      const lane = e.target.closest('[data-track]');
      if (lane) {
        if (state.tool === 'range' || e.shiftKey) {
          const x = e.clientX - inner.getBoundingClientRect().left;
          drag = { kind: 'range', x1: x, x2: x };
          $('#lanes-inner').insertAdjacentHTML('beforeend', '<div class="marquee" id="marquee"></div>');
          vp.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
        if (!e.ctrlKey && !e.metaKey) {
          PARTS.forEach((p) => { p.sel = false; });
          state.selectedPart = null;
        }
        clickTrack(lane.dataset.track, e);
        renderTracks(); renderLanes(); updateInspector(); updateInfoLine();
        setPos(barAt(e.clientX), true);
        updateCursor();
        /* glisser dans le vide = rectangle de sélection, comme dans Nuendo */
        const x0 = e.clientX - inner.getBoundingClientRect().left;
        drag = { kind: 'marquee', x1: x0, y1: e.clientY, x2: x0, y2: e.clientY, track: lane.dataset.track };
        vp.setPointerCapture(e.pointerId);
      }
    });

    vp.addEventListener('pointermove', (e) => {
      /* curseurs contextuels (poignées) */
      if (!drag) {
        const hand = e.target.closest('.pf-h'), edge = e.target.closest('.p-edge'), vol = e.target.closest('.pv-h');
        inner.style.cursor = hand ? 'ew-resize' : edge ? 'ew-resize' : vol ? 'ns-resize' : '';
        return;
      }
      const dx = e.clientX - drag.x0;
      const dBars = dx / state.barW;
      if (drag.kind === 'move') {
        const step = snapStep();
        drag.orig.forEach(([p, s0]) => {
          let v = s0 + dBars;
          if (state.tool !== 'draw') v = snapVal(v, true);
          else if (step) v = Math.round((v - 1) / step) * step + 1;
          p.start = Math.max(1, Math.round(v * 1000) / 1000);
        });
        renderLanes(); updateInfoLine();
        $('#sbStatus').textContent = 'Déplacement : ' + fmtPos(drag.list[0].start);
        return;
      }
      if (drag.kind === 'size') {
        const p = drag.p;
        /* Sizing Moves Contents : le contenu glisse avec le bord */
        if (state.resizeMode === 'contents') {
          if (!drag.c0) drag.c0 = p.offset || 0;
          p.offset = Math.round((drag.c0 - (drag.side === 'start' ? dBars : 0)) * 100) / 100;
          $('#infoOff').value = String(p.offset).replace('.', ',') + '.0.0.0';
        }
        /* Sizing Applies Time Stretch : le contenu est étiré (facteur affiché) */
        if (state.resizeMode === 'stretch') {
          p.stretch = true;
        }
        if (drag.side === 'end') {
          let v = drag.s0 + drag.l0 + dBars;
          v = state.snapMode === 'Shuffle' ? v : snapVal(v, true);
          p.len = Math.max(0.125, Math.round((v - p.start) * 1000) / 1000);
        } else {
          let v = drag.s0 + dBars;
          v = state.snapMode === 'Shuffle' ? v : snapVal(v, true);
          const end = drag.s0 + drag.l0;
          p.start = Math.min(end - 0.125, Math.max(1, Math.round(v * 1000) / 1000));
          p.len = Math.round((end - p.start) * 1000) / 1000;
        }
        renderLanes(); updateInfoLine();
        const extra = state.resizeMode === 'contents' ? ' · contenu décalé de ' + String(p.offset || 0).replace('.', ',') + ' mesure(s)'
          : state.resizeMode === 'stretch' ? ' · contenu étiré (Time Stretch)' : '';
        $('#sbStatus').textContent = 'Longueur : ' + String(p.len).replace('.', ',') + ' mesure(s)' + extra;
        return;
      }
      if (drag.kind === 'fade') {
        const p = drag.p;
        const val = Math.max(0, Math.min(p.len / 2, drag.f0 + dBars));
        if (drag.side === 'in') p.fadeIn = Math.round(val * 100) / 100;
        else p.fadeOut = Math.round(val * 100) / 100;
        renderLanes();
        $('#sbStatus').textContent = 'Fondu ' + (drag.side === 'in' ? 'entrant' : 'sortant') + ' : ' +
          (val * (240 / 120)).toFixed(2).replace('.', ',') + ' s';
        return;
      }
      if (drag.kind === 'vol') {
        const p = drag.p;
        p.evol = Math.max(-24, Math.min(12, Math.round((drag.v0 - dx / 4) * 10) / 10));
        renderLanes();
        $('#sbStatus').textContent = 'Volume de l’événement : ' + (p.evol > 0 ? '+' : '') + String(p.evol).replace('.', ',') + ' dB';
        return;
      }
      if (drag.kind === 'audition') {
        setPos(barAt(e.clientX), true);
        updateCursor();
        $('#sbStatus').textContent = 'Scrub : ' + fmtPos(state.pos);
        return;
      }
      if (drag.kind === 'warp') {
        state.warp = Math.max(0, Math.min(0.5, drag.w0 + dx / Math.max(1, state.bars * state.barW)));
        renderRuler(); renderLanes(); updateCursor();
        $('#sbStatus').textContent = 'Time Warp : courbure du temps ' + (state.warp * 100).toFixed(0) + ' %';
        return;
      }
      if (drag.kind === 'line') {
        const r = inner.getBoundingClientRect();
        drag.x2 = e.clientX - r.left; drag.y2 = e.clientY - inner.getBoundingClientRect().top;
        const lr = inner.querySelector('.lane[data-track="' + drag.t.id + '"]').getBoundingClientRect();
        drag.y2 = e.clientY - lr.top;
        let mq = $('#line-ghost');
        if (!mq) { inner.insertAdjacentHTML('beforeend', '<svg class="line-ghost" id="line-ghost" width="' + inner.offsetWidth + '" height="' + inner.offsetHeight + '"></svg>'); mq = $('#line-ghost'); }
        const laneTop = lr.top - r.top;
        mq.innerHTML = '<path d="' + linePath(drag, laneTop) + '" fill="none" stroke="#f2e6a0" stroke-width="1.4" stroke-dasharray="3 2"/>';
        return;
      }
      if (drag.kind === 'marquee' || drag.kind === 'range') {
        if (drag.kind === 'marquee') { drag.x2 = e.clientX - inner.getBoundingClientRect().left; drag.y2 = e.clientY; }
        else drag.x2 = e.clientX - inner.getBoundingClientRect().left;
        const r = inner.getBoundingClientRect();
        const x1 = Math.min(drag.x1, drag.x2), x2 = Math.max(drag.x1, drag.x2);
        let mq = $('#marquee');
        if (!mq) { inner.insertAdjacentHTML('beforeend', '<div class="marquee" id="marquee"></div>'); mq = $('#marquee'); }
        if (drag.kind === 'range') {
          mq.style.left = x1 + 'px'; mq.style.width = (x2 - x1) + 'px';
          mq.style.top = '0'; mq.style.height = inner.offsetHeight + 'px';
        } else {
          const y1 = Math.min(drag.y1, drag.y2) - r.top, y2 = Math.max(drag.y1, drag.y2) - r.top;
          mq.style.left = x1 + 'px'; mq.style.top = y1 + 'px';
          mq.style.width = (x2 - x1) + 'px'; mq.style.height = (y2 - y1) + 'px';
        }
        return;
      }
    });

    vp.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const mq = $('#marquee');
      if (drag.kind === 'marquee' && mq) {
        const b = mq.getBoundingClientRect();
        PARTS.forEach((p) => {
          const el = inner.querySelector('[data-part="' + p.id + '"]');
          if (!el) return;
          const r = el.getBoundingClientRect();
          const hit = !(r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom);
          if (hit) p.sel = true;
        });
        mq.remove();
        renderLanes(); updateInfoLine();
        $('#sbStatus').textContent = 'Sélection par rectangle : ' + PARTS.filter((p) => p.sel).length + ' événement(s)';
      } else if (drag.kind === 'range' && mq) {
        const x1 = Math.max(0, Math.min(drag.x1, drag.x2)), x2 = Math.max(drag.x1, drag.x2);
        state.cycleL = Math.round((x1 / state.barW + 1) * 100) / 100;
        state.cycleR = Math.round((x2 / state.barW + 1) * 100) / 100;
        mq.remove();
        renderRuler(); renderLanes(); renderOverview();
        $('#sbStatus').textContent = 'Plage : ' + fmtPos(state.cycleL) + ' → ' + fmtPos(state.cycleR);
      } else if (drag.kind === 'warp') {
        toast('Time Warp appliqué : les événements de base de temps <b>musicale</b> suivent la nouvelle courbe, les événements <b>linéaires</b> restent en place. Règle passée en Time Linear.', 'Time Warp');
      } else if (drag.kind === 'audition') {
        state.scrubbing = false;
      } else if (drag.kind === 'line') {
        const g = $('#line-ghost'); if (g) g.remove();
        const pts = linePoints(drag);
        drag.t._aut = pts;
        drag.t.autParam = drag.t.autParam || 'Volume';
        drag.t.autShown = true;
        renderLanes(); updateCursor();
        $('#sbStatus').textContent = 'Courbe « ' + state.lineMode + ' » dessinée sur ' + drag.t.name;
      } else if (drag.kind === 'move' || drag.kind === 'size') {
        renderOverview(); updateInfoLine(); updateCursor();
      }
      drag = null;
      inner.style.cursor = '';
    });
    vp.addEventListener('pointercancel', () => {
      drag = null;
      const mq = $('#marquee'); if (mq) mq.remove();
    });

    /* ---- double-clic sur une poignée de fondu = fondu automatique --- */
    inner.addEventListener('dblclick', (e) => {
      const hand = e.target.closest('.pf-h');
      if (hand) {
        const p = PARTS.find((x) => x.id === hand.closest('[data-part]').dataset.part);
        if (!p) return;
        p.fadeIn = p.fadeOut = 0.04;
        renderLanes();
        toast('Fondu automatique de 10 ms appliqué (Réglages des fondus automatiques pour la valeur par défaut).', 'Fondu');
      }
    });

    /* ---- hauteur de piste à la souris (bord inférieur, p. 34-35) ---- */
    const tl = $('#tracklist-inner');
    let grab = null;
    tl.addEventListener('pointerdown', (e) => {
      const g = e.target.closest('[data-grab]');
      if (!g) return;
      const t = trackById(g.dataset.grab);
      if (!t) return;
      grab = { t: t, y0: e.clientY, h0: t.h, all: e.ctrlKey || e.metaKey, allH: TRACKS.map((x) => x.h) };
      g.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    tl.addEventListener('pointermove', (e) => {
      if (!grab || !e.buttons) return;
      const d = e.clientY - grab.y0;
      let nh = grab.h0 + d;
      if (state.snapHeights) nh = Math.round(nh / 8) * 8;
      nh = Math.max(22, Math.min(220, nh));
      if (grab.all) {
        const ratio = nh / Math.max(1, grab.h0);
        TRACKS.forEach((x, i) => { x.h = Math.max(22, Math.min(220, Math.round(grab.allH[i] * ratio))); });
      } else {
        grab.t.h = nh;
      }
      renderTracks(); renderLanes(); updateCursor();
      $('#sbStatus').textContent = 'Hauteur : ' + Math.round(nh) + ' px' + (grab.all ? ' (toutes les pistes)' : '');
    });
    const endGrab = () => { grab = null; };
    tl.addEventListener('pointerup', endGrab);
    tl.addEventListener('pointercancel', endGrab);
    tl.addEventListener('mousemove', (e) => {
      /* curseur ns-resize au survol de la poignée */
      if (!grab) tl.style.cursor = e.target.closest('[data-grab]') ? 'ns-resize' : '';
    });
  }

  /* --- courbes du Line tool (5 modes, p. 236) ---------------------------- */
  function linePoints(d) {
    const barsTo = (px) => px / state.barW + 1;
    const b1 = Math.max(1, barsTo(Math.min(d.x1, d.x2)));
    const b2 = Math.max(b1 + 0.25, barsTo(Math.max(d.x1, d.x2)));
    const v1 = 1 - Math.max(0, Math.min(1, d.y1 / Math.max(1, d.h - 4)));
    const v2 = 1 - Math.max(0, Math.min(1, d.y2 / Math.max(1, d.h - 4)));
    const N = 24;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const k = i / N;
      let v;
      switch (state.lineMode) {
        case 'Parabola': v = v1 + (v2 - v1) * (k * k); break;
        case 'Sine': v = v1 + (v2 - v1) * k + Math.sin(k * Math.PI * 2) * 0.12; break;
        case 'Triangle': v = v1 + (v2 - v1) * (k < 0.5 ? k * 2 : (1 - k) * 2); break;
        case 'Square': v = v1 + (v2 - v1) * (k < 0.5 ? 0 : 1); break;
        default: v = v1 + (v2 - v1) * k;
      }
      pts.push([b1 + (b2 - b1) * k, Math.max(0, Math.min(1, v))]);
    }
    return pts;
  }
  function linePath(d, laneTop) {
    const pts = linePoints(d);
    return pts.map((p, i) => (i ? 'L' : 'M') + barToPx(p[0]) + ' ' + (laneTop + (1 - p[1]) * (d.h - 8))).join(' ');
  }

  /* --- primitives d'édition --------------------------------------------- */
  function removeParts(ids) {
    const del = [];
    ids.forEach((id) => {
      const i = PARTS.findIndex((p) => p.id === id);
      if (i >= 0) del.push(PARTS.splice(i, 1)[0]);
    });
    state.selectedPart = null;
    renderLanes(); renderOverview(); updateInfoLine(); updateStatus();
    if (del.length) toast(del.length + ' événement(s) supprimé(s) — <b>Ctrl+Z</b> pour annuler.', 'Édition');
    pushUndo({ type: 'del', items: del });
  }
  function splitAt(p, at) {
    at = state.snap ? Math.round(at / (state.gridSteps[state.grid] || 1)) * (state.gridSteps[state.grid] || 1) : at;
    if (at <= p.start + 0.05 || at >= p.start + p.len - 0.05) return;
    const right = Object.assign({}, p, { id: p.id + '-b' + Date.now() % 1000, start: at, len: p.start + p.len - at });
    p.len = at - p.start;
    PARTS.push(right);
    renderLanes(); renderOverview(); updateInfoLine();
    $('#sbStatus').textContent = 'Événement divisé à ' + fmtPos(at);
  }

  /* --- annulation (Ctrl+Z) : dernière opération simple ------------------- */
  const UNDO = [];
  function pushUndo(op) { UNDO.push(op); if (UNDO.length > 40) UNDO.shift(); }
  function undoOnce() {
    const op = UNDO.pop();
    if (!op) { toast('Aucune modification dans l’historique de cette session (l’étape 2 ajoutera la pile complète).', 'Annuler'); return; }
    if (op.type === 'del') { op.items.forEach((p) => PARTS.push(p)); }
    if (op.type === 'move') { op.items.forEach(([p, s]) => { p.start = s; }); }
    renderLanes(); renderOverview(); updateInfoLine(); updateStatus();
    toast('Dernière opération annulée.', 'Annuler');
  }

  function bindWorkspace() {
    $('#tracklist-inner').addEventListener('click', (e) => {
      const folderBtn = e.target.closest('[data-folder]');
      if (folderBtn) {
        const f = trackById(folderBtn.dataset.folder);
        f.open = !f.open;
        renderTracks(); renderLanes(); renderOverview(); updateCursor();
        return;
      }
      const autoshow = e.target.closest('[data-autoshow]');
      if (autoshow) { toggleAuto(autoshow.dataset.autoshow); return; }
      const autoparam = e.target.closest('[data-autoparam]');
      if (autoparam) {
        const t = trackById(autoparam.dataset.autoparam);
        const PARAMS = ['Volume', 'Panoramique', 'Mute', 'Départs 1', 'Départs 2', 'Inserts 1', 'Égaliseur', 'LFE'];
        ctxMenu(e.clientX, e.clientY, PARAMS.map((p) => ({ t: p, chk: 'autop', val: t.id + '|' + p, act: 'setAutParam', a: t.id + '|' + p })));
        return;
      }
      const autoadd = e.target.closest('[data-autoadd]');
      if (autoadd) {
        toast('Sous-piste d’automatisation ajoutée : chaque paramètre automatisable d’une piste a sa propre sous-piste (Nuendo 4, p. 26).', 'Automatisation');
        return;
      }
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) {
        const t = trackById(actBtn.dataset.track);
        if (!t) return;
        const a = actBtn.dataset.act;
        if (a === 'mute') t.mute = !t.mute;
        if (a === 'solo') t.solo = !t.solo;
        if (a === 'rec') t.rec = !t.rec;
        if (a === 'mon') t.mon = !t.mon;
        if (a === 'autow') t.autoW = !t.autoW;
        if (a === 'autor') t.autoR = !t.autoR;
        if (a === 'lock') { t.lock = !t.lock; $('#sbStatus').textContent = t.name + ' ' + (t.lock ? 'verrouillée' : 'déverrouillée'); }
        if (a === 'autoshow') { toggleAuto(t.id); return; }
        if (a === 'timebase') {
          t.timebase = t.timebase === 'linear' ? 'musical' : 'linear';
          renderTracks();
          $('#sbStatus').textContent = t.name + ' : base de temps ' + (t.timebase === 'linear' ? 'linéaire (Temps)' : 'musicale (Tempo)');
          return;
        }
        if (a === 'lane') {
          const order = ['normal', 'lanes fixes', 'lanes auto', 'Masquer les lanes'];
          t.laneMode = (order.indexOf(t.laneMode) + 1) % order.length;
          $('#sbStatus').textContent = 'Type d’affichage des pistes : ' + order[t.laneMode];
          toast('Type d’affichage (lanes) : <b>' + order[t.laneMode] + '</b>. Les lanes servent aux prises multiples d’une même piste (Nuendo 4, p. 26 et 51).', 'Lanes');
          return;
        }
        if (a === 'chan') { selectTrack(t.id); WIN('channel', t.id); return; }
        if (a === 'vol') { WIN('channel', t.id); toast('Volume : ' + fmtDb(t.db || 0) + ' — le fader du canal s’ouvre dans Réglages de canal.', 'Volume'); return; }
        if (a === 'pan') { WIN('channel', t.id); toast('Panoramique : ' + (t.pan ? t.pan : 'centre') + '.', 'Panoramique'); return; }
        if (a === 'ins') { WIN('channel', t.id); toast('Inserts de « ' + t.name + ' » : 2 slots utilisés (Comp Alpha VCA, De-esser Pro).', 'Inserts'); return; }
        if (a === 'eq') { WIN('channel', t.id); toast('Égaliseur de « ' + t.name + '» : 4 bandes paramétriques.', 'Égaliseur'); return; }
        if (a === 'sends') { WIN('channel', t.id); toast('Départs FX : A = Réverb Space, B = Delay Echo.', 'Départs'); return; }
        if (a === 'routing') { WIN('conns'); toast('Routage : entrée Stéréo In 1 · sortie vers BUS DRUMS puis Stéréo Out.', 'Routage'); return; }
        if (a === 'notepad') { WIN('channel', t.id); toast('Bloc-notes de la piste ouvert dans les réglages de canal.', 'Bloc-notes'); return; }
        if (isTrackSel(t.id)) updateInspector();
        renderTracks();
        return;
      }
      const row = e.target.closest('[data-track]');
      if (row) {
        if (row.dataset.sub) return;
        clickTrack(row.dataset.track, e);
        renderTracks(); renderLanes(); updateInspector(); updateCursor();
        const n = state.selTracks.length;
        $('#sbStatus').textContent = n > 1 ? n + ' pistes sélectionnées' : 'Piste sélectionnée : ' + (trackById(row.dataset.track) || {}).name;
        if (window.ALPHAWIN && window.ALPHAWIN.refreshSelections) window.ALPHAWIN.refreshSelections();
      }
    });

    $('#lanes-inner').addEventListener('click', (e) => {
      /* les événements sont gérés par editingBindings (pointerdown) : ici seulement les zones vides */
      const partEl = e.target.closest('[data-part]');
      if (partEl) return;
      const lane = e.target.closest('[data-track]');
      if (lane && !lane.dataset.sub) updateInfoLine();
    });

    /* marqueurs de la piste de marqueurs : clic = position, double-clic = renommer, clic droit = menu */
    $('#lanes-inner').addEventListener('pointerdown', (e) => {
      const mk = e.target.closest('[data-mk]');
      if (!mk || e.button !== 0) return;
      const bar = +mk.dataset.mk;
      setPos(bar);
      const m = MARKERS.find((x) => x[0] === bar);
      $('#sbStatus').textContent = 'Marqueur « ' + (m ? m[1] : bar) + ' » — position ' + fmtPos(bar);
    });
    $('#lanes-inner').addEventListener('contextmenu', (e) => {
      const mk = e.target.closest('[data-mk]');
      if (!mk) return;
      e.preventDefault();
      e.stopPropagation();
      const bar = +mk.dataset.mk;
      const i = MARKERS.findIndex((x) => x[0] === bar);
      ctxMenu(e.clientX, e.clientY, [
        { t: 'Renommer le marqueur…', act: 'renameMarker', a: i },
        { t: 'Aller au marqueur', act: 'gotoMarker', a: bar },
        { t: 'Supprimer le marqueur', act: 'delMarker', a: i },
        SEP,
        { t: 'Marqueur de cycle à partir d’ici', act: 'cycleFromMarker', a: bar },
        { t: 'Ouvrir la fenêtre Marqueurs', sc: 'Ctrl+M', act: 'markers' }
      ], 'Marqueur « ' + (MARKERS[i] ? MARKERS[i][1] : bar) + ' »');
    });
    $('#lanes-inner').addEventListener('dblclick', (e) => {
      const partEl = e.target.closest('[data-part]');
      if (partEl) {
        const p = PARTS.find((x) => x.id === partEl.dataset.part);
        WIN(p.type === 'midi' ? 'key' : 'sample', p.id);
      } else {
        const mk = e.target.closest('.mk');
        if (mk) renameMarker(+mk.dataset.mk);
      }
    });

    /* --- règle : clic droit = format, clic gauche = position, molette = zoom --- */
    const rk = $('#ruler-inner');
    if (rk) {
      rk.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const m = e.target.closest('[data-rk]');
        if (m) {
          const i = +m.dataset.rk;
          const mk = MARKERS[i];
          if (e.detail === 1) { setPos(mk[0]); $('#sbStatus').textContent = 'Marqueur « ' + mk[1] + ' » — position ' + fmtPos(mk[0]); }
        } else {
          setPos(barAt(e.clientX), true);
          updateCursor();
        }
      });
      rk.addEventListener('dblclick', (e) => {
        const m = e.target.closest('[data-rk]');
        if (m) renameMarker(+m.dataset.rk);
        else toast('Double-clic sur la règle : dans Nuendo 4, il ouvre la fenêtre <b>Piste de marqueurs</b>.', 'Règle');
      });
      const sub = $('#ruler-sub');
      if (sub) sub.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const F = [['bars', 'Barres + temps'], ['tc', 'Timecode'], ['sec', 'Secondes'], ['smp', 'Échantillons'],
                   ['ft16', 'Pieds + images 16 mm'], ['ft35', 'Pieds + images 35 mm'], ['user', 'User']];
        ctxMenu(e.clientX, e.clientY, F.map(([k, lab]) => ({ t: lab, chk: 'rf', val: k, act: 'setRulerFmt2', a: k })), 'Règle 2 — format');
      });
    }

    $('#lanes-vp').addEventListener('scroll', syncScroll, { passive: true });

    $('#lanes-vp').addEventListener('wheel', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    editingBindings();
  }

  function rulerMenu(x, y, cur) {
    const F = [['bars', 'Barres + temps'], ['tc', 'Timecode'], ['sec', 'Secondes'], ['smp', 'Échantillons'],
               ['ft16', 'Pieds + images 16 mm'], ['ft35', 'Pieds + images 35 mm'], ['user', 'User']];
    ctxMenu(x, y, F.map(([k, lab]) => ({ t: lab, chk: 'fmt', val: k, act: 'setRulerFmt', a: k }))
      .concat([
        SEP,
        { t: 'Bars+Beats Linear', chk: 'rt', val: 'bars', act: 'setRulerTime', a: 'bars' },
        { t: 'Time Linear', chk: 'rt', val: 'time', act: 'setRulerTime', a: 'time' },
        SEP,
        { t: 'Ajouter une piste de règle', act: 'addRulerTrack' },
        { t: 'Afficher / masquer la règle 2', act: 'toggleRulerSub' },
        SEP,
        { t: 'Réglages de la règle…', act: 'layout' }
      ]), 'Format de la règle');
  }

  /* Inspector Setup : une section = un bloc .sect de l'inspecteur (p. 25) */
  function updateInspectSections(t) {
    const midi = !!(t && (t.kind === 'midi' || t.kind === 'instrument'));
    const ms = document.querySelector('#inspector .sect[data-sect="midi"]');
    if (ms) ms.style.display = midi ? '' : 'none';
  }

  const INSP_MAP = {
    'Automatisation': 'auto', 'Volume': 'vol', 'Panoramique': 'pan', 'Inserts': 'ins',
    'Départs': 'send', 'Égaliseur': 'eq', 'Fader de départ': 'send',
    'Notepad': 'note', 'Canal': 'chan', 'En-tête (nom, mute/solo)': 'auto'
  };
  function setInspectorSection(name, on) {
    const key = INSP_MAP[name];
    if (!key) return;
    const el = document.querySelector('#inspector .sect[data-sect="' + key + '"]');
    if (!el) return;
    el.style.display = on ? '' : 'none';
  }

  function toggleAuto(id) {
    const t = trackById(id);
    if (!t) return;
    t.autShown = !t.autShown;
    renderTracks(); renderLanes(); updateCursor();
    $('#sbStatus').textContent = 'Automatisation de « ' + t.name + ' » ' + (t.autShown ? 'affichée' : 'masquée');
  }

  function renameMarker(i) {
    const m = MARKERS[i];
    if (!m) return;
    const v = window.prompt('Nom du marqueur :', m[1]);
    if (v === null) return;
    m[1] = v || m[1];
    renderRuler(); renderLanes(); renderOverview();
  }

  /* ------------------------------------------------ MENUS CONTEXTUELS */
  /* Un seul constructeur de menu flottant : il réutilise les objets des menus du haut
     (t = texte, sc = raccourci, act = action, a = argument, chk/val = case à cocher, items = sous-menu). */
  let ctxEl = null;
  function closeCtx() {
    if (ctxEl) { ctxEl.remove(); ctxEl = null; }
  }
  function ctxMenu(x, y, items, title) {
    closeCtx();
    const box = document.createElement('div');
    box.className = 'ctx-menu';
    if (title) box.innerHTML = '<div class="ctx-title">' + title + '</div>';
    function build(list, parent) {
      const wrap = document.createElement('div');
      wrap.className = parent ? 'ctx-sub' : 'ctx-list';
      list.forEach((it) => {
        if (it === SEP) { const s2 = document.createElement('div'); s2.className = 'ctx-sep'; wrap.appendChild(s2); return; }
        const d = document.createElement('div');
        d.className = 'ctx-item' + (it.items ? ' arrow' : '') + (it.chk ? ' chk' : '');
        d.innerHTML = '<span class="ct">' + it.t + '</span>' + (it.sc ? '<span class="cs">' + it.sc + '</span>' : '') +
          (it.items ? '<span class="ca">▸</span>' : '');
        if (it.chk) {
          let on = false;
          if (it.chk === 'tool') on = state.tool === it.val;
          else if (it.chk === 'grid') on = state.grid === it.val;
          else if (it.chk === 'fmt') on = state.fmt === it.val;
          else if (it.chk === 'track') on = !!(trackById(it.val) || {})[it.field];
          else if (it.chk === 'sm') on = state.snapMode === it.val;
          else if (it.chk === 'qm') on = state.quantizeVal === it.val;
          else if (it.chk === 'am') on = state.autoMode === it.val;
          else if (it.chk === 'rk') on = state.rootKey === it.val;
          else if (it.chk === 'cc') on = String(state.colorIdx) === String(it.val);
          else if (it.chk === 'rm') on = state.resizeMode === it.val;
          else if (it.chk === 'lm') on = state.lineMode === it.val;
          else if (it.chk === 'tbi') on = TOOLBAR_HIDDEN.indexOf(it.val) < 0;
          else if (it.chk === 'autop') {
            const [tid, pn] = String(it.val).split('|');
            const tt = trackById(tid);
            on = !!tt && tt.autParam === pn;
          }
          else if (it.chk === 'rt') on = state.rulerTime === it.val;
          else if (it.chk === 'rf') on = state.rulerFmt2 === it.val;
          else if (it.chk === 'rmk') on = !!(MARKERS[it.val] && MARKERS[it.val][2] === 'cycle');
          else if (it.chk === 'multi') on = state.multiInfo === (it.val === 'on');
          else on = !!state[it.chk];
          d.classList.toggle('on', on);
        }
        if (it.items) {
          const sub = build(it.items, true);
          d.appendChild(sub);
        } else {
          d.addEventListener('click', () => {
            closeCtx();
            if (it.act && ACTIONS[it.act]) ACTIONS[it.act](it.a !== undefined ? it.a : it.val);
            else toast('«\u00a0' + it.t + '\u00a0» sera relié à l\u2019étape 2.', 'Commande');
          });
        }
        wrap.appendChild(d);
      });
      return wrap;
    }
    box.appendChild(build(items, false));
    document.body.appendChild(box);
    const r = box.getBoundingClientRect();
    box.style.left = Math.max(2, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    box.style.top = Math.max(2, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
    ctxEl = box;
    setTimeout(() => {
      document.addEventListener('mousedown', function out(ev) {
        if (ctxEl && !ctxEl.contains(ev.target)) { closeCtx(); document.removeEventListener('mousedown', out, true); }
      }, true);
    }, 0);
    return box;
  }

  const H = (n) => [[34, 'Très petite'], [44, 'Petite'], [64, 'Moyenne'], [90, 'Grande'], [120, 'Très grande']].map((x) => ({
    t: x[1] + ' (' + x[0] + ' px)', chk: 'none', val: x[0], act: 'trackHeight', a: x[0]
  }));
  const COLORS = [['Bleu acier', '#4f7fa8', '#8fb6d6'], ['Vert', '#61865e', '#9dbf9b'], ['Ocre', '#9a8450', '#c9b98f'],
    ['Violet', '#7466a0', '#b0a6c9'], ['Rouge', '#a8665e', '#d3a49e'], ['Gris', '#6f7d86', '#9fb2bb']];

  function eventMenu(x, y, p) {
    const tr = trackById(p.track) || {};
    const isMidi = p.type === 'midi';
    ctxMenu(x, y, [
      { t: 'Ouvrir dans l\u2019éditeur d\u2019échantillons', sc: 'Ctrl+E', act: 'sample' },
      { t: 'Ouvrir dans l\u2019éditeur de clavier', act: 'key' },
      { t: 'Édition en place', sc: 'Ctrl+Maj+I', act: 'inplace' },
      { t: 'Audition', act: 'auditionEvent' },
      SEP,
      { t: 'Couper', sc: 'Ctrl+X', act: 'cut' },
      { t: 'Copier', sc: 'Ctrl+C', act: 'copy' },
      { t: 'Coller', sc: 'Ctrl+V', act: 'paste' },
      { t: 'Supprimer', sc: 'Suppr', act: 'del' },
      { t: 'Dupliquer', sc: 'Ctrl+D', act: 'duplicate' },
      { t: 'Répéter\u2026', act: 'repeat' },
      { t: 'Diviser au curseur', sc: 'Alt+X', act: 'splitAtCursor' },
      SEP,
      { t: 'Muter', sc: 'M', act: 'mute' },
      { t: 'Fondu\u2026', sc: 'A', act: 'fade' },
      { t: 'Fondu enchaîné\u2026', sc: 'X', act: 'crossfade' },
      { t: 'Supprimer les fondus', act: 'removeFades' },
      { t: 'Réglages des fondus automatiques\u2026', act: 'autoFade' },
      SEP,
      { t: 'Traitement', items: [
        { t: 'Gain\u2026', act: 'process' }, { t: 'Normaliser\u2026', act: 'process' },
        { t: 'Fondu entrant', act: 'process' }, { t: 'Fondu sortant', act: 'process' },
        { t: 'Inverser la phase', act: 'process' }, { t: 'Silence', act: 'process' },
        { t: 'Supprimer le décalage DC', act: 'process' },
        SEP, { t: 'Détection des silences\u2026', act: 'detect' }, { t: 'Statistiques\u2026', act: 'stats' }
      ] },
      { t: 'Plug-ins', items: [
        { t: 'Reverb Space', act: 'plugins' }, { t: 'Compression Alpha', act: 'plugins' },
        { t: 'De-Esser Pro', act: 'plugins' }, { t: 'Channel EQ', act: 'plugins' },
        SEP, { t: 'Surround Panner\u2026', act: 'surround' }, { t: 'MixConvert\u2026', act: 'surround', a: 'converter' },
        { t: 'Informations sur les plug-ins\u2026', act: 'plugini' }
      ] },
      isMidi ? { t: 'Fonctions MIDI', items: [
        { t: 'Quantifier', act: 'quantize' }, { t: 'Quantize Setup\u2026', act: 'quantizeSetup' },
        { t: 'Transposer\u2026', act: 'transpose' }, { t: 'Vitesses\u2026', act: 'velocities' },
        { t: 'Dissoudre la partie', act: 'dissolvePart' }, { t: 'Éditeur logique MIDI\u2026', act: 'midiLogical' }
      ] } : { t: 'Audio Warp', items: [
        { t: 'Tempo matching\u2026', act: 'warp' }, { t: 'Straighten Up', act: 'warp' },
        { t: 'Marquer les hitpoints', act: 'hitpoints' }, { t: 'Aplatir le traitement', act: 'warp' }
      ] },
      SEP,
      { t: 'Renommer\u2026', act: 'renameEvent' },
      { t: 'Verrouiller\u2026', act: 'lock' },
      { t: 'Convertir en copie réelle', act: 'toRealCopy' },
      { t: 'Déplacer vers', items: [{ t: 'Plan avant', act: 'moveFront' }, { t: 'Plan arrière', act: 'moveBack' }] },
      { t: 'Sélectionner', items: [
        { t: 'Tous les événements de la piste', act: 'selectTrack' },
        { t: 'Dans la boucle', act: 'selectLoop' },
        { t: 'Suivant', act: 'nextSel' }, { t: 'Précédent', act: 'prevSel' }
      ] },
      SEP,
      { t: 'Propriétés\u2026', act: 'eventProps' }
    ], String(p.name).replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  }

  function trackMenu(x, y, t) {
    ctxMenu(x, y, [
      { t: 'Renommer\u2026', act: 'renameTrack', a: t.id },
      { t: 'Couleur de piste', items: COLORS.map((c) => ({ t: c[0], act: 'trackColor', a: t.id + '|' + c[1] + '|' + c[2] })) },
      { t: 'Hauteur de piste', items: H() },
      { t: 'Zoom vertical', items: [{ t: 'Zoom +', act: 'zoomVert', a: 1 }, { t: 'Zoom −', act: 'zoomVert', a: -1 }] },
      SEP,
      { t: 'Muter', sc: 'M', chk: 'track', field: 'mute', val: t.id, act: 'toggleTrack', a: 'mute|' + t.id },
      { t: 'Solo', sc: 'S', chk: 'track', field: 'solo', val: t.id, act: 'toggleTrack', a: 'solo|' + t.id },
      { t: 'Enregistrement', sc: 'R', chk: 'track', field: 'rec', val: t.id, act: 'toggleTrack', a: 'rec|' + t.id },
      { t: 'Écoute (monitor)', chk: 'track', field: 'mon', val: t.id, act: 'toggleTrack', a: 'mon|' + t.id },
      SEP,
      { t: 'Inserts\u2026', act: 'chan' },
      { t: 'Égaliseur\u2026', act: 'chan' },
      { t: 'Départs (FX)\u2026', act: 'chan' },
      { t: 'Réglages du canal', sc: 'E', act: 'chan' },
      { t: 'Ouvrir le Mixer', sc: 'F3', act: 'mix' },
      { t: 'Automatisation', items: [
        { t: 'Panneau d\u2019automatisation', sc: 'Alt+A', act: 'auto' },
        { t: 'Écrire l\u2019automatisation', chk: 'autoW', act: 'toggleAuto', a: 'autoW' },
        { t: 'Lire l\u2019automatisation', chk: 'autoR', act: 'toggleAuto', a: 'autoR' }
      ] },
      SEP,
      { t: 'Enregistrer comme modèle de piste\u2026', act: 'trackTemplateOut' },
      { t: 'Dupliquer les pistes', act: 'dupTrack', a: t.id },
      { t: 'Supprimer la piste', act: 'delTrack', a: t.id },
      { t: 'Retirer les pistes vides', act: 'removeEmpty' },
      { t: 'Masquer la piste', act: 'hideTrack', a: t.id },
      { t: 'Tout afficher', act: 'showAllTracks' },
      SEP,
      { t: 'Fondu automatique des événements', act: 'autoFade' },
      { t: 'Freeze de la piste', act: 'freeze' },
      { t: 'Désactiver la piste', act: 'disableTrack', a: t.id }
    ], t.name);
  }

  function bindContextMenus() {
    const vp = $('#lanes-vp');
    vp.addEventListener('contextmenu', (e) => {
      const part = e.target.closest('.part');
      const lane = e.target.closest('.lane');
      e.preventDefault();
      if (part) {
        const p = PARTS.filter((x) => x.id === part.dataset.part)[0];
        if (p) {
          if (!p.sel) { PARTS.forEach((x) => { x.sel = false; }); p.sel = true; state.selectedPart = p.id; state.selectedTrack = p.track; renderTracks(); renderLanes(); updateInfoLine(); }
          eventMenu(e.clientX, e.clientY, p);
        }
        return;
      }
      const tid = lane && lane.dataset.track;
      if (tid && trackById(tid) && trackById(tid).num) { trackMenu(e.clientX, e.clientY, trackById(tid)); return; }
      ctxMenu(e.clientX, e.clientY, [
        { t: 'Ajouter une piste', items: [
          { t: 'Audio', act: 'addTrack' }, { t: 'MIDI', act: 'addTrack' }, { t: 'Instrument', act: 'addTrack' },
          { t: 'Dossier', act: 'addTrack' }, { t: 'Groupe', act: 'addTrack' }, { t: 'FX', act: 'addFX' }
        ] },
        { t: 'Tout sélectionner', sc: 'Ctrl+A', act: 'selectAll' },
        { t: 'Désélectionner tout', sc: 'Ctrl+Maj+A', act: 'deselectAll' },
        SEP,
        { t: 'Grille', items: [
          { t: 'Barre', chk: 'grid', val: 'Barre', act: 'useGrid', a: 'Barre' },
          { t: 'Temps', chk: 'grid', val: 'Temps', act: 'useGrid', a: 'Temps' },
          { t: '1/8', chk: 'grid', val: '1/8', act: 'useGrid', a: '1/8' },
          { t: '1/16', chk: 'grid', val: '1/16', act: 'useGrid', a: '1/16' },
          SEP, { t: 'Activer l\u2019accrochage', sc: 'J', chk: 'snap', act: 'snap' }
        ] },
        { t: 'Zoom plein', act: 'zoomFull' },
        { t: 'Zoom sur la boucle', act: 'zoomLoop' },
        SEP,
        { t: 'Panneau d\u2019automatisation', act: 'auto' },
        { t: 'Mixer', sc: 'F3', act: 'mix' },
        { t: 'Pool', sc: 'Ctrl+P', act: 'pool' }
      ], 'Zone de montage');
    });
    $('#tracklist-vp').addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-track]');
      if (!row) return;
      e.preventDefault();
      const t = trackById(row.dataset.track);
      if (!t) return;
      if (!t.num) {
        ctxMenu(e.clientX, e.clientY, [
          { t: 'Ouvrir / fermer le dossier', act: 'toggleFolder', a: t.id },
          { t: 'Renommer\u2026', act: 'renameTrack', a: t.id },
          { t: 'Ajouter une piste dans le dossier', act: 'addTrack' },
          SEP,
          { t: 'Tout afficher', act: 'showAllTracks' }
        ], t.name);
        return;
      }
      if (row.dataset.track !== state.selectedTrack) selectTrack(row.dataset.track);
      trackMenu(e.clientX, e.clientY, t);
    });
    $('#ruler-vp').addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      rulerMenu(e.clientX, e.clientY, state.fmt);
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });
  }

  function bindToolbar() {
    const CURSORS = {
      pointer: '', range: 'cell', split: 'crosshair', glue: 'alias', erase: 'not-allowed',
      zoom: 'zoom-in', mute: 'not-allowed', draw: 'crosshair', audition: 'pointer',
      line: 'crosshair', color: 'copy', warp: 'ew-resize'
    };
    const setTool = (tool) => {
      state.tool = tool;
      updateStatus();
      $('#lanes-inner').style.cursor = CURSORS[tool] || '';
      $('#sbStatus').textContent = 'Outil : ' + (state.tools[tool] || tool);
    };

    $('#toolGroup').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]');
      if (!b) return;
      const tool = b.dataset.tool;
      /* second clic sur un outil à sous-modes : menu déroulant (Nuendo 4, p. 48 et 236) */
      if (b.classList.contains('has-sub') && state.tool === tool) {
        const r = b.getBoundingClientRect();
        toolPopup(r.left, r.bottom + 3, tool);
        return;
      }
      if (state.tool === tool && tool === 'pointer') {
        /* second clic sur la flèche : les trois modes de redimensionnement (p. 48) */
        const r = b.getBoundingClientRect();
        ctxMenu(r.left, r.bottom + 3, [
          { t: 'Normal Sizing — le contenu reste fixe', chk: 'rm', val: 'normal', act: 'setResize', a: 'normal' },
          { t: 'Sizing Moves Contents — le contenu suit', chk: 'rm', val: 'contents', act: 'setResize', a: 'contents' },
          { t: 'Sizing Applies Time Stretch — étirement', chk: 'rm', val: 'stretch', act: 'setResize', a: 'stretch' }
        ], 'Mode de redimensionnement');
        return;
      }
      setTool(tool);
    });

    function toolPopup(x, y, tool) {
      if (tool === 'line') {
        ctxMenu(x, y, ['Line', 'Parabola', 'Sine', 'Triangle', 'Square'].map((m) => ({
          t: m + (m === 'Line' ? ' — mode par défaut' : ''), chk: 'lm', val: m, act: 'setLine', a: m
        })), 'Modes du Line tool');
      }
    }

    $('#btnSnap').addEventListener('click', () => {
      state.snap = !state.snap;
      updateStatus();
      $('#sbStatus').textContent = state.snap ? 'Accrochage activé : ' + state.snapMode + ' · ' + state.grid : 'Accrochage désactivé';
    });
    $('#btnSnapZero').addEventListener('click', () => {
      state.snapZero = !state.snapZero; updateStatus();
      toast('Snap to Zero Crossings ' + (state.snapZero ? 'activé : coupes et redimensionnements se font aux passages par zéro (pas de clic)' : 'désactivé') +
        '. Le réglage vaut pour toutes les fenêtres et tous les projets ouverts.', 'Accrochage');
    });
    $('#btnConstrain').addEventListener('click', () => {
      state.constrain = !state.constrain; updateStatus();
      toast('Contrainte de compensation de retard ' + (state.constrain ? 'activée : la latence des plug-ins est réduite au minimum pendant l’enregistrement' : 'désactivée') +
        '. Seuls les plug-ins dépassant le seuil de préférences sont concernés.', 'Latence');
    });
    $('#btnInfoLine').addEventListener('click', () => ACTIONS.toggleInfoline());
    $('#btnInspector').addEventListener('click', () => ACTIONS.toggleInspector());
    $('#btnOverview').addEventListener('click', () => ACTIONS.toggleOverview());
    $('#btnToolbarSetup').addEventListener('click', (e) => { e.stopPropagation(); toolbarSetup(e.clientX, e.clientY); });

    $('#comboGrid').addEventListener('click', () => {
      const opts = Object.keys(state.gridSteps);
      state.grid = opts[(opts.indexOf(state.grid) + 1) % opts.length];
      updateStatus();
      $('#sbStatus').textContent = 'Grille d’accrochage : ' + state.grid;
    });

    $('#comboSnapMode').addEventListener('click', (e) => {
      const MODES = ['Grille', 'Grille relative', 'Événements', 'Curseur magnétique', 'Shuffle',
        'Grille + curseur', 'Événements + curseur', 'Événements + grille + curseur'];
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, MODES.map((m) => ({ t: m, chk: 'sm', val: m, act: 'setSnapMode', a: m })), 'Mode d’accrochage');
    });

    $('#comboQuant').addEventListener('click', (e) => {
      const Q = ['1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/4 T', '1/8 T', '1/16 T'];
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, Q.map((q) => ({ t: q, chk: 'qm', val: q, act: 'setQuant', a: q })), 'Valeur de quantification');
    });

    $('#comboAutoMode').addEventListener('click', (e) => {
      const M = ['Auto-Latch', 'Touch', 'Latch', 'Cross-Over', 'Trim/Relatif', 'Remplacer'];
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, M.map((m) => ({ t: m, chk: 'am', val: m, act: 'setAutoMode', a: m })), 'Mode d’automatisation');
    });

    $('#comboRoot').addEventListener('click', (e) => {
      const K = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, K.map((k) => ({ t: k, chk: 'rk', val: k, act: 'setRoot', a: k })), 'Fondamentale du projet');
    });

    $('#comboColor').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, COLORS.map((c, i) => ({ t: c[0], chk: 'cc', val: String(i), act: 'setColorIdx', a: i })), 'Couleur de piste');
    });

    $('#comboZoom').addEventListener('click', () => {
      const presets = [32, 64, 96, 128];
      const cur = state.barW;
      const next = presets[(presets.indexOf(cur) + 1) % presets.length] || 64;
      setBarW(next);
    });
    $('#btnZoomIn').addEventListener('click', () => zoom(1));
    $('#btnZoomOut').addEventListener('click', () => zoom(-1));

    $('#btnCycle').addEventListener('click', toggleCycle);
    $('#btnPunchIn').addEventListener('click', () => { state.punchIn = !state.punchIn; updateStatus(); $('#sbStatus').textContent = 'Punch In ' + (state.punchIn ? 'activé' : 'désactivé'); });
    $('#btnPunchOut').addEventListener('click', () => { state.punchOut = !state.punchOut; updateStatus(); $('#sbStatus').textContent = 'Punch Out ' + (state.punchOut ? 'activé' : 'désactivé'); });
    $('#btnAutoScroll').addEventListener('click', () => {
      state.autoScroll = !state.autoScroll;
      updateStatus();
      $('#sbStatus').textContent = 'Défilement automatique ' + (state.autoScroll ? 'activé' : 'désactivé');
    });

    $('#btnNudgeL').addEventListener('click', () => nudgeParts(-1));
    $('#btnNudgeR').addEventListener('click', () => nudgeParts(1));
    $('#btnSettings').addEventListener('click', () => WIN('layout'));
    const rzM = $('#rzMediabay'), rzP = $('#rzPool');
    if (rzM) rzM.addEventListener('click', () => WIN('mediabay'));
    if (rzP) rzP.addEventListener('click', () => WIN('pool'));
    $('#btnHelp').addEventListener('click', openAbout);

    /* clic droit sur la barre d'outils : menu de personnalisation (Nuendo 4, p. 506) */
    $('#toolbar').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toolbarSetup(e.clientX, e.clientY);
    });
  }

  /* --- configuration de la barre d'outils (Setup dialog, p. 506) --- */
  const TOOLBAR_ITEMS = [
    ['tools', 'Outils du projet'], ['snap', 'Accrochage + grille'], ['snapMode', 'Mode d’accrochage'],
    ['quant', 'Valeur de quantize'], ['zero', 'Snap to Zero Crossings'], ['constrain', 'Contrainte de retard'],
    ['panels', 'Afficher/masquer les panneaux'], ['automode', 'Mode d’automatisation'],
    ['root', 'Fondamentale du projet'], ['color', 'Couleur de piste'], ['zoom', 'Zoom + facteur'],
    ['nudge', 'Nudge'], ['cycle', 'Cycle / Punch'], ['autoscroll', 'Défilement automatique']
  ];
  const TOOLBAR_HIDDEN = [];
  function toolbarSetup(x, y) {
    const items = TOOLBAR_ITEMS.map(([k, n]) => ({
      t: n, chk: 'tbi', val: k, act: 'toggleToolbarItem', a: k
    }));
    ctxMenu(x, y, [
      { t: 'Tout afficher', act: 'toolbarShowAll' },
      { t: 'Par défaut', act: 'toolbarDefault' },
      SEP,
      { t: 'Éléments de la barre', items: items },
      SEP,
      { t: 'Setup… (Configuration des éléments)', act: 'layout' }
    ], 'Barre d’outils');
  }

  /* masque/affiche les éléments configurables de la barre d'outils (Setup, p. 506) */
  function applyToolbarItems() {
    const MAP = {
      snapMode: '#comboSnapMode', quant: '#comboQuant', zero: '#btnSnapZero',
      constrain: '#btnConstrain', automode: '#comboAutoMode', root: '#comboRoot',
      color: '#comboColor', nudge: '#nudgeGrp', autoscroll: '#btnAutoScroll'
    };
    Object.keys(MAP).forEach((k) => {
      const el = $(MAP[k]);
      if (el) el.style.display = TOOLBAR_HIDDEN.indexOf(k) >= 0 ? 'none' : '';
    });
    const sz = $('#toolbar');
    if (sz) sz.dataset.hidden = TOOLBAR_HIDDEN.join(',');
  }

  function nudgeParts(dir) {
    const sel = PARTS.filter((p) => p.sel);
    if (!sel.length) { toast('Sélectionnez d’abord des événements à décaler.', 'Nudge'); return; }
    const step = state.snap ? (state.gridSteps[state.grid] || 1) : 0.25;
    sel.forEach((p) => { p.start = Math.max(1, p.start + dir * step); });
    renderLanes(); renderOverview(); updateInfoLine();
    $('#sbStatus').textContent = 'Nudge ' + (dir < 0 ? 'gauche' : 'droite') + ' : ' + fmtPos(sel[0].start);
  }

  function bindTransport() {
    $('#tpClose').addEventListener('click', toggleTransport);
    $('#tpRtz').addEventListener('click', () => setPos(1));
    $('#tpRew').addEventListener('click', () => setPos(state.pos - 4));
    $('#tpFf').addEventListener('click', () => setPos(state.pos + 4));
    $('#tpEnd').addEventListener('click', () => setPos(61));
    $('#tpCycleBtn').addEventListener('click', toggleCycle);
    $('#tpStop').addEventListener('click', () => ACTIONS.stop());
    $('#tpPlay').addEventListener('click', () => ACTIONS.play());
    $('#tpRec').addEventListener('click', () => ACTIONS.record());
    $('#tpClick').addEventListener('click', toggleClick);
    $('#tpSync').addEventListener('click', () => { state.sync = !state.sync; updateStatus(); $('#sbStatus').textContent = 'Synchronisation ' + (state.sync ? 'activée' : 'désactivée') + ' (MIDI/Timecode — étape 2)'; });
    $('#tpAutoR').addEventListener('click', () => { state.autoR = !state.autoR; updateStatus(); });
    $('#tpAutoW').addEventListener('click', () => { state.autoW = !state.autoW; updateStatus(); });
    $('#tpPunchIn').addEventListener('click', () => { state.punchIn = !state.punchIn; updateStatus(); });
    $('#tpPunchOut').addEventListener('click', () => { state.punchOut = !state.punchOut; updateStatus(); });

    /* ---- lot 8 : marqueurs, jog, pre/post-roll, modes ---- */
    const bindBtn = (sel, fn, arg) => { const el = $(sel); if (el) el.addEventListener('click', () => fn(arg)); };
    bindBtn('#tpPrevMk', () => ACTIONS.prevMarker());
    bindBtn('#tpNextMk', () => ACTIONS.nextMarker());
    bindBtn('#tpMarkers', () => ACTIONS.showMarkers());
    bindBtn('#tpKeepVis', () => { state.keepVis = !state.keepVis; $('#tpKeepVis').classList.toggle('on', state.keepVis); });
    bindBtn('#tpAutoQBtn', () => { state.autoQ = !state.autoQ; $('#tpAutoQBtn').classList.toggle('on', state.autoQ); $('#tpAutoQ').classList.toggle('on', state.autoQ); });
    bindBtn('#tpTempoMode', () => {
      state.tempoMode = state.tempoMode === 'track' ? 'fixed' : 'track';
      $('#tpTempoMode').innerHTML = '<span style="font-size:8px">' + (state.tempoMode === 'fixed' ? 'FIX' : 'TRK') + '</span>';
      $('#tpTempoMode').classList.toggle('on', state.tempoMode === 'track');
      $('#sbStatus').textContent = 'Tempo : ' + (state.tempoMode === 'fixed' ? 'fixe (une seule valeur)' : 'piste de tempo (TRACK)');
    });
    $('#tpRecMode').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, ['Remplacer', 'Conserver', 'Prises'].map((m) => ({ t: m, act: 'setRecMode', a: m })), 'Mode d’enregistrement');
    });
    $('#tpCycleRec').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      ctxMenu(r.left, r.bottom + 2, ['Mix', 'Remplacer', 'Conserver'].map((m) => ({ t: m, chk: 'cr', val: m, act: 'setCycleRec', a: m })), 'Enregistrement en cycle');
    });
    const cycleVal = (el, fn) => {
      el.addEventListener('click', () => {
        const cur = parseFloat(el.querySelector('b').textContent) || 0;
        fn(Math.min(10, Math.round((cur + 1) * 10) / 10));
      });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); fn(0); });
    };
    cycleVal($('#tpPre'), (v) => ACTIONS.setPre(v));
    cycleVal($('#tpPost'), (v) => ACTIONS.setPost(v));
    $('#tpPre').title = 'Pré-roll — clic : +1 s, clic droit : 0 s';
    $('#tpPost').title = 'Post-roll — clic : +1 s, clic droit : 0 s';

    /* jog / shuttle */
    const jog = $('#tpJogWheel');
    if (jog) {
      let jd = null;
      jog.addEventListener('pointerdown', (e) => {
        jd = { x: e.clientX, p: state.pos };
        jog.setPointerCapture(e.pointerId);
        jog.classList.add('grab');
      });
      jog.addEventListener('pointermove', (e) => {
        if (!jd) return;
        const d = (e.clientX - jd.x);
        ACTIONS.setJog(d / 120);
        setPos(jd.p + d / 90, true);
        updateCursor();
      });
      const jup = () => { jd = null; jog.classList.remove('grab'); };
      jog.addEventListener('pointerup', jup);
      jog.addEventListener('pointercancel', jup);
    }
    $('#tpJog').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      [0.25, 0.5, 1, 2, 4].forEach(() => {});
      ctxMenu(r.left, r.bottom + 2, [0.25, 0.5, 1, 2, 4].map((v) => ({
        t: 'Shuttle ' + String(v).replace('.', ',') + '×', act: 'jogShuttle', a: v
      })), 'Jog / Shuttle');
    });

    /* déplacement du panneau */
    const tp = $('#transport');
    const head = tp.querySelector('.tp-head');
    let drag = null;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = tp.getBoundingClientRect();
      tp.style.transform = 'none';
      tp.style.left = r.left + 'px';
      tp.style.top = r.top + 'px';
      tp.style.bottom = 'auto';
      drag = { x: e.clientX - r.left, y: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const w = tp.offsetWidth, h = tp.offsetHeight;
      const L = Math.min(Math.max(0, e.clientX - drag.x), window.innerWidth - w);
      const T = Math.min(Math.max(31, e.clientY - drag.y), window.innerHeight - h - 23);
      tp.style.left = L + 'px';
      tp.style.top = T + 'px';
    });
    const stopDrag = () => { drag = null; };
    head.addEventListener('pointerup', stopDrag);
    head.addEventListener('pointercancel', stopDrag);

    window.addEventListener('resize', () => {
      const r = tp.getBoundingClientRect();
      if (r.left < -10 || r.right > window.innerWidth + 10 || r.top > window.innerHeight - 40) {
        tp.style.transform = 'none';
        tp.style.left = Math.max(0, Math.round((window.innerWidth - tp.offsetWidth) / 2)) + 'px';
        tp.style.top = Math.max(31, window.innerHeight - tp.offsetHeight - 40) + 'px';
        tp.style.bottom = 'auto';
      }
    });
  }

  function bindInspector() {
    $('#inspector').addEventListener('click', (e) => {
      const h = e.target.closest('.sect-h');
      if (h && !e.target.closest('button')) {
        const sect = h.parentElement;
        const all = Array.prototype.slice.call(document.querySelectorAll('#inspector .sect'));
        if (e.altKey) {
          /* Alt + clic : montre ou masque toutes les sections (manuel p. 26) */
          const anyClosed = all.some((x) => !x.classList.contains('open'));
          all.forEach((x) => x.classList.toggle('open', anyClosed));
        } else if (e.ctrlKey || e.metaKey) {
          /* Ctrl + clic : masque / montre cette section seulement */
          sect.classList.toggle('open');
        } else {
          /* clic simple : ouvre la section et referme les autres */
          all.forEach((x) => x.classList.toggle('open', x === sect));
        }
        return;
      }
      const lite = e.target.closest('.slot-lite');
      if (lite) { lite.classList.toggle('on'); return; }
      const eq = e.target.closest('.eq-l');
      if (eq) { eq.classList.toggle('on'); }
    });

    const toggleOnTrack = (field) => {
      const t = trackById(state.selectedTrack);
      if (!t) return;
      t[field] = !t[field];
      renderTracks(); renderLanes(); updateInspector(); updateCursor();
    };
    /* menu contextuel de l'Inspecteur : Tout afficher / Par défaut / Setup… (manuel p. 506) */
    $('#inspector').addEventListener('click', (e) => {
      const h = e.target.closest('.sect-h');
      if (!h) return;
      const sect = h.parentElement;
      if (e.ctrlKey || e.metaKey) {
        const all = $$('#inspector .sect');
        const open = sect.classList.contains('open');
        all.forEach((x) => x.classList.toggle('open', x === sect ? !open : false));
        $('#sbStatus').textContent = 'Inspecteur : Ctrl+clic sur une section ouvre celle-ci et replie les autres';
        return;
      }
      sect.classList.toggle('open');
    });
    $('#inspector').addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.sect-h, #inspHead')) return;
      e.preventDefault();
      const old = document.getElementById('inspCtx');
      if (old) old.remove();
      const m = document.createElement('div');
      m.id = 'inspCtx';
      m.innerHTML = '<div data-ic="all">Tout afficher</div><div data-ic="def">Par défaut</div>' +
        '<div data-ic="setup">Setup…</div><div class="sep"></div><div data-ic="layout">Configurer les panneaux…</div>';
      m.style.cssText = 'position:fixed;z-index:9000;background:linear-gradient(#4a4f54,#3a3f44);border:1px solid #22262a;' +
        'border-radius:3px;padding:3px;box-shadow:0 6px 18px rgba(0,0,0,.55);font:9px/1.5 Verdana,Tahoma,sans-serif;color:#e2e7ea;min-width:170px';
      m.querySelectorAll('div').forEach((d) => {
        d.style.cssText = 'padding:3px 10px;border-radius:2px;cursor:default' + (d.className === 'sep' ? ';height:0;padding:0;border-top:1px solid #5c6268;margin:3px 4px' : '');
        if (d.className !== 'sep') {
          d.addEventListener('mouseenter', () => { d.style.background = '#3f6c98'; });
          d.addEventListener('mouseleave', () => { d.style.background = 'transparent'; });
        }
      });
      const r = document.getElementById('inspector').getBoundingClientRect();
      m.style.left = Math.min(window.innerWidth - 190, r.left + 20) + 'px';
      m.style.top = Math.min(window.innerHeight - 120, Math.max(28, r.top + 40)) + 'px';
      document.body.appendChild(m);
      const close = () => { m.remove(); document.removeEventListener('mousedown', out, true); };
      const out = (ev) => { if (!m.contains(ev.target)) close(); };
      document.addEventListener('mousedown', out, true);
      m.addEventListener('click', (ev) => {
        const k = ev.target.dataset.ic;
        if (!k) return;
        if (k === 'all') {
          document.querySelectorAll('#inspector .sect').forEach((x) => x.classList.add('open'));
          toast('Inspecteur : toutes les sections sont affichées.', 'Inspecteur');
        } else if (k === 'def') {
          document.querySelectorAll('#inspector .sect').forEach((x, i) => x.classList.toggle('open', i < 7));
          toast('Inspecteur : disposition par défaut rétablie.', 'Inspecteur');
        } else if (k === 'setup' || k === 'layout') {
          WIN('layout', 'inspector');
        }
        close();
      });
    });

    $('#inspM').addEventListener('click', () => toggleOnTrack('mute'));
    $('#inspS').addEventListener('click', () => toggleOnTrack('solo'));
    $('#inspR').addEventListener('click', () => toggleOnTrack('rec'));
    $$('#inspector [data-qcm]').forEach((k) => {
      let d = null;
      k.addEventListener('pointerdown', (e) => { d = { y: e.clientY, a: parseFloat(k.style.getPropertyValue('--a')) || 135 }; k.setPointerCapture(e.pointerId); });
      k.addEventListener('pointermove', (e) => {
        if (!d) return;
        const v = Math.max(0, Math.min(270, d.a + (d.y - e.clientY) * 2));
        k.style.setProperty('--a', v + 'deg');
      });
      const up = () => { d = null; };
      k.addEventListener('pointerup', up);
      k.addEventListener('pointercancel', up);
    });
    if ($('#btnQcSetup')) $('#btnQcSetup').addEventListener('click', () => WIN('qcontrols', state.selectedTrack));
    if ($('#btnQcLearn')) $('#btnQcLearn').addEventListener('click', () => toast('Apprendre : cliquez un bouton Quick Controls de l’inspecteur puis bougez le contrôleur.', 'Quick Controls'));
    if ($('#btnMidiMods')) $('#btnMidiMods').addEventListener('click', () => WIN('midimods'));
    $('#btnChanSettings').addEventListener('click', () => WIN('channel', state.selectedTrack));
    $('#btnOpenMix').addEventListener('click', ACTIONS.mix);

    $('#infoName').addEventListener('change', (e) => {
      const p = PARTS.find((x) => x.id === state.selectedPart);
      if (!p) return;
      p.name = e.target.value || p.name;
      renderLanes();
      updateCursor();
    });
    $('#infoName').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  }

  function bindZoom() {
    const set = (v) => setBarW(v);
    window.addEventListener('resize', () => { renderOverview(); syncScroll(); });
    return set;
  }

  function setBarW(next) {
    const vp = $('#lanes-vp');
    const old = state.barW;
    const centerBar = (vp.scrollLeft + vp.clientWidth / 2) / old;
    state.barW = Math.min(176, Math.max(26, next));
    document.documentElement.style.setProperty('--bar-w', state.barW + 'px');
    renderRuler();
    renderLanes();
    renderOverview();
    updateStatus();
    updateCursor();
    vp.scrollLeft = Math.max(0, centerBar * state.barW - vp.clientWidth / 2);
    syncScroll();
  }
  function zoom(dir) {
    setBarW(dir > 0 ? state.barW * 1.25 : state.barW / 1.25);
  }

  /* ------------------------------------------------------------ CLAVIER */
  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        closeAbout();
        $$('.menu').forEach((m) => m.classList.remove('open'));
        if (window.ALPHAWIN && window.ALPHAWIN.REG) {
          Object.keys(window.ALPHAWIN.REG).forEach((k) => {
            const w = window.ALPHAWIN.REG[k];
            if (w.maxed) { window.ALPHAWIN.open(k); w.el.classList.remove('max'); w.maxed = false; }
          });
        }
        return;
      }
      /* raccourcis personnalisés (Commandes clavier) */
      const mods = [];
      if (e.ctrlKey || e.metaKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Maj');
      let kk = e.key;
      if (kk === ' ') kk = 'Espace';
      if (kk.length === 1) kk = kk.toUpperCase();
      const comboStr = mods.concat([kk]).join('+');
      if (keymap[comboStr] && ACTIONS[keymap[comboStr]]) {
        e.preventDefault();
        ACTIONS[keymap[comboStr]]();
        return;
      }
      /* espaces de travail : Alt + 1…9 / Alt+0 */
      if (e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (e.key === '0') { if (window.ALPHAWIN) window.ALPHAWIN.WS.locked = !window.ALPHAWIN.WS.locked; toast('Espace de travail ' + (window.ALPHAWIN.WS.locked ? 'verrouillé' : 'déverrouillé') + '.', 'Espaces de travail'); return; }
        if (window.ALPHAWIN && window.ALPHAWIN.recallWorkspace(+e.key)) return;
        toast('Aucun espace de travail n° ' + e.key + '. Ouvrez <b>Fenêtres \u25b8 Espaces de travail</b> pour en mémoriser un.', 'Espaces de travail');
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); openAbout(); return; }
      if (e.key === 'F2') { e.preventDefault(); toggleTransport(); return; }
      if (e.key === 'F3') { e.preventDefault(); ACTIONS.mix(); return; }
      if (e.key === 'F4') { e.preventDefault(); ACTIONS.conns(); return; }
      if (e.key === 'F5') { e.preventDefault(); ACTIONS.mediabay(); return; }
      if (e.key === 'F6') { e.preventDefault(); ACTIONS.loops(); return; }
      if (e.key === 'F7') { e.preventDefault(); ACTIONS.sounds(); return; }
      if (e.key === 'F8') { e.preventDefault(); ACTIONS.video(); return; }
      if (e.key === 'F11') { e.preventDefault(); ACTIONS.vstinstr(); return; }
      if (e.key === 'F12') { e.preventDefault(); ACTIONS.perf(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); ACTIONS.markers(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); ACTIONS.browser(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 't' || e.key === 'T')) { e.preventDefault(); ACTIONS.tempo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); ACTIONS.toggleInfoline(); return; }
      if (e.altKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); ACTIONS.toggleInspector(); return; }
      if (e.altKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); ACTIONS.toggleOverview(); return; }
      if (e.altKey && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); ACTIONS.layout(); return; }
      if (e.shiftKey && (e.key === 'S' || e.key === 's') && !e.ctrlKey && !e.altKey) { e.preventDefault(); ACTIONS.setup(); return; }
      if (e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); ACTIONS.mediabay(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); ACTIONS.pool(); return; }
      if (e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); ACTIONS.auto(); return; }
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (plain && (e.key === 'w' || e.key === 'W')) { ACTIONS.workspaces(); return; }
      if (plain && (e.key === 'e' || e.key === 'E')) { ACTIONS.chan(); return; }
      if (plain && (e.key === 'x' || e.key === 'X')) { ACTIONS.crossfade(); return; }
      if (plain && (e.key === 'a' || e.key === 'A')) { ACTIONS.fade(); return; }
      /* --- édition réelle (lots 6 et 7) --- */
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoOnce(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); ACTIONS.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); ACTIONS.selectAll(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); ACTIONS.copy(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) { e.preventDefault(); ACTIONS.cut(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) { e.preventDefault(); ACTIONS.paste(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); ACTIONS.duplicate(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) { e.preventDefault(); ACTIONS.toggleCycle(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ACTIONS.del(); return; }
      if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACTIONS.prevMarker(); return; }
      if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACTIONS.nextMarker(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeParts(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeParts(1); return; }
      if (plain && (e.key === 'p' || e.key === 'P')) { ACTIONS.prevMarker(); return; }
      if (plain && (e.key === 'n' || e.key === 'N')) { ACTIONS.nextMarker(); return; }
      if (plain && (e.key === 's' || e.key === 'S')) { ACTIONS.splitAtCursor(); return; }
      if (plain && (e.key === 'm' || e.key === 'M')) { ACTIONS.mute(); return; }
      if (plain && (e.key === 'b' || e.key === 'B')) { ACTIONS.enlargeSelected(); return; }
      if (e.key === ' ') { e.preventDefault(); ACTIONS.play(); return; }
      if (e.key === 'Home') { e.preventDefault(); setPos(1); return; }
      if (e.key === 'End') { e.preventDefault(); setPos(61); return; }
      if (e.key === '+' || e.key === '=') { zoom(1); return; }
      if (e.key === '-') { zoom(-1); return; }
      if (e.key === 'j' || e.key === 'J') { state.snap = !state.snap; updateStatus(); return; }
      if (e.key === '/') { toggleCycle(); return; }
      if (e.key === 'c' || e.key === 'C') { toggleClick(); return; }
      if (e.key === '0') { ACTIONS.stop(); return; }
      if (e.key === '*') { ACTIONS.record(); return; }
      if (/^[1-9]$/.test(e.key)) {
        const map = ['pointer', 'range', 'split', 'glue', 'erase', 'zoom', 'mute', 'draw', 'audition'];
        state.tool = map[parseInt(e.key, 10) - 1];
        updateStatus();
        $('#sbStatus').textContent = 'Outil : ' + state.tools[state.tool];
      }
    });
  }

  /* --------------------------------------------------------------- INIT */
  function initBindings() {
    renderMenus();
    bindOverview();
    bindWorkspace();
    bindTlScroll();
    bindToolbar();
    bindTransport();
    bindInspector();
    bindRuler();
    bindContextMenus();
    bindKeys();
    $('#aboutClose').addEventListener('click', closeAbout);
    $('#aboutOk').addEventListener('click', closeAbout);
    $('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeAbout(); });
    const nativeWindow = (command) => {
      const bridge = window.ALPHA_NATIVE;
      if (bridge && typeof bridge.send === 'function') { bridge.send(command); return true; }
      return false;
    };
    $('#btnQuit').addEventListener('click', () => {
      if (nativeWindow('quit')) return;
      toast('Fermeture désactivée : ce prototype d\u2019interface reste ouvert. Fermez l\u2019onglet pour quitter.', 'ALPHA Studio');
    });
    $$('#titlebar .winbtn').forEach((b) => {
      if (b.id === 'btnQuit') return;
      b.addEventListener('click', () => {
        const command = b.dataset.alphaCommand;
        if (command && nativeWindow(command)) return;
        toast('Gestion de fenêtres simulée dans le prototype.');
      });
    });
  }

  function init() {
    initBindings();
    applyPanels();
    renderRuler();
    renderTracks();
    renderLanes();
    renderOverview();
    updateInspector();
    updateInfoLine();
    updateLcd();
    updateStatus();
    syncScroll();
    $('#lanes-inner').style.cursor = '';

    /* petit accueil discret */
    setTimeout(() => {
      toast('Fenêtres disponibles : <b>F3</b> Mixer · <b>F6</b> Panneau d’automatisation · double-clic sur un événement = éditeur · <b>Alt+B</b> MediaBay.', 'Bienvenue dans ALPHA Studio');
    }, 700);
  }

  /* ------------------------------------------------------- API publique */
  window.ALPHA = {
    TRACKS: TRACKS, PARTS: PARTS, MARKERS: MARKERS, state: state,
    MENUS: MENUS, MENU_STUBS: MENU_STUBS,
    trackById: trackById, visibleTracks: visibleTracks,
    wavePath: wavePath, midiNotes: midiNotes, dbToPct: dbToPct,
    fmtDb: fmtDb, fmtPos: fmtPos, fmtTime: fmtTime, fmtTc: fmtTc,
    showToast: toast,
    ACTIONS: ACTIONS,
    selectPart: (id, add) => selectPart(id, add),
    setPanel: setPanel, getPanels: getPanels, applyPanels: applyPanels, setInspectorSection: setInspectorSection,
    TRACKS: TRACKS,
    TRACK_CTL: TRACK_CTL,
    renderTracksNow: () => { renderTracks(); renderLanes(); renderOverview(); updateCursor(); },
    editing: { removeParts: removeParts, splitAt: splitAt, nudgeParts: nudgeParts, undoOnce: undoOnce,
               toolbarSetup: toolbarSetup, rulerMenu: rulerMenu, applyToolbarItems: applyToolbarItems },
    state: state,
    tools: { setBarW: setBarW },
    keymap: keymap,
    setKey: (combo, action, oldCombo) => {
      if (oldCombo && keymap[oldCombo] === action) delete keymap[oldCombo];
      keymap[combo] = action;
    },
    setStatus: (t) => { const el = $('#sbStatus'); if (el) el.textContent = t; },
    setWorkspaceLabel: (t) => { const el = $('#sbWorkspace'); if (el) el.textContent = t || '—'; },
    getProjectLayout: () => ({
      barW: state.barW,
      scrollLeft: $('#lanes-vp').scrollLeft,
      scrollTop: $('#lanes-vp').scrollTop,
      pos: state.pos,
      selected: state.selectedTrack
    }),
    applyProjectLayout: (l) => {
      if (!l) return;
      setBarW(l.barW || 64);
      const vp = $('#lanes-vp');
      vp.scrollLeft = l.scrollLeft || 0;
      vp.scrollTop = l.scrollTop || 0;
      state.pos = l.pos || 1;
      if (l.selected) state.selectedTrack = l.selected;
      renderTracks(); renderLanes(); renderOverview(); updateInspector(); updateInfoLine(); updateCursor(); updateStatus();
    },
    goto: (p) => { setPos(p); $('#sbStatus').textContent = 'Position : ' + fmtPos(state.pos); },
    setPlayhead: setPlayhead,
    refresh: () => {
      renderTracks(); renderLanes(); renderOverview();
      updateInspector(); updateInfoLine(); updateCursor(); updateStatus();
      if (window.ALPHAWIN && window.ALPHAWIN.REG) {
        const n = Object.keys(window.ALPHAWIN.REG).length;
        const el = $('#sbWins'); if (el) el.textContent = n;
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
