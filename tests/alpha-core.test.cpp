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
    assert (doc.find ("\"schema\":2") != std::string::npos);
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

int main()
{
    testJ2JsonAndProject();
    testJ2UnlimitedHistoryReal();
    testJ2EditingAndPersistence();
    testJ3J4AutomationAndDsp();
    testJ5J6MidiPrefsVideo();
    std::cout << "OK — noyau C++ J2→J6 : 5 groupes de tests PASS.\n";
    return 0;
}
