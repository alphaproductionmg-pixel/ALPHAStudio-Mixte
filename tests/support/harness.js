/* Faux navigateur, faux AudioContext et faux DOM pour les tests J1 sans npm. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.resolve(__dirname, '../../UI/AlphaStudio/src');

class AudioParamMock {
  constructor(value) {
    this.value = value;
    this.events = [];
  }
  setValueAtTime(value, time) { this.events.push(['set', value, time]); this.value = value; return this; }
  linearRampToValueAtTime(value, time) { this.events.push(['linear', value, time]); this.value = value; return this; }
  exponentialRampToValueAtTime(value, time) { this.events.push(['exponential', value, time]); this.value = value; return this; }
  setTargetAtTime(value, time, constant) { this.events.push(['target', value, time, constant]); this.value = value; return this; }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); return this; }
}

class NodeMock {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
  }
  connect(destination) { this.connections.push(destination); return destination; }
  disconnect() { this.disconnected = true; this.connections.length = 0; }
}

class GainMock extends NodeMock {
  constructor() { super('gain'); this.gain = new AudioParamMock(1); }
}
class AnalyserMock extends NodeMock {
  constructor() {
    super('analyser');
    this.fftSize = 512;
    this.samples = new Float32Array(this.fftSize);
  }
  getFloatTimeDomainData(target) {
    const n = Math.min(target.length, this.samples.length);
    for (let i = 0; i < n; i++) target[i] = this.samples[i];
  }
}
class OscMock extends NodeMock {
  constructor() {
    super('oscillator');
    this.type = 'sine';
    this.frequency = new AudioParamMock(440);
    this.detune = new AudioParamMock(0);
    this.starts = [];
    this.stops = [];
    this.onended = null;
  }
  start(time) { this.starts.push(time); }
  stop(time) { this.stops.push(time); }
}
class BufferSourceMock extends NodeMock {
  constructor() {
    super('buffer-source');
    this.buffer = null;
    this.loop = false;
    this.starts = [];
    this.stops = [];
    this.onended = null;
  }
  start(time, offset) { this.starts.push([time, offset]); }
  stop(time) { this.stops.push(time); }
}
class FilterMock extends NodeMock {
  constructor() {
    super('filter');
    this.type = 'lowpass';
    this.frequency = new AudioParamMock(1000);
    this.Q = new AudioParamMock(1);
  }
}
class PannerMock extends NodeMock {
  constructor() { super('panner'); this.pan = new AudioParamMock(0); }
}

class AudioContextMock {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'suspended';
    this.destination = new NodeMock('destination');
    this.nodes = [];
    this.oscillators = [];
    this.bufferSources = [];
    this.gains = [];
    this.analysers = [];
    this.closed = false;
    AudioContextMock.instances.push(this);
  }
  _add(node) { this.nodes.push(node); return node; }
  createGain() { const n = this._add(new GainMock()); this.gains.push(n); return n; }
  createAnalyser() { const n = this._add(new AnalyserMock()); this.analysers.push(n); return n; }
  createOscillator() { const n = this._add(new OscMock()); this.oscillators.push(n); return n; }
  createBufferSource() { const n = this._add(new BufferSourceMock()); this.bufferSources.push(n); return n; }
  createBiquadFilter() { return this._add(new FilterMock()); }
  createStereoPanner() { return this._add(new PannerMock()); }
  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return { numberOfChannels: channels, length, sampleRate, getChannelData: () => data };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); }
}
AudioContextMock.instances = [];

function makeClassList() {
  const set = new Set();
  return {
    add: (name) => set.add(name),
    remove: (name) => set.delete(name),
    contains: (name) => set.has(name),
    toggle: (name, force) => {
      const on = force === undefined ? !set.has(name) : !!force;
      if (on) set.add(name); else set.delete(name);
      return on;
    },
    _set: set
  };
}

function makeElement(tag, id) {
  const listeners = Object.create(null);
  const el = {
    tagName: tag || 'div',
    id: id || '',
    dataset: {},
    style: {
      setProperty(name, value) { this[name] = value; }
    },
    classList: makeClassList(),
    children: [],
    innerHTML: '',
    textContent: '',
    value: '',
    clientWidth: 1000,
    clientHeight: 600,
    offsetWidth: 120,
    offsetHeight: 80,
    scrollLeft: 0,
    scrollTop: 0,
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    removeEventListener(type, fn) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter((f) => f !== fn);
    },
    dispatchEvent(event) { (listeners[event && event.type] || []).slice().forEach((fn) => fn(event)); return true; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    setAttribute() {},
    getAttribute() { return null; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 120, bottom: 80, width: 120, height: 80 }; },
    setPointerCapture() {},
    releasePointerCapture() {},
    closest() { return null; },
    focus() {},
    scrollTo() {},
    getContext() { return null; },
    _listeners: listeners
  };
  return el;
}

function makeMeterStrip(id) {
  const strip = makeElement('div', 'strip-' + id);
  strip.dataset.mstrip = id;
  const lvl = makeElement('i');
  const pk = makeElement('i');
  strip.querySelector = (sel) => {
    if (sel === '.meter i:first-child') return lvl;
    if (sel === '.meter i.pk') return pk;
    return null;
  };
  strip._lvl = lvl;
  strip._pk = pk;
  return strip;
}

function createHarness(options) {
  options = options || {};
  AudioContextMock.instances.length = 0;
  let virtualNow = 0;
  let timerId = 1;
  let rafId = 1;
  let timers = [];
  let rafQueue = [];

  function setTimeoutMock(fn, ms) {
    const id = timerId++;
    timers.push({ id, fn, at: virtualNow + (Number(ms) || 0), interval: false, ms: Number(ms) || 0 });
    return id;
  }
  function setIntervalMock(fn, ms) {
    const id = timerId++;
    timers.push({ id, fn, at: virtualNow + (Number(ms) || 1), interval: true, ms: Number(ms) || 1 });
    return id;
  }
  function clearTimerMock(id) { timers = timers.filter((t) => t.id !== id); }
  function runTimers(advanceMs) {
    virtualNow += Number(advanceMs) || 0;
    let guard = 0;
    while (guard++ < 1000) {
      const due = timers.filter((t) => t.at <= virtualNow).sort((a, b) => a.at - b.at);
      if (!due.length) break;
      for (const timer of due) {
        timers = timers.filter((t) => t !== timer);
        if (timer.interval) {
          timer.at = virtualNow + timer.ms;
          timers.push(timer);
        }
        timer.fn();
      }
    }
  }
  function requestAnimationFrameMock(fn) {
    const id = rafId++;
    rafQueue.push({ id, fn });
    return id;
  }
  function cancelAnimationFrameMock(id) { rafQueue = rafQueue.filter((r) => r.id !== id); }
  function runFrame() {
    const next = rafQueue.shift();
    if (next) next.fn(virtualNow / 1000);
  }

  const playButton = makeElement('button', 'tpPlay');
  const recButton = makeElement('button', 'tpRec');
  const status = makeElement('span', 'sbStatus');
  const ruler = makeElement('div', 'ruler-vp');
  const lanes = makeElement('div', 'lanes-vp');
  const masterStrip = makeMeterStrip('master');
  const strips = ['drums', 'basse', 'gtrR', 'gtrS', 'keys', 'voix', 'choeurs', 'perc', 'amb']
    .map(makeMeterStrip);
  const act = makeElement('i');

  const documentListeners = Object.create(null);
  const document = {
    readyState: 'loading',
    hidden: false,
    body: makeElement('body'),
    documentElement: makeElement('html'),
    getElementById(id) {
      if (id === 'ruler-vp') return ruler;
      if (id === 'lanes-vp') return lanes;
      if (id === 'tpPlay') return playButton;
      if (id === 'tpRec') return recButton;
      if (id === 'sbStatus') return status;
      return null;
    },
    querySelector(sel) {
      if (sel === '#tpPlay') return playButton;
      if (sel === '#tpRec') return recButton;
      if (sel === '#sbStatus') return status;
      if (sel === '#lanes-vp') return lanes;
      if (sel === '.mstrip.master') return masterStrip;
      if (/^\.tl-row\[data-track=/.test(sel)) return act;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.mstrip[data-mstrip]') return strips.slice();
      return [];
    },
    createElement(tag) { return makeElement(tag); },
    addEventListener(type, fn, capture) {
      (documentListeners[type] || (documentListeners[type] = [])).push({ fn, capture: !!capture });
    },
    removeEventListener(type, fn) {
      if (documentListeners[type]) documentListeners[type] = documentListeners[type].filter((l) => l.fn !== fn);
    },
    dispatchEvent(event) {
      const list = (documentListeners[event && event.type] || []).slice()
        .sort((a, b) => Number(b.capture) - Number(a.capture));
      list.forEach((l) => l.fn(event));
      return true;
    },
    _listeners: documentListeners
  };

  const TRACKS = [
    { id: 'markers', kind: 'marker' },
    { id: 'tempoT', kind: 'tempo' },
    { id: 'drums', kind: 'midi', db: -3.2, mute: false, solo: false, pan: 0 },
    { id: 'basse', kind: 'audio', db: -4.1, mute: false, solo: false, pan: -0.1 },
    { id: 'gtrR', kind: 'audio', db: -5.4, mute: false, solo: false, pan: 0.2 },
    { id: 'gtrS', kind: 'audio', db: -3.0, mute: false, solo: false, pan: 0.1 },
    { id: 'keys', kind: 'audio', db: -6.2, mute: false, solo: false, pan: 0 },
    { id: 'voix', kind: 'audio', db: -2.5, mute: false, solo: false, pan: 0 },
    { id: 'choeurs', kind: 'audio', db: -7.0, mute: false, solo: false, pan: 0.1 },
    { id: 'perc', kind: 'audio', db: -8.4, mute: false, solo: false, pan: -0.2 },
    { id: 'amb', kind: 'audio', db: -12.0, mute: false, solo: false, pan: 0 },
    { id: 'video', kind: 'video', db: 0, mute: false, solo: false },
    { id: 'bus', kind: 'group', db: 0, mute: false, solo: false }
  ];
  const PART_WAVES = [
    ['drums', 'midi'], ['basse', 'bass'], ['gtrR', 'guitar'], ['gtrS', 'guitarSolo'],
    ['keys', 'rhodes'], ['voix', 'vocal'], ['choeurs', 'choir'], ['perc', 'perc']
  ];
  const PARTS = PART_WAVES.map(([track, wave], i) => ({
    id: 'part-' + i, track, name: track, start: 9, len: 8,
    type: wave === 'midi' ? 'midi' : 'audio', wave, muted: false
  }));
  PARTS.push({ id: 'part-amb', track: 'amb', name: 'amb', start: 1, len: 16, type: 'audio', wave: 'amb', muted: false });
  PARTS.push({ id: 'part-video', track: 'video', name: 'video', start: 1, len: 16, type: 'video', wave: 'video', muted: false });

  const trackMap = new Map(TRACKS.map((t) => [t.id, t]));
  const state = {
    bars: options.bars || 1000,
    barW: 64,
    cycle: !!options.cycle,
    cycleL: 9,
    cycleR: 17,
    pos: options.pos === undefined ? 9 : options.pos,
    click: !!options.click,
    precount: !!options.precount,
    playing: false,
    recording: false,
    autoScroll: false,
    tempo: 120,
    selectedTrack: 'voix',
    selTracks: ['voix']
  };
  const A = {
    TRACKS, PARTS, state,
    trackById: (id) => TRACKS.find((t) => t.id === id) || null,
    fmtPos: (p) => String(p),
    showToast: () => {},
    setStatus: (text) => { status.textContent = text; },
    refresh: () => {},
    MENU_STUBS: options.menuStubs || {},
    setPlayhead: (p, follow) => {
      const v = Number(p);
      state.pos = Math.min(state.bars, Math.max(1, Number.isFinite(v) ? v : 1));
      return state.pos;
    },
    goto: (p) => { state.pos = p; return state.pos; },
    ACTIONS: {
      play: () => { state.playing = true; },
      stop: () => { state.playing = false; },
      cycle: () => { state.cycle = !state.cycle; },
      click: () => { state.click = !state.click; },
      precount: () => { state.precount = !state.precount; },
      rtz: () => { state.pos = 1; },
      end: () => { state.pos = 61; },
      gotoL: () => { state.pos = state.cycleL; },
      gotoR: () => { state.pos = state.cycleR; },
      gotoMarker: (bar) => { state.pos = bar; },
      prevMarker: () => { state.pos = 1; },
      nextMarker: () => { state.pos = 17; }
    }
  };

  const sandbox = {
    console,
    Promise,
    Float32Array,
    Uint8Array,
    Map,
    Set,
    document,
    AudioContext: AudioContextMock,
    webkitAudioContext: AudioContextMock,
    setTimeout: setTimeoutMock,
    clearTimeout: clearTimerMock,
    setInterval: setIntervalMock,
    clearInterval: clearTimerMock,
    requestAnimationFrame: requestAnimationFrameMock,
    cancelAnimationFrame: cancelAnimationFrameMock,
    performance: { now: () => virtualNow },
    addEventListener() {},
    removeEventListener() {}
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.ALPHA = A;
  if (options.native) sandbox.ALPHA_NATIVE = { send: () => {} };
  if (options.windows) {
    const registry = Object.create(null);
    const WINDOWS = Object.create(null);
    sandbox.ALPHAWIN = {
      REG: {},
      WINDOWS,
      lastBuilt: null,
      lastRows: [],
      register(defs) { Object.assign(WINDOWS, defs || {}); },
      open(id) {
        const def = WINDOWS[id];
        if (!def) return;
        const built = def.build();
        this.lastBuilt = built;
        this.REG[id] = { id };
        const indexes = (String(built.html || '').match(/data-hindex="(\d+)"/g) || [])
          .map((m) => Number(m.replace(/\D/g, '')));
        this.lastRows = indexes.map((index) => {
          const row = makeElement('tr');
          row.dataset.hindex = String(index);
          return row;
        });
        if (built.after) built.after({ querySelectorAll: () => this.lastRows.slice() });
      },
      close(id) { delete this.REG[id]; }
    };
    void registry;
  }

  let native = null;
  if (options.nativeBridge) {
    const listeners = Object.create(null);
    const calls = [];
    const pending = [];
    sandbox.__JUCE__ = {
      backend: {
        addEventListener(id, fn) { (listeners[id] || (listeners[id] = [])).push(fn); },
        removeEventListener(id, fn) {
          if (listeners[id]) listeners[id] = listeners[id].filter((f) => f !== fn);
        },
        emitEvent(id, payload) {
          if (id === '__juce__invoke') {
            calls.push({ name: payload.params[0], data: payload.params[1] || {}, resultId: payload.resultId });
            pending.push(payload);
          }
        }
      }
    };
    class FileReaderMock {
      readAsDataURL(file) {
        this.result = 'data:' + (file.type || 'application/octet-stream') + ';base64,' + (file.base64 || '');
        if (this.onload) this.onload();
      }
    }
    sandbox.FileReader = FileReaderMock;
    native = {
      calls,
      completeNative(result) {
        const invokes = pending.splice(0);
        invokes.forEach((invoke) => {
          (listeners.__juce__complete || []).forEach((fn) => fn({ promiseId: invoke.resultId, result }));
        });
        return invokes.map((invoke) => ({ name: invoke.params[0], data: invoke.params[1] || {} }));
      },
      async flush() { await Promise.resolve(); await Promise.resolve(); }
    };
  }
  vm.createContext(sandbox);

  const core = fs.readFileSync(path.join(SRC, 'audio-core.js'), 'utf8');
  const audio = fs.readFileSync(path.join(SRC, 'audio.js'), 'utf8');
  const bridge = options.nativeBridge
    ? fs.readFileSync(path.resolve(__dirname, '../../UI/AlphaStudio/native-bridge.js'), 'utf8')
    : '';
  vm.runInContext(core, sandbox, { filename: 'audio-core.js' });
  if (options.nativeBridge) vm.runInContext(bridge, sandbox, { filename: 'native-bridge.js' });
  vm.runInContext(audio, sandbox, { filename: 'audio.js' });

  return {
    sandbox, window: sandbox, A, state, document,
    status, playButton, recButton, masterStrip, strips, act,
    engine: sandbox.ALPHA_AUDIO,
    meters: sandbox.ALPHA_AUDIO_METERS,
    core: sandbox.ALPHA_AUDIO_CORE,
    native,
    contexts: AudioContextMock.instances,
    runTimers,
    runFrame,
    async flush() { await Promise.resolve(); await Promise.resolve(); },
    setCurrentTime(value) {
      const ctx = sandbox.ALPHA_AUDIO.debug().context;
      if (ctx) ctx.currentTime = value;
      return ctx;
    }
  };
}

module.exports = { createHarness, AudioContextMock };
