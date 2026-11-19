/* ALPHA Studio — J1, noyau pur du moteur Web Audio.
   Aucune dépendance DOM / Web Audio : ce fichier est testable avec Node seul.
   Il est inclus dans alpha-studio.html par build.py et exporté en CommonJS pour les tests. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ALPHA_AUDIO_CORE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_BPM = 120;
  var BEATS_PER_BAR = 4;
  var EPS = 1e-9;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function finite(v, fallback) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }

  function secondsPerBar(bpm, beatsPerBar) {
    return (beatsPerBar || BEATS_PER_BAR) * 60 / clamp(finite(bpm, DEFAULT_BPM), 20, 300);
  }
  function secondsPerBeat(bpm) { return 60 / clamp(finite(bpm, DEFAULT_BPM), 20, 300); }
  function timeAtBar(bar, originBar, originTime, bpm) {
    return originTime + (bar - originBar) * secondsPerBar(bpm);
  }

  function loopLength(loop) {
    return loop && loop.enabled && loop.end > loop.start ? loop.end - loop.start : 0;
  }

  /* Position musicale enveloppée dans le cycle A/B, calculée depuis une horloge
     AudioContext. Le temps brut n'est jamais intégré pas à pas : aucune dérive. */
  function wrapBar(raw, loop) {
    var len = loopLength(loop);
    if (!len || raw < loop.end - EPS) return raw;
    var rel = raw - loop.start;
    return loop.start + ((rel % len) + len) % len;
  }
  function barAt(elapsedSeconds, startBar, bpm, loop) {
    return wrapBar(startBar + Math.max(0, elapsedSeconds) / secondsPerBar(bpm), loop);
  }

  function nextLoopBoundary(raw, loop) {
    var len = loopLength(loop);
    if (!len) return Infinity;
    var cycles = Math.max(0, Math.ceil((raw - loop.end) / len - EPS));
    var boundary = loop.end + cycles * len;
    while (boundary <= raw + EPS) boundary += len;
    return boundary;
  }

  /* Découpe une fenêtre d'ordonnancement en segments continus dans la timeline
     bouclée. from/to sont des barres brutes ; barFrom/barTo sont des barres A/B. */
  function loopSegments(from, to, loop) {
    if (!(to > from + EPS)) return [];
    if (!loopLength(loop)) {
      return [{ from: from, to: to, barFrom: from, barTo: to, wrapped: false }];
    }
    var out = [], cursor = from, guard = 0;
    while (cursor < to - EPS && guard++ < 512) {
      var end = Math.min(to, nextLoopBoundary(cursor, loop));
      if (end <= cursor + EPS) { cursor += EPS; continue; }
      var barFrom = wrapBar(cursor, loop);
      out.push({
        from: cursor,
        to: end,
        barFrom: barFrom,
        barTo: barFrom + (end - cursor),
        wrapped: true
      });
      cursor = end;
    }
    return out;
  }

  /* Positions de clics métronome sur une grille de temps ancrée à la mesure 1. */
  function beatPositions(from, to, beatsPerBar) {
    var beats = beatsPerBar || BEATS_PER_BAR;
    var step = 1 / beats;
    var first = Math.ceil((from - 1) / step - EPS) * step + 1;
    var out = [], guard = 0;
    for (var bar = first; bar < to - EPS && guard++ < 4096; bar += step) {
      var beatCount = Math.round((bar - 1) * beats);
      var onBar = Math.abs((bar - 1) * beats - beatCount) < 1e-6;
      out.push({
        bar: bar,
        beat: ((beatCount % beats) + beats) % beats,
        accent: onBar && beatCount % beats === 0
      });
    }
    return out;
  }

  function dbToGain(db) {
    var value = Number(db);
    if (!Number.isFinite(value) || value <= -60) return 0;
    return Math.pow(10, clamp(value, -60, 6) / 20);
  }
  function trackGain(track, anySolo) {
    if (!track) return 0;
    if (track.mute || (anySolo && !track.solo)) return 0;
    return dbToGain(finite(track.db, 0));
  }
  function panValue(track) { return clamp(finite(track && track.pan, 0), -1, 1); }
  function meterPercent(level) {
    var v = Number(level);
    if (!Number.isFinite(v) || v <= 0) return 2;
    var db = 20 * Math.log10(clamp(v, 1e-5, 2));
    return clamp(72 + db * 3.4, 2, 97);
  }
  function levelFromSamples(samples) {
    var sum = 0, peak = 0, n = samples ? samples.length : 0;
    for (var i = 0; i < n; i++) {
      var v = Number(samples[i]) || 0;
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: n ? Math.sqrt(sum / n) : 0, peak: peak };
  }
  function isAudibleTrack(track) {
    return !!track && ['audio', 'midi', 'instrument', 'group', 'fx'].indexOf(track.kind) >= 0;
  }

  /* 12 sources de démonstration + le clic. Oscillateurs, bruit filtré et
     enveloppes : aucun fichier audio, aucun réseau, aucune dépendance. */
  var INSTRUMENTS = {
    kick:        { kind: 'tone',  wave: 'sine',     freq: 55,    glide: 0.45, filter: 220,   filterType: 'lowpass',  gain: 0.80, dur: 0.24, attack: 0.003, step: 0.25 },
    snare:       { kind: 'noise', wave: 'noise',    freq: 1750,  glide: 0,    filter: 1750,  filterType: 'bandpass', gain: 0.34, dur: 0.15, attack: 0.002, step: 0.25, q: 0.8 },
    hat:         { kind: 'noise', wave: 'noise',    freq: 7200,  glide: 0,    filter: 7200,  filterType: 'highpass', gain: 0.14, dur: 0.055, attack: 0.001, step: 0.25 },
    bass:        { kind: 'tone',  wave: 'sawtooth', freq: 55,    glide: 0,    filter: 480,   filterType: 'lowpass',  gain: 0.22, dur: 0.38, attack: 0.008, step: 0.25, scale: [55, 65.41, 73.42, 82.41, 49, 55, 65.41, 61.74] },
    guitar:      { kind: 'tone',  wave: 'square',   freq: 220,   glide: 0,    filter: 1250,  filterType: 'lowpass',  gain: 0.10, dur: 0.30, attack: 0.004, step: 0.25, scale: [220, 261.63, 329.63, 392, 174.61, 220, 261.63, 293.66] },
    guitarSolo:  { kind: 'tone',  wave: 'sawtooth', freq: 330,   glide: 0,    filter: 2100,  filterType: 'lowpass',  gain: 0.12, dur: 0.42, attack: 0.012, step: 0.25, scale: [329.63, 392, 440, 523.25, 587.33, 523.25, 440, 392] },
    rhodes:      { kind: 'tone',  wave: 'sine',     freq: 261.63,glide: 0,    filter: 1800,  filterType: 'lowpass',  gain: 0.16, dur: 0.55, attack: 0.02,  step: 0.50, scale: [261.63, 329.63, 392, 174.61, 220, 261.63] },
    vocal:       { kind: 'tone',  wave: 'triangle', freq: 330,   glide: 0,    filter: 1500,  filterType: 'bandpass', gain: 0.14, dur: 0.48, attack: 0.03,  step: 0.50, scale: [329.63, 392, 440, 392, 349.23, 329.63, 293.66, 261.63], q: 0.7 },
    choir:       { kind: 'tone',  wave: 'sine',     freq: 261.63,glide: 0,    filter: 1100,  filterType: 'lowpass',  gain: 0.10, dur: 0.85, attack: 0.10,  step: 1.00, scale: [261.63, 329.63, 392, 523.25, 440, 392, 329.63] },
    perc:        { kind: 'noise', wave: 'noise',    freq: 3200,  glide: 0,    filter: 3200,  filterType: 'bandpass', gain: 0.18, dur: 0.12, attack: 0.002, step: 0.25, q: 1.4 },
    amb:         { kind: 'tone',  wave: 'triangle', freq: 130.81,glide: 0,    filter: 900,   filterType: 'lowpass',  gain: 0.07, dur: 1.60, attack: 0.25,  step: 1.00, scale: [130.81, 174.61, 196, 164.81, 146.83, 130.81] },
    pad:         { kind: 'tone',  wave: 'sine',     freq: 220,   glide: 0,    filter: 1200,  filterType: 'lowpass',  gain: 0.09, dur: 0.80, attack: 0.08,  step: 0.50, scale: [220, 261.63, 329.63, 392, 349.23, 293.66] },
    metronome:   { kind: 'tone',  wave: 'square',   freq: 1050,  glide: 0,    filter: 3500,  filterType: 'bandpass', gain: 0.22, dur: 0.035, attack: 0.001, step: 0.25, q: 1.2 }
  };

  function instrumentFor(part, track) {
    if (!part || !track || part.muted || !isAudibleTrack(track)) return null;
    if (track.kind === 'group' || track.kind === 'fx' || track.kind === 'video') return null;
    if (part.type === 'midi' || track.kind === 'midi' || /drum/i.test(track.id || '')) return 'drums';
    var map = {
      bass: 'bass', guitar: 'guitar', guitarSolo: 'guitarSolo', rhodes: 'rhodes',
      vocal: 'vocal', choir: 'choir', perc: 'perc', amb: 'amb', native: 'pad'
    };
    return map[part.wave || ''] || (track.kind === 'instrument' ? 'pad' : 'pad');
  }
  function grainStep(name) {
    return INSTRUMENTS[name] && INSTRUMENTS[name].step ? INSTRUMENTS[name].step : 0.25;
  }
  function drumKitAt(stepIndex) {
    var beat = ((Math.round(stepIndex) % 4) + 4) % 4;
    if (beat === 0) return ['kick', 'hat'];
    if (beat === 2) return ['kick', 'snare', 'hat'];
    return ['snare', 'hat'];
  }
  function noteFrequency(name, stepIndex, bar) {
    var def = INSTRUMENTS[name] || INSTRUMENTS.pad;
    var scale = def.scale || [def.freq || 220];
    var seed = (Math.abs(Math.round(stepIndex)) * 7 + Math.abs(Math.floor(bar)) * 3 + name.length * 11) >>> 0;
    var h = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    return scale[(h + Math.abs(Math.round(stepIndex))) % scale.length] || def.freq || 220;
  }

  return {
    DEFAULT_BPM: DEFAULT_BPM,
    BEATS_PER_BAR: BEATS_PER_BAR,
    EPS: EPS,
    INSTRUMENTS: INSTRUMENTS,
    clamp: clamp,
    finite: finite,
    secondsPerBar: secondsPerBar,
    secondsPerBeat: secondsPerBeat,
    timeAtBar: timeAtBar,
    loopLength: loopLength,
    wrapBar: wrapBar,
    barAt: barAt,
    loopSegments: loopSegments,
    beatPositions: beatPositions,
    dbToGain: dbToGain,
    trackGain: trackGain,
    panValue: panValue,
    meterPercent: meterPercent,
    levelFromSamples: levelFromSamples,
    isAudibleTrack: isAudibleTrack,
    instrumentFor: instrumentFor,
    grainStep: grainStep,
    drumKitAt: drumKitAt,
    noteFrequency: noteFrequency
  };
});
