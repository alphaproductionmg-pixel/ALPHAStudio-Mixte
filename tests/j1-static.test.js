'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sha = (p) => crypto.createHash('sha256').update(read(p)).digest('hex');

test('build — livrable unique, autosuffisant, contenant tout J1', () => {
  const html = read('UI/AlphaStudio/alpha-studio.html');
  assert.ok(html.length > 947303);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.ok(html.includes('AudioContext'));
  assert.ok(html.includes('registerProcessor("alpha-mix"'));
  assert.ok(html.includes('window.ALPHA_AUDIO ='));
  assert.ok(html.includes('ALPHA_AUDIO_METERS'));
  assert.ok(html.includes('setPlayhead'));
  assert.ok(!html.includes('<script src='));
  assert.ok(!html.includes('@import url('));
  // Un script de détection native dans <head> + le bundle applicatif unique.
  assert.equal((html.match(/<script>/g) || []).length, 2);
  assert.match(html, /<script>if \(window\.__JUCE__ && window\.__JUCE__\.backend\) document\.documentElement\.dataset\.alphaNative = '1';<\/script>/);
  const inline = html.match(/<script>\n([\s\S]*)\n<\/script>/);
  assert.ok(inline);
  assert.doesNotThrow(() => new vm.Script(inline[1], { filename: 'alpha-studio.inline.js' }));
});

test('sources — une seule vérité, pont natif préservé, archive d’origine intacte', () => {
  const build = read('UI/AlphaStudio/build.py');
  assert.ok(build.includes('"audio-core.js"'));
  assert.ok(build.includes('js_after_bridge = ["audio.js", "layout.js"]'));
  assert.ok(build.includes('assert "window.ALPHA_AUDIO" in html'));

  const app = read('UI/AlphaStudio/src/app.js');
  assert.ok(app.includes('function setPlayhead(p, follow)'));
  assert.ok(app.includes('setPlayhead: setPlayhead'));

  const bridge = read('UI/AlphaStudio/native-bridge.js');
  assert.ok(bridge.includes('if (A.setPlayhead) A.setPlayhead(A.state.pos);'));
  assert.ok(bridge.includes('ALPHA_AUDIO_METERS.fromNative'));
  assert.ok(bridge.includes('__juce__invoke'));
  assert.ok(bridge.includes('replaceState'));

  const audio = read('UI/AlphaStudio/src/audio.js');
  assert.ok(audio.includes('levels[t.id]'));
  assert.ok(audio.includes('if (window.ALPHA_NATIVE)'));
  assert.ok(audio.includes('audioWorklet.addModule'));
  assert.ok(audio.includes('getFloatTimeDomainData'));
  assert.ok(!/\/\/ TODO|\/\* TODO/.test(audio));

  const original = read('UI/AlphaStudio/alpha-studio-original.html');
  const archived = read('UI/AlphaStudio/SourceArchive/ALPHA-Studio/alpha-studio.html');
  assert.equal(sha('UI/AlphaStudio/alpha-studio-original.html'),
    sha('UI/AlphaStudio/SourceArchive/ALPHA-Studio/alpha-studio.html'));
  assert.equal(Buffer.byteLength(original, 'utf8'), 947303);
  assert.ok(!original.includes('AudioContext'));
  assert.equal(archived, original);
});

test('livraison — contrat J1, documentation et lanceur sans npm', () => {
  const etapes = read('ETAPES.md');
  assert.ok(!etapes.includes('\\1**codé'));
  assert.match(etapes, /\| \*\*J1\*\* \|.*codé, tests automatiques PASS/);
  assert.match(etapes, /Méthode verrouillée/);
  assert.match(etapes, /push\/compile GitHub à la fin/);
  assert.ok(fs.existsSync(path.join(ROOT, 'ETAPES.md')));
  assert.ok(fs.existsSync(path.join(ROOT, 'docs/J1-contrat.md')));
  const contract = read('docs/J1-contrat.md');
  assert.match(contract, /Contrat/);
  assert.match(contract, /sources synthétisées/);
  assert.match(contract, /non fait/);
  const integration = read('Integration/README.md');
  assert.match(integration, /Repli Web Audio/);
  const runner = read('tests/run.sh');
  assert.match(runner, /python3 UI\/AlphaStudio\/build\.py/);
  assert.match(runner, /node --test/);
  assert.match(runner, /alpha-core\.test\.cpp/);
  assert.match(runner, /j2-j6-native\.test\.js/);
  assert.match(runner, /juce-syntax\.sh/);
  assert.ok(!runner.includes('npm install'));
  const mode = fs.statSync(path.join(ROOT, 'tests/run.sh')).mode;
  assert.ok(mode & 0o111);
});
