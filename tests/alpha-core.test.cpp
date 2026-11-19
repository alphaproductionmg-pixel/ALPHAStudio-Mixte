// Tests C++17 du noyau de projet J2→J6, sans JUCE et sans dépendance.
#include "../Engines/ALPHA-Studio/Source/AlphaProjectCore.h"

#include <cassert>
#include <cmath>
#include <iostream>
#include <string>

using namespace alpha;

static JsonValue commandPayload (std::initializer_list<std::pair<const char*, JsonValue>> values)
{
    JsonValue p (JsonValue::Type::Object);
    for (const auto& kv : values) p[kv.first] = kv.second;
    return p;
}

static void testJ2JsonAndProject()
{
    std::string err;
    JsonValue j = JsonValue::parse ("{\"format\":\"ALPHAPROJ\",\"texte\":\"é\\u00e9\",\"points\":[[1,0.5],[9,1]],\"ok\":true,\"n\":-2.25}", err);
    assert (err.empty());
    assert (j.isObject());
    assert (jString (j, "texte") == "éé");
    assert (std::abs (jNumber (j, "n") + 2.25) < 1e-12);
    assert (jBool (j, "ok"));
    assert (j.get ("points").array.size() == 2);
    assert (j.dump().find ("ALPHAPROJ") != std::string::npos);
    JsonValue bad = JsonValue::parse ("{\"x\":", err);
    (void) bad;
    assert (! err.empty());

    ProjectCore core;
    auto doc = core.serialize();
    assert (doc.find ("\"format\":\"ALPHAPROJ\"") != std::string::npos);
    assert (doc.find ("\"schema\":3") != std::string::npos);
    assert (doc.find ("\"videoEnabled\":false") != std::string::npos);
    assert (core.state.buses.size() == 4);
    assert (core.state.templates.size() == 4);
    assert (core.state.projectLengthBars() >= 84.0);

    ProjectCore loaded;
    assert (loaded.load (doc));
    assert (loaded.state.buses.size() == core.state.buses.size());
    assert (loaded.state.markers.size() == core.state.markers.size());
    assert (! loaded.load ("{\"format\":\"AUTRE\"}"));
    assert (! loaded.lastError.empty());
    std::cout << "j2a JSON/.alphaproj : PASS\n";
}

static void testJ2UnlimitedHistoryReal()
{
    ProjectCore core;
    const double initial = core.state.masterDb;
    for (int i = 0; i < 60; ++i)
        assert (core.command ("setMaster", commandPayload ({ { "volumeDb", JsonValue ((i + 1) / 10.0) } })));
    assert (core.history.size() == 61); // état initial + 60 mutations, sans limite à 40.
    assert (core.history.canUndo());
    for (int i = 0; i < 60; ++i) assert (core.undo());
    assert (std::abs (core.state.masterDb - initial) < 1e-12);
    assert (! core.history.canUndo());
    for (int i = 0; i < 60; ++i) assert (core.redo());
    assert (std::abs (core.state.masterDb - 6.0) < 1e-12);
    assert (core.jumpHistory (30));
    assert (core.history.index() == 30);
    assert (core.apiState().get ("history").array.size() == 61);
    std::cout << "j2b historique illimité, undo/redo/jump : PASS\n";
}

static void testJ2EditingAndPersistence()
{
    ProjectCore core;
    assert (core.command ("addTrack", commandPayload ({ { "name", JsonValue ("Voix") } })));
    assert (core.command ("addTrack", commandPayload ({ { "name", JsonValue ("Guitare") } })));
    assert (core.command ("addClip", commandPayload ({ { "trackIndex", JsonValue (0) }, { "name", JsonValue ("Prise.wav") }, { "media", JsonValue ("Media/Prise.wav") }, { "startBars", JsonValue (3.0) }, { "lenBars", JsonValue (4.0) } })));
    JsonValue paste (JsonValue::Type::Object);
    JsonValue pasteClips (JsonValue::Type::Array);
    JsonValue c0 (JsonValue::Type::Object);
    c0["trackIndex"] = JsonValue (1); c0["name"] = JsonValue ("Copie 1");
    c0["media"] = JsonValue ("Media/Prise.wav"); c0["startBars"] = JsonValue (5.0); c0["lenBars"] = JsonValue (4.0);
    JsonValue c1 (JsonValue::Type::Object);
    c1["trackIndex"] = JsonValue (0); c1["name"] = JsonValue ("Copie 2");
    c1["media"] = JsonValue ("Media/Prise.wav"); c1["startBars"] = JsonValue (9.0); c1["lenBars"] = JsonValue (4.0);
    pasteClips.array.push_back (c0); pasteClips.array.push_back (c1); paste["clips"] = pasteClips;
    assert (core.command ("pasteClips", paste));
    assert (core.state.tracks[0].clips.size() == 2);
    assert (core.state.tracks[1].clips.size() == 1);
    assert (core.state.media.size() == 1);
    assert (core.command ("splitClip", commandPayload ({ { "trackIndex", JsonValue (0) }, { "clipIndex", JsonValue (0) }, { "atBars", JsonValue (5.0) } })));
    assert (core.state.tracks[0].clips.size() == 3);
    assert (core.command ("duplicateTrack", commandPayload ({ { "index", JsonValue (0) } })));
    assert (core.state.tracks.size() == 3);
    JsonValue replacement (JsonValue::Type::Object);
    replacement["state"] = stateToJson (core.state);
    assert (core.command ("replaceState", replacement));
    assert (core.state.tracks[1].name == "Voix copie");
    const auto historyBeforeNoOp = core.history.size();
    JsonValue noOp (JsonValue::Type::Object);
    noOp["state"] = stateToJson (core.state);
    assert (core.command ("replaceState", noOp));
    assert (core.history.size() == historyBeforeNoOp); // l'horodatage seul ne crée pas de niveau.
    core.markSaved();
    assert (! core.dirty);
    assert (core.command ("setTempo", commandPayload ({ { "bpm", JsonValue (140.0) } })));
    assert (core.dirty);
    assert (core.revert());
    assert (std::abs (core.state.bpm - 120.0) < 1e-12);
    std::cout << "j2c édition multi-pistes, médias, revert : PASS\n";
}

static void testJ3J4AutomationAndDsp()
{
    ProjectCore core;
    assert (core.command ("setRecordingOptions", commandPayload ({ { "punchEnabled", JsonValue (true) }, { "punchInBars", JsonValue (9.0) }, { "punchOutBars", JsonValue (17.0) }, { "precountBars", JsonValue (1.0) }, { "latencyMs", JsonValue (3.5) } })));
    assert (std::abs (core.state.latencyMs - 3.5) < 1e-12);
    assert (core.command ("addTrack", commandPayload ({ { "name", JsonValue ("Synth") } })));
    JsonValue pts (JsonValue::Type::Array);
    JsonValue a (JsonValue::Type::Array); a.array.push_back (JsonValue (1.0)); a.array.push_back (JsonValue (0.25)); pts.array.push_back (a);
    JsonValue b (JsonValue::Type::Array); b.array.push_back (JsonValue (9.0)); b.array.push_back (JsonValue (0.85)); pts.array.push_back (b);
    JsonValue p (JsonValue::Type::Object); p["trackIndex"] = JsonValue (0); p["param"] = JsonValue ("Volume"); p["points"] = pts;
    assert (core.command ("setAutomation", p));
    assert (core.state.tracks[0].automation.size() == 1);
    assert (std::abs (core.state.tracks[0].automation[0].valueAt (5.0) - 0.55) < 1e-9);
    assert (core.command ("setFx", commandPayload ({ { "trackIndex", JsonValue (0) }, { "band", JsonValue (2) }, { "field", JsonValue ("gainDb") }, { "value", JsonValue (6.0) } })));
    assert (std::abs (core.state.tracks[0].fx.eq[2].gainDb - 6.0) < 1e-12);
    EqBand band; band.freq = 2500.0; band.gainDb = 6.0; band.q = 0.9;
    Biquad q = makeBiquad (band, 48000.0);
    assert (std::isfinite (q.b0) && std::isfinite (q.a1));
    float y = 0.0f;
    for (int i = 0; i < 256; ++i) y = q.process (i % 2 ? 0.5f : -0.5f);
    assert (std::isfinite (y));
    assert (std::abs (compressorGainDb (-6.0, -18.0, 3.0) + 8.0) < 1e-9);
    DynamicsProcessor comp;
    Dynamics d; d.enabled = true; d.thresholdDb = -18; d.ratio = 4; comp.configure (48000.0, d);
    float l = 0.9f, r = 0.9f; comp.process (l, r);
    assert (std::isfinite (l));
    MeterAccumulator meter;
    for (int i = 0; i < 1000; ++i) meter.add (0.25f, -0.25f);
    assert (std::isfinite (meter.lufs()));
    assert (meter.peakValue() >= 0.25);
    std::cout << "j3/j4 punch, automation, EQ, dynamique, LUFS : PASS\n";
}

static void testJ5J6MidiPrefsVideo()
{
    ProjectCore core;
    assert (core.command ("applyTemplate", commandPayload ({ { "name", JsonValue ("Démo 4 pistes") } })));
    assert (core.state.tracks.size() == 4);
    assert (core.state.media.size() == 4);
    assert (core.state.videoEnabled == false);
    JsonValue notes (JsonValue::Type::Array);
    for (int i = 0; i < 3; ++i)
    {
        JsonValue n (JsonValue::Type::Object);
        n["startBars"] = JsonValue (1.0 + i * 0.27);
        n["lenBars"] = JsonValue (0.25);
        n["pitch"] = JsonValue (60 + i);
        n["velocity"] = JsonValue (100);
        notes.array.push_back (n);
    }
    JsonValue p (JsonValue::Type::Object); p["trackIndex"] = JsonValue (0); p["notes"] = notes;
    assert (core.command ("setMidiNotes", p));
    assert (core.state.tracks[0].instrument);
    assert (core.command ("quantizeMidi", commandPayload ({ { "trackIndex", JsonValue (0) }, { "gridBars", JsonValue (0.25) } })));
    assert (std::abs (core.state.tracks[0].midiNotes[1].startBars - 1.25) < 1e-9);
    assert (core.command ("setPreferences", commandPayload ({ { "autoSave", JsonValue (true) }, { "highContrast", JsonValue (true) }, { "autoSaveSeconds", JsonValue (15.0) } })));
    assert (core.state.preferences.highContrast);
    assert (core.command ("setControlRoom", commandPayload ({ { "monitorDb", JsonValue (-3.0) }, { "mono", JsonValue (true) }, { "dim", JsonValue (true) } })));
    assert (core.state.controlRoom.mono && core.state.controlRoom.dim);
    assert (! core.command ("setVideoEnabled", commandPayload ({ { "enabled", JsonValue (true) } })));
    assert (core.state.videoEnabled == false);
    assert (core.lastError.find ("test final") != std::string::npos);
    const std::string original = "ALPHA Studio J2-J6 :: médias ✦";
    assert (base64Decode (base64Encode (original)) == original);
    uint32_t seed = 7;
    assert (std::isfinite (triangularDither (seed)));
    std::vector<MidiNote> smfNotes;
    smfNotes.push_back ({ 1.0, 0.25, 60, 100, true });
    smfNotes.push_back ({ 1.25, 0.5, 64, 90, true });
    const auto smf = makeSmf (smfNotes, 480);
    assert (smf.compare (0, 4, "MThd") == 0);
    const auto parsed = parseSmf (smf);
    assert (parsed.error.empty());
    assert (parsed.notes.size() == 2);
    assert (parsed.notes[0].pitch == 60);
    assert (std::abs (parsed.notes[1].startBars - 1.25) < 1e-9);
    std::cout << "j5/j6 modèle, MIDI, préférences, Control Room, vidéo verrouillée : PASS\n";
}

static void testAuditHardening()
{
    // S5 : grammaire numérique JSON stricte, sans valeur non finie.
    std::string err;
    JsonValue strict = JsonValue::parse ("{\"x\":-2.5e+1,\"y\":0,\"z\":1.25}", err);
    assert (err.empty());
    assert (std::abs (jNumber (strict, "x") + 25.0) < 1e-12);
    assert (std::abs (jNumber (strict, "y")) < 1e-12);
    const char* invalidNumbers[] = {
        "{\"x\":1.}", "{\"x\":1e}", "{\"x\":1e+}", "{\"x\":01}",
        "{\"x\":+1}", "{\"x\":1e999}", "{\"x\":NaN}", "{\"x\":.5}"
    };
    for (const char* text : invalidNumbers)
    {
        err.clear();
        const auto bad = JsonValue::parse (text, err);
        (void) bad;
        assert (! err.empty());
    }

    // S6 : paire UTF-16 valide, substituts isolés ou mal appariés rejetés.
    err.clear();
    JsonValue unicode = JsonValue::parse ("{\"a\":\"\\uD83D\\uDE00\"}", err);
    assert (err.empty());
    assert (jString (unicode, "a") == "\xf0\x9f\x98\x80");
    const char* invalidUnicode[] = {
        "{\"a\":\"\\uD83D\"}", "{\"a\":\"\\uDE00\"}",
        "{\"a\":\"\\uD83D\\uD83D\"}", "{\"a\":\"\\uD83Dx\"}"
    };
    for (const char* text : invalidUnicode)
    {
        err.clear();
        const auto bad = JsonValue::parse (text, err);
        (void) bad;
        assert (! err.empty());
    }

    // S2/S3/S4 : SMF borné, formats 0/1, PPQN réel, Note Off avant Note On au même tick.
    std::vector<MidiNote> repeat;
    repeat.push_back ({ 1.0, 0.25, 60, 100, true });
    repeat.push_back ({ 1.25, 0.25, 60, 110, true });
    const auto smf = makeSmf (repeat, 480);
    size_t p = 22; // MThd 14 octets + en-tête MTrk 8 octets.
    bool ok = true;
    std::vector<int> statuses;
    std::vector<uint32_t> deltas;
    while (p < smf.size())
    {
        const uint32_t delta = readVarLen (smf, p, smf.size(), ok);
        assert (ok && p < smf.size());
        const int status = static_cast<uint8_t> (smf[p++]);
        if (status == 0xff)
        {
            p += 1;
            const uint32_t l = readVarLen (smf, p, smf.size(), ok);
            assert (ok && (size_t) l <= smf.size() - p);
            p += (size_t) l;
            break;
        }
        statuses.push_back (status);
        deltas.push_back (delta);
        p += 2;
    }
    assert (statuses.size() >= 4);
    assert (statuses[1] == 0x80);
    assert (statuses[2] == 0x90);
    assert (deltas[2] == 0);

    const auto smf960 = makeSmf (repeat, 960);
    const auto parsed960 = parseSmf (smf960);
    assert (parsed960.error.empty());
    assert (parsed960.ticksPerQuarter == 960);
    std::string bad = smf;
    bad[9] = 2;
    assert (! parseSmf (bad).error.empty()); // format SMF 2 rejeté
    bad = smf; bad[12] = static_cast<char> (0x80); bad[13] = 0;
    assert (! parseSmf (bad).error.empty()); // division SMPTE rejetée explicitement
    bad = smf; bad[18] = 0x7f; bad[19] = static_cast<char> (0xff); bad[20] = static_cast<char> (0xff); bad[21] = static_cast<char> (0xff);
    assert (! parseSmf (bad).error.empty()); // longueur MTrk excessive
    assert (! parseSmf (smf.substr (0, smf.size() - 2)).error.empty()); // piste tronquée
    std::cout << "audit S2/S3/S4/S5/S6 : PASS\n";
}

// =====================================================================
// Audit v6 — modèle étendu réel : types de canaux, routage, départs,
// inserts persistés, Quick Controls, marqueurs, carte de tempo, mesures,
// informations projet, espaces de travail, instantanés, projets récents,
// raccourcis, éditeur logique MIDI, modificateurs MIDI, pistes vides,
// dossiers de greffons, disposition d'interface et fermeture de projet.
// =====================================================================
static void testAuditV6ExtendedModel()
{
    ProjectCore core;
    core.command ("addTrack", commandPayload ({ { "name", JsonValue ("Chant") } }));
    core.command ("addTrack", commandPayload ({ { "name", JsonValue ("Synthé") } }));
    assert (core.state.tracks.size() == 2);

    // --- type de canal réel : audio / instrument / midi / group / fx
    assert (core.command ("setChannelType", commandPayload ({ { "index", JsonValue (1) }, { "type", JsonValue ("instrument") } })));
    assert (core.state.tracks[1].channelType == "instrument");
    assert (core.state.tracks[1].instrument);          // drapeau legacy synchronisé
    assert (core.command ("setChannelType", commandPayload ({ { "index", JsonValue (0) }, { "type", JsonValue ("midi") } })));
    assert (core.state.tracks[0].channelType == "midi" && ! core.state.tracks[0].instrument);
    assert (! core.command ("setChannelType", commandPayload ({ { "index", JsonValue (0) }, { "type", JsonValue ("inconnu") } })));
    assert (core.lastError.find ("inconnu") != std::string::npos);

    // --- routage réel : entrées/sorties, canal MIDI, bus, latence, transposition
    assert (core.command ("setTrackRouting", commandPayload ({ { "index", JsonValue (0) },
                                                              { "inputDevice", JsonValue ("ASIO Delta 1010") },
                                                              { "inputChannel", JsonValue (2) },
                                                              { "outputDevice", JsonValue ("Bus C") },
                                                              { "bus", JsonValue (2) },
                                                              { "midiChannel", JsonValue (7) },
                                                              { "delaySamples", JsonValue (128) },
                                                              { "transposeSemitones", JsonValue (-2) } })));
    const auto& t0 = core.state.tracks[0];
    assert (t0.inputDevice == "ASIO Delta 1010" && t0.inputChannel == 2);
    assert (t0.bus == 2 && t0.outputDevice == "Bus C");
    assert (t0.midiChannel == 7 && t0.delaySamples == 128 && t0.transposeSemitones == -2);

    // --- départs auxiliaires réels (pré/post fader, niveau, activation)
    assert (core.command ("addSend", commandPayload ({ { "index", JsonValue (0) }, { "bus", JsonValue (1) },
                                                       { "db", JsonValue (-9.0) }, { "preFader", JsonValue (true) } })));
    assert (core.state.tracks[0].sends.size() == 1);
    assert (core.state.tracks[0].sends[0].bus == 1 && core.state.tracks[0].sends[0].preFader);
    assert (core.command ("setSend", commandPayload ({ { "index", JsonValue (0) }, { "sendIndex", JsonValue (0) },
                                                       { "field", JsonValue ("db") }, { "value", JsonValue (-3.5) } })));
    assert (std::abs (core.state.tracks[0].sends[0].db + 3.5) < 1e-9);
    assert (core.command ("setSend", commandPayload ({ { "index", JsonValue (0) }, { "sendIndex", JsonValue (0) },
                                                       { "field", JsonValue ("enabled") }, { "value", JsonValue (false) } })));
    assert (! core.state.tracks[0].sends[0].enabled);
    assert (! core.command ("setSend", commandPayload ({ { "index", JsonValue (0) }, { "sendIndex", JsonValue (5) } })));
    assert (core.command ("removeSend", commandPayload ({ { "index", JsonValue (0) }, { "sendIndex", JsonValue (0) } })));
    assert (core.state.tracks[0].sends.empty());

    // --- inserts réels : ajout, ordre, bypass, paramètres, état binaire, suppression
    assert (core.command ("addInsert", commandPayload ({ { "index", JsonValue (0) },
                                                        { "uid", JsonValue ("VST3|Comp|AlphaAudio|1111AAAA") },
                                                        { "name", JsonValue ("Compresseur") },
                                                        { "format", JsonValue ("VST3") },
                                                        { "file", JsonValue ("C:/VST3/Comp.vst3") },
                                                        { "manufacturer", JsonValue ("AlphaAudio") },
                                                        { "category", JsonValue ("Dynamics") },
                                                        { "latencySamples", JsonValue (64) } })));
    assert (core.command ("addInsert", commandPayload ({ { "index", JsonValue (0) },
                                                        { "uid", JsonValue ("VST3|EQ|AlphaAudio|2222BBBB") },
                                                        { "name", JsonValue ("Égaliseur") },
                                                        { "slot", JsonValue (0) } })));
    assert (core.state.tracks[0].inserts.size() == 2);
    assert (core.state.tracks[0].inserts[0].name == "Égaliseur");   // insertion à l'emplacement demandé
    assert (core.state.tracks[0].inserts[1].latencySamples == 64);
    assert (core.command ("setInsertBypass", commandPayload ({ { "index", JsonValue (0) }, { "insertIndex", JsonValue (1) },
                                                               { "bypassed", JsonValue (true) } })));
    assert (core.state.tracks[0].inserts[1].bypassed);
    assert (core.command ("setInsertParameter", commandPayload ({ { "index", JsonValue (0) }, { "insertIndex", JsonValue (1) },
                                                                  { "paramIndex", JsonValue (2) }, { "value", JsonValue (0.75) } })));
    assert (core.state.tracks[0].inserts[1].params.size() == 3);
    assert (std::abs (core.state.tracks[0].inserts[1].params[2] - 0.75) < 1e-9);
    assert (core.command ("setInsertState", commandPayload ({ { "index", JsonValue (0) }, { "insertIndex", JsonValue (1) },
                                                              { "stateBase64", JsonValue ("QUJDRA==") } })));
    assert (core.state.tracks[0].inserts[1].stateBase64 == "QUJDRA==");
    assert (core.state.tracks[0].inserts[1].name == "Compresseur");
    assert (core.command ("moveInsert", commandPayload ({ { "index", JsonValue (0) }, { "insertIndex", JsonValue (0) }, { "to", JsonValue (1) } })));
    assert (core.state.tracks[0].inserts[0].name == "Compresseur");          // déplacement réel
    assert (core.state.tracks[0].inserts[1].name == "Égaliseur");
    assert (core.state.tracks[0].inserts[0].stateBase64 == "QUJDRA==");      // l'état suit l'insert
    assert (! core.command ("addInsert", commandPayload ({ { "index", JsonValue (0) } })));   // greffon sans identifiant réel
    assert (core.command ("removeInsert", commandPayload ({ { "index", JsonValue (0) }, { "insertIndex", JsonValue (1) } })));
    assert (core.state.tracks[0].inserts.size() == 1);
    assert (core.state.tracks[0].inserts[0].name == "Compresseur");
    // inserts de bus réels
    assert (core.command ("addInsert", commandPayload ({ { "kind", JsonValue ("bus") }, { "busIndex", JsonValue (0) },
                                                         { "uid", JsonValue ("VST3|Limit|Alpha|3333") },
                                                         { "name", JsonValue ("Limiteur") } })));
    assert (core.state.buses[0].inserts.size() == 1);

    // --- persistance réelle des inserts/départs/types dans le .alphaproj
    const std::string doc = core.serialize();
    assert (doc.find ("\"inserts\"") != std::string::npos);
    assert (doc.find ("\"channelType\":\"midi\"") != std::string::npos);
    ProjectCore reloaded;
    assert (reloaded.load (doc));
    assert (reloaded.state.tracks[0].inserts.size() == 1);
    assert (reloaded.state.tracks[0].inserts[0].stateBase64 == "QUJDRA==");
    assert (reloaded.state.tracks[0].channelType == "midi");
    assert (reloaded.state.tracks[0].midiChannel == 7);
    assert (reloaded.state.buses[0].inserts.size() == 1);

    // --- Quick Controls réellement affectés et appliqués au moteur
    assert (core.command ("setQuickControl", commandPayload ({ { "index", JsonValue (0) }, { "slot", JsonValue (0) },
                                                               { "target", JsonValue ("track") }, { "param", JsonValue ("pan") },
                                                               { "label", JsonValue ("Panoramique") } })));
    assert (core.state.tracks[0].quickControls[0].assigned);
    assert (core.command ("applyQuickControl", commandPayload ({ { "index", JsonValue (0) }, { "slot", JsonValue (0) },
                                                                 { "value", JsonValue (-0.4) } })));
    assert (std::abs (core.state.tracks[0].pan + 0.4) < 1e-9);
    assert (! core.command ("applyQuickControl", commandPayload ({ { "index", JsonValue (0) }, { "slot", JsonValue (3) } })));
    assert (core.lastError.find ("non affecté") != std::string::npos);

    // --- marqueurs : ajout réel, tri, renommage, suppression
    assert (core.command ("setTransportState", commandPayload ({ { "positionBars", JsonValue (13.0) } })));
    assert (core.command ("addMarker", commandPayload ({ { "name", JsonValue ("Couplet 3") } })));
    assert (! core.state.markers.empty());
    const size_t before = core.state.markers.size();
    for (size_t i = 1; i < core.state.markers.size(); ++i)
        assert (core.state.markers[i - 1].bars <= core.state.markers[i].bars);   // réellement triés
    bool found = false;
    int markerIndex = 0;
    for (size_t i = 0; i < core.state.markers.size(); ++i)
        if (core.state.markers[i].name == "Couplet 3") { found = true; markerIndex = static_cast<int> (i); }
    assert (found);
    assert (core.command ("renameMarker", commandPayload ({ { "markerIndex", JsonValue (markerIndex) }, { "name", JsonValue ("Pont B") } })));
    assert (core.state.markers[static_cast<size_t> (markerIndex)].name == "Pont B");
    assert (core.command ("removeMarker", commandPayload ({ { "markerIndex", JsonValue (markerIndex) } })));
    assert (core.state.markers.size() == before - 1);
    assert (! core.command ("removeMarker", commandPayload ({ { "markerIndex", JsonValue (9999) } })));

    // --- carte de tempo réelle : conversion mesure ↔ secondes intégrée
    ProjectCore tempo;
    tempo.command ("setTempo", commandPayload ({ { "bpm", JsonValue (120.0) } }));
    assert (std::abs (tempo.state.secondsAtBars (3.0) - 4.0) < 1e-9);       // 2 mesures à 120 BPM = 4 s
    assert (tempo.command ("addTempoEvent", commandPayload ({ { "bars", JsonValue (3.0) }, { "bpm", JsonValue (60.0) } })));
    assert (tempo.state.tempoEvents.size() == 2);
    assert (std::abs (tempo.state.secondsAtBars (5.0) - 12.0) < 1e-9);      // 4 s + 2 mesures à 60 BPM = 8 s
    assert (std::abs (tempo.state.bpmAt (4.0) - 60.0) < 1e-9);
    assert (std::abs (tempo.state.barsAtSeconds (12.0) - 5.0) < 1e-9);      // conversion inverse réelle
    assert (tempo.command ("removeTempoEvent", commandPayload ({ { "bars", JsonValue (3.0) } })));
    assert (tempo.state.tempoEvents.size() == 1);
    assert (! tempo.command ("removeTempoEvent", commandPayload ({ { "bars", JsonValue (1.0) } })));  // le projet garde un tempo

    // --- changements de mesure réels
    assert (core.command ("addSignature", commandPayload ({ { "bars", JsonValue (9.0) }, { "numerator", JsonValue (3) }, { "denominator", JsonValue (4) } })));
    assert (core.state.signatureAt (10.0).numerator == 3);
    assert (! core.command ("addSignature", commandPayload ({ { "bars", JsonValue (17.0) }, { "numerator", JsonValue (5) }, { "denominator", JsonValue (3) } })));
    assert (core.lastError.find ("puissance de 2") != std::string::npos);
    assert (core.command ("removeSignature", commandPayload ({ { "bars", JsonValue (9.0) } })));

    // --- informations projet réelles
    assert (core.command ("setProjectInfo", commandPayload ({ { "author", JsonValue ("ALPHA Production") },
                                                              { "copyright", JsonValue ("2026") },
                                                              { "notes", JsonValue ("Mixage voix") },
                                                              { "sampleRate", JsonValue ("96000") },
                                                              { "bitDepth", JsonValue ("32") },
                                                              { "startTimecode", JsonValue ("01:00:00:00") } })));
    assert (core.state.info.author == "ALPHA Production" && core.state.info.sampleRate == "96000");
    assert (core.state.info.startTimecode == "01:00:00:00");

    // --- espaces de travail réellement mémorisés, rappelés, verrouillés, supprimés
    assert (core.command ("storeWorkspace", commandPayload ({ { "name", JsonValue ("Mixage voix") },
                                                              { "barW", JsonValue (120.0) },
                                                              { "scrollLeft", JsonValue (400.0) },
                                                              { "positionBars", JsonValue (17.0) },
                                                              { "selectedTrack", JsonValue (1) } })));
    assert (core.state.workspaces.size() == 5);
    core.state.positionBars = 1.0;
    assert (core.command ("recallWorkspace", commandPayload ({ { "name", JsonValue ("Mixage voix") } })));
    assert (std::abs (core.state.positionBars - 17.0) < 1e-9);
    assert (core.state.selectedTrack == 1);
    assert (core.state.recalledWorkspace == "Mixage voix");
    assert (core.command ("setWorkspaceLock", commandPayload ({ { "name", JsonValue ("Mixage voix") }, { "locked", JsonValue (true) } })));
    assert (! core.command ("storeWorkspace", commandPayload ({ { "name", JsonValue ("Mixage voix") }, { "barW", JsonValue (30.0) } })));
    assert (core.lastError.find ("verrouillé") != std::string::npos);
    assert (! core.command ("deleteWorkspace", commandPayload ({ { "name", JsonValue ("Mixage voix") } })));
    assert (core.command ("setWorkspaceLock", commandPayload ({ { "name", JsonValue ("Mixage voix") }, { "locked", JsonValue (false) } })));
    assert (core.command ("deleteWorkspace", commandPayload ({ { "name", JsonValue ("Mixage voix") } })));
    assert (core.state.workspaces.size() == 4);

    // --- instantanés de mixage réellement mémorisés et rappelés
    core.command ("setTrack", commandPayload ({ { "index", JsonValue (0) }, { "field", JsonValue ("volumeDb") }, { "value", JsonValue (-2.0) } }));
    assert (core.command ("storeSnapshot", commandPayload ({ { "name", JsonValue ("Mix A") } })));
    core.command ("setTrack", commandPayload ({ { "index", JsonValue (0) }, { "field", JsonValue ("volumeDb") }, { "value", JsonValue (-30.0) } }));
    assert (std::abs (core.state.tracks[0].volumeDb + 30.0) < 1e-9);
    assert (core.command ("recallSnapshot", commandPayload ({ { "name", JsonValue ("Mix A") } })));
    assert (std::abs (core.state.tracks[0].volumeDb + 2.0) < 1e-9);         // niveau réellement restauré
    assert (core.command ("deleteSnapshot", commandPayload ({ { "name", JsonValue ("Mix A") } })));
    assert (core.state.snapshots.empty());
    assert (! core.command ("storeSnapshot", commandPayload ({})));          // nom requis

    // --- projets récents réellement gérés
    assert (core.command ("addRecent", commandPayload ({ { "path", JsonValue ("C:/Alpha/Demo.alphaproj") }, { "name", JsonValue ("Demo") } })));
    assert (core.command ("addRecent", commandPayload ({ { "path", JsonValue ("C:/Alpha/Mix.alphaproj") }, { "name", JsonValue ("Mix") } })));
    assert (core.state.recents.size() == 2 && core.state.recents[0].name == "Mix");
    assert (core.command ("addRecent", commandPayload ({ { "path", JsonValue ("C:/Alpha/Demo.alphaproj") }, { "name", JsonValue ("Demo") } })));
    assert (core.state.recents.size() == 2 && core.state.recents[0].name == "Demo");  // pas de doublon réel
    assert (core.command ("clearRecents", commandPayload ({})));
    assert (core.state.recents.empty());
    assert (! core.command ("addRecent", commandPayload ({})));

    // --- raccourcis clavier réellement persistés dans le projet
    assert (core.state.keyCommands.size() == ProjectState::defaultKeyCommands().size());
    assert (core.command ("setKeyCommand", commandPayload ({ { "combo", JsonValue ("F9") }, { "action", JsonValue ("cycle") } })));
    bool f9 = false;
    for (const auto& k : core.state.keyCommands) if (k.combo == "F9" && k.action == "cycle") f9 = true;
    assert (f9);
    assert (core.command ("setKeyCommand", commandPayload ({ { "combo", JsonValue ("F9") }, { "action", JsonValue ("metronome") } })));
    int f9count = 0;
    for (const auto& k : core.state.keyCommands) if (k.combo == "F9") { ++f9count; assert (k.action == "metronome"); }
    assert (f9count == 1);                                                   // réellement remplacé, pas dupliqué
    assert (core.command ("resetKeyCommands", commandPayload ({})));
    assert (core.state.keyCommands.size() == ProjectState::defaultKeyCommands().size());
    assert (! core.command ("setKeyCommand", commandPayload ({ { "combo", JsonValue ("") } })));

    // --- éditeur logique MIDI : règles réellement appliquées aux notes
    ProjectCore midi;
    midi.command ("addTrack", commandPayload ({ { "name", JsonValue ("Batterie") } }));
    JsonValue notes (JsonValue::Type::Array);
    for (int i = 0; i < 8; ++i)
    {
        JsonValue n (JsonValue::Type::Object);
        n["startBars"] = JsonValue (1.0 + i * 0.26);
        n["lenBars"] = JsonValue (0.25);
        n["pitch"] = JsonValue (36 + (i % 3) * 12);
        n["velocity"] = JsonValue (40 + i * 10);
        notes.array.push_back (n);
    }
    assert (midi.command ("setMidiNotes", commandPayload ({ { "index", JsonValue (0) }, { "notes", notes } })));
    assert (midi.state.tracks[0].midiNotes.size() == 8);
    assert (midi.command ("storeLogicalRule", commandPayload ({ { "name", JsonValue ("Vélocité fixe") },
                                                                { "ruleIndex", JsonValue (0) },   // remplace la règle par défaut
                                                                { "action", JsonValue ("setVelocity") },
                                                                { "actionValue", JsonValue (110.0) },
                                                                { "pitchMin", JsonValue (36) }, { "pitchMax", JsonValue (48) } })));
    assert (midi.state.logicalRules.size() == 1);
    assert (midi.command ("applyLogicalEdit", commandPayload ({ { "ruleIndex", JsonValue (0) } })));
    int touched = 0, unchanged = 0;
    for (const auto& n : midi.state.tracks[0].midiNotes)
    {
        if (n.pitch >= 36 && n.pitch <= 48) { assert (n.velocity == 110); ++touched; }
        else ++unchanged;
    }
    assert (touched > 0 && unchanged > 0);                                   // filtre réellement sélectif
    assert (midi.state.lastLogicalTouched == touched);
    // quantification réelle sur la grille
    assert (midi.command ("storeLogicalRule", commandPayload ({ { "name", JsonValue ("Quantize 1/16") },
                                                                { "action", JsonValue ("quantize") },
                                                                { "grid", JsonValue ("1/16") },
                                                                { "pitchMin", JsonValue (0) }, { "pitchMax", JsonValue (127) } })));
    assert (midi.command ("applyLogicalEdit", commandPayload ({ { "ruleIndex", JsonValue (1) } })));
    for (const auto& n : midi.state.tracks[0].midiNotes)
    {
        const double k = (n.startBars - 1.0) / 0.25;
        assert (std::abs (k - std::round (k)) < 1e-6);                       // réellement calé sur 1/16
    }
    // suppression réelle par règle
    assert (midi.command ("storeLogicalRule", commandPayload ({ { "name", JsonValue ("Effacer graves") },
                                                                { "action", JsonValue ("deleteNotes") },
                                                                { "pitchMin", JsonValue (0) }, { "pitchMax", JsonValue (40) } })));
    const size_t beforeDelete = midi.state.tracks[0].midiNotes.size();
    assert (midi.command ("applyLogicalEdit", commandPayload ({ { "ruleIndex", JsonValue (2) } })));
    assert (midi.state.tracks[0].midiNotes.size() < beforeDelete);
    for (const auto& n : midi.state.tracks[0].midiNotes) assert (n.pitch > 40);
    assert (! midi.command ("applyLogicalEdit", commandPayload ({ { "ruleIndex", JsonValue (99) } })));
    assert (midi.command ("deleteLogicalRule", commandPayload ({ { "ruleIndex", JsonValue (2) } })));
    assert (midi.state.logicalRules.size() == 2);

    // --- modificateurs MIDI réellement appliqués (transformation non destructive)
    ProjectCore mod;
    mod.command ("addTrack", commandPayload ({ { "name", JsonValue ("Basse") } }));
    JsonValue mn (JsonValue::Type::Array);
    JsonValue n0 (JsonValue::Type::Object);
    n0["startBars"] = JsonValue (1.0); n0["lenBars"] = JsonValue (0.5);
    n0["pitch"] = JsonValue (48); n0["velocity"] = JsonValue (80);
    mn.array.push_back (n0);
    assert (mod.command ("setMidiNotes", commandPayload ({ { "index", JsonValue (0) }, { "notes", mn } })));
    assert (mod.command ("storeMidiModifier", commandPayload ({ { "name", JsonValue ("Octave + vélocité") },
                                                                { "modifierIndex", JsonValue (0) },   // remplace le preset par défaut
                                                                { "transposeSemitones", JsonValue (12.0) },
                                                                { "velocityScale", JsonValue (0.5) },
                                                                { "velocityOffset", JsonValue (10.0) },
                                                                { "lengthScale", JsonValue (2.0) },
                                                                { "delayBars", JsonValue (0.25) } })));
    assert (mod.command ("applyMidiModifier", commandPayload ({ { "modifierIndex", JsonValue (0) }, { "trackIndex", JsonValue (0) } })));
    assert (mod.state.tracks[0].midiNotes[0].pitch == 60);
    assert (mod.state.tracks[0].midiNotes[0].velocity == 50);
    assert (std::abs (mod.state.tracks[0].midiNotes[0].lenBars - 1.0) < 1e-9);
    assert (std::abs (mod.state.tracks[0].midiNotes[0].startBars - 1.25) < 1e-9);
    assert (mod.command ("deleteMidiModifier", commandPayload ({ { "modifierIndex", JsonValue (0) } })));
    assert (! mod.command ("applyMidiModifier", commandPayload ({ { "modifierIndex", JsonValue (0) } })));

    // --- transposition réelle
    assert (mod.command ("transposeMidi", commandPayload ({ { "trackIndex", JsonValue (0) }, { "semitones", JsonValue (-5) } })));
    assert (mod.state.tracks[0].midiNotes[0].pitch == 55);
    assert (mod.state.tracks[0].transposeSemitones == -5);

    // --- retrait réel des pistes vides
    ProjectCore empty;
    empty.command ("addTrack", commandPayload ({ { "name", JsonValue ("Vide 1") } }));
    empty.command ("addTrack", commandPayload ({ { "name", JsonValue ("Vide 2") } }));
    empty.command ("addClip", commandPayload ({ { "index", JsonValue (0) }, { "clip", commandPayload ({ { "name", JsonValue ("Prise") }, { "media", JsonValue ("Media/a.wav") }, { "startBars", JsonValue (1.0) }, { "lenBars", JsonValue (2.0) } }) } }));
    assert (empty.state.tracks.size() == 2);
    assert (empty.command ("removeEmptyTracks", commandPayload ({})));
    assert (empty.state.tracks.size() == 1 && empty.state.lastRemovedEmpty == 1);
    assert (empty.state.tracks[0].name == "Vide 1");

    // --- dossiers de greffons réellement enregistrés
    assert (core.command ("addPluginFolder", commandPayload ({ { "path", JsonValue ("C:/Program Files/Common Files/VST3") } })));
    assert (core.state.pluginFolders.size() == 1);
    assert (core.command ("addPluginFolder", commandPayload ({ { "path", JsonValue ("C:/Program Files/Common Files/VST3") } })));
    assert (core.state.pluginFolders.size() == 1);                           // pas de doublon
    assert (core.command ("removePluginFolder", commandPayload ({ { "path", JsonValue ("C:/Program Files/Common Files/VST3") } })));
    assert (core.state.pluginFolders.empty());
    assert (! core.command ("removePluginFolder", commandPayload ({ { "path", JsonValue ("X") } })));

    // --- disposition d'interface réellement persistée dans le projet
    assert (core.command ("setUiLayout", commandPayload ({ { "rulerFormat", JsonValue ("timecode") },
                                                           { "snapMode", JsonValue ("magnet") },
                                                           { "nudgeMode", JsonValue ("frames") },
                                                           { "editMode", JsonValue ("range") },
                                                           { "timebase", JsonValue ("linear") },
                                                           { "showInspector", JsonValue (false) },
                                                           { "trackHeight", JsonValue (96.0) } })));
    assert (core.state.layout.rulerFormat == "timecode" && core.state.layout.timebase == "linear");
    assert (! core.state.layout.showInspector);
    assert (std::abs (core.state.tracks[0].height - 96.0) < 1e-9);           // hauteur réellement propagée
    assert (! core.command ("setUiLayout", commandPayload ({ { "rulerFormat", JsonValue ("bidule") } })));
    assert (! core.command ("setUiLayout", commandPayload ({ { "timebase", JsonValue ("bidule") } })));

    // --- persistance complète du modèle étendu (enregistrement/fermeture/réouverture)
    const std::string full = core.serialize();
    assert (full.find ("\"workspaces\"") != std::string::npos);
    assert (full.find ("\"keyCommands\"") != std::string::npos);
    assert (full.find ("\"logicalRules\"") != std::string::npos);
    assert (full.find ("\"midiModifiers\"") != std::string::npos);
    assert (full.find ("\"quickControls\"") != std::string::npos);
    assert (full.find ("\"tempoEvents\"") != std::string::npos);
    assert (full.find ("\"signatures\"") != std::string::npos);
    assert (full.find ("\"snapshots\"") != std::string::npos);
    assert (full.find ("\"info\"") != std::string::npos);
    assert (full.find ("\"layout\"") != std::string::npos);
    ProjectCore again;
    assert (again.load (full));
    assert (again.state.layout.rulerFormat == "timecode");
    assert (again.state.info.author == "ALPHA Production");
    assert (again.state.workspaces.size() == core.state.workspaces.size());
    assert (again.state.keyCommands.size() == core.state.keyCommands.size());
    assert (again.state.tracks.size() == core.state.tracks.size());
    assert (again.state.tracks[0].quickControls[0].param == "pan");
    assert (again.serialize() == core.serialize());                          // aller-retour stable

    // --- migration réelle d'un ancien projet schéma 2 vers le schéma courant
    std::string legacy = "{\"format\":\"ALPHAPROJ\",\"schema\":2,\"name\":\"Ancien\",\"bpm\":100.0,"
                         "\"tracks\":[{\"id\":\"t0\",\"name\":\"Voix\",\"volumeDb\":-4.0}],"
                         "\"buses\":[{\"name\":\"Bus A\",\"volumeDb\":0.0,\"pan\":0.0,\"mute\":false}]}";
    ProjectCore migrated;
    assert (migrated.load (legacy));
    assert (migrated.state.schema == 3);
    assert (migrated.state.tracks.size() == 1);
    assert (migrated.state.tracks[0].channelType == "audio");
    assert (migrated.state.tempoEvents.size() == 1 && std::abs (migrated.state.tempoEvents[0].bpm - 100.0) < 1e-9);
    assert (migrated.state.buses.size() == 4);                               // bus manquants réellement recréés
    assert (migrated.state.keyCommands.size() == ProjectState::defaultKeyCommands().size());
    assert (migrated.state.layout.trackHeight > 0.0);
    assert (std::abs (migrated.state.secondsAtBars (3.0) - 4.8) < 1e-9);     // tempo hérité du fichier

    // --- fermeture réelle du projet puis réouverture
    ProjectCore closeable;
    closeable.command ("addTrack", commandPayload ({ { "name", JsonValue ("Guitare") } }));
    closeable.state.path = "C:/Alpha/Guitare.alphaproj";
    assert (closeable.command ("closeProject", commandPayload ({})));
    assert (closeable.state.closed);
    assert (closeable.state.tracks.empty());
    assert (! closeable.state.recents.empty() && closeable.state.recents[0].path == "C:/Alpha/Guitare.alphaproj");
    assert (closeable.state.workspaces.size() == 4);                         // les réglages d'interface survivent
    assert (closeable.command ("newProject", commandPayload ({})));
    assert (! closeable.state.closed);

    // --- historique réel : chaque commande du modèle étendu est annulable
    ProjectCore hist;
    hist.command ("addTrack", commandPayload ({ { "name", JsonValue ("Piste") } }));
    hist.command ("setChannelType", commandPayload ({ { "index", JsonValue (0) }, { "type", JsonValue ("instrument") } }));
    hist.command ("addInsert", commandPayload ({ { "index", JsonValue (0) }, { "uid", JsonValue ("VST3|X|Y|Z") }, { "name", JsonValue ("X") } }));
    assert (hist.state.tracks[0].inserts.size() == 1);
    assert (hist.command ("undo", commandPayload ({})));
    assert (hist.state.tracks[0].inserts.empty());
    assert (hist.state.tracks[0].channelType == "instrument");
    assert (hist.command ("undo", commandPayload ({})));
    assert (hist.state.tracks[0].channelType == "audio");
    assert (hist.command ("redo", commandPayload ({})));
    assert (hist.state.tracks[0].channelType == "instrument");
    assert (hist.command ("redo", commandPayload ({})));
    assert (hist.state.tracks[0].inserts.size() == 1);
    // commande sans effet réel : aucun faux niveau d'historique
    const size_t levels = hist.history.size();
    assert (hist.command ("setChannelType", commandPayload ({ { "index", JsonValue (0) }, { "type", JsonValue ("instrument") } })));
    assert (hist.history.size() == levels);

    // --- AUDIT v6 (A121/A55) : médias réellement supprimés et renommés,
    //     avec répercussion sur les événements qui les référencent + undo.
    ProjectCore med;
    med.state = ProjectState();
    med.history.initialise (med.state, "Test médias");
    med.command ("addTrack", commandPayload ({ { "name", JsonValue ("Piste médias") } }));
    med.command ("addClip", commandPayload ({ { "trackIndex", JsonValue (0) }, { "name", JsonValue ("Prise.wav") },
                                              { "media", JsonValue ("Media/Prise.wav") }, { "startBars", JsonValue (1.0) },
                                              { "lenBars", JsonValue (4.0) } }));
    assert (med.state.tracks[0].clips.size() == 1);
    assert (med.command ("renameMedia", commandPayload ({ { "path", JsonValue ("Media/Prise.wav") },
                                                          { "newName", JsonValue ("Media/Prise-v2.wav") } })));
    assert (med.state.tracks[0].clips[0].media == "Media/Prise-v2.wav");
    assert (med.command ("setClipLength", commandPayload ({ { "trackIndex", JsonValue (0) }, { "clipIndex", JsonValue (0) },
                                                             { "lenBars", JsonValue (8.0) } })));
    assert (med.state.tracks[0].clips[0].lenBars == 8.0);
    assert (med.command ("removeMedia", commandPayload ({ { "path", JsonValue ("Media/Prise-v2.wav") } })));
    assert (med.state.tracks[0].clips.empty());
    assert (med.command ("undo", commandPayload ({})));
    assert (med.state.tracks[0].clips.size() == 1);   // suppression annulable
    assert (! med.command ("removeMedia", commandPayload ({})));   // chemin requis
    // --- échecs : aucune référence du projet ne doit être modifiée ---
    assert (! med.command ("renameMedia", commandPayload ({ { "path", JsonValue ("Media/Prise-v2.wav") },
                                                             { "newName", JsonValue ("") } })));   // newName requis
    assert (med.state.tracks[0].clips[0].media == "Media/Prise-v2.wav");   // référence intacte après échec
    assert (! med.command ("renameMedia", commandPayload ({ { "path", JsonValue ("") },
                                                             { "newName", JsonValue ("x.wav") } })));
    assert (med.state.tracks[0].clips[0].media == "Media/Prise-v2.wav");
    // removeMedia d'un chemin inconnu : les références existantes restent intactes
    assert (med.command ("removeMedia", commandPayload ({ { "path", JsonValue ("Media/Autre.wav") } })));
    assert (med.state.tracks[0].clips.size() == 1);
    assert (med.state.tracks[0].clips[0].media == "Media/Prise-v2.wav");

    std::cout << "audit v6 modèle étendu (canaux, routage, départs, inserts, Quick Controls, marqueurs,\n"
                 "  tempo, mesures, infos, espaces, instantanés, récents, raccourcis, logique MIDI,\n"
                 "  modificateurs, pistes vides, greffons, interface, migration, fermeture, historique) : PASS\n";
}

int main()
{
    testJ2JsonAndProject();
    testJ2UnlimitedHistoryReal();
    testJ2EditingAndPersistence();
    testJ3J4AutomationAndDsp();
    testJ5J6MidiPrefsVideo();
    testAuditHardening();
    testAuditV6ExtendedModel();
    std::cout << "OK — noyau C++ J2→J6 + audit v6 : 7 groupes de tests PASS.\n";
    return 0;
}
