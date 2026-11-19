'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../UI/AlphaStudio/src/audio-core.js');

test('j1a — horloge musicale calculée depuis currentTime, sans intégration pas à pas', () => {
  assert.equal(C.secondsPerBar(120), 2);
  assert.equal(C.secondsPerBeat(120), 0.5);
  assert.equal(C.barAt(600, 1, 120, null), 301);
  assert.equal(C.timeAtBar(301, 1, 0.06, 120), 600.06);
  const loop = { enabled: true, start: 9, end: 17 };
  assert.equal(C.wrapBar(16.999, loop), 16.999);
  assert.equal(C.wrapBar(17, loop), 9);
  assert.equal(C.barAt(0.1, 16.95, 120, loop), 9);
});

test('j1c — découpe du cycle A/B et grille de métronome', () => {
  const loop = { enabled: true, start: 9, end: 17 };
  const atBoundary = C.loopSegments(16.9, 17.3, loop);
  assert.equal(atBoundary.length, 2);
  assert.ok(Math.abs(atBoundary[0].barFrom - 16.9) < 1e-9);
  assert.ok(Math.abs(atBoundary[0].barTo - 17) < 1e-9);
  assert.ok(Math.abs(atBoundary[1].barFrom - 9) < 1e-9);
  assert.ok(Math.abs(atBoundary[1].barTo - 9.3) < 1e-9);

  const afterBoundary = C.loopSegments(17, 26, loop);
  assert.equal(afterBoundary.length, 2);
  assert.equal(afterBoundary[0].barFrom, 9);
  assert.equal(afterBoundary[0].barTo, 17);
  assert.equal(afterBoundary[1].barFrom, 9);
  assert.equal(afterBoundary[1].barTo, 10);

  const beats = C.beatPositions(9, 11, 4);
  assert.equal(beats.length, 8);
  assert.equal(beats.filter((b) => b.accent).length, 2);
  assert.equal(beats[0].bar, 9);
  assert.equal(beats[0].accent, true);
});

test('j1b — 12 sources de démonstration, toutes dérivées des événements', () => {
  assert.ok(Object.keys(C.INSTRUMENTS).length >= 12);
  assert.equal(C.instrumentFor({ type: 'midi', wave: '' }, { id: 'drums', kind: 'midi' }), 'drums');
  assert.equal(C.instrumentFor({ wave: 'bass' }, { id: 'basse', kind: 'audio' }), 'bass');
  assert.equal(C.instrumentFor({ wave: 'guitarSolo' }, { id: 'gtrS', kind: 'audio' }), 'guitarSolo');
  assert.equal(C.instrumentFor({ wave: 'vocal', muted: true }, { id: 'voix', kind: 'audio' }), null);
  assert.equal(C.instrumentFor({ wave: 'video' }, { id: 'video', kind: 'video' }), null);
  assert.deepEqual(C.drumKitAt(0), ['kick', 'hat']);
  assert.deepEqual(C.drumKitAt(2), ['kick', 'snare', 'hat']);
  for (const name of Object.keys(C.INSTRUMENTS)) {
    assert.ok(Number.isFinite(C.noteFrequency(name, 3, 9)));
    assert.ok(C.noteFrequency(name, 3, 9) >= 20);
  }
});

test('j1d — fader, mute/solo, panoramique et mesure de niveau', () => {
  assert.ok(Math.abs(C.dbToGain(-6) - Math.pow(10, -6 / 20)) < 1e-12);
  assert.equal(C.dbToGain(-60), 0);
  assert.equal(C.trackGain({ db: -3, mute: true, solo: false }, false), 0);
  assert.equal(C.trackGain({ db: -3, mute: false, solo: false }, true), 0);
  assert.ok(C.trackGain({ db: -3, mute: false, solo: true }, true) > 0);
  assert.equal(C.panValue({ pan: 2 }), 1);
  assert.equal(C.panValue({ pan: -2 }), -1);
  assert.equal(C.meterPercent(0), 2);
  assert.equal(C.meterPercent(1), 72);
  const level = C.levelFromSamples(new Float32Array([0, 1, -1, 0]));
  assert.ok(Math.abs(level.rms - Math.sqrt(0.5)) < 1e-6);
  assert.equal(level.peak, 1);
});

test('j1e — le noyau reste indépendant du DOM et de Web Audio', () => {
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.AudioContext, 'undefined');
  assert.equal(C.loopSegments(1, 1, null).length, 0);
  assert.equal(C.loopSegments(1, 2, null)[0].barFrom, 1);
});
