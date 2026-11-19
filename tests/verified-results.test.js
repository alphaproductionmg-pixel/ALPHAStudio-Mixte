'use strict';
/* Tests FONCTIONNELS de vérification des résultats (audit utilisateur 0.5.0) :
   on exécute réellement le code du pont natif et du traitement par lot dans un
   bac à sable, avec un moteur simulé qui CONFIRME ou REFUSE les commandes.
   On vérifie les résultats observables (appels envoyés, ordre séquentiel,
   toasts, état), jamais la simple présence de noms de commandes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHarness } = require('./support/harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

/* ------------------------------------------------------------------ */
/* 1. Pont natif : sendChecked ne rapporte une réussite que sur        */
/*    confirmation explicite du moteur (commandResult).                */
/* ------------------------------------------------------------------ */

function bridgeHarness() {
  const h = createHarness({ nativeBridge: true });
  h.runTimers(0);
  // le premier appel est getState : on y répond avec un état minimal
  h.native.completeNative({ tracks: [], status: 'prêt' });
  return h;
}

test('pont natif — sendChecked : réussite UNIQUEMENT sur confirmation moteur', async () => {
  const h = bridgeHarness();
  const N = h.window.ALPHA_NATIVE;

  // (a) moteur confirme → ok:true, detail propagé
  let p = N.sendChecked('renameMedia', { path: 'a.wav', newName: 'b.wav' });
  h.native.completeNative({
    tracks: [], status: 'renommé',
    commandResult: { seq: 1, command: 'renameMedia', ok: true, error: '', detail: 'b.wav déplacé, 1 référence mise à jour' }
  });
  let r = await p;
  assert.equal(r.ok, true);
  assert.equal(r.command, 'renameMedia');
  assert.match(r.detail, /1 référence mise à jour/);

  // (b) moteur refuse → ok:false avec la raison réelle
  p = N.sendChecked('removeMedia', { path: 'manquant.wav' });
  h.native.completeNative({
    tracks: [], status: 'échec',
    commandResult: { seq: 2, command: 'removeMedia', ok: false, error: 'fichier introuvable sur le disque', detail: '' }
  });
  r = await p;
  assert.equal(r.ok, false);
  assert.match(r.error, /fichier introuvable/);

  // (c) confirmation pour une AUTRE commande → jamais de réussite implicite
  p = N.sendChecked('renameMedia', { path: 'a.wav', newName: 'b.wav' });
  h.native.completeNative({
    tracks: [], status: 'autre',
    commandResult: { seq: 3, command: 'play', ok: true, error: '', detail: '' }
  });
  r = await p;
  assert.equal(r.ok, false);
  assert.match(r.error, /non confirmée/i);

  // (d) snapshot sans commandResult → pas de réussite inventée
  p = N.sendChecked('renameMedia', {});
  h.native.completeNative({ tracks: [], status: 'muET' });
  r = await p;
  assert.equal(r.ok, false);

  // (e) échec de transport → ok:false, aucune réussite affichée
  p = N.sendChecked('renameMedia', {});
  h.native.failNative('WebView2 indisponible');
  r = await p;
  assert.equal(r.ok, false);
  assert.match(r.error, /WebView2 indisponible/);
  await h.flush();
});

/* ------------------------------------------------------------------ */
/* 2. Traitement par lot (windows3.js) : exécution séquentielle,       */
/*    vérifiée, honnête — bac à sable réel avec moteur programmable.   */
/* ------------------------------------------------------------------ */

function makeEl(props) {
  const el = Object.assign({
    dataset: {}, textContent: '', innerHTML: '', disabled: false,
    listeners: {},
    addEventListener(t, fn) { (this.listeners[t] || (this.listeners[t] = [])).push(fn); },
    dispatch(type, ev) { (this.listeners[type] || []).forEach((fn) => fn(Object.assign({ currentTarget: this }, ev || {}))); }
  }, props || {});
  return el;
}

function win3Sandbox(opts) {
  /* opts: { clips: [...], confirm: fn(command, data, callIndex) -> {ok,...} | Promise,
             hasChecked: bool, stateMutator: fn(callIndex) } */
  const toasts = [];
  const calls = [];
  const state = {
    selectedTrack: 0,
    tracks: [{ clips: (opts.clips || []).map((c, i) => Object.assign({ id: 'c' + i, name: 'Clip ' + i, startBars: 1 + i * 4, lenBars: 4 }, c)) }]
  };
  const elBilist = makeEl();
  const elBiright = makeEl();
  const elFoot = makeEl();
  const btns = ['new', 'rename', 'del', 'manage', 'close', 'apply'].map((k) => makeEl({ dataset: { bpa: k } }));
  const body = {
    querySelector(sel) {
      if (sel === '[data-bilist]') return elBilist;
      if (sel === '[data-biright]') return elBiright;
      if (sel === '[data-batchfoot]') return elFoot;
      if (sel === '[data-bpa="apply"]') return btns[btns.length - 1];
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-bpa]') return btns;
      if (sel === '[data-bi]') return [];
      return [];
    }
  };
  const registered = {};
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    Promise, Math, JSON, Number, String, Array, Object, Boolean, RegExp, Error, Date, isNaN, parseInt, parseFloat,
    setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: (t) => makeEl({ tagName: t }) }
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.ALPHA = { showToast: (msg, ctx) => toasts.push({ msg: String(msg), ctx: String(ctx || '') }) };
  sandbox.window.ALPHAWIN = { register: (defs) => Object.assign(registered, defs), close: () => {} };
  const native = {
    send: () => true,
    getState: () => state
  };
  if (opts.hasChecked !== false) {
    native.sendChecked = (command, data) => {
      const i = calls.length;
      calls.push({ command, data: data || {} });
      if (opts.stateMutator) opts.stateMutator(i, state);
      const out = (opts.confirm || (() => ({ ok: true })))(command, data || {}, i);
      return Promise.resolve(Object.assign({ command, error: '', detail: '', status: '' }, out));
    };
  }
  sandbox.window.ALPHA_NATIVE = native;
  vm.createContext(sandbox);
  vm.runInContext(read('UI/AlphaStudio/src/windows3.js'), sandbox, { filename: 'windows3.js' });
  assert.ok(registered.batch, 'la fenêtre batch doit être enregistrée');
  const built = registered.batch.build();
  built.after(body);
  return {
    toasts, calls, state, body, btns, elFoot,
    apply: () => { btns[btns.length - 1].dispatch('click'); }
  };
}

const CHAIN_VOIX = 0; // « Voix — nettoyage » : Découper aux silences, Normaliser (-0,3 dB), Compresseur de piste

test('batch — succès : chaîne séquentielle confirmée par le moteur, résumé honnête', async () => {
  const s = win3Sandbox({ clips: [{}, {}] });
  s.apply();
  await tick();
  // 3 opérations × 2 événements, dans l'ordre, un seul appel à la fois
  assert.equal(s.calls.length, 6);
  assert.deepEqual(s.calls.map((c) => c.command),
    ['splitAtSilences', 'processClip', 'setFx', 'splitAtSilences', 'processClip', 'setFx']);
  assert.equal(s.calls[0].data.clipIndex, 0);
  assert.equal(s.calls[3].data.clipIndex, 1);
  assert.equal(s.calls[1].data.op, 'normalize');
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last.msg, /réellement exécuté et confirmé par le moteur/);
  assert.match(last.msg, /6 opération\(s\) confirmée\(s\)/);
  assert.ok(!/échec/i.test(last.msg), 'aucun échec ne doit être annoncé quand tout est confirmé');
});

test('batch — échec moteur : la chaîne de l’événement s’arrête, jamais de faux succès', async () => {
  // normalisation refusée par le moteur (fichier verrouillé), le reste accepté
  const s = win3Sandbox({
    clips: [{}, {}],
    confirm: (command, data) => {
      if (command === 'processClip' && data.op === 'normalize')
        return { ok: false, error: 'écriture du fichier refusée (verrouillé)' };
      return { ok: true };
    }
  });
  s.apply();
  await tick();
  // événement 1 : découpe OK, normalisation KO → compresseur JAMAIS envoyé ;
  // événement 2 : idem. setFx ne doit donc apparaître nulle part.
  assert.deepEqual(s.calls.map((c) => c.command),
    ['splitAtSilences', 'processClip', 'splitAtSilences', 'processClip']);
  assert.ok(!s.calls.some((c) => c.command === 'setFx'), 'pas de traitement aveugle après un échec');
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last.msg, /NON entièrement exécuté/);
  assert.match(last.msg, /écriture du fichier refusée/);
  assert.match(last.msg, /2 opération\(s\) confirmée\(s\) par le moteur, 2 échec\(s\)/);
  assert.match(s.elFoot.textContent, /2 échec\(s\)/);
});

test('batch — événement inexistant : aucune commande envoyée, arrêt immédiat', async () => {
  // le moteur supprime l’événement 2 après la première opération (découpe)
  const s = win3Sandbox({
    clips: [{}, {}],
    stateMutator: (i, st) => { if (i === 0) st.tracks[0].clips.length = 1; }
  });
  s.apply();
  await tick();
  // l'événement 1 termine sa chaîne (3 opérations), puis l'événement 2 est
  // détecté introuvable AVANT tout envoi : aucune commande ne le concerne.
  assert.equal(s.calls.length, 3);
  // « Compresseur de piste » agit sur la piste (pas de clipIndex) : aucune
  // commande ne doit jamais viser l'événement 2 disparu (clipIndex 1).
  assert.ok(s.calls.every((c) => c.data.clipIndex === undefined || c.data.clipIndex === 0),
    'aucune commande pour un événement inexistant');
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last.msg, /NON entièrement exécuté/);
  assert.match(last.msg, /introuvable/);
  assert.match(s.elFoot.textContent, /1 échec\(s\)/);
});

test('batch — piste sans événement réel : rien n’est envoyé, message honnête', async () => {
  const s = win3Sandbox({ clips: [] });
  s.apply();
  await tick();
  assert.equal(s.calls.length, 0, 'aucune commande ne doit partir vers le moteur');
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last.msg, /Aucun événement audio réel/);
  assert.match(last.msg, /aucune commande envoyée/);
});

test('batch — moteur hors ligne (pas de sendChecked) : jamais de réussite annoncée', async () => {
  const s = win3Sandbox({ clips: [{}], hasChecked: false });
  s.apply();
  await tick();
  assert.equal(s.calls.length, 0);
  const last = s.toasts[s.toasts.length - 1];
  assert.match(last.msg, /NON entièrement exécuté/);
  assert.match(last.msg, /hors ligne/);
});

/* ------------------------------------------------------------------ */
/* 3. Garde-fous structurels : plus aucun succès « fire-and-forget »   */
/*    sur les opérations qui modifient le disque ou le projet.         */
/* ------------------------------------------------------------------ */

test('garde-fous — les opérations sensibles passent par l’envoi vérifié', () => {
  const w1 = read('UI/AlphaStudio/src/windows.js');
  const w2 = read('UI/AlphaStudio/src/windows2.js');
  const w3 = read('UI/AlphaStudio/src/windows3.js');
  const app = read('UI/AlphaStudio/src/app.js');
  const bridge = read('UI/AlphaStudio/native-bridge.js');

  // le pont expose la confirmation moteur
  assert.match(bridge, /sendChecked/);
  assert.match(bridge, /commandResult/);
  assert.match(bridge, /cr\.ok === true/);

  // renommage/suppression de médias : vérifiés, liste modifiée seulement sur confirmation
  assert.match(w1, /nativeChecked\('renameMedia'/);
  assert.match(w1, /nativeChecked\('removeMedia'/);
  assert.doesNotMatch(w1, /nativeSend\('renameMedia'/);
  assert.doesNotMatch(w1, /nativeSend\('removeMedia'/);

  // traitement par lot : plus d'envoi aveugle
  assert.doesNotMatch(w3, /nativeSend\('processClip'/);
  assert.doesNotMatch(w3, /nativeSend\('splitAtSilences'/);

  // écritures destructives vérifiées partout
  for (const [name, src] of [['windows.js', w1], ['windows2.js', w2], ['app.js', app]]) {
    assert.ok(!/nativeSend\('processClip'/.test(src), name + ' : processClip doit être vérifié');
    assert.ok(!/nativeSend\('stretchClip'/.test(src), name + ' : stretchClip doit être vérifié');
    assert.ok(!/nativeSend\('splitAtSilences'/.test(src), name + ' : splitAtSilences doit être vérifié');
  }
});

test('garde-fous — le moteur publie commandResult et vérifie ses écritures', () => {
  const eng = read('Engines/ALPHA-Studio/Source/Engine.h');
  // protocole de commande vérifiée
  assert.match(eng, /commandResult/);
  assert.match(eng, /dispatchCommand/);
  // writeClipToDisk rapporte une erreur (chaîne non vide) au lieu d'un no-op silencieux
  assert.match(eng, /String writeClipToDisk/);
  assert.match(eng, /writeAudioBuffer/);
  // vérification par relecture après écriture
  assert.match(eng, /createReaderFor \(dest\)/);
  assert.match(eng, /contrôle du fichier écrit échoué/);
  // rename/remove : le disque d'abord, les références seulement si vérifié
  assert.match(eng, /moveFileTo|moveToTrash/);
  assert.match(eng, /coreRefsForFile/);
});
