/* ALPHA Studio — J1 : moteur Web Audio autonome.
   Chargé après native-bridge.js. Si le pont JUCE/WebView2 est actif, ce moteur
   ne remplace pas le moteur natif ; il expose seulement les VU-mètres. */
(function () {
  'use strict';

  var A = window.ALPHA;
  var C = window.ALPHA_AUDIO_CORE;
  if (!A || !C) return;

  var LOOKAHEAD = 0.12;
  var SCHEDULER_MS = 25;
  var START_DELAY = 0.06;
  var MASTER_LEVEL = 0.8;

  var WORKLET_SOURCE = [
    'class AlphaMixProcessor extends AudioWorkletProcessor {',
    '  process(inputs, outputs) {',
    '    const input = inputs[0] || [];',
    '    const output = outputs[0] || [];',
    '    for (let ch = 0; ch < output.length; ++ch) {',
    '      const src = input[ch] || input[0] || [];',
    '      const dst = output[ch];',
    '      for (let i = 0; i < dst.length; ++i) {',
    '        const v = src[i] || 0;',
    '        dst[i] = Math.tanh(v * 0.85);',
    '      }',
    '    }',
    '    return true;',
    '  }',
    '}',
    'registerProcessor("alpha-mix", AlphaMixProcessor);'
  ].join('\n');

  var lastLevels = { master: { rms: 0, peak: 0 } };

  function each(list, fn) {
    if (!list) return;
    if (typeof list.forEach === 'function') { list.forEach(fn); return; }
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }
  function setStyle(el, prop, value) {
    if (el && el.style && typeof el.style.setProperty === 'function') el.style.setProperty(prop, value);
    else if (el && el.style) el.style[prop] = value;
  }
  function paintStrip(strip, rms, peak) {
    if (!strip) return;
    var lvl = strip.querySelector ? strip.querySelector('.meter i:first-child') : null;
    var pk = strip.querySelector ? strip.querySelector('.meter i.pk') : null;
    setStyle(lvl, '--lvl', C.meterPercent(rms).toFixed(1) + '%');
    setStyle(pk, '--pk', C.meterPercent(peak).toFixed(1) + '%');
  }
  function paintMeters(levels) {
    lastLevels = levels || lastLevels;
    if (typeof document === 'undefined' || !document.querySelectorAll) return lastLevels;
    var strips = Array.prototype.slice.call(document.querySelectorAll('.mstrip[data-mstrip]'));
    var master = document.querySelector ? document.querySelector('.mstrip.master') : null;
    Object.keys(lastLevels).forEach(function (id) {
      var l = lastLevels[id] || { rms: 0, peak: 0 };
      for (var i = 0; i < strips.length; i++) {
        if (strips[i].dataset && strips[i].dataset.mstrip === id) paintStrip(strips[i], l.rms, l.peak);
      }
      if (id === 'master') paintStrip(master, l.rms, l.peak);
      var act = document.querySelector ? document.querySelector('.tl-row[data-track="' + id + '"] .tl-act') : null;
      if (act && act.classList) act.classList.toggle('on', C.meterPercent(l.rms) > 12);
    });
    return lastLevels;
  }
  function metersFromNative(snapshot) {
    if (!snapshot || !snapshot.tracks) return lastLevels;
    var levels = { master: { rms: 0, peak: 0 } };
    var sum = 0, peak = 0, n = 0;
    each(snapshot.tracks, function (t, i) {
      var l = Math.max(0, Number(t.levelL) || 0), r = Math.max(0, Number(t.levelR) || 0);
      var rms = Math.sqrt((l * l + r * r) / 2), pk = Math.max(l, r);
      var value = { rms: rms, peak: pk };
      levels['native_' + i] = value;
      if (t && t.id) levels[t.id] = value; // identifiants réels publiés par AlphaEngine.
      sum += rms * rms; peak = Math.max(peak, pk); n++;
    });
    levels.master = {
      rms: Math.max(Math.sqrt(sum / Math.max(1, n)), Math.max(0, Number(snapshot.masterLevelL) || 0)),
      peak: Math.max(peak, Math.max(0, Number(snapshot.masterPeak) || 0))
    };
    return paintMeters(levels);
  }

  window.ALPHA_AUDIO_METERS = {
    paint: paintMeters,
    fromNative: metersFromNative,
    levels: function () { return lastLevels; }
  };

  /* Le pont natif a priorité. Le moteur Web Audio sert alors de repli navigateur. */
  if (window.ALPHA_NATIVE) {
    window.ALPHA_AUDIO = { mode: 'native' };
    return;
  }

  var ctx = null;
  var masterGain = null, masterAnalyser = null, workletNode = null, noiseBuffer = null;
  var tracks = new Map();
  var activeSources = new Set();
  var voiceHistory = [];
  var schedulerId = null, rafId = null, suspendTimer = null;
  var running = false, fallbackMode = false;
  var originTime = 0, originBar = 1, nextBar = 1, activeBarSec = C.secondsPerBar(C.DEFAULT_BPM);
  var lastSettings = null, lastTiming = null, lastWrittenBar = A.state.pos, frame = 0;

  var base = {};
  ['play', 'stop', 'cycle', 'click', 'precount', 'rtz', 'end', 'gotoL', 'gotoR', 'gotoMarker', 'prevMarker', 'nextMarker']
    .forEach(function (name) { base[name] = A.ACTIONS && A.ACTIONS[name]; });
  var baseGoto = A.goto;

  function docQuery(sel) { return typeof document !== 'undefined' && document.querySelector ? document.querySelector(sel) : null; }
  function setStatus(text) {
    if (A.setStatus) A.setStatus(text);
    else { var el = docQuery('#sbStatus'); if (el) el.textContent = text; }
  }
  function button(id, cls, on) {
    var el = docQuery(id);
    if (el && el.classList) el.classList.toggle(cls, !!on);
  }
  function flash(sel, ms) {
    var el = docQuery(sel);
    if (!el || !el.classList) return;
    el.classList.add('active');
    setTimeout(function () { el.classList.remove('active'); }, ms || 260);
  }
  function setPlayhead(bar, follow) {
    if (A.setPlayhead) A.setPlayhead(bar, follow);
    else A.state.pos = C.clamp(C.finite(bar, 1), 1, A.state.bars);
    return A.state.pos;
  }
  function currentBpm() { return C.finite(A.state.tempo || A.state.bpm || C.DEFAULT_BPM, C.DEFAULT_BPM); }
  function barSeconds() { return activeBarSec || C.secondsPerBar(currentBpm()); }
  function currentLoop() {
    var l = C.finite(A.state.cycleL, 1), r = C.finite(A.state.cycleR, 9);
    return { enabled: !!A.state.cycle && r > l, start: l, end: r };
  }
  function timingSignature() {
    var loop = currentLoop();
    return [loop.enabled ? 1 : 0, loop.start, loop.end, currentBpm()].join('|');
  }
  function settingsSignature() {
    return [timingSignature(), A.state.click ? 1 : 0, A.state.precount ? 1 : 0].join('|');
  }
  function rawTime(rawBar) { return originTime + (rawBar - originBar) * barSeconds(); }
  function positionAt(time) {
    if (!running) return A.state.pos;
    var elapsed = Math.max(0, time - originTime) / barSeconds();
    return C.wrapBar(originBar + elapsed, currentLoop());
  }

  A.state.clock = {
    mode: 'AudioContext',
    currentTime: function () { return ctx ? ctx.currentTime : 0; },
    positionBars: function () { return ctx ? positionAt(ctx.currentTime) : A.state.pos; },
    driftSeconds: function () {
      return ctx ? Math.abs(positionAt(ctx.currentTime) - A.state.pos) * barSeconds() : 0;
    },
    originTime: function () { return originTime; }
  };

  function nodeDisconnect(node) { if (node && typeof node.disconnect === 'function') { try { node.disconnect(); } catch (e) {} } }

  function ensureContext() {
    if (ctx) return ctx;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      fallbackMode = true;
      if (A.showToast) A.showToast('Web Audio indisponible : repli sur l’horloge d’interface.', 'J1 · audio');
      return null;
    }
    try { ctx = new Ctor({ latencyHint: 'interactive' }); }
    catch (e) { ctx = new Ctor(); }
    masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterAnalyser = ctx.createAnalyser();
    masterAnalyser.fftSize = 1024;
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer();
    makeTrackNodes();
    installWorklet();
    return ctx;
  }

  function makeNoiseBuffer() {
    var n = Math.max(1, Math.floor(ctx.sampleRate || 48000));
    var buf = ctx.createBuffer(1, n, ctx.sampleRate || 48000);
    var data = buf.getChannelData(0);
    var seed = 0x13579bdf;
    for (var i = 0; i < n; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 2147483648) - 1;
    }
    return buf;
  }

  function installWorklet() {
    var BlobCtor = window.Blob;
    var URLCtor = window.URL || window.webkitURL;
    if (!ctx.audioWorklet || !window.AudioWorkletNode || !BlobCtor || !URLCtor || !URLCtor.createObjectURL) return;
    var localCtx = ctx, url = null;
    try {
      url = URLCtor.createObjectURL(new BlobCtor([WORKLET_SOURCE], { type: 'application/javascript' }));
      var result = localCtx.audioWorklet.addModule(url);
      var attach = function () {
        if (URLCtor.revokeObjectURL) URLCtor.revokeObjectURL(url);
        if (ctx !== localCtx || !masterAnalyser) return;
        try {
          workletNode = new window.AudioWorkletNode(localCtx, 'alpha-mix', {
            numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
          });
          masterAnalyser.disconnect();
          masterAnalyser.connect(workletNode);
          workletNode.connect(localCtx.destination);
        } catch (e) { workletNode = null; }
      };
      if (result && typeof result.then === 'function') result.then(attach, function () {
        if (URLCtor.revokeObjectURL) URLCtor.revokeObjectURL(url);
      });
      else attach();
    } catch (e) {
      if (url && URLCtor.revokeObjectURL) URLCtor.revokeObjectURL(url);
    }
  }

  function makeTrackNodes() {
    if (!ctx || !masterGain) return;
    each(A.TRACKS, function (track) {
      if (!track || !C.isAudibleTrack(track) || tracks.has(track.id)) return;
      var gain = ctx.createGain();
      gain.gain.value = 0;
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      gain.connect(analyser);
      if (panner) {
        analyser.connect(panner);
        panner.connect(masterGain);
      } else {
        analyser.connect(masterGain);
      }
      tracks.set(track.id, { gain: gain, analyser: analyser, panner: panner });
    });
  }

  function cancelVoices(when) {
    activeSources.forEach(function (source) {
      try { source.stop(when); }
      catch (e) { nodeDisconnect(source); }
    });
    activeSources.clear();
  }

  function scheduleVoice(name, when, duration, freq, amp, destination, trackId) {
    if (!ctx || !destination) return null;
    var def = C.INSTRUMENTS[name] || C.INSTRUMENTS.pad;
    var t = Math.max(when, ctx.currentTime);
    var dur = Math.max(0.02, C.finite(duration, def.dur));
    var f = Math.max(20, C.finite(freq, def.freq));
    var a = Math.max(0.0002, C.finite(amp, def.gain));
    var attack = Math.min(def.attack || 0.005, dur * 0.45);
    var env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(a, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(destination);

    var filter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
    if (filter) {
      filter.type = def.filterType || 'lowpass';
      filter.frequency.setValueAtTime(def.filter || 1000, t);
      if (filter.Q) filter.Q.value = def.q || 1;
      filter.connect(env);
    }

    var source;
    if (def.kind === 'noise') {
      source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      var offset = ((Math.round(t * 1000) % 733) / 733) * 0.5;
      source.start(t, offset);
    } else {
      source = ctx.createOscillator();
      source.type = def.wave || 'sine';
      if (def.glide) {
        source.frequency.setValueAtTime(f * (1 + def.glide * 2), t);
        source.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, dur));
      } else {
        source.frequency.setValueAtTime(f, t);
      }
      source.start(t);
    }
    if (filter) source.connect(filter);
    else source.connect(env);
    source.stop(t + dur + 0.02);
    source.onended = function () {
      nodeDisconnect(source);
      nodeDisconnect(filter);
      nodeDisconnect(env);
      activeSources.delete(source);
    };
    activeSources.add(source);
    voiceHistory.push({ name: name, when: t, duration: dur, frequency: f, track: trackId || '' });
    if (voiceHistory.length > 4000) voiceHistory.shift();
    return source;
  }

  function scheduleInstrument(name, bar, stepIndex, when, destination, trackId, grainDuration) {
    if (name === 'drums') {
      each(C.drumKitAt(stepIndex), function (kit) {
        scheduleVoice(kit, when, undefined, undefined, undefined, destination, trackId);
      });
      return;
    }
    var def = C.INSTRUMENTS[name] || C.INSTRUMENTS.pad;
    var dur = Math.min(def.dur, Math.max(0.05, grainDuration * 0.92));
    var freq = C.noteFrequency(name, stepIndex, bar);
    scheduleVoice(name, when, dur, freq, def.gain, destination, trackId);
  }

  function scheduleClick(when, accent, destination) {
    scheduleVoice('metronome', when, 0.035, accent ? 1600 : 1050,
      accent ? 0.26 : 0.18, destination || masterGain, '__click');
  }

  function scheduleSegment(seg, horizon) {
    var segmentStart = rawTime(seg.from);
    var segmentEnd = rawTime(seg.to);
    var start = Math.max(ctx.currentTime, segmentStart);
    if (segmentEnd <= start) return;
    var lateBars = (start - segmentStart) / barSeconds();
    var localFrom = seg.barFrom + lateBars;
    var localTo = seg.barTo;

    each(A.PARTS, function (part) {
      if (!part || part.muted) return;
      var track = A.trackById ? A.trackById(part.track) : null;
      var name = C.instrumentFor(part, track);
      var node = track && tracks.get(track.id);
      if (!name || !node) return;
      var pStart = C.finite(part.start, 1), pEnd = pStart + Math.max(0, C.finite(part.len, 0));
      var from = Math.max(pStart, localFrom), to = Math.min(pEnd, localTo);
      if (to <= from) return;
      var step = C.grainStep(name === 'drums' ? 'kick' : name);
      var first = Math.ceil((from - 1) / step - C.EPS) * step + 1;
      var guard = 0;
      for (var bar = first; bar < to - C.EPS && guard++ < 2048; bar += step) {
        var when = start + (bar - localFrom) * barSeconds();
        if (when < ctx.currentTime - 0.001 || when > horizon + 0.001) continue;
        scheduleInstrument(name, bar, Math.round((bar - 1) / step), when,
          node.gain, track.id, step * barSeconds());
      }
    });

    if (A.state.click) {
      each(C.beatPositions(localFrom, localTo, C.BEATS_PER_BAR), function (beat) {
        var when = start + (beat.bar - localFrom) * barSeconds();
        if (when >= ctx.currentTime - 0.001 && when <= horizon + 0.001) scheduleClick(when, beat.accent, masterGain);
      });
    }
  }

  function scheduleAhead(horizon) {
    if (!running || !ctx) return;
    makeTrackNodes();
    horizon = Math.max(horizon || 0, ctx.currentTime + LOOKAHEAD);
    var toRaw = originBar + (horizon - originTime) / barSeconds();
    if (toRaw <= nextBar + C.EPS) return;
    var loop = currentLoop();
    each(C.loopSegments(nextBar, toRaw, loop), function (seg) { scheduleSegment(seg, horizon); });
    nextBar = toRaw;
  }

  function sampleAnalyser(analyser) {
    if (!analyser || typeof analyser.getFloatTimeDomainData !== 'function') return { rms: 0, peak: 0 };
    var n = Math.max(1, analyser.fftSize || 512);
    var samples = new Float32Array(n);
    analyser.getFloatTimeDomainData(samples);
    return C.levelFromSamples(samples);
  }
  function readLevels() {
    var levels = { master: sampleAnalyser(masterAnalyser) };
    tracks.forEach(function (node, id) { levels[id] = sampleAnalyser(node.analyser); });
    return levels;
  }
  function updateMix() {
    if (!ctx) return;
    makeTrackNodes();
    var now = ctx.currentTime;
    var anySolo = false;
    each(A.TRACKS, function (t) { if (C.isAudibleTrack(t) && t.solo) anySolo = true; });
    tracks.forEach(function (node, id) {
      var track = A.trackById ? A.trackById(id) : null;
      var target = C.trackGain(track, anySolo);
      if (node.gain.gain.setTargetAtTime) node.gain.gain.setTargetAtTime(target, now, 0.012);
      else node.gain.gain.value = target;
      if (node.panner && node.panner.pan) {
        var pan = C.panValue(track);
        if (node.panner.pan.setTargetAtTime) node.panner.pan.setTargetAtTime(pan, now, 0.02);
        else node.panner.pan.value = pan;
      }
    });
  }

  function resetClock(pos, now, cancel) {
    originBar = C.clamp(C.finite(pos, 1), 1, A.state.bars);
    originTime = now + 0.005;
    nextBar = originBar;
    activeBarSec = C.secondsPerBar(currentBpm());
    if (cancel) cancelVoices(now + 0.01);
    setPlayhead(originBar, false);
    lastWrittenBar = A.state.pos;
    lastSettings = settingsSignature();
    lastTiming = timingSignature();
  }
  function rebase(posOverride) {
    if (!running || !ctx) return;
    var now = ctx.currentTime;
    var pos = typeof posOverride === 'number' && Number.isFinite(posOverride)
      ? posOverride : positionAt(now);
    resetClock(pos, now, true);
  }
  function seek(pos) {
    if (!ctx) { setPlayhead(pos, false); lastWrittenBar = A.state.pos; return; }
    resetClock(pos, ctx.currentTime, running);
  }
  function syncSettings() {
    var sig = settingsSignature(), timing = timingSignature();
    if (lastTiming !== null && timing !== lastTiming) rebase(A.state.pos);
    lastSettings = sig;
    lastTiming = timing;
    if (Math.abs(A.state.pos - lastWrittenBar) > 0.0005) seek(A.state.pos);
  }

  function tick() {
    if (!running || !ctx) return;
    syncSettings();
    var now = ctx.currentTime;
    if (now >= originTime) {
      var raw = originBar + (now - originTime) / barSeconds();
      if (!currentLoop().enabled && raw >= A.state.bars) { stopEngine('Arrêt — fin du projet'); return; }
      var pos = positionAt(now);
      setPlayhead(pos, (frame++ % 4) === 0);
      lastWrittenBar = A.state.pos;
    }
    updateMix();
    lastLevels = readLevels();
    paintMeters(lastLevels);
    rafId = requestAnimationFrame(tick);
  }

  function startTimers() {
    if (schedulerId) clearInterval(schedulerId);
    schedulerId = setInterval(function () {
      if (ctx) scheduleAhead(ctx.currentTime + LOOKAHEAD);
    }, SCHEDULER_MS);
    scheduleAhead(ctx.currentTime + LOOKAHEAD);
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (A.state.playing) { A.ACTIONS.stop(); return; }
    var audio = ensureContext();
    if (!audio) {
      fallbackMode = true;
      A.state.clock.mode = 'interface';
      if (base.play) return base.play();
      return;
    }
    if (ctx.state === 'suspended' && ctx.resume) {
      var resumed = ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(function () {});
    }
    clearTimeout(suspendTimer);
    fallbackMode = false;
    var now = ctx.currentTime;
    activeBarSec = C.secondsPerBar(currentBpm());
    var beatSec = C.secondsPerBeat(currentBpm());
    var lead = A.state.precount ? activeBarSec : 0;
    originBar = A.state.pos;
    originTime = now + START_DELAY + lead;
    nextBar = originBar;
    running = true;
    fallbackMode = false;
    A.state.clock.mode = 'AudioContext';
    frame = 0;
    lastSettings = settingsSignature();
    lastTiming = timingSignature();
    setPlayhead(originBar, false);
    lastWrittenBar = A.state.pos;

    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(MASTER_LEVEL, now + 0.02);
    makeTrackNodes();
    updateMix();
    if (lead) {
      for (var i = 0; i < C.BEATS_PER_BAR; i++) {
        scheduleVoice('metronome', now + START_DELAY + i * beatSec, 0.035,
          i === 0 ? 1600 : 1050, i === 0 ? 0.26 : 0.18, masterGain, '__countin');
      }
    }
    A.state.playing = true;
    A.state.recording = false;
    flash('#tpPlay', 400);
    button('#tpPlay', 'active', true);
    button('#tpRec', 'active', false);
    setStatus(lead ? 'Précompte : 4 temps, puis lecture audio (AudioContext).'
      : 'Lecture audio — horloge AudioContext, cycle et métronome réels.');
    startTimers();
  }

  function stopEngine(reason) {
    running = false;
    if (schedulerId) { clearInterval(schedulerId); schedulerId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (ctx) {
      var now = ctx.currentTime;
      cancelVoices(now + 0.025);
      if (masterGain && masterGain.gain) {
        masterGain.gain.cancelScheduledValues(now);
        masterGain.gain.setValueAtTime(masterGain.gain.value, now);
        masterGain.gain.linearRampToValueAtTime(0, now + 0.02);
      }
      tracks.forEach(function (node) {
        if (node.gain.gain.setTargetAtTime) node.gain.gain.setTargetAtTime(0, now, 0.008);
      });
    }
    if (base.stop) base.stop();
    A.state.playing = false;
    A.state.recording = false;
    button('#tpPlay', 'active', false);
    button('#tpRec', 'active', false);
    setStatus(reason || ('Arrêt — position ' + (A.fmtPos ? A.fmtPos(A.state.pos) : A.state.pos)));
    lastWrittenBar = A.state.pos;
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(function () {
      if (!running && ctx && ctx.state === 'running' && ctx.suspend) {
        var p = ctx.suspend();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    }, 60);
  }

  function destroy() {
    stopEngine('Arrêt — contexte audio libéré');
    clearTimeout(suspendTimer);
    var old = ctx;
    ctx = null;
    if (old) {
      if (old.close) { var p = old.close(); if (p && typeof p.catch === 'function') p.catch(function () {}); }
    }
    tracks.forEach(function (node) {
      nodeDisconnect(node.gain); nodeDisconnect(node.analyser); nodeDisconnect(node.panner);
    });
    tracks.clear();
    nodeDisconnect(workletNode);
    nodeDisconnect(masterAnalyser);
    nodeDisconnect(masterGain);
    workletNode = null; masterAnalyser = null; masterGain = null; noiseBuffer = null;
    activeSources.clear();
    voiceHistory.length = 0;
  }

  function wrapAction(name, after) {
    var fn = base[name];
    if (typeof fn !== 'function') return;
    A.ACTIONS[name] = function () {
      var result = fn.apply(A.ACTIONS, arguments);
      if (after) after.apply(null, arguments);
      return result;
    };
  }
  A.ACTIONS.play = play;
  A.ACTIONS.stop = function () { stopEngine(); };
  wrapAction('cycle', function () {
    syncSettings();
    setStatus(A.state.cycle ? 'Cycle audio activé — la boucle repart au localisateur gauche.' : 'Cycle audio désactivé.');
  });
  wrapAction('click', function () {
    syncSettings();
    setStatus(A.state.click ? 'Métronome audio activé.' : 'Métronome désactivé.');
  });
  wrapAction('precount', function () {
    lastSettings = settingsSignature();
    setStatus('Précompte ' + (A.state.precount ? 'activé — 4 clics avant la lecture.' : 'désactivé') + '.');
  });
  ['rtz', 'end', 'gotoL', 'gotoR', 'prevMarker', 'nextMarker'].forEach(function (name) {
    wrapAction(name, function () { seek(A.state.pos); });
  });
  wrapAction('gotoMarker', function (bar) { seek(C.finite(bar, A.state.pos)); });

  if (typeof baseGoto === 'function') {
    A.goto = function (pos) {
      var result = baseGoto.call(A, pos);
      seek(C.finite(pos, A.state.pos));
      return result;
    };
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    var ruler = document.getElementById ? document.getElementById('ruler-vp') : null;
    if (ruler && ruler.addEventListener) {
      ruler.addEventListener('pointerup', function () {
        setTimeout(function () { seek(A.state.pos); }, 0);
      }, true);
    }
    document.addEventListener('keydown', function (e) {
      var key = e && e.key;
      if (key === 'c' || key === 'C' || key === '/') {
        setTimeout(function () {
          syncSettings();
          if (key === 'c' || key === 'C') setStatus(A.state.click ? 'Métronome audio activé.' : 'Métronome désactivé.');
          else setStatus(A.state.cycle ? 'Cycle audio activé.' : 'Cycle audio désactivé.');
        }, 0);
      } else if (key === 'Home' || key === 'End') {
        setTimeout(function () { seek(A.state.pos); }, 0);
      }
    }, false);
    window.addEventListener('pagehide', destroy, false);
  }

  window.ALPHA_AUDIO = {
    mode: 'web-audio',
    start: play,
    stop: stopEngine,
    seek: seek,
    rebase: rebase,
    destroy: destroy,
    positionAt: positionAt,
    scheduleAhead: scheduleAhead,
    tick: tick,
    updateMix: updateMix,
    readLevels: readLevels,
    paintMeters: paintMeters,
    levels: function () { return lastLevels; },
    trackNode: function (id) { return tracks.get(id) || null; },
    debug: function () {
      return {
        context: ctx,
        masterGain: masterGain,
        masterAnalyser: masterAnalyser,
        workletNode: workletNode,
        trackCount: tracks.size,
        voiceCount: activeSources.size,
        voices: voiceHistory.slice(),
        originTime: originTime,
        originBar: originBar,
        nextBar: nextBar,
        running: running,
        fallbackMode: fallbackMode,
        barSeconds: barSeconds(),
        contextState: ctx ? ctx.state : 'none'
      };
    }
  };
})();
