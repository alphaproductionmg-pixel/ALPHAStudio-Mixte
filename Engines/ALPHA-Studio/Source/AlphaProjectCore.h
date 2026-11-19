// ALPHA Studio — noyau de projet J2→J6, C++17 pur, sans JUCE.
// Ce header est compilable et testable sur Linux ; Engine.h l'inclut pour
// piloter le graphe JUCE/Windows. Il ne contient aucun accès fichier ni audio
// temps réel : l'hôte se charge des E/S, le processeur audio utilise les
// helpers DSP ci-dessous.
#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <ctime>
#include <limits>
#include <map>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

namespace alpha {

// --------------------------------------------------------------------- JSON
// Petit JSON autonome : le format .alphaproj ne doit dépendre d'aucune
// bibliothèque externe et doit être relisible par les tests Node et C++.
struct JsonValue
{
    enum class Type { Null, Bool, Number, String, Array, Object };
    Type type = Type::Null;
    bool boolean = false;
    double number = 0.0;
    std::string string;
    std::vector<JsonValue> array;
    std::map<std::string, JsonValue> object;

    JsonValue() = default;
    explicit JsonValue (Type t) : type (t) {}
    JsonValue (bool v) : type (Type::Bool), boolean (v) {}
    JsonValue (double v) : type (Type::Number), number (v) {}
    JsonValue (int v) : type (Type::Number), number (static_cast<double> (v)) {}
    JsonValue (long long v) : type (Type::Number), number (static_cast<double> (v)) {}
    JsonValue (const char* v) : type (Type::String), string (v ? v : "") {}
    JsonValue (const std::string& v) : type (Type::String), string (v) {}

    bool isNull() const { return type == Type::Null; }
    bool isObject() const { return type == Type::Object; }
    bool isArray() const { return type == Type::Array; }

    JsonValue& operator[] (const std::string& key)
    {
        if (type != Type::Object) { type = Type::Object; object.clear(); array.clear(); }
        return object[key];
    }
    const JsonValue& get (const std::string& key) const
    {
        static const JsonValue nullValue;
        if (type != Type::Object) return nullValue;
        const auto it = object.find (key);
        return it == object.end() ? nullValue : it->second;
    }
    bool has (const std::string& key) const
    {
        return type == Type::Object && object.find (key) != object.end();
    }

    std::string dump() const
    {
        std::string out;
        dumpInto (out);
        return out;
    }

    void dumpInto (std::string& out) const
    {
        switch (type)
        {
            case Type::Null:   out += "null"; return;
            case Type::Bool:   out += boolean ? "true" : "false"; return;
            case Type::Number:
                if (! std::isfinite (number)) { out += "0"; return; }
                {
                    std::ostringstream os;
                    os.precision (15);
                    os << number;
                    out += os.str();
                }
                return;
            case Type::String: dumpString (string, out); return;
            case Type::Array:
                out += '[';
                for (size_t i = 0; i < array.size(); ++i)
                {
                    if (i) out += ',';
                    array[i].dumpInto (out);
                }
                out += ']';
                return;
            case Type::Object:
                out += '{';
                {
                    bool first = true;
                    for (const auto& kv : object)
                    {
                        if (! first) out += ',';
                        first = false;
                        dumpString (kv.first, out);
                        out += ':';
                        kv.second.dumpInto (out);
                    }
                }
                out += '}';
                return;
        }
    }

    static void dumpString (const std::string& s, std::string& out)
    {
        static const char* hex = "0123456789abcdef";
        out += '"';
        for (unsigned char c : s)
        {
            switch (c)
            {
                case '"': out += "\\\""; break;
                case '\\': out += "\\\\"; break;
                case '\b': out += "\\b"; break;
                case '\f': out += "\\f"; break;
                case '\n': out += "\\n"; break;
                case '\r': out += "\\r"; break;
                case '\t': out += "\\t"; break;
                default:
                    if (c < 0x20)
                    {
                        out += "\\u00";
                        out += hex[c >> 4];
                        out += hex[c & 15];
                    }
                    else out += static_cast<char> (c);
            }
        }
        out += '"';
    }

    static JsonValue parse (const std::string& text, std::string& error)
    {
        Parser p (text, error);
        JsonValue v = p.readValue();
        p.skipSpace();
        if (error.empty() && p.pos != p.text.size()) error = "caractères après l'objet JSON";
        if (! error.empty()) return JsonValue();
        return v;
    }

private:
    struct Parser
    {
        const std::string& text;
        size_t pos = 0;
        std::string& error;
        Parser (const std::string& t, std::string& e) : text (t), error (e) {}

        void skipSpace()
        {
            while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r')) ++pos;
        }
        void fail (const std::string& msg) { if (error.empty()) error = msg + " à l'octet " + std::to_string (pos); }
        char peek() const { return pos < text.size() ? text[pos] : '\0'; }

        JsonValue readValue()
        {
            skipSpace();
            if (pos >= text.size()) { fail ("valeur JSON manquante"); return {}; }
            const char c = text[pos];
            if (c == '{') return readObject();
            if (c == '[') return readArray();
            if (c == '"') return JsonValue (readString());
            if (c == 't' || c == 'f') return readBool();
            if (c == 'n') return readNull();
            if (c == '-' || (c >= '0' && c <= '9')) return readNumber();
            fail ("caractère JSON inattendu");
            return {};
        }
        JsonValue readNull()
        {
            if (text.compare (pos, 4, "null") == 0) { pos += 4; return {}; }
            fail ("null invalide");
            return {};
        }
        JsonValue readBool()
        {
            if (text.compare (pos, 4, "true") == 0) { pos += 4; return JsonValue (true); }
            if (text.compare (pos, 5, "false") == 0) { pos += 5; return JsonValue (false); }
            fail ("booléen invalide");
            return {};
        }
        JsonValue readNumber()
        {
            const size_t start = pos;
            if (peek() == '-') ++pos;
            if (peek() == '0') ++pos;
            else if (peek() >= '1' && peek() <= '9')
            {
                while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') ++pos;
            }
            else { fail ("nombre JSON invalide"); return {}; }
            if (peek() == '.')
            {
                ++pos;
                if (pos >= text.size() || text[pos] < '0' || text[pos] > '9') { fail ("partie décimale incomplète"); return {}; }
                while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') ++pos;
            }
            if (peek() == 'e' || peek() == 'E')
            {
                ++pos;
                if (peek() == '+' || peek() == '-') ++pos;
                if (pos >= text.size() || text[pos] < '0' || text[pos] > '9') { fail ("exposant incomplet"); return {}; }
                while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') ++pos;
            }
            const std::string token = text.substr (start, pos - start);
            char* end = nullptr;
            const double value = std::strtod (token.c_str(), &end);
            if (end != token.c_str() + token.size() || ! std::isfinite (value)) { fail ("nombre JSON non fini ou invalide"); return {}; }
            return JsonValue (value);
        }
        static void appendUtf8 (uint32_t cp, std::string& out)
        {
            if (cp <= 0x7f) out += static_cast<char> (cp);
            else if (cp <= 0x7ff)
            {
                out += static_cast<char> (0xc0 | (cp >> 6));
                out += static_cast<char> (0x80 | (cp & 0x3f));
            }
            else if (cp <= 0xffff)
            {
                out += static_cast<char> (0xe0 | (cp >> 12));
                out += static_cast<char> (0x80 | ((cp >> 6) & 0x3f));
                out += static_cast<char> (0x80 | (cp & 0x3f));
            }
            else
            {
                out += static_cast<char> (0xf0 | (cp >> 18));
                out += static_cast<char> (0x80 | ((cp >> 12) & 0x3f));
                out += static_cast<char> (0x80 | ((cp >> 6) & 0x3f));
                out += static_cast<char> (0x80 | (cp & 0x3f));
            }
        }
        uint32_t readHex4()
        {
            uint32_t v = 0;
            for (int i = 0; i < 4; ++i)
            {
                if (pos >= text.size()) { fail ("\\u incomplet"); return 0; }
                const char c = text[pos++];
                v <<= 4;
                if (c >= '0' && c <= '9') v |= static_cast<uint32_t> (c - '0');
                else if (c >= 'a' && c <= 'f') v |= static_cast<uint32_t> (10 + c - 'a');
                else if (c >= 'A' && c <= 'F') v |= static_cast<uint32_t> (10 + c - 'A');
                else { fail ("chiffre hexadécimal invalide"); return 0; }
            }
            return v;
        }
        std::string readString()
        {
            std::string out;
            if (peek() != '"') { fail ("chaîne attendue"); return out; }
            ++pos;
            while (pos < text.size())
            {
                const char c = text[pos++];
                if (c == '"') return out;
                if (c != '\\') { out += c; continue; }
                if (pos >= text.size()) { fail ("échappement incomplet"); return out; }
                const char e = text[pos++];
                switch (e)
                {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break;
                    case 't': out += '\t'; break;
                    case 'u':
                    {
                        uint32_t cp = readHex4();
                        if (! error.empty()) return out;
                        if (cp >= 0xd800 && cp <= 0xdbff)
                        {
                            if (pos + 5 >= text.size() || text[pos] != '\\' || text[pos + 1] != 'u')
                            {
                                fail ("paire de substituts UTF-16 incomplète");
                                return out;
                            }
                            pos += 2;
                            const uint32_t low = readHex4();
                            if (! error.empty()) return out;
                            if (low < 0xdc00 || low > 0xdfff) { fail ("substitut bas UTF-16 invalide"); return out; }
                            cp = 0x10000u + ((cp - 0xd800u) << 10) + (low - 0xdc00u);
                        }
                        else if (cp >= 0xdc00 && cp <= 0xdfff)
                        {
                            fail ("substitut bas UTF-16 isolé");
                            return out;
                        }
                        appendUtf8 (cp, out);
                        break;
                    }
                    default: fail ("échappement inconnu"); return out;
                }
            }
            fail ("chaîne non terminée");
            return out;
        }
        JsonValue readArray()
        {
            JsonValue v (Type::Array);
            ++pos;
            skipSpace();
            if (peek() == ']') { ++pos; return v; }
            while (error.empty())
            {
                v.array.push_back (readValue());
                if (! error.empty()) return v;
                skipSpace();
                if (peek() == ',') { ++pos; continue; }
                if (peek() == ']') { ++pos; return v; }
                fail ("virgule ou ] attendue");
                return v;
            }
            return v;
        }
        JsonValue readObject()
        {
            JsonValue v (Type::Object);
            ++pos;
            skipSpace();
            if (peek() == '}') { ++pos; return v; }
            while (error.empty())
            {
                skipSpace();
                if (peek() != '"') { fail ("clé JSON attendue"); return v; }
                const std::string key = readString();
                if (! error.empty()) return v;
                skipSpace();
                if (peek() != ':') { fail (": attendu"); return v; }
                ++pos;
                v.object[key] = readValue();
                if (! error.empty()) return v;
                skipSpace();
                if (peek() == ',') { ++pos; continue; }
                if (peek() == '}') { ++pos; return v; }
                fail ("virgule ou } attendue");
                return v;
            }
            return v;
        }
    };
};

inline double jNumber (const JsonValue& j, const std::string& key, double fallback = 0.0)
{
    const auto& v = j.get (key);
    return v.type == JsonValue::Type::Number && std::isfinite (v.number) ? v.number : fallback;
}
inline int jInt (const JsonValue& j, const std::string& key, int fallback = 0)
{
    return static_cast<int> (std::llround (jNumber (j, key, static_cast<double> (fallback))));
}
inline bool jBool (const JsonValue& j, const std::string& key, bool fallback = false)
{
    const auto& v = j.get (key);
    return v.type == JsonValue::Type::Bool ? v.boolean : fallback;
}
inline std::string jString (const JsonValue& j, const std::string& key, const std::string& fallback = "")
{
    const auto& v = j.get (key);
    return v.type == JsonValue::Type::String ? v.string : fallback;
}
inline double clampValue (double v, double lo, double hi)
{
    if (! std::isfinite (v)) return lo;
    return std::max (lo, std::min (hi, v));
}
inline std::string utcNow()
{
    std::time_t t = std::time (nullptr);
    std::tm tm {};
#if defined(_WIN32)
    gmtime_s (&tm, &t);
#else
    gmtime_r (&t, &tm);
#endif
    char buf[32];
    std::strftime (buf, sizeof (buf), "%Y-%m-%dT%H:%M:%SZ", &tm);
    return std::string (buf);
}

// ------------------------------------------------------------------ modèle
struct EqBand
{
    double freq = 1000.0, gainDb = 0.0, q = 0.707;
    bool enabled = true;
    bool lowShelf = false, highShelf = false;
};
struct Dynamics
{
    double thresholdDb = -18.0, ratio = 3.0, attackMs = 5.0, releaseMs = 80.0, makeupDb = 0.0;
    bool enabled = false;
};
struct FxState
{
    bool eqEnabled = true;
    std::array<EqBand, 4> eq;
    Dynamics dynamics;

    FxState()
    {
        eq[0] = { 80.0, 0.0, 0.707, true, true, false };
        eq[1] = { 350.0, 0.0, 0.9, true, false, false };
        eq[2] = { 2500.0, 0.0, 0.9, true, false, false };
        eq[3] = { 10000.0, 0.0, 0.707, true, false, true };
    }
};
struct AutomationPoint { double bars = 1.0, value = 1.0; };
struct AutomationCurve
{
    std::string param = "Volume";
    double neutral = 1.0;
    std::vector<AutomationPoint> points;

    double valueAt (double bars) const
    {
        if (points.empty()) return neutral;
        if (bars <= points.front().bars) return points.front().value;
        for (size_t i = 1; i < points.size(); ++i)
        {
            const auto& a = points[i - 1];
            const auto& b = points[i];
            if (bars <= b.bars)
            {
                const double span = b.bars - a.bars;
                if (span <= 0.0) return b.value;
                const double k = (bars - a.bars) / span;
                return a.value + (b.value - a.value) * k;
            }
        }
        return points.back().value;
    }
};
struct MidiNote
{
    double startBars = 1.0, lenBars = 0.25;
    int pitch = 60, velocity = 100;
    bool on = true;
};
struct AudioClip
{
    std::string id, name, media;
    double startBars = 1.0, lenBars = 1.0, offsetBars = 0.0;
    bool loop = false;
};
struct TrackState
{
    std::string id, name = "Audio", colour = "#4f7fa8";
    double volumeDb = -6.0, pan = 0.0;
    bool mute = false, solo = false, arm = false, instrument = false;
    int bus = 0;
    double sendDb = 0.0;
    std::vector<AudioClip> clips;
    std::vector<MidiNote> midiNotes;
    std::vector<AutomationCurve> automation;
    FxState fx;
};
struct BusState
{
    std::string name = "Bus";
    double volumeDb = 0.0, pan = 0.0;
    bool mute = false;
};
struct MarkerState
{
    double bars = 1.0, endBars = 1.0;
    std::string name = "Marqueur";
    bool cycle = false;
};
struct Preferences
{
    bool autoSave = true, keyboardAccess = true, highContrast = false, largeText = false;
    double autoSaveSeconds = 30.0, latencyMs = 0.0, precountBars = 1.0;
    std::string theme = "Nuendo 4";
};
struct ControlRoom
{
    double monitorDb = 0.0;
    bool dim = false, mono = false;
    std::string source = "Mix";
};
struct ProjectState
{
    int schema = 2;
    std::string format = "ALPHAPROJ";
    std::string name = "Projet sans titre", createdUtc = utcNow(), modifiedUtc = utcNow();
    double bpm = 120.0, masterDb = 0.0;
    bool looping = true, metronome = false;
    double loopStartBars = 1.0, loopEndBars = 9.0;
    bool punchEnabled = false;
    double punchInBars = 1.0, punchOutBars = 9.0;
    double precountBars = 1.0, latencyMs = 0.0;
    std::vector<TrackState> tracks;
    std::vector<BusState> buses;
    std::vector<MarkerState> markers;
    std::vector<std::string> media;
    std::vector<std::string> templates;
    Preferences preferences;
    ControlRoom controlRoom;
    bool videoEnabled = false; // verrouillé : la vidéo attend le test final confirmé.

    ProjectState()
    {
        buses = { { "Bus A", 0.0, 0.0, false }, { "Bus B", 0.0, 0.0, false },
                  { "Bus C", 0.0, 0.0, false }, { "Bus D", 0.0, 0.0, false } };
        markers = { { 1.0, 1.0, "Intro", false }, { 9.0, 9.0, "Couplet 1", false },
                    { 17.0, 17.0, "Refrain 1", false }, { 25.0, 25.0, "Couplet 2", false },
                    { 33.0, 33.0, "Refrain 2", false }, { 41.0, 41.0, "Pont", false },
                    { 49.0, 49.0, "Final", false }, { 57.0, 57.0, "Fin", false } };
        templates = { "Vide", "Démo 4 pistes", "Podcast", "Mixage" };
    }

    double projectLengthBars() const
    {
        double len = std::max (84.0, loopEndBars + 8.0);
        for (const auto& t : tracks)
        {
            for (const auto& c : t.clips) len = std::max (len, c.startBars + c.lenBars + 8.0);
            for (const auto& n : t.midiNotes) len = std::max (len, n.startBars + n.lenBars + 8.0);
        }
        for (const auto& m : markers) len = std::max (len, m.bars + 8.0);
        return len;
    }
    void normaliseMedia()
    {
        for (const auto& t : tracks)
            for (const auto& c : t.clips)
                if (! c.media.empty() && std::find (media.begin(), media.end(), c.media) == media.end())
                    media.push_back (c.media);
    }
};

// --------------------------------------------------------------- sérialisation
inline JsonValue fxToJson (const FxState& fx)
{
    JsonValue j (JsonValue::Type::Object);
    j["eqEnabled"] = JsonValue (fx.eqEnabled);
    JsonValue bands (JsonValue::Type::Array);
    for (const auto& b : fx.eq)
    {
        JsonValue e (JsonValue::Type::Object);
        e["freq"] = JsonValue (b.freq);
        e["gainDb"] = JsonValue (b.gainDb);
        e["q"] = JsonValue (b.q);
        e["enabled"] = JsonValue (b.enabled);
        e["lowShelf"] = JsonValue (b.lowShelf);
        e["highShelf"] = JsonValue (b.highShelf);
        bands.array.push_back (e);
    }
    j["eq"] = bands;
    j["dynamics"] = JsonValue (JsonValue::Type::Object);
    j["dynamics"]["thresholdDb"] = JsonValue (fx.dynamics.thresholdDb);
    j["dynamics"]["ratio"] = JsonValue (fx.dynamics.ratio);
    j["dynamics"]["attackMs"] = JsonValue (fx.dynamics.attackMs);
    j["dynamics"]["releaseMs"] = JsonValue (fx.dynamics.releaseMs);
    j["dynamics"]["makeupDb"] = JsonValue (fx.dynamics.makeupDb);
    j["dynamics"]["enabled"] = JsonValue (fx.dynamics.enabled);
    return j;
}
inline FxState fxFromJson (const JsonValue& j)
{
    FxState fx;
    fx.eqEnabled = jBool (j, "eqEnabled", true);
    const auto& bands = j.get ("eq");
    if (bands.isArray())
        for (size_t i = 0; i < bands.array.size() && i < fx.eq.size(); ++i)
        {
            const auto& e = bands.array[i];
            fx.eq[i].freq = clampValue (jNumber (e, "freq", fx.eq[i].freq), 20.0, 20000.0);
            fx.eq[i].gainDb = clampValue (jNumber (e, "gainDb", 0.0), -24.0, 24.0);
            fx.eq[i].q = clampValue (jNumber (e, "q", 0.707), 0.1, 20.0);
            fx.eq[i].enabled = jBool (e, "enabled", true);
            fx.eq[i].lowShelf = jBool (e, "lowShelf", false);
            fx.eq[i].highShelf = jBool (e, "highShelf", false);
        }
    const auto& d = j.get ("dynamics");
    fx.dynamics.thresholdDb = clampValue (jNumber (d, "thresholdDb", -18.0), -60.0, 0.0);
    fx.dynamics.ratio = clampValue (jNumber (d, "ratio", 3.0), 1.0, 20.0);
    fx.dynamics.attackMs = clampValue (jNumber (d, "attackMs", 5.0), 0.1, 200.0);
    fx.dynamics.releaseMs = clampValue (jNumber (d, "releaseMs", 80.0), 1.0, 2000.0);
    fx.dynamics.makeupDb = clampValue (jNumber (d, "makeupDb", 0.0), -24.0, 24.0);
    fx.dynamics.enabled = jBool (d, "enabled", false);
    return fx;
}
inline JsonValue stateToJson (const ProjectState& s)
{
    JsonValue j (JsonValue::Type::Object);
    j["schema"] = JsonValue (s.schema);
    j["format"] = JsonValue (s.format);
    j["name"] = JsonValue (s.name);
    j["createdUtc"] = JsonValue (s.createdUtc);
    j["modifiedUtc"] = JsonValue (s.modifiedUtc);
    j["bpm"] = JsonValue (s.bpm);
    j["masterDb"] = JsonValue (s.masterDb);
    j["looping"] = JsonValue (s.looping);
    j["metronome"] = JsonValue (s.metronome);
    j["loopStartBars"] = JsonValue (s.loopStartBars);
    j["loopEndBars"] = JsonValue (s.loopEndBars);
    j["punchEnabled"] = JsonValue (s.punchEnabled);
    j["punchInBars"] = JsonValue (s.punchInBars);
    j["punchOutBars"] = JsonValue (s.punchOutBars);
    j["precountBars"] = JsonValue (s.precountBars);
    j["latencyMs"] = JsonValue (s.latencyMs);
    j["videoEnabled"] = JsonValue (s.videoEnabled);
    j["projectLengthBars"] = JsonValue (s.projectLengthBars());

    JsonValue tracks (JsonValue::Type::Array);
    for (size_t ti = 0; ti < s.tracks.size(); ++ti)
    {
        const auto& t = s.tracks[ti];
        JsonValue e (JsonValue::Type::Object);
        e["id"] = JsonValue (t.id.empty() ? "native_" + std::to_string (ti) : t.id);
        e["name"] = JsonValue (t.name);
        e["colour"] = JsonValue (t.colour);
        e["volumeDb"] = JsonValue (t.volumeDb);
        e["pan"] = JsonValue (t.pan);
        e["mute"] = JsonValue (t.mute);
        e["solo"] = JsonValue (t.solo);
        e["arm"] = JsonValue (t.arm);
        e["instrument"] = JsonValue (t.instrument);
        e["bus"] = JsonValue (t.bus);
        e["sendDb"] = JsonValue (t.sendDb);
        e["fx"] = fxToJson (t.fx);
        JsonValue clips (JsonValue::Type::Array);
        for (const auto& c : t.clips)
        {
            JsonValue k (JsonValue::Type::Object);
            k["id"] = JsonValue (c.id);
            k["name"] = JsonValue (c.name);
            k["media"] = JsonValue (c.media);
            k["startBars"] = JsonValue (c.startBars);
            k["lenBars"] = JsonValue (c.lenBars);
            k["offsetBars"] = JsonValue (c.offsetBars);
            k["loop"] = JsonValue (c.loop);
            clips.array.push_back (k);
        }
        e["clips"] = clips;
        JsonValue notes (JsonValue::Type::Array);
        for (const auto& n : t.midiNotes)
        {
            JsonValue k (JsonValue::Type::Object);
            k["startBars"] = JsonValue (n.startBars);
            k["lenBars"] = JsonValue (n.lenBars);
            k["pitch"] = JsonValue (n.pitch);
            k["velocity"] = JsonValue (n.velocity);
            k["on"] = JsonValue (n.on);
            notes.array.push_back (k);
        }
        e["midiNotes"] = notes;
        JsonValue autos (JsonValue::Type::Array);
        for (const auto& a : t.automation)
        {
            JsonValue k (JsonValue::Type::Object);
            k["param"] = JsonValue (a.param);
            k["neutral"] = JsonValue (a.neutral);
            JsonValue pts (JsonValue::Type::Array);
            for (const auto& p : a.points)
            {
                JsonValue q (JsonValue::Type::Array);
                q.array.push_back (JsonValue (p.bars));
                q.array.push_back (JsonValue (p.value));
                pts.array.push_back (q);
            }
            k["points"] = pts;
            autos.array.push_back (k);
        }
        e["automation"] = autos;
        tracks.array.push_back (e);
    }
    j["tracks"] = tracks;

    JsonValue buses (JsonValue::Type::Array);
    for (const auto& b : s.buses)
    {
        JsonValue e (JsonValue::Type::Object);
        e["name"] = JsonValue (b.name);
        e["volumeDb"] = JsonValue (b.volumeDb);
        e["pan"] = JsonValue (b.pan);
        e["mute"] = JsonValue (b.mute);
        buses.array.push_back (e);
    }
    j["buses"] = buses;

    JsonValue markers (JsonValue::Type::Array);
    for (const auto& m : s.markers)
    {
        JsonValue e (JsonValue::Type::Object);
        e["bars"] = JsonValue (m.bars);
        e["endBars"] = JsonValue (m.endBars);
        e["name"] = JsonValue (m.name);
        e["cycle"] = JsonValue (m.cycle);
        markers.array.push_back (e);
    }
    j["markers"] = markers;

    JsonValue media (JsonValue::Type::Array);
    for (const auto& m : s.media) media.array.push_back (JsonValue (m));
    j["media"] = media;
    JsonValue templates (JsonValue::Type::Array);
    for (const auto& m : s.templates) templates.array.push_back (JsonValue (m));
    j["templates"] = templates;

    JsonValue prefs (JsonValue::Type::Object);
    prefs["autoSave"] = JsonValue (s.preferences.autoSave);
    prefs["keyboardAccess"] = JsonValue (s.preferences.keyboardAccess);
    prefs["highContrast"] = JsonValue (s.preferences.highContrast);
    prefs["largeText"] = JsonValue (s.preferences.largeText);
    prefs["autoSaveSeconds"] = JsonValue (s.preferences.autoSaveSeconds);
    prefs["latencyMs"] = JsonValue (s.preferences.latencyMs);
    prefs["precountBars"] = JsonValue (s.preferences.precountBars);
    prefs["theme"] = JsonValue (s.preferences.theme);
    j["preferences"] = prefs;

    JsonValue cr (JsonValue::Type::Object);
    cr["monitorDb"] = JsonValue (s.controlRoom.monitorDb);
    cr["dim"] = JsonValue (s.controlRoom.dim);
    cr["mono"] = JsonValue (s.controlRoom.mono);
    cr["source"] = JsonValue (s.controlRoom.source);
    j["controlRoom"] = cr;
    return j;
}
inline ProjectState stateFromJson (const JsonValue& j)
{
    ProjectState s;
    s.schema = jInt (j, "schema", 2);
    s.format = jString (j, "format", "ALPHAPROJ");
    s.name = jString (j, "name", s.name);
    s.createdUtc = jString (j, "createdUtc", utcNow());
    s.modifiedUtc = jString (j, "modifiedUtc", utcNow());
    s.bpm = clampValue (jNumber (j, "bpm", 120.0), 20.0, 300.0);
    s.masterDb = clampValue (jNumber (j, "masterDb", 0.0), -60.0, 12.0);
    s.looping = jBool (j, "looping", true);
    s.metronome = jBool (j, "metronome", false);
    s.loopStartBars = clampValue (jNumber (j, "loopStartBars", 1.0), 1.0, 100000.0);
    s.loopEndBars = std::max (s.loopStartBars + 0.01, clampValue (jNumber (j, "loopEndBars", 9.0), 1.0, 100000.0));
    s.punchEnabled = jBool (j, "punchEnabled", false);
    s.punchInBars = clampValue (jNumber (j, "punchInBars", 1.0), 1.0, 100000.0);
    s.punchOutBars = std::max (s.punchInBars, clampValue (jNumber (j, "punchOutBars", 9.0), 1.0, 100000.0));
    s.precountBars = clampValue (jNumber (j, "precountBars", 1.0), 0.0, 8.0);
    s.latencyMs = clampValue (jNumber (j, "latencyMs", 0.0), 0.0, 500.0);
    s.videoEnabled = false; // décision produit : jamais restaurée depuis un fichier.

    s.tracks.clear();
    const auto& tracks = j.get ("tracks");
    if (tracks.isArray()) for (const auto& e : tracks.array)
    {
        TrackState t;
        t.id = jString (e, "id");
        t.name = jString (e, "name", t.name);
        t.colour = jString (e, "colour", t.colour);
        t.volumeDb = clampValue (jNumber (e, "volumeDb", -6.0), -60.0, 12.0);
        t.pan = clampValue (jNumber (e, "pan", 0.0), -1.0, 1.0);
        t.mute = jBool (e, "mute", false);
        t.solo = jBool (e, "solo", false);
        t.arm = jBool (e, "arm", false);
        t.instrument = jBool (e, "instrument", false);
        t.bus = static_cast<int> (clampValue (static_cast<double> (jInt (e, "bus", 0)), 0.0, 3.0));
        t.sendDb = clampValue (jNumber (e, "sendDb", 0.0), -60.0, 12.0);
        t.fx = fxFromJson (e.get ("fx"));
        const auto& clips = e.get ("clips");
        if (clips.isArray()) for (const auto& k : clips.array)
        {
            AudioClip c;
            c.id = jString (k, "id");
            c.name = jString (k, "name", "Audio");
            c.media = jString (k, "media");
            c.startBars = clampValue (jNumber (k, "startBars", 1.0), 1.0, 100000.0);
            c.lenBars = clampValue (jNumber (k, "lenBars", 1.0), 0.001, 100000.0);
            c.offsetBars = clampValue (jNumber (k, "offsetBars", 0.0), 0.0, 100000.0);
            c.loop = jBool (k, "loop", false);
            t.clips.push_back (c);
        }
        const auto& notes = e.get ("midiNotes");
        if (notes.isArray()) for (const auto& k : notes.array)
        {
            MidiNote n;
            n.startBars = clampValue (jNumber (k, "startBars", 1.0), 1.0, 100000.0);
            n.lenBars = clampValue (jNumber (k, "lenBars", 0.25), 0.001, 100000.0);
            n.pitch = static_cast<int> (clampValue (static_cast<double> (jInt (k, "pitch", 60)), 0.0, 127.0));
            n.velocity = static_cast<int> (clampValue (static_cast<double> (jInt (k, "velocity", 100)), 1.0, 127.0));
            n.on = jBool (k, "on", true);
            t.midiNotes.push_back (n);
        }
        const auto& autos = e.get ("automation");
        if (autos.isArray()) for (const auto& k : autos.array)
        {
            AutomationCurve a;
            a.param = jString (k, "param", "Volume");
            a.neutral = jNumber (k, "neutral", 1.0);
            const auto& pts = k.get ("points");
            if (pts.isArray()) for (const auto& p : pts.array)
                if (p.isArray() && p.array.size() >= 2)
                    a.points.push_back ({ clampValue (p.array[0].number, 1.0, 100000.0),
                                         clampValue (p.array[1].number, -60.0, 60.0) });
            std::sort (a.points.begin(), a.points.end(), [] (const AutomationPoint& x, const AutomationPoint& y) { return x.bars < y.bars; });
            t.automation.push_back (a);
        }
        s.tracks.push_back (t);
    }

    s.buses.clear();
    const auto& buses = j.get ("buses");
    if (buses.isArray()) for (const auto& e : buses.array)
        s.buses.push_back ({ jString (e, "name", "Bus"),
                             clampValue (jNumber (e, "volumeDb", 0.0), -60.0, 12.0),
                             clampValue (jNumber (e, "pan", 0.0), -1.0, 1.0),
                             jBool (e, "mute", false) });
    if (s.buses.empty()) { ProjectState def; s.buses = def.buses; }

    s.markers.clear();
    const auto& markers = j.get ("markers");
    if (markers.isArray()) for (const auto& e : markers.array)
        s.markers.push_back ({ clampValue (jNumber (e, "bars", 1.0), 1.0, 100000.0),
                              clampValue (jNumber (e, "endBars", 1.0), 1.0, 100000.0),
                              jString (e, "name", "Marqueur"), jBool (e, "cycle", false) });
    if (s.markers.empty()) { ProjectState def; s.markers = def.markers; }

    s.media.clear();
    const auto& media = j.get ("media");
    if (media.isArray()) for (const auto& e : media.array) if (e.type == JsonValue::Type::String) s.media.push_back (e.string);
    s.templates.clear();
    const auto& templates = j.get ("templates");
    if (templates.isArray()) for (const auto& e : templates.array) if (e.type == JsonValue::Type::String) s.templates.push_back (e.string);
    if (s.templates.empty()) { ProjectState def; s.templates = def.templates; }

    const auto& prefs = j.get ("preferences");
    s.preferences.autoSave = jBool (prefs, "autoSave", true);
    s.preferences.keyboardAccess = jBool (prefs, "keyboardAccess", true);
    s.preferences.highContrast = jBool (prefs, "highContrast", false);
    s.preferences.largeText = jBool (prefs, "largeText", false);
    s.preferences.autoSaveSeconds = clampValue (jNumber (prefs, "autoSaveSeconds", 30.0), 5.0, 3600.0);
    s.preferences.latencyMs = clampValue (jNumber (prefs, "latencyMs", 0.0), 0.0, 500.0);
    s.preferences.precountBars = clampValue (jNumber (prefs, "precountBars", 1.0), 0.0, 8.0);
    s.preferences.theme = jString (prefs, "theme", "Nuendo 4");

    const auto& cr = j.get ("controlRoom");
    s.controlRoom.monitorDb = clampValue (jNumber (cr, "monitorDb", 0.0), -60.0, 12.0);
    s.controlRoom.dim = jBool (cr, "dim", false);
    s.controlRoom.mono = jBool (cr, "mono", false);
    s.controlRoom.source = jString (cr, "source", "Mix");
    s.normaliseMedia();
    return s;
}

inline ProjectState templateState (const std::string& name)
{
    ProjectState s;
    s.name = name;
    s.createdUtc = utcNow();
    s.modifiedUtc = s.createdUtc;
    if (name == "Vide") { s.tracks.clear(); return s; }
    if (name == "Démo 4 pistes")
    {
        const char* names[4] = { "Batterie", "Basse", "Nappes", "Arpège" };
        const char* files[4] = { "Media/Beat 120.wav", "Media/Ligne de basse.wav",
                                 "Media/Accords Am F C G.wav", "Media/Arpège pentatonique.wav" };
        const double vols[4] = { -4.0, -5.0, -9.0, -10.0 };
        const double pans[4] = { 0.0, 0.0, -0.2, 0.35 };
        for (int i = 0; i < 4; ++i)
        {
            TrackState t;
            t.id = "native_" + std::to_string (i);
            t.name = names[i];
            t.volumeDb = vols[i];
            t.pan = pans[i];
            AudioClip c;
            c.id = "nativeClip_" + std::to_string (i) + "_0";
            c.name = i == 2 ? "Accords Am F C G" : (i == 3 ? "Arpège pentatonique" : (i == 1 ? "Ligne de basse" : "Beat 120"));
            c.media = files[i];
            c.startBars = i == 3 ? 5.0 : 1.0;
            c.lenBars = i == 3 ? 6.0 : 8.0;
            t.clips.push_back (c);
            s.tracks.push_back (t);
            s.media.push_back (files[i]);
        }
        s.loopStartBars = 1.0;
        s.loopEndBars = 9.0;
        return s;
    }
    if (name == "Podcast")
    {
        s.tracks.clear();
        const char* names[3] = { "Voix", "Ambiance", "Générique" };
        for (int i = 0; i < 3; ++i) { TrackState t; t.id = "native_" + std::to_string (i); t.name = names[i]; t.arm = i == 0; s.tracks.push_back (t); }
        s.punchEnabled = true; s.punchInBars = 1.0; s.punchOutBars = 9.0;
        return s;
    }
    s.tracks.clear();
    for (int i = 0; i < 8; ++i)
    {
        TrackState t;
        t.id = "native_" + std::to_string (i);
        t.name = "Piste " + std::to_string (i + 1);
        t.bus = i % 4;
        s.tracks.push_back (t);
    }
    return s;
}

// ------------------------------------------------------------- historique
class History
{
public:
    struct Entry { std::string label; ProjectState state; };

    void initialise (const ProjectState& state, const std::string& label = "État initial")
    {
        entries.clear();
        entries.push_back ({ label.empty() ? "État initial" : label, state });
        cursor = 0;
    }
    void record (const std::string& label, const ProjectState& state)
    {
        entries.resize (cursor + 1); // aucune limite : seul le disque/RAM borne la pile.
        entries.push_back ({ label.empty() ? "Modification" : label, state });
        cursor = entries.size() - 1;
    }
    bool canUndo() const { return cursor > 0; }
    bool canRedo() const { return ! entries.empty() && cursor + 1 < entries.size(); }
    size_t size() const { return entries.size(); }
    size_t index() const { return cursor; }
    bool undo (ProjectState& out)
    {
        if (! canUndo()) return false;
        --cursor;
        out = entries[cursor].state;
        return true;
    }
    bool redo (ProjectState& out)
    {
        if (! canRedo()) return false;
        ++cursor;
        out = entries[cursor].state;
        return true;
    }
    bool jump (size_t target, ProjectState& out)
    {
        if (target >= entries.size()) return false;
        cursor = target;
        out = entries[cursor].state;
        return true;
    }
    JsonValue toJson() const
    {
        JsonValue a (JsonValue::Type::Array);
        for (size_t i = 0; i < entries.size(); ++i)
        {
            JsonValue e (JsonValue::Type::Object);
            e["index"] = JsonValue (static_cast<long long> (i));
            e["label"] = JsonValue (entries[i].label);
            e["current"] = JsonValue (i == cursor);
            e["undoable"] = JsonValue (i < cursor);
            e["redoable"] = JsonValue (i > cursor);
            a.array.push_back (e);
        }
        return a;
    }
private:
    std::vector<Entry> entries;
    size_t cursor = 0;
};

// ------------------------------------------------------------------ commandes
class ProjectCore
{
public:
    ProjectState state;
    History history;
    bool dirty = false;
    std::string lastError;
    std::string savedJson;

    ProjectCore() { resetTo (ProjectState(), "État initial"); }

    void resetTo (const ProjectState& s, const std::string& label)
    {
        state = s;
        state.videoEnabled = false;
        state.modifiedUtc = utcNow();
        state.normaliseMedia();
        history.initialise (state, label);
        dirty = false;
    }
    std::string serialize() const { return stateToJson (state).dump(); }
    bool load (const std::string& text)
    {
        std::string err;
        const auto j = JsonValue::parse (text, err);
        if (! err.empty() || ! j.isObject() || jString (j, "format", "") != "ALPHAPROJ")
        {
            lastError = err.empty() ? "Format .alphaproj invalide" : err;
            return false;
        }
        resetTo (stateFromJson (j), "Projet chargé");
        savedJson = serialize();
        return true;
    }
    void markSaved()
    {
        savedJson = serialize();
        dirty = false;
    }
    bool revert()
    {
        if (savedJson.empty()) { lastError = "Aucun état enregistré à rétablir"; return false; }
        return load (savedJson);
    }
    void markDirty() { dirty = true; state.modifiedUtc = utcNow(); }

    JsonValue apiState() const
    {
        JsonValue j = stateToJson (state);
        j["history"] = history.toJson();
        j["historyCount"] = JsonValue (static_cast<long long> (history.size()));
        j["historyIndex"] = JsonValue (static_cast<long long> (history.index()));
        j["canUndo"] = JsonValue (history.canUndo());
        j["canRedo"] = JsonValue (history.canRedo());
        j["dirty"] = JsonValue (dirty);
        j["videoEnabled"] = JsonValue (false);
        j["videoPolicy"] = JsonValue ("after_final_confirmed_test");
        return j;
    }

    bool mutate (const std::string& label, bool (*fn) (ProjectState&, const JsonValue&, std::string&),
                 const JsonValue& payload = JsonValue())
    {
        ProjectState next = state;
        std::string err;
        if (! fn (next, payload, err)) { lastError = err; return false; }
        next.videoEnabled = false;
        const std::string previousModifiedUtc = state.modifiedUtc;
        next.modifiedUtc = utcNow();
        next.normaliseMedia();
        ProjectState comparable = next;
        comparable.modifiedUtc = previousModifiedUtc;
        if (stateToJson (comparable).dump() == stateToJson (state).dump())
        {
            lastError.clear();
            return true; // commande sans effet : pas de faux niveau d'historique.
        }
        state = next;
        history.record (label, state);
        dirty = true;
        lastError.clear();
        return true;
    }

    bool undo() { ProjectState out; if (! history.undo (out)) { lastError = "Début de l'historique"; return false; } state = out; state.videoEnabled = false; dirty = true; lastError.clear(); return true; }
    bool redo() { ProjectState out; if (! history.redo (out)) { lastError = "Fin de l'historique"; return false; } state = out; state.videoEnabled = false; dirty = true; lastError.clear(); return true; }
    bool jumpHistory (size_t target) { ProjectState out; if (! history.jump (target, out)) { lastError = "Niveau d'historique invalide"; return false; } state = out; state.videoEnabled = false; dirty = true; lastError.clear(); return true; }

    bool command (const std::string& name, const JsonValue& p)
    {
        lastError.clear();
        if (name == "undo") return undo();
        if (name == "redo") return redo();
        if (name == "jumpHistory") return jumpHistory (static_cast<size_t> (jInt (p, "index", 0)));
        if (name == "revert") return revert();
        if (name == "saveSnapshot") { markSaved(); return true; }
        if (name == "newProject") { resetTo (ProjectState(), "Nouveau projet"); return true; }
        if (name == "applyTemplate" || name == "newFromTemplate" || name == "loadTemplate")
        {
            const auto t = jString (p, "name", "Vide");
            auto s = templateState (t);
            resetTo (s, "Modèle : " + t);
            return true;
        }
        if (name == "setVideoEnabled")
        {
            lastError = "Vidéo verrouillée : elle sera ajoutée après le test final confirmé.";
            return false;
        }
        if (name == "backupProject") return true;
        if (name == "setStatus") return true;

        static const struct { const char* name; const char* label; bool (*fn) (ProjectState&, const JsonValue&, std::string&); } table[] = {
            { "setTempo", "Tempo", setTempo },
            { "setLoop", "Cycle", setLoop },
            { "setMaster", "Master", setMaster },
            { "setControlRoom", "Control Room", setControlRoom },
            { "setPreferences", "Préférences", setPreferences },
            { "setRecordingOptions", "Options d'enregistrement", setRecordingOptions },
            { "setMarkers", "Marqueurs", setMarkers },
            { "addTrack", "Ajouter une piste", addTrack },
            { "removeTrack", "Supprimer une piste", removeTrack },
            { "duplicateTrack", "Dupliquer une piste", duplicateTrack },
            { "setTrack", "Réglage de piste", setTrack },
            { "setBus", "Réglage de bus", setBus },
            { "addClip", "Ajouter un clip", addClip },
            { "removeClip", "Supprimer un clip", removeClip },
            { "moveClip", "Déplacer un clip", moveClip },
            { "splitClip", "Diviser un clip", splitClip },
            { "duplicateClip", "Dupliquer un clip", duplicateClip },
            { "setClipStart", "Position du clip", setClipStart },
            { "pasteClips", "Collage multi-pistes", pasteClips },
            { "setFx", "Égaliseur / dynamique", setFx },
            { "setAutomation", "Automatisation", setAutomation },
            { "setMidiNotes", "Notes MIDI", setMidiNotes },
            { "quantizeMidi", "Quantification MIDI", quantizeMidi },
            { "importMedia", "Importer un média", importMedia },
            { "replaceState", "Édition de l'interface", replaceState }
        };
        for (const auto& e : table)
            if (name == e.name)
                return mutate (e.label, e.fn, p);
        lastError = "Commande projet inconnue : " + name;
        return false;
    }

private:
    static bool indexValid (const ProjectState& s, int index, std::string& err)
    {
        if (index < 0 || index >= static_cast<int> (s.tracks.size())) { err = "Indice de piste invalide"; return false; }
        return true;
    }
    static bool clipValid (const ProjectState& s, int track, int clip, std::string& err)
    {
        if (! indexValid (s, track, err)) return false;
        if (clip < 0 || clip >= static_cast<int> (s.tracks[static_cast<size_t> (track)].clips.size())) { err = "Indice de clip invalide"; return false; }
        return true;
    }
    static bool setTempo (ProjectState& s, const JsonValue& p, std::string&) { s.bpm = clampValue (jNumber (p, "bpm", s.bpm), 20.0, 300.0); return true; }
    static bool setLoop (ProjectState& s, const JsonValue& p, std::string&)
    {
        s.looping = jBool (p, "enabled", s.looping);
        s.loopStartBars = clampValue (jNumber (p, "start", s.loopStartBars), 1.0, 100000.0);
        s.loopEndBars = std::max (s.loopStartBars + 0.01, clampValue (jNumber (p, "end", s.loopEndBars), 1.0, 100000.0));
        return true;
    }
    static bool setMaster (ProjectState& s, const JsonValue& p, std::string&) { s.masterDb = clampValue (jNumber (p, "volumeDb", s.masterDb), -60.0, 12.0); return true; }
    static bool setControlRoom (ProjectState& s, const JsonValue& p, std::string&)
    {
        s.controlRoom.monitorDb = clampValue (jNumber (p, "monitorDb", s.controlRoom.monitorDb), -60.0, 12.0);
        s.controlRoom.dim = jBool (p, "dim", s.controlRoom.dim);
        s.controlRoom.mono = jBool (p, "mono", s.controlRoom.mono);
        s.controlRoom.source = jString (p, "source", s.controlRoom.source);
        return true;
    }
    static bool setPreferences (ProjectState& s, const JsonValue& p, std::string&)
    {
        auto& f = s.preferences;
        f.autoSave = jBool (p, "autoSave", f.autoSave);
        f.keyboardAccess = jBool (p, "keyboardAccess", f.keyboardAccess);
        f.highContrast = jBool (p, "highContrast", f.highContrast);
        f.largeText = jBool (p, "largeText", f.largeText);
        f.autoSaveSeconds = clampValue (jNumber (p, "autoSaveSeconds", f.autoSaveSeconds), 5.0, 3600.0);
        f.latencyMs = clampValue (jNumber (p, "latencyMs", f.latencyMs), 0.0, 500.0);
        f.precountBars = clampValue (jNumber (p, "precountBars", f.precountBars), 0.0, 8.0);
        f.theme = jString (p, "theme", f.theme);
        return true;
    }
    static bool setRecordingOptions (ProjectState& s, const JsonValue& p, std::string& err)
    {
        s.punchEnabled = jBool (p, "punchEnabled", s.punchEnabled);
        s.punchInBars = clampValue (jNumber (p, "punchInBars", s.punchInBars), 1.0, 100000.0);
        s.punchOutBars = clampValue (jNumber (p, "punchOutBars", s.punchOutBars), 1.0, 100000.0);
        s.precountBars = clampValue (jNumber (p, "precountBars", s.precountBars), 0.0, 8.0);
        s.latencyMs = clampValue (jNumber (p, "latencyMs", s.latencyMs), 0.0, 500.0);
        if (s.punchOutBars <= s.punchInBars) { err = "Punch out doit être après punch in"; return false; }
        return true;
    }
    static bool setMarkers (ProjectState& s, const JsonValue& p, std::string&)
    {
        const auto& a = p.get ("markers");
        if (! a.isArray()) return true;
        std::vector<MarkerState> m;
        for (const auto& e : a.array)
            m.push_back ({ clampValue (jNumber (e, "bars", 1.0), 1.0, 100000.0),
                           clampValue (jNumber (e, "endBars", 1.0), 1.0, 100000.0),
                           jString (e, "name", "Marqueur"), jBool (e, "cycle", false) });
        s.markers = m;
        return true;
    }
    static bool addTrack (ProjectState& s, const JsonValue& p, std::string&)
    {
        TrackState t;
        t.id = "native_" + std::to_string (s.tracks.size());
        t.name = jString (p, "name", "Audio " + std::to_string (s.tracks.size() + 1));
        t.bus = jInt (p, "bus", 0);
        s.tracks.push_back (t);
        return true;
    }
    static bool removeTrack (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! indexValid (s, i, err)) return false;
        s.tracks.erase (s.tracks.begin() + i);
        return true;
    }
    static bool duplicateTrack (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! indexValid (s, i, err)) return false;
        TrackState copy = s.tracks[static_cast<size_t> (i)];
        copy.id = "native_" + std::to_string (s.tracks.size());
        copy.name += " copie";
        copy.arm = false;
        s.tracks.insert (s.tracks.begin() + i + 1, copy);
        return true;
    }
    static bool setTrack (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! indexValid (s, i, err)) return false;
        auto& t = s.tracks[static_cast<size_t> (i)];
        const auto field = jString (p, "field");
        const auto& v = p.get ("value");
        if (field == "name") t.name = jString (p, "value", t.name);
        else if (field == "mute") t.mute = v.type == JsonValue::Type::Bool ? v.boolean : static_cast<bool> (v.number);
        else if (field == "solo") t.solo = v.type == JsonValue::Type::Bool ? v.boolean : static_cast<bool> (v.number);
        else if (field == "arm") t.arm = v.type == JsonValue::Type::Bool ? v.boolean : static_cast<bool> (v.number);
        else if (field == "volumeDb") t.volumeDb = clampValue (jNumber (p, "value", t.volumeDb), -60.0, 12.0);
        else if (field == "pan") t.pan = clampValue (jNumber (p, "value", t.pan), -1.0, 1.0);
        else if (field == "bus") t.bus = static_cast<int> (clampValue (jNumber (p, "value", t.bus), 0.0, 3.0));
        else if (field == "sendDb") t.sendDb = clampValue (jNumber (p, "value", t.sendDb), -60.0, 12.0);
        else if (field == "instrument") t.instrument = v.type == JsonValue::Type::Bool ? v.boolean : static_cast<bool> (v.number);
        else { err = "Champ de piste inconnu : " + field; return false; }
        return true;
    }
    static bool setBus (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (i < 0 || i >= static_cast<int> (s.buses.size())) { err = "Indice de bus invalide"; return false; }
        auto& b = s.buses[static_cast<size_t> (i)];
        const auto field = jString (p, "field");
        if (field == "name") b.name = jString (p, "value", b.name);
        else if (field == "volumeDb") b.volumeDb = clampValue (jNumber (p, "value", b.volumeDb), -60.0, 12.0);
        else if (field == "pan") b.pan = clampValue (jNumber (p, "value", b.pan), -1.0, 1.0);
        else if (field == "mute") b.mute = jBool (p, "value", b.mute);
        else { err = "Champ de bus inconnu : " + field; return false; }
        return true;
    }
    static AudioClip clipFromJson (const JsonValue& k)
    {
        AudioClip c;
        c.id = jString (k, "id");
        c.name = jString (k, "name", "Audio");
        c.media = jString (k, "media");
        c.startBars = clampValue (jNumber (k, "startBars", 1.0), 1.0, 100000.0);
        c.lenBars = clampValue (jNumber (k, "lenBars", 1.0), 0.001, 100000.0);
        c.offsetBars = clampValue (jNumber (k, "offsetBars", 0.0), 0.0, 100000.0);
        c.loop = jBool (k, "loop", false);
        return c;
    }
    static bool addClip (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "trackIndex", jInt (p, "index", -1));
        if (! indexValid (s, i, err)) return false;
        AudioClip c = clipFromJson (p.get ("clip").isObject() ? p.get ("clip") : p);
        if (c.id.empty()) c.id = "nativeClip_" + std::to_string (i) + "_" + std::to_string (s.tracks[static_cast<size_t> (i)].clips.size());
        s.tracks[static_cast<size_t> (i)].clips.push_back (c);
        return true;
    }
    static bool removeClip (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", -1));
        const int ci = jInt (p, "clipIndex", jInt (p, "clip", -1));
        if (! clipValid (s, ti, ci, err)) return false;
        s.tracks[static_cast<size_t> (ti)].clips.erase (s.tracks[static_cast<size_t> (ti)].clips.begin() + ci);
        return true;
    }
    static bool moveClip (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", -1));
        const int ci = jInt (p, "clipIndex", jInt (p, "clip", -1));
        if (! clipValid (s, ti, ci, err)) return false;
        s.tracks[static_cast<size_t> (ti)].clips[static_cast<size_t> (ci)].startBars = clampValue (jNumber (p, "startBars", 1.0), 1.0, 100000.0);
        return true;
    }
    static bool setClipStart (ProjectState& s, const JsonValue& p, std::string& err) { return moveClip (s, p, err); }
    static bool splitClip (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", -1));
        const int ci = jInt (p, "clipIndex", jInt (p, "clip", -1));
        if (! clipValid (s, ti, ci, err)) return false;
        auto& clips = s.tracks[static_cast<size_t> (ti)].clips;
        const double at = clampValue (jNumber (p, "atBars", 1.0), 1.0, 100000.0);
        AudioClip a = clips[static_cast<size_t> (ci)];
        const double end = a.startBars + a.lenBars;
        if (at <= a.startBars + 0.001 || at >= end - 0.001) { err = "Point de division hors du clip"; return false; }
        AudioClip b = a;
        b.id += "-b";
        b.startBars = at;
        b.offsetBars = a.offsetBars + (at - a.startBars);
        b.lenBars = end - at;
        a.lenBars = at - a.startBars;
        clips[static_cast<size_t> (ci)] = a;
        clips.push_back (b);
        return true;
    }
    static bool duplicateClip (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", -1));
        const int ci = jInt (p, "clipIndex", jInt (p, "clip", -1));
        if (! clipValid (s, ti, ci, err)) return false;
        auto& clips = s.tracks[static_cast<size_t> (ti)].clips;
        AudioClip c = clips[static_cast<size_t> (ci)];
        c.id += "-dup";
        c.startBars += c.lenBars;
        clips.push_back (c);
        return true;
    }
    static bool pasteClips (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto& a = p.get ("clips");
        if (! a.isArray() || a.array.empty()) { err = "Presse-papiers vide"; return false; }
        for (const auto& k : a.array)
        {
            const int ti = jInt (k, "trackIndex", jInt (p, "trackIndex", 0));
            if (! indexValid (s, ti, err)) return false;
            AudioClip c = clipFromJson (k);
            c.id += "-paste-" + std::to_string (s.tracks[static_cast<size_t> (ti)].clips.size());
            s.tracks[static_cast<size_t> (ti)].clips.push_back (c);
        }
        return true;
    }
    static bool setFx (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", 0));
        if (! indexValid (s, ti, err)) return false;
        auto& fx = s.tracks[static_cast<size_t> (ti)].fx;
        if (p.has ("fx")) { fx = fxFromJson (p.get ("fx")); return true; }
        if (p.has ("eqEnabled")) fx.eqEnabled = jBool (p, "eqEnabled", fx.eqEnabled);
        const int band = jInt (p, "band", -1);
        if (band >= 0 && band < 4)
        {
            auto& b = fx.eq[static_cast<size_t> (band)];
            const auto field = jString (p, "field");
            if (field == "freq") b.freq = clampValue (jNumber (p, "value", b.freq), 20.0, 20000.0);
            else if (field == "gainDb") b.gainDb = clampValue (jNumber (p, "value", b.gainDb), -24.0, 24.0);
            else if (field == "q") b.q = clampValue (jNumber (p, "value", b.q), 0.1, 20.0);
            else if (field == "enabled") b.enabled = jBool (p, "value", b.enabled);
            else if (field == "type")
            {
                const auto type = jString (p, "value", "peak");
                b.lowShelf = type == "lowShelf";
                b.highShelf = type == "highShelf";
            }
            else { err = "Champ EQ inconnu"; return false; }
        }
        const auto field = jString (p, "field");
        if (field == "thresholdDb") fx.dynamics.thresholdDb = clampValue (jNumber (p, "value", fx.dynamics.thresholdDb), -60.0, 0.0);
        else if (field == "ratio") fx.dynamics.ratio = clampValue (jNumber (p, "value", fx.dynamics.ratio), 1.0, 20.0);
        else if (field == "attackMs") fx.dynamics.attackMs = clampValue (jNumber (p, "value", fx.dynamics.attackMs), 0.1, 200.0);
        else if (field == "releaseMs") fx.dynamics.releaseMs = clampValue (jNumber (p, "value", fx.dynamics.releaseMs), 1.0, 2000.0);
        else if (field == "makeupDb") fx.dynamics.makeupDb = clampValue (jNumber (p, "value", fx.dynamics.makeupDb), -24.0, 24.0);
        else if (field == "dynamicsEnabled" || field == "compressor") fx.dynamics.enabled = jBool (p, "value", fx.dynamics.enabled);
        return true;
    }
    static bool setAutomation (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", 0));
        if (! indexValid (s, ti, err)) return false;
        const auto param = jString (p, "param", "Volume");
        auto& curves = s.tracks[static_cast<size_t> (ti)].automation;
        AutomationCurve curve;
        curve.param = param;
        curve.neutral = param == "Panoramique" || param == "Mute" ? 0.0 : 1.0;
        const auto& pts = p.get ("points");
        if (! pts.isArray()) { err = "Points d'automatisation invalides"; return false; }
        for (const auto& q : pts.array)
            if (q.isArray() && q.array.size() >= 2)
                curve.points.push_back ({ clampValue (q.array[0].number, 1.0, 100000.0),
                                         clampValue (q.array[1].number, -60.0, 60.0) });
        std::sort (curve.points.begin(), curve.points.end(), [] (const AutomationPoint& a, const AutomationPoint& b) { return a.bars < b.bars; });
        const auto it = std::find_if (curves.begin(), curves.end(), [&] (const AutomationCurve& c) { return c.param == param; });
        if (it == curves.end()) curves.push_back (curve);
        else *it = curve;
        return true;
    }
    static bool setMidiNotes (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", 0));
        if (! indexValid (s, ti, err)) return false;
        const auto& a = p.get ("notes");
        if (! a.isArray()) { err = "Notes MIDI invalides"; return false; }
        std::vector<MidiNote> notes;
        for (const auto& k : a.array)
        {
            MidiNote n;
            n.startBars = clampValue (jNumber (k, "startBars", 1.0), 1.0, 100000.0);
            n.lenBars = clampValue (jNumber (k, "lenBars", 0.25), 0.001, 100000.0);
            n.pitch = static_cast<int> (clampValue (static_cast<double> (jInt (k, "pitch", 60)), 0.0, 127.0));
            n.velocity = static_cast<int> (clampValue (static_cast<double> (jInt (k, "velocity", 100)), 1.0, 127.0));
            n.on = jBool (k, "on", true);
            notes.push_back (n);
        }
        s.tracks[static_cast<size_t> (ti)].midiNotes = notes;
        s.tracks[static_cast<size_t> (ti)].instrument = true;
        return true;
    }
    static bool quantizeMidi (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", 0));
        if (! indexValid (s, ti, err)) return false;
        const double grid = clampValue (jNumber (p, "gridBars", 0.0625), 0.001, 4.0);
        for (auto& n : s.tracks[static_cast<size_t> (ti)].midiNotes)
            n.startBars = std::round (n.startBars / grid) * grid;
        return true;
    }
    static bool importMedia (ProjectState& s, const JsonValue& p, std::string&)
    {
        const auto m = jString (p, "media");
        if (! m.empty() && std::find (s.media.begin(), s.media.end(), m) == s.media.end()) s.media.push_back (m);
        return true;
    }
    static bool replaceState (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto& state = p.get ("state");
        if (! state.isObject()) { err = "Document d'interface invalide"; return false; }
        s = stateFromJson (state);
        s.videoEnabled = false;
        return true;
    }
};

// ------------------------------------------------------------------------ DSP
struct Biquad
{
    double b0 = 1.0, b1 = 0.0, b2 = 0.0, a1 = 0.0, a2 = 0.0;
    double x1 = 0.0, x2 = 0.0, y1 = 0.0, y2 = 0.0;

    void reset() { x1 = x2 = y1 = y2 = 0.0; }
    float process (float in)
    {
        const double x = static_cast<double> (in);
        const double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = std::isfinite (y) ? y : 0.0;
        return static_cast<float> (y1);
    }
};
inline Biquad makeBiquad (const EqBand& b, double sampleRate)
{
    const double sr = clampValue (sampleRate, 8000.0, 384000.0);
    const double f = clampValue (b.freq, 20.0, sr * 0.45);
    const double A = std::pow (10.0, clampValue (b.gainDb, -24.0, 24.0) / 40.0);
    const double w = 2.0 * 3.14159265358979323846 * f / sr;
    const double cw = std::cos (w), sw = std::sin (w);
    const double alpha = sw / (2.0 * clampValue (b.q, 0.1, 20.0));
    const double sqrtA = std::sqrt (A);
    double b0 = 1.0, b1 = 0.0, b2 = 0.0, a0 = 1.0, a1 = 0.0, a2 = 0.0;
    if (b.lowShelf)
    {
        b0 = A * ((A + 1.0) - (A - 1.0) * cw + 2.0 * sqrtA * alpha);
        b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cw);
        b2 = A * ((A + 1.0) - (A - 1.0) * cw - 2.0 * sqrtA * alpha);
        a0 = (A + 1.0) + (A - 1.0) * cw + 2.0 * sqrtA * alpha;
        a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cw);
        a2 = (A + 1.0) + (A - 1.0) * cw - 2.0 * sqrtA * alpha;
    }
    else if (b.highShelf)
    {
        b0 = A * ((A + 1.0) + (A - 1.0) * cw + 2.0 * sqrtA * alpha);
        b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cw);
        b2 = A * ((A + 1.0) + (A - 1.0) * cw - 2.0 * sqrtA * alpha);
        a0 = (A + 1.0) - (A - 1.0) * cw + 2.0 * sqrtA * alpha;
        a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cw);
        a2 = (A + 1.0) - (A - 1.0) * cw - 2.0 * sqrtA * alpha;
    }
    else
    {
        b0 = 1.0 + alpha * A;
        b1 = -2.0 * cw;
        b2 = 1.0 - alpha * A;
        a0 = 1.0 + alpha / A;
        a1 = -2.0 * cw;
        a2 = 1.0 - alpha / A;
    }
    Biquad q;
    if (std::abs (a0) > 1e-12)
    {
        q.b0 = b0 / a0; q.b1 = b1 / a0; q.b2 = b2 / a0;
        q.a1 = a1 / a0; q.a2 = a2 / a0;
    }
    return q;
}
inline double compressorGainDb (double detectorDb, double thresholdDb, double ratio)
{
    if (detectorDb <= thresholdDb) return 0.0;
    return thresholdDb + (detectorDb - thresholdDb) / std::max (1.0, ratio) - detectorDb;
}
class DynamicsProcessor
{
public:
    void configure (double sampleRate, const Dynamics& d)
    {
        sr = clampValue (sampleRate, 8000.0, 384000.0);
        cfg = d;
    }
    void reset() { envelope = 0.0; currentGain = 1.0; }
    void process (float& left, float& right)
    {
        if (! cfg.enabled) return;
        const double detector = std::max (std::abs (left), std::abs (right));
        const double coeff = std::exp (-1.0 / std::max (1.0, sr * (detector > envelope ? cfg.attackMs : cfg.releaseMs) / 1000.0));
        envelope = coeff * envelope + (1.0 - coeff) * detector;
        const double detectorDb = 20.0 * std::log10 (std::max (1e-7, envelope));
        const double target = std::pow (10.0, (compressorGainDb (detectorDb, cfg.thresholdDb, cfg.ratio) + cfg.makeupDb) / 20.0);
        currentGain += (target - currentGain) * 0.02;
        left = static_cast<float> (left * currentGain);
        right = static_cast<float> (right * currentGain);
    }
private:
    double sr = 48000.0, envelope = 0.0, currentGain = 1.0;
    Dynamics cfg;
};
class MeterAccumulator
{
public:
    void reset() { meanSquare = 0.0; count = 0; peak = 0.0; hp = 0.0; }
    void add (float l, float r)
    {
        const double x = 0.5 * (static_cast<double> (l) + static_cast<double> (r));
        hp = 0.997 * hp + 0.997 * (x - last);
        last = x;
        const double y = hp * 1.4; // pré-accentuation simplifiée, pas une mesure EBU R128 certifiée.
        meanSquare += y * y;
        ++count;
        peak = std::max (peak, static_cast<double> (std::max (std::abs (l), std::abs (r))));
    }
    double lufs() const
    {
        if (count == 0 || meanSquare <= 0.0) return -70.0;
        return std::max (-70.0, -0.691 + 10.0 * std::log10 (meanSquare / static_cast<double> (count)));
    }
    double peakValue() const { return peak; }
private:
    double meanSquare = 0.0, peak = 0.0, hp = 0.0, last = 0.0;
    uint64_t count = 0;
};
inline float triangularDither (uint32_t& seed)
{
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
    const float a = static_cast<float> (seed & 0xffff) / 32768.0f - 1.0f;
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
    const float b = static_cast<float> (seed & 0xffff) / 32768.0f - 1.0f;
    return (a + b) / 16777216.0f;
}

// ------------------------------------------------------------------- base64
inline std::string base64Encode (const std::string& in)
{
    static const char* table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    for (size_t i = 0; i < in.size(); i += 3)
    {
        const uint32_t a = static_cast<unsigned char> (in[i]);
        const uint32_t b = i + 1 < in.size() ? static_cast<unsigned char> (in[i + 1]) : 0;
        const uint32_t c = i + 2 < in.size() ? static_cast<unsigned char> (in[i + 2]) : 0;
        const uint32_t v = (a << 16) | (b << 8) | c;
        out += table[(v >> 18) & 63];
        out += table[(v >> 12) & 63];
        out += i + 1 < in.size() ? table[(v >> 6) & 63] : '=';
        out += i + 2 < in.size() ? table[v & 63] : '=';
    }
    return out;
}
inline std::string base64Decode (const std::string& in)
{
    auto val = [] (char c) -> int
    {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return 26 + c - 'a';
        if (c >= '0' && c <= '9') return 52 + c - '0';
        if (c == '+') return 62;
        if (c == '/') return 63;
        return -1;
    };
    std::string out;
    uint32_t buffer = 0;
    int bits = 0;
    for (char c : in)
    {
        if (c == '=') break;
        const int v = val (c);
        if (v < 0) continue;
        buffer = (buffer << 6) | static_cast<uint32_t> (v);
        bits += 6;
        if (bits >= 8)
        {
            bits -= 8;
            out += static_cast<char> ((buffer >> bits) & 0xff);
        }
    }
    return out;
}

// --------------------------------------------------- MIDI file .mid minimal
inline uint16_t readBE16 (const std::string& b, size_t p)
{
    return p + 1 < b.size() ? (uint16_t) (((uint8_t) b[p] << 8) | (uint8_t) b[p + 1]) : 0;
}
inline uint32_t readBE32 (const std::string& b, size_t p)
{
    return p + 3 < b.size() ? (((uint32_t) (uint8_t) b[p]) << 24) | (((uint32_t) (uint8_t) b[p + 1]) << 16)
                               | (((uint32_t) (uint8_t) b[p + 2]) << 8) | ((uint32_t) (uint8_t) b[p + 3]) : 0;
}
inline void appendBE16 (std::string& b, uint16_t v)
{
    b += static_cast<char> ((v >> 8) & 0xff);
    b += static_cast<char> (v & 0xff);
}
inline void appendBE32 (std::string& b, uint32_t v)
{
    b += static_cast<char> ((v >> 24) & 0xff);
    b += static_cast<char> ((v >> 16) & 0xff);
    b += static_cast<char> ((v >> 8) & 0xff);
    b += static_cast<char> (v & 0xff);
}
inline uint32_t readVarLen (const std::string& b, size_t& p, size_t end, bool& ok)
{
    uint32_t v = 0;
    for (int i = 0; i < 4 && p < end; ++i)
    {
        const uint8_t c = static_cast<uint8_t> (b[p++]);
        v = (v << 7) | (c & 0x7f);
        if ((c & 0x80) == 0) return v;
    }
    ok = false;
    return v;
}
inline void appendVarLen (std::string& b, uint32_t v)
{
    std::vector<uint8_t> bytes;
    bytes.push_back (static_cast<uint8_t> (v & 0x7f));
    v >>= 7;
    while (v > 0)
    {
        bytes.push_back (static_cast<uint8_t> ((v & 0x7f) | 0x80));
        v >>= 7;
    }
    for (auto it = bytes.rbegin(); it != bytes.rend(); ++it) b += static_cast<char> (*it);
}
struct SmfResult
{
    std::vector<MidiNote> notes;
    uint16_t ticksPerQuarter = 480;
    std::string error;
};
inline SmfResult parseSmf (const std::string& b)
{
    SmfResult out;
    if (b.size() < 14 || b.compare (0, 4, "MThd") != 0) { out.error = "En-tête MThd absent"; return out; }
    const uint32_t headerLen = readBE32 (b, 4);
    const uint16_t format = readBE16 (b, 8);
    const uint16_t tracks = readBE16 (b, 10);
    const uint16_t division = readBE16 (b, 12);
    if (headerLen != 6 || (size_t) 8 + headerLen > b.size() || tracks == 0 || division == 0)
    { out.error = "En-tête SMF invalide ou tronqué"; return out; }
    if (format > 1) { out.error = "Format SMF 2 non pris en charge"; return out; }
    if ((division & 0x8000) != 0) { out.error = "Division SMPTE non prise en charge"; return out; }
    out.ticksPerQuarter = division;
    const double ticksPerBar = 4.0 * (double) out.ticksPerQuarter;
    size_t p = (size_t) 8 + headerLen;
    struct Active { uint32_t tick; int velocity; };
    for (uint16_t tr = 0; tr < tracks; ++tr)
    {
        if (p + 8 > b.size() || b.compare (p, 4, "MTrk") != 0)
        { out.error = "Piste MTrk absente ou tronquée"; out.notes.clear(); return out; }
        const uint32_t len = readBE32 (b, p + 4);
        const size_t start = p + 8;
        if (start > b.size() || (size_t) len > b.size() - start)
        { out.error = "Longueur MTrk supérieure aux données"; out.notes.clear(); return out; }
        const size_t end = start + (size_t) len;
        p = end;
        size_t q = start;
        uint32_t tick = 0;
        int runningStatus = -1;
        std::map<std::pair<int, int>, Active> active;
        bool ok = true;
        while (q < end && ok)
        {
            tick += readVarLen (b, q, end, ok);
            if (! ok || q >= end) { ok = false; break; }
            int status = static_cast<uint8_t> (b[q]);
            if (status < 0x80)
            {
                if (runningStatus < 0) { ok = false; break; }
                status = runningStatus;
            }
            else { ++q; runningStatus = status < 0xf0 ? status : -1; }
            if (status == 0xff)
            {
                if (q >= end) { ok = false; break; }
                const int type = static_cast<uint8_t> (b[q++]);
                const uint32_t l = readVarLen (b, q, end, ok);
                if (! ok || (size_t) l > end - q) { ok = false; break; }
                q += (size_t) l;
                if (type == 0x2f) break;
                continue;
            }
            if (status == 0xf0 || status == 0xf7)
            {
                const uint32_t l = readVarLen (b, q, end, ok);
                if (! ok || (size_t) l > end - q) { ok = false; break; }
                q += (size_t) l;
                continue;
            }
            const int hi = status & 0xf0;
            const int dataBytes = (hi == 0xc0 || hi == 0xd0) ? 1 : 2;
            if (q + (size_t) dataBytes > end) { ok = false; break; }
            const int d1 = static_cast<uint8_t> (b[q]);
            const int d2 = dataBytes > 1 ? static_cast<uint8_t> (b[q + 1]) : 0;
            q += (size_t) dataBytes;
            if (hi == 0x90 && d2 > 0)
            {
                active[{ status & 0x0f, d1 }] = { tick, d2 };
            }
            else if (hi == 0x80 || (hi == 0x90 && d2 == 0))
            {
                const auto key = std::make_pair (status & 0x0f, d1);
                const auto it = active.find (key);
                if (it != active.end())
                {
                    MidiNote n;
                    n.startBars = 1.0 + (double) it->second.tick / ticksPerBar;
                    n.lenBars = std::max (0.001, (double) (tick - it->second.tick) / ticksPerBar);
                    n.pitch = d1; n.velocity = it->second.velocity; n.on = true;
                    out.notes.push_back (n);
                    active.erase (it);
                }
            }
        }
        if (! ok)
        {
            out.error = "Événement MIDI incomplet ou longueur excessive";
            out.notes.clear();
            return out;
        }
        for (const auto& kv : active)
        {
            MidiNote n;
            n.startBars = 1.0 + (double) kv.second.tick / ticksPerBar;
            n.lenBars = 0.25; n.pitch = kv.first.second; n.velocity = kv.second.velocity; n.on = true;
            out.notes.push_back (n);
        }
    }
    std::sort (out.notes.begin(), out.notes.end(), [] (const MidiNote& a, const MidiNote& b2) { return a.startBars < b2.startBars; });
    return out;
}
inline std::string makeSmf (const std::vector<MidiNote>& notes, uint16_t ticksPerQuarter = 480)
{
    struct Ev { uint32_t tick; uint8_t priority, status, d1, d2; };
    std::vector<Ev> events;
    const double tpb = 4.0 * ticksPerQuarter;
    for (const auto& n : notes)
    {
        const uint32_t a = (uint32_t) std::llround ((n.startBars - 1.0) * tpb);
        const uint32_t b = (uint32_t) std::llround (std::max (0.001, n.lenBars) * tpb);
        events.push_back ({ a, 1, 0x90, (uint8_t) n.pitch, (uint8_t) n.velocity });
        events.push_back ({ a + b, 0, 0x80, (uint8_t) n.pitch, 0 });
    }
    // À tick égal, Note Off est toujours écrit avant Note On : une réarticulation
    // immédiate ne peut pas laisser une note bloquée ni dépendre de std::sort.
    std::sort (events.begin(), events.end(), [] (const Ev& a, const Ev& b)
    {
        if (a.tick != b.tick) return a.tick < b.tick;
        if (a.priority != b.priority) return a.priority < b.priority;
        if (a.status != b.status) return a.status < b.status;
        return a.d1 < b.d1;
    });
    std::string track;
    uint32_t last = 0;
    for (const auto& e : events)
    {
        appendVarLen (track, e.tick - last);
        last = e.tick;
        track += static_cast<char> (e.status);
        track += static_cast<char> (e.d1);
        track += static_cast<char> (e.d2);
    }
    appendVarLen (track, 0);
    track += static_cast<char> (0xff); track += static_cast<char> (0x2f); track += static_cast<char> (0);
    std::string out = "MThd";
    appendBE32 (out, 6); appendBE16 (out, 0); appendBE16 (out, 1); appendBE16 (out, ticksPerQuarter);
    out += "MTrk"; appendBE32 (out, (uint32_t) track.size()); out += track;
    return out;
}

} // namespace alpha
