'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHarness } = require('./support/harness.js');

test('j1a — Espace crée un AudioContext et le curseur ne dérive pas après 10 min', () => {
  const h = createHarness({ bars: 1000, cycle: false, pos: 1 });
  h.A.ACTIONS.play();
  const engine = h.engine;
  const d = engine.debug();
  assert.equal(d.running, true);
  assert.equal(d.contextState, 'running');
  assert.equal(h.state.playing, true);
  assert.equal(h.state.clock.mode, 'AudioContext');
  assert.equal(h.state.clock.currentTime(), 0);

  h.setCurrentTime(d.originTime + 600);
  assert.equal(engine.positionAt(d.originTime + 600), 301);
  engine.tick();
  assert.equal(h.state.pos, 301);
  assert.equal(h.state.clock.positionBars(), 301);
  assert.equal(h.state.clock.driftSeconds(), 0);
  assert.match(h.status.textContent, /Lecture audio|Arrêt/);
});

test('j1b — oscillateurs, bruit filtré, gains de piste et 9 pistes sonores', () => {
  const h = createHarness();
  h.A.ACTIONS.play();
  const engine = h.engine;
  const d = engine.debug();
  engine.scheduleAhead(d.originTime + 1.0);
  const ctx = d.context;
  assert.ok(d.trackCount >= 9);
  assert.ok(ctx.oscillators.length > 0);
  assert.ok(ctx.bufferSources.length > 0);
  assert.ok(ctx.gains.length >= 10);
  const names = new Set(engine.debug().voices.map((v) => v.name));
  for (const expected of ['kick', 'snare', 'hat', 'bass', 'guitar', 'guitarSolo', 'rhodes', 'vocal', 'choir', 'perc', 'amb']) {
    assert.ok(names.has(expected), 'source manquante : ' + expected);
  }
  assert.ok(engine.debug().voices.some((v) => v.track === 'voix'));
  assert.ok(!engine.debug().voices.some((v) => v.track === 'video'));
});

test('j1c — boucle A/B, métronome audible et précompte de 4 temps', () => {
  const loopHarness = createHarness({ cycle: true, pos: 16.95, click: true, bars: 1000 });
  loopHarness.A.ACTIONS.play();
  const loopEngine = loopHarness.engine;
  const origin = loopEngine.debug().originTime;
  loopHarness.setCurrentTime(origin + 0.1);
  assert.ok(Math.abs(loopEngine.positionAt(origin + 0.1) - 9) < 1e-9);
  loopEngine.scheduleAhead(origin + 0.5);
  assert.ok(loopEngine.debug().voices.some((v) => v.name === 'metronome'));
  assert.ok(loopEngine.debug().voices.some((v) => v.when >= origin && v.track !== '__countin'));
  const voicesBeforeClickToggle = loopEngine.debug().voiceCount;
  loopHarness.A.ACTIONS.click(); // option seule : aucun rebase, aucune voix annulée
  assert.equal(loopEngine.debug().voiceCount, voicesBeforeClickToggle);

  const countHarness = createHarness({ precount: true });
  countHarness.A.ACTIONS.play();
  const countEngine = countHarness.engine;
  const d = countEngine.debug();
  assert.ok(d.originTime >= 2.06);
  const countIn = d.voices.filter((v) => v.track === '__countin' && v.name === 'metronome');
  assert.equal(countIn.length, 4);
  assert.equal(countIn[0].frequency, 1600);
  assert.equal(countIn[1].frequency, 1050);
});

test('j1d — fader/mute/solo pilotent de vrais nœuds de gain et les VU mesurent l’audio', () => {
  const h = createHarness();
  h.A.ACTIONS.play();
  const engine = h.engine;
  const voix = h.A.trackById('voix');
  const basse = h.A.trackById('basse');
  voix.db = -6;
  engine.updateMix();
  const voixNode = engine.trackNode('voix');
  const lastTarget = (node) => {
    const events = node.gain.gain.events.filter((e) => e[0] === 'target');
    return events.length ? events[events.length - 1][1] : null;
  };
  assert.ok(Math.abs(lastTarget(voixNode) - Math.pow(10, -6 / 20)) < 1e-9);

  voix.mute = true;
  engine.updateMix();
  assert.equal(lastTarget(voixNode), 0);

  voix.mute = false;
  voix.solo = true;
  engine.updateMix();
  assert.ok(lastTarget(voixNode) > 0);
  assert.equal(lastTarget(engine.trackNode('basse')), 0);
  assert.equal(basse.solo, false);

  const analyser = engine.debug().masterAnalyser;
  analyser.samples.fill(0.5);
  const levels = engine.readLevels();
  assert.ok(levels.master.rms > 0);
  assert.ok(levels.master.peak > 0);

  engine.paintMeters({ master: { rms: 0.5, peak: 1 }, voix: { rms: 0.25, peak: 0.5 } });
  assert.match(h.masterStrip._lvl.style['--lvl'], /%$/);
  assert.match(h.masterStrip._pk.style['--pk'], /%$/);
  assert.equal(h.meters.levels().voix.rms, 0.25);

  const nativeLevels = h.meters.fromNative({
    tracks: [{ levelL: 0.5, levelR: 0.25 }, { levelL: 0, levelR: 0 }]
  });
  assert.ok(nativeLevels.master.rms > 0);
  assert.ok(nativeLevels.native_0.peak > 0);
  assert.match(h.masterStrip._lvl.style['--lvl'], /%$/);
});

test('j1e — arrêt avec rampe, suspend, libération et 10 cycles sans fuite de contexte', () => {
  const h = createHarness();
  const engine = h.engine;
  for (let i = 0; i < 10; i++) {
    h.A.ACTIONS.play();
    const d = engine.debug();
    engine.scheduleAhead(d.originTime + 0.3);
    assert.ok(d.voiceCount > 0);
    h.A.ACTIONS.stop();
    h.runTimers(100);
    assert.equal(h.state.playing, false);
    assert.equal(engine.debug().contextState, 'suspended');
    assert.equal(engine.debug().voiceCount, 0);
    assert.equal(h.contexts.length, 1);
  }
  const master = engine.debug().masterGain;
  assert.ok(master.gain.events.some((e) => e[0] === 'linear' && e[1] === 0));
  engine.destroy();
  assert.equal(engine.debug().context, null);
  assert.equal(h.contexts[0].closed, true);
  assert.equal(engine.debug().running, false);
});

test('pont natif — le moteur Web Audio cède la priorité et expose quand même les compteurs', () => {
  const h = createHarness({ native: true });
  assert.equal(h.window.ALPHA_AUDIO.mode, 'native');
  assert.equal(h.contexts.length, 0);
  assert.match(h.A.ACTIONS.play.toString(), /state\.playing = true/); // action d’origine conservée
  h.A.ACTIONS.play();
  assert.equal(h.contexts.length, 0);
  const levels = h.meters.fromNative({ tracks: [{ levelL: 0.4, levelR: 0.2 }] });
  assert.ok(levels.master.rms > 0);
});
