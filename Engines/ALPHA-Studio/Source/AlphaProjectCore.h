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
// Départ auxiliaire réel : chaque piste peut envoyer vers n'importe quel bus,
// en pré- ou post-fader, avec un niveau en dB et un état activé/coupé.
struct SendState
{
    int bus = 0;
    double db = -60.0;
    bool preFader = false;
    bool enabled = true;
};
// Insert réel : référence un greffon analysé sur le disque (VST3/VST/LV2/AU),
// conserve son état binaire et les valeurs réelles de ses paramètres.
struct InsertState
{
    std::string uid;                 // identifiant unique du greffon (format + UID)
    std::string name = "Insert";     // nom réel renvoyé par le greffon
    std::string format = "VST3";
    std::string file;                // chemin réel du module analysé
    std::string manufacturer;
    std::string category;
    bool bypassed = false;           // bypass réel appliqué au nœud du graphe
    bool enabled = true;
    std::string stateBase64;         // état binaire réel (getStateInformation)
    std::vector<double> params;      // valeurs réelles des paramètres
    std::vector<std::string> paramNames;
    int latencySamples = 0;          // compensation de latence réelle du greffon
};
// Quick Control réel : chaque emplacement pointe vers un paramètre du moteur.
struct QuickControl
{
    std::string target = "track";    // track | bus | eq | dynamics | insert | send
    std::string param = "volumeDb";
    std::string label = "Volume";
    int index = 0;                   // indice de bus / insert / bande
    double value = 0.0;
    bool assigned = false;
};
struct TempoEvent { double bars = 1.0, bpm = 120.0; };
struct SignatureEvent { double bars = 1.0; int numerator = 4, denominator = 4; };
struct WorkspaceState
{
    std::string name = "Espace 1";
    bool locked = false;
    double barW = 64.0, scrollLeft = 0.0, scrollTop = 0.0, positionBars = 1.0;
    std::vector<std::string> windows;       // fenêtres réellement ouvertes
    std::vector<std::string> toolbarItems;  // éléments réellement affichés
    std::string panelState;                 // panneaux visibles sérialisés
    int selectedTrack = 0;
};
struct ProjectInfo
{
    std::string author, copyright, notes, originator, reference;
    std::string sampleRate = "48000", bitDepth = "24", startTimecode = "00:00:00:00";
};
struct RecentProject { std::string name, path, openedUtc; };
struct KeyCommand { std::string combo, action; };
// Règle d'éditeur logique MIDI réellement appliquée aux notes du projet.
struct LogicalRule
{
    std::string name = "Règle 1";
    bool enabled = true;
    int pitchMin = 0, pitchMax = 127, velocityMin = 1, velocityMax = 127;
    double lengthMinBars = 0.0, lengthMaxBars = 100000.0;
    bool onlySelectedTrack = true;
    std::string typeFilter = "note";                 // note | all
    std::string action = "setVelocity";              // setVelocity | scaleVelocity | transpose | setLength | scaleLength | quantize | deleteNotes | invertVelocity
    double actionValue = 100.0;
    std::string grid = "1/16";
};
// Preset de modificateurs MIDI réellement appliqué (transformation non destructive).
struct MidiModifier
{
    std::string name = "Modificateur 1";
    double transposeSemitones = 0.0;
    double velocityOffset = 0.0, velocityScale = 1.0;
    double lengthScale = 1.0;
    double delayBars = 0.0;
    bool invert = false;
};
struct UiLayout
{
    std::string rulerFormat = "bars", snapMode = "grid", nudgeMode = "tick", editMode = "normal", timebase = "musical";
    bool showToolbar = true, showInspector = true, showOverview = true, showInfoline = true, showMarkerTrack = true;
    double trackHeight = 62.0;
    std::vector<std::string> toolbarItems;
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
    // ---- modèle étendu : type de canal, routage, inserts, départs, contrôles
    std::string channelType = "audio";            // audio | instrument | midi | group | fx
    std::string inputDevice = "Entrées stéréo", outputDevice = "Bus A";
    int inputChannel = 0, outputChannel = 0, midiChannel = 1;
    double height = 62.0;
    bool visible = true, frozen = false, locked = false;
    int transposeSemitones = 0;
    long long delaySamples = 0;
    std::vector<SendState> sends;
    std::vector<InsertState> inserts;
    std::array<QuickControl, 8> quickControls;

    // Le type de canal est la source de vérité ; le drapeau historique
    // « instrument » reste synchronisé pour la compatibilité ascendante.
    // Recevoir des notes MIDI promeut réellement une piste audio en piste
    // d'instrument, comme le faisait le moteur avant l'extension du modèle.
    void syncChannelFlags()
    {
        static const char* valid[] = { "audio", "instrument", "midi", "group", "fx" };
        if (std::find (std::begin (valid), std::end (valid), channelType) == std::end (valid))
            channelType = instrument ? "instrument" : "audio";
        else if (instrument && channelType == "audio")
            channelType = "instrument";
        else if (! instrument && ! midiNotes.empty() && channelType == "audio")
            channelType = "instrument";
        instrument = (channelType == "instrument");
    }
};
struct BusState
{
    std::string name = "Bus";
    double volumeDb = 0.0, pan = 0.0;
    bool mute = false;
    // ---- modèle étendu : bus réels avec routage de sortie et inserts
    std::string channelType = "group";
    std::string outputDevice = "Sortie principale";
    int outputChannel = 0;
    bool solo = false;
    std::vector<SendState> sends;
    std::vector<InsertState> inserts;
};
struct SnapshotState
{
    std::string name = "Instantané";
    double masterDb = 0.0;
    std::vector<TrackState> tracks;
    std::vector<BusState> buses;
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
    // ---- monitoring réel : talkback, listen, casque et niveaux par sortie
    bool talkback = false, listen = false, dimActive = false;
    double dimDb = -20.0, phonesDb = -12.0, monADb = -2.0, monBDb = -6.0;
    std::string activeMonitor = "A";     // A | B | C | PH
    bool exclusiveMonitor = true;
};
struct ProjectState
{
    int schema = 3;
    std::string format = "ALPHAPROJ";
    std::string name = "Projet sans titre", createdUtc = utcNow(), modifiedUtc = utcNow();
    std::string path;                              // chemin réel du projet ouvert
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

    // ---- modèle étendu réel : carte de tempo, mesures, espaces, instantanés,
    //      projets récents, raccourcis, éditeur logique, modificateurs MIDI,
    //      dossiers de greffons, informations projet et disposition d'interface.
    std::vector<TempoEvent> tempoEvents;
    std::vector<SignatureEvent> signatures;
    std::vector<WorkspaceState> workspaces;
    std::vector<SnapshotState> snapshots;
    std::vector<RecentProject> recents;
    std::vector<KeyCommand> keyCommands;
    std::vector<LogicalRule> logicalRules;
    std::vector<MidiModifier> midiModifiers;
    std::vector<std::string> pluginFolders;
    ProjectInfo info;
    UiLayout layout;
    double positionBars = 1.0;
    int selectedTrack = 0;
    bool closed = false;                           // vrai après « Fermer le projet »
    // Résultats réels des derniers traitements, exposés à l'interface :
    std::string recalledWorkspace;                 // dernier espace de travail rappelé
    int lastLogicalTouched = 0;                    // notes réellement modifiées
    int lastRemovedEmpty = 0;                      // pistes vides réellement retirées
    std::string lastImportSummary;                 // rapport réel du dernier import
    std::string lastExportPath;                    // fichier réellement écrit
    double lastDetectedBpm = 0.0;                  // tempo réellement détecté

    ProjectState()
    {
        buses = defaultBuses();
        markers = { { 1.0, 1.0, "Intro", false }, { 9.0, 9.0, "Couplet 1", false },
                    { 17.0, 17.0, "Refrain 1", false }, { 25.0, 25.0, "Couplet 2", false },
                    { 33.0, 33.0, "Refrain 2", false }, { 41.0, 41.0, "Pont", false },
                    { 49.0, 49.0, "Final", false }, { 57.0, 57.0, "Fin", false } };
        templates = { "Vide", "Démo 4 pistes", "Podcast", "Mixage" };
        tempoEvents = { { 1.0, 120.0 } };
        signatures = { { 1.0, 4, 4 } };
        workspaces = { { "Mixage", false, 64.0, 0.0, 0.0, 1.0, {}, {}, "", 0 },
                       { "Édition", false, 96.0, 0.0, 0.0, 1.0, {}, {}, "", 0 },
                       { "Arrangement", false, 48.0, 0.0, 0.0, 1.0, {}, {}, "", 0 },
                       { "Pistes", false, 64.0, 0.0, 0.0, 1.0, {}, {}, "", 0 } };
        logicalRules = { LogicalRule() };
        midiModifiers = { MidiModifier() };
        keyCommands = defaultKeyCommands();
        layout.toolbarItems = { "play", "stop", "record", "rtz", "cycle", "click", "tempo", "position", "zoom" };
    }

    static std::vector<BusState> defaultBuses()
    {
        std::vector<BusState> out;
        const char* names[4] = { "Bus A", "Bus B", "Bus C", "Bus D" };
        for (int i = 0; i < 4; ++i)
        {
            BusState b;
            b.name = names[i];
            b.channelType = "group";
            b.outputDevice = "Sortie principale";
            b.outputChannel = i * 2;
            out.push_back (b);
        }
        return out;
    }

    static std::vector<KeyCommand> defaultKeyCommands()
    {
        return { { "Space", "play" }, { "Enter", "stop" }, { "Ctrl+R", "record" },
                 { "Home", "rtz" }, { "End", "end" }, { "Ctrl+Z", "undo" },
                 { "Ctrl+Shift+Z", "redo" }, { "Ctrl+S", "saveProject" },
                 { "Ctrl+N", "newProject" }, { "Ctrl+O", "openProject" },
                 { "Ctrl+M", "muteSelected" }, { "F3", "mixer" }, { "F6", "automation" },
                 { "Alt+B", "mediabay" }, { "Ctrl+E", "splitAtCursor" },
                 { "Delete", "deleteSelected" }, { "Ctrl+D", "duplicateSelected" } };
    }

    double bpmAt (double bars) const
    {
        double bpmHere = bpm;
        for (const auto& e : tempoEvents) if (bars >= e.bars) bpmHere = e.bpm;
        return clampValue (bpmHere, 20.0, 300.0);
    }
    SignatureEvent signatureAt (double bars) const
    {
        SignatureEvent here { 1.0, 4, 4 };
        for (const auto& e : signatures) if (bars >= e.bars) here = e;
        if (here.denominator <= 0) here.denominator = 4;
        return here;
    }
    // Conversion réelle mesure → secondes en intégrant la carte de tempo.
    double secondsAtBars (double bars) const
    {
        if (tempoEvents.empty()) return (bars - 1.0) * 4.0 * 60.0 / bpm;
        std::vector<TempoEvent> sorted = tempoEvents;
        std::sort (sorted.begin(), sorted.end(), [] (const TempoEvent& a, const TempoEvent& b) { return a.bars < b.bars; });
        double seconds = 0.0, cursor = sorted.front().bars, currentBpm = sorted.front().bpm;
        for (size_t i = 1; i < sorted.size(); ++i)
        {
            const double next = sorted[i].bars;
            if (next >= bars) break;
            seconds += (std::min (bars, next) - cursor) * 4.0 * 60.0 / clampValue (currentBpm, 20.0, 300.0);
            cursor = std::max (cursor, next);
            currentBpm = sorted[i].bpm;
        }
        seconds += (bars - cursor) * 4.0 * 60.0 / clampValue (currentBpm, 20.0, 300.0);
        return std::max (0.0, seconds);
    }
    double barsAtSeconds (double seconds) const
    {
        if (tempoEvents.empty()) return 1.0 + seconds * bpm / (4.0 * 60.0);
        std::vector<TempoEvent> sorted = tempoEvents;
        std::sort (sorted.begin(), sorted.end(), [] (const TempoEvent& a, const TempoEvent& b) { return a.bars < b.bars; });
        double remaining = seconds, cursor = sorted.front().bars, currentBpm = sorted.front().bpm;
        for (size_t i = 1; i < sorted.size(); ++i)
        {
            const double span = sorted[i].bars - cursor;
            const double spanSeconds = span * 4.0 * 60.0 / clampValue (currentBpm, 20.0, 300.0);
            if (remaining <= spanSeconds) return cursor + remaining * clampValue (currentBpm, 20.0, 300.0) / (4.0 * 60.0);
            remaining -= spanSeconds;
            cursor = sorted[i].bars;
            currentBpm = sorted[i].bpm;
        }
        return cursor + remaining * clampValue (currentBpm, 20.0, 300.0) / (4.0 * 60.0);
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
        for (auto& t : tracks)
        {
            t.syncChannelFlags();
            for (auto& s : t.sends)
            {
                s.bus = static_cast<int> (clampValue (static_cast<double> (s.bus), 0.0, std::max (0.0, static_cast<double> (buses.size()) - 1.0)));
                s.db = clampValue (s.db, -60.0, 12.0);
            }
            for (auto& q : t.quickControls) q.index = std::max (0, q.index);
        }
        for (auto& b : buses)
            for (auto& s : b.sends)
                s.db = clampValue (s.db, -60.0, 12.0);
        for (const auto& t : tracks)
            for (const auto& c : t.clips)
                if (! c.media.empty() && std::find (media.begin(), media.end(), c.media) == media.end())
                    media.push_back (c.media);
        std::sort (tempoEvents.begin(), tempoEvents.end(), [] (const TempoEvent& a, const TempoEvent& b) { return a.bars < b.bars; });
        std::sort (signatures.begin(), signatures.end(), [] (const SignatureEvent& a, const SignatureEvent& b) { return a.bars < b.bars; });
        std::sort (markers.begin(), markers.end(), [] (const MarkerState& a, const MarkerState& b) { return a.bars < b.bars; });
        if (tempoEvents.empty()) tempoEvents = { { 1.0, bpm } };
        if (signatures.empty()) signatures = { { 1.0, 4, 4 } };
        selectedTrack = static_cast<int> (clampValue (static_cast<double> (selectedTrack), 0.0,
                                                      std::max (0.0, static_cast<double> (tracks.size()) - 1.0)));
        positionBars = clampValue (positionBars, 1.0, 1000000.0);
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
inline JsonValue sendsToJson (const std::vector<SendState>& sends)
{
    JsonValue a (JsonValue::Type::Array);
    for (const auto& s : sends)
    {
        JsonValue e (JsonValue::Type::Object);
        e["bus"] = JsonValue (s.bus);
        e["db"] = JsonValue (s.db);
        e["preFader"] = JsonValue (s.preFader);
        e["enabled"] = JsonValue (s.enabled);
        a.array.push_back (e);
    }
    return a;
}
inline std::vector<SendState> sendsFromJson (const JsonValue& j)
{
    std::vector<SendState> out;
    const auto& a = j.isArray() ? j : JsonValue();
    for (const auto& e : a.array)
    {
        SendState s;
        s.bus = std::max (0, jInt (e, "bus", 0));
        s.db = clampValue (jNumber (e, "db", -60.0), -60.0, 12.0);
        s.preFader = jBool (e, "preFader", false);
        s.enabled = jBool (e, "enabled", true);
        out.push_back (s);
    }
    return out;
}
inline JsonValue insertsToJson (const std::vector<InsertState>& inserts)
{
    JsonValue a (JsonValue::Type::Array);
    for (const auto& i : inserts)
    {
        JsonValue e (JsonValue::Type::Object);
        e["uid"] = JsonValue (i.uid);
        e["name"] = JsonValue (i.name);
        e["format"] = JsonValue (i.format);
        e["file"] = JsonValue (i.file);
        e["manufacturer"] = JsonValue (i.manufacturer);
        e["category"] = JsonValue (i.category);
        e["bypassed"] = JsonValue (i.bypassed);
        e["enabled"] = JsonValue (i.enabled);
        e["stateBase64"] = JsonValue (i.stateBase64);
        e["latencySamples"] = JsonValue (i.latencySamples);
        JsonValue p (JsonValue::Type::Array);
        for (double v : i.params) p.array.push_back (JsonValue (v));
        e["params"] = p;
        JsonValue n (JsonValue::Type::Array);
        for (const auto& s : i.paramNames) n.array.push_back (JsonValue (s));
        e["paramNames"] = n;
        a.array.push_back (e);
    }
    return a;
}
inline std::vector<InsertState> insertsFromJson (const JsonValue& j)
{
    std::vector<InsertState> out;
    for (const auto& e : j.array)
    {
        InsertState i;
        i.uid = jString (e, "uid");
        i.name = jString (e, "name", "Insert");
        i.format = jString (e, "format", "VST3");
        i.file = jString (e, "file");
        i.manufacturer = jString (e, "manufacturer");
        i.category = jString (e, "category");
        i.bypassed = jBool (e, "bypassed", false);
        i.enabled = jBool (e, "enabled", true);
        i.stateBase64 = jString (e, "stateBase64");
        i.latencySamples = jInt (e, "latencySamples", 0);
        for (const auto& v : e.get ("params").array) i.params.push_back (v.number);
        for (const auto& v : e.get ("paramNames").array) i.paramNames.push_back (v.string);
        out.push_back (i);
    }
    return out;
}
inline JsonValue quickControlsToJson (const std::array<QuickControl, 8>& q)
{
    JsonValue a (JsonValue::Type::Array);
    for (const auto& c : q)
    {
        JsonValue e (JsonValue::Type::Object);
        e["target"] = JsonValue (c.target);
        e["param"] = JsonValue (c.param);
        e["label"] = JsonValue (c.label);
        e["index"] = JsonValue (c.index);
        e["value"] = JsonValue (c.value);
        e["assigned"] = JsonValue (c.assigned);
        a.array.push_back (e);
    }
    return a;
}
inline void quickControlsFromJson (const JsonValue& j, std::array<QuickControl, 8>& q)
{
    size_t i = 0;
    for (const auto& e : j.array)
    {
        if (i >= q.size()) break;
        q[i].target = jString (e, "target", q[i].target);
        q[i].param = jString (e, "param", q[i].param);
        q[i].label = jString (e, "label", q[i].label);
        q[i].index = jInt (e, "index", q[i].index);
        q[i].value = jNumber (e, "value", q[i].value);
        q[i].assigned = jBool (e, "assigned", q[i].assigned);
        ++i;
    }
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
        e["channelType"] = JsonValue (t.channelType);
        e["inputDevice"] = JsonValue (t.inputDevice);
        e["outputDevice"] = JsonValue (t.outputDevice);
        e["inputChannel"] = JsonValue (t.inputChannel);
        e["outputChannel"] = JsonValue (t.outputChannel);
        e["midiChannel"] = JsonValue (t.midiChannel);
        e["height"] = JsonValue (t.height);
        e["visible"] = JsonValue (t.visible);
        e["frozen"] = JsonValue (t.frozen);
        e["locked"] = JsonValue (t.locked);
        e["transposeSemitones"] = JsonValue (t.transposeSemitones);
        e["delaySamples"] = JsonValue (t.delaySamples);
        e["sends"] = sendsToJson (t.sends);
        e["inserts"] = insertsToJson (t.inserts);
        e["quickControls"] = quickControlsToJson (t.quickControls);
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
        e["channelType"] = JsonValue (b.channelType);
        e["outputDevice"] = JsonValue (b.outputDevice);
        e["outputChannel"] = JsonValue (b.outputChannel);
        e["solo"] = JsonValue (b.solo);
        e["sends"] = sendsToJson (b.sends);
        e["inserts"] = insertsToJson (b.inserts);
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
    cr["talkback"] = JsonValue (s.controlRoom.talkback);
    cr["listen"] = JsonValue (s.controlRoom.listen);
    cr["dimDb"] = JsonValue (s.controlRoom.dimDb);
    cr["phonesDb"] = JsonValue (s.controlRoom.phonesDb);
    cr["monADb"] = JsonValue (s.controlRoom.monADb);
    cr["monBDb"] = JsonValue (s.controlRoom.monBDb);
    cr["activeMonitor"] = JsonValue (s.controlRoom.activeMonitor);
    cr["exclusiveMonitor"] = JsonValue (s.controlRoom.exclusiveMonitor);
    j["controlRoom"] = cr;

    // ---- modèle étendu réel
    j["path"] = JsonValue (s.path);
    j["positionBars"] = JsonValue (s.positionBars);
    j["selectedTrack"] = JsonValue (s.selectedTrack);
    j["closed"] = JsonValue (s.closed);

    JsonValue tempo (JsonValue::Type::Array);
    for (const auto& e : s.tempoEvents)
    {
        JsonValue v (JsonValue::Type::Object);
        v["bars"] = JsonValue (e.bars);
        v["bpm"] = JsonValue (e.bpm);
        tempo.array.push_back (v);
    }
    j["tempoEvents"] = tempo;

    JsonValue sigs (JsonValue::Type::Array);
    for (const auto& e : s.signatures)
    {
        JsonValue v (JsonValue::Type::Object);
        v["bars"] = JsonValue (e.bars);
        v["numerator"] = JsonValue (e.numerator);
        v["denominator"] = JsonValue (e.denominator);
        sigs.array.push_back (v);
    }
    j["signatures"] = sigs;

    JsonValue ws (JsonValue::Type::Array);
    for (const auto& w : s.workspaces)
    {
        JsonValue v (JsonValue::Type::Object);
        v["name"] = JsonValue (w.name);
        v["locked"] = JsonValue (w.locked);
        v["barW"] = JsonValue (w.barW);
        v["scrollLeft"] = JsonValue (w.scrollLeft);
        v["scrollTop"] = JsonValue (w.scrollTop);
        v["positionBars"] = JsonValue (w.positionBars);
        v["selectedTrack"] = JsonValue (w.selectedTrack);
        v["panelState"] = JsonValue (w.panelState);
        JsonValue wins (JsonValue::Type::Array);
        for (const auto& n : w.windows) wins.array.push_back (JsonValue (n));
        v["windows"] = wins;
        JsonValue items (JsonValue::Type::Array);
        for (const auto& n : w.toolbarItems) items.array.push_back (JsonValue (n));
        v["toolbarItems"] = items;
        ws.array.push_back (v);
    }
    j["workspaces"] = ws;

    JsonValue snaps (JsonValue::Type::Array);
    for (const auto& sn : s.snapshots)
    {
        JsonValue v (JsonValue::Type::Object);
        v["name"] = JsonValue (sn.name);
        v["masterDb"] = JsonValue (sn.masterDb);
        JsonValue ts (JsonValue::Type::Array);
        for (const auto& t : sn.tracks)
        {
            JsonValue e (JsonValue::Type::Object);
            e["name"] = JsonValue (t.name);
            e["volumeDb"] = JsonValue (t.volumeDb);
            e["pan"] = JsonValue (t.pan);
            e["mute"] = JsonValue (t.mute);
            e["solo"] = JsonValue (t.solo);
            e["bus"] = JsonValue (t.bus);
            e["sendDb"] = JsonValue (t.sendDb);
            e["fx"] = fxToJson (t.fx);
            e["sends"] = sendsToJson (t.sends);
            ts.array.push_back (e);
        }
        v["tracks"] = ts;
        JsonValue bs (JsonValue::Type::Array);
        for (const auto& b : sn.buses)
        {
            JsonValue e (JsonValue::Type::Object);
            e["name"] = JsonValue (b.name);
            e["volumeDb"] = JsonValue (b.volumeDb);
            e["pan"] = JsonValue (b.pan);
            e["mute"] = JsonValue (b.mute);
            bs.array.push_back (e);
        }
        v["buses"] = bs;
        snaps.array.push_back (v);
    }
    j["snapshots"] = snaps;

    JsonValue rec (JsonValue::Type::Array);
    for (const auto& r : s.recents)
    {
        JsonValue v (JsonValue::Type::Object);
        v["name"] = JsonValue (r.name);
        v["path"] = JsonValue (r.path);
        v["openedUtc"] = JsonValue (r.openedUtc);
        rec.array.push_back (v);
    }
    j["recents"] = rec;

    JsonValue keys (JsonValue::Type::Array);
    for (const auto& k : s.keyCommands)
    {
        JsonValue v (JsonValue::Type::Object);
        v["combo"] = JsonValue (k.combo);
        v["action"] = JsonValue (k.action);
        keys.array.push_back (v);
    }
    j["keyCommands"] = keys;

    JsonValue rules (JsonValue::Type::Array);
    for (const auto& r : s.logicalRules)
    {
        JsonValue v (JsonValue::Type::Object);
        v["name"] = JsonValue (r.name);
        v["enabled"] = JsonValue (r.enabled);
        v["pitchMin"] = JsonValue (r.pitchMin);
        v["pitchMax"] = JsonValue (r.pitchMax);
        v["velocityMin"] = JsonValue (r.velocityMin);
        v["velocityMax"] = JsonValue (r.velocityMax);
        v["lengthMinBars"] = JsonValue (r.lengthMinBars);
        v["lengthMaxBars"] = JsonValue (r.lengthMaxBars);
        v["onlySelectedTrack"] = JsonValue (r.onlySelectedTrack);
        v["typeFilter"] = JsonValue (r.typeFilter);
        v["action"] = JsonValue (r.action);
        v["actionValue"] = JsonValue (r.actionValue);
        v["grid"] = JsonValue (r.grid);
        rules.array.push_back (v);
    }
    j["logicalRules"] = rules;

    JsonValue mods (JsonValue::Type::Array);
    for (const auto& m : s.midiModifiers)
    {
        JsonValue v (JsonValue::Type::Object);
        v["name"] = JsonValue (m.name);
        v["transposeSemitones"] = JsonValue (m.transposeSemitones);
        v["velocityOffset"] = JsonValue (m.velocityOffset);
        v["velocityScale"] = JsonValue (m.velocityScale);
        v["lengthScale"] = JsonValue (m.lengthScale);
        v["delayBars"] = JsonValue (m.delayBars);
        v["invert"] = JsonValue (m.invert);
        mods.array.push_back (v);
    }
    j["midiModifiers"] = mods;

    JsonValue folders (JsonValue::Type::Array);
    for (const auto& f : s.pluginFolders) folders.array.push_back (JsonValue (f));
    j["pluginFolders"] = folders;

    JsonValue pi (JsonValue::Type::Object);
    pi["author"] = JsonValue (s.info.author);
    pi["copyright"] = JsonValue (s.info.copyright);
    pi["notes"] = JsonValue (s.info.notes);
    pi["originator"] = JsonValue (s.info.originator);
    pi["reference"] = JsonValue (s.info.reference);
    pi["sampleRate"] = JsonValue (s.info.sampleRate);
    pi["bitDepth"] = JsonValue (s.info.bitDepth);
    pi["startTimecode"] = JsonValue (s.info.startTimecode);
    j["info"] = pi;

    JsonValue lo (JsonValue::Type::Object);
    lo["rulerFormat"] = JsonValue (s.layout.rulerFormat);
    lo["snapMode"] = JsonValue (s.layout.snapMode);
    lo["nudgeMode"] = JsonValue (s.layout.nudgeMode);
    lo["editMode"] = JsonValue (s.layout.editMode);
    lo["timebase"] = JsonValue (s.layout.timebase);
    lo["showToolbar"] = JsonValue (s.layout.showToolbar);
    lo["showInspector"] = JsonValue (s.layout.showInspector);
    lo["showOverview"] = JsonValue (s.layout.showOverview);
    lo["showInfoline"] = JsonValue (s.layout.showInfoline);
    lo["showMarkerTrack"] = JsonValue (s.layout.showMarkerTrack);
    lo["trackHeight"] = JsonValue (s.layout.trackHeight);
    JsonValue ti (JsonValue::Type::Array);
    for (const auto& n : s.layout.toolbarItems) ti.array.push_back (JsonValue (n));
    lo["toolbarItems"] = ti;
    j["layout"] = lo;

    return j;
}
inline ProjectState stateFromJson (const JsonValue& j)
{
    ProjectState s;
    s.schema = ProjectState().schema; // le chargeur migre tout projet vers le schéma courant
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
        t.channelType = jString (e, "channelType", t.instrument ? "instrument" : "audio");
        t.inputDevice = jString (e, "inputDevice", t.inputDevice);
        t.outputDevice = jString (e, "outputDevice", t.outputDevice);
        t.inputChannel = std::max (0, jInt (e, "inputChannel", 0));
        t.outputChannel = std::max (0, jInt (e, "outputChannel", 0));
        t.midiChannel = static_cast<int> (clampValue (static_cast<double> (jInt (e, "midiChannel", 1)), 1.0, 16.0));
        t.height = clampValue (jNumber (e, "height", 62.0), 24.0, 400.0);
        t.visible = jBool (e, "visible", true);
        t.frozen = jBool (e, "frozen", false);
        t.locked = jBool (e, "locked", false);
        t.transposeSemitones = static_cast<int> (clampValue (static_cast<double> (jInt (e, "transposeSemitones", 0)), -24.0, 24.0));
        t.delaySamples = static_cast<long long> (clampValue (jNumber (e, "delaySamples", 0.0), 0.0, 1000000.0));
        t.sends = sendsFromJson (e.get ("sends"));
        t.inserts = insertsFromJson (e.get ("inserts"));
        quickControlsFromJson (e.get ("quickControls"), t.quickControls);
        t.syncChannelFlags();
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
    {
        BusState b;
        b.name = jString (e, "name", "Bus");
        b.volumeDb = clampValue (jNumber (e, "volumeDb", 0.0), -60.0, 12.0);
        b.pan = clampValue (jNumber (e, "pan", 0.0), -1.0, 1.0);
        b.mute = jBool (e, "mute", false);
        b.channelType = jString (e, "channelType", "group");
        b.outputDevice = jString (e, "outputDevice", "Sortie principale");
        b.outputChannel = std::max (0, jInt (e, "outputChannel", 0));
        b.solo = jBool (e, "solo", false);
        b.sends = sendsFromJson (e.get ("sends"));
        b.inserts = insertsFromJson (e.get ("inserts"));
        s.buses.push_back (b);
    }
    if (s.buses.empty()) { s.buses = ProjectState::defaultBuses(); }
    else if (s.buses.size() < 4)
    {
        // Migration réelle : un projet ancien qui déclare moins de bus que
        // l'architecture courante voit ses bus manquants recréés, sinon les
        // pistes routées vers ces bus perdraient leur destination.
        const auto defaults = ProjectState::defaultBuses();
        for (size_t i = s.buses.size(); i < defaults.size(); ++i) s.buses.push_back (defaults[i]);
    }

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
    s.controlRoom.talkback = jBool (cr, "talkback", false);
    s.controlRoom.listen = jBool (cr, "listen", false);
    s.controlRoom.dimDb = clampValue (jNumber (cr, "dimDb", -20.0), -60.0, 0.0);
    s.controlRoom.phonesDb = clampValue (jNumber (cr, "phonesDb", -12.0), -60.0, 12.0);
    s.controlRoom.monADb = clampValue (jNumber (cr, "monADb", -2.0), -60.0, 12.0);
    s.controlRoom.monBDb = clampValue (jNumber (cr, "monBDb", -6.0), -60.0, 12.0);
    s.controlRoom.activeMonitor = jString (cr, "activeMonitor", "A");
    s.controlRoom.exclusiveMonitor = jBool (cr, "exclusiveMonitor", true);

    // ---- modèle étendu réel
    s.path = jString (j, "path", "");
    s.positionBars = clampValue (jNumber (j, "positionBars", 1.0), 1.0, 1000000.0);
    s.selectedTrack = std::max (0, jInt (j, "selectedTrack", 0));
    s.closed = jBool (j, "closed", false);

    s.tempoEvents.clear();
    for (const auto& e : j.get ("tempoEvents").array)
        s.tempoEvents.push_back ({ clampValue (jNumber (e, "bars", 1.0), 1.0, 100000.0),
                                   clampValue (jNumber (e, "bpm", 120.0), 20.0, 300.0) });
    if (s.tempoEvents.empty()) s.tempoEvents = { { 1.0, s.bpm } };

    s.signatures.clear();
    for (const auto& e : j.get ("signatures").array)
    {
        SignatureEvent v;
        v.bars = clampValue (jNumber (e, "bars", 1.0), 1.0, 100000.0);
        v.numerator = static_cast<int> (clampValue (static_cast<double> (jInt (e, "numerator", 4)), 1.0, 16.0));
        v.denominator = static_cast<int> (clampValue (static_cast<double> (jInt (e, "denominator", 4)), 1.0, 16.0));
        s.signatures.push_back (v);
    }
    if (s.signatures.empty()) s.signatures = { { 1.0, 4, 4 } };

    s.workspaces.clear();
    for (const auto& e : j.get ("workspaces").array)
    {
        WorkspaceState w;
        w.name = jString (e, "name", "Espace");
        w.locked = jBool (e, "locked", false);
        w.barW = clampValue (jNumber (e, "barW", 64.0), 4.0, 2000.0);
        w.scrollLeft = std::max (0.0, jNumber (e, "scrollLeft", 0.0));
        w.scrollTop = std::max (0.0, jNumber (e, "scrollTop", 0.0));
        w.positionBars = clampValue (jNumber (e, "positionBars", 1.0), 1.0, 1000000.0);
        w.selectedTrack = std::max (0, jInt (e, "selectedTrack", 0));
        w.panelState = jString (e, "panelState", "");
        for (const auto& n : e.get ("windows").array) if (n.type == JsonValue::Type::String) w.windows.push_back (n.string);
        for (const auto& n : e.get ("toolbarItems").array) if (n.type == JsonValue::Type::String) w.toolbarItems.push_back (n.string);
        s.workspaces.push_back (w);
    }
    if (s.workspaces.empty()) { ProjectState def; s.workspaces = def.workspaces; }

    s.snapshots.clear();
    for (const auto& e : j.get ("snapshots").array)
    {
        SnapshotState sn;
        sn.name = jString (e, "name", "Instantané");
        sn.masterDb = clampValue (jNumber (e, "masterDb", 0.0), -60.0, 12.0);
        for (const auto& t : e.get ("tracks").array)
        {
            TrackState ts;
            ts.name = jString (t, "name", "Audio");
            ts.volumeDb = clampValue (jNumber (t, "volumeDb", -6.0), -60.0, 12.0);
            ts.pan = clampValue (jNumber (t, "pan", 0.0), -1.0, 1.0);
            ts.mute = jBool (t, "mute", false);
            ts.solo = jBool (t, "solo", false);
            ts.bus = static_cast<int> (clampValue (static_cast<double> (jInt (t, "bus", 0)), 0.0, 3.0));
            ts.sendDb = clampValue (jNumber (t, "sendDb", 0.0), -60.0, 12.0);
            ts.fx = fxFromJson (t.get ("fx"));
            ts.sends = sendsFromJson (t.get ("sends"));
            sn.tracks.push_back (ts);
        }
        for (const auto& b : e.get ("buses").array)
        {
            BusState bs;
            bs.name = jString (b, "name", "Bus");
            bs.volumeDb = clampValue (jNumber (b, "volumeDb", 0.0), -60.0, 12.0);
            bs.pan = clampValue (jNumber (b, "pan", 0.0), -1.0, 1.0);
            bs.mute = jBool (b, "mute", false);
            sn.buses.push_back (bs);
        }
        s.snapshots.push_back (sn);
    }

    s.recents.clear();
    for (const auto& e : j.get ("recents").array)
        s.recents.push_back ({ jString (e, "name", "Projet"), jString (e, "path", ""), jString (e, "openedUtc", "") });

    s.keyCommands.clear();
    for (const auto& e : j.get ("keyCommands").array)
        s.keyCommands.push_back ({ jString (e, "combo", ""), jString (e, "action", "") });
    if (s.keyCommands.empty()) s.keyCommands = ProjectState::defaultKeyCommands();

    s.logicalRules.clear();
    for (const auto& e : j.get ("logicalRules").array)
    {
        LogicalRule r;
        r.name = jString (e, "name", r.name);
        r.enabled = jBool (e, "enabled", true);
        r.pitchMin = static_cast<int> (clampValue (static_cast<double> (jInt (e, "pitchMin", 0)), 0.0, 127.0));
        r.pitchMax = static_cast<int> (clampValue (static_cast<double> (jInt (e, "pitchMax", 127)), 0.0, 127.0));
        r.velocityMin = static_cast<int> (clampValue (static_cast<double> (jInt (e, "velocityMin", 1)), 1.0, 127.0));
        r.velocityMax = static_cast<int> (clampValue (static_cast<double> (jInt (e, "velocityMax", 127)), 1.0, 127.0));
        r.lengthMinBars = clampValue (jNumber (e, "lengthMinBars", 0.0), 0.0, 100000.0);
        r.lengthMaxBars = clampValue (jNumber (e, "lengthMaxBars", 100000.0), 0.0, 100000.0);
        r.onlySelectedTrack = jBool (e, "onlySelectedTrack", true);
        r.typeFilter = jString (e, "typeFilter", "note");
        r.action = jString (e, "action", "setVelocity");
        r.actionValue = jNumber (e, "actionValue", 0.0);
        r.grid = jString (e, "grid", "1/16");
        s.logicalRules.push_back (r);
    }
    if (s.logicalRules.empty()) s.logicalRules = { LogicalRule() };

    s.midiModifiers.clear();
    for (const auto& e : j.get ("midiModifiers").array)
    {
        MidiModifier m;
        m.name = jString (e, "name", m.name);
        m.transposeSemitones = clampValue (jNumber (e, "transposeSemitones", 0.0), -24.0, 24.0);
        m.velocityOffset = clampValue (jNumber (e, "velocityOffset", 0.0), -127.0, 127.0);
        m.velocityScale = clampValue (jNumber (e, "velocityScale", 1.0), 0.0, 4.0);
        m.lengthScale = clampValue (jNumber (e, "lengthScale", 1.0), 0.01, 8.0);
        m.delayBars = clampValue (jNumber (e, "delayBars", 0.0), -8.0, 8.0);
        m.invert = jBool (e, "invert", false);
        s.midiModifiers.push_back (m);
    }
    if (s.midiModifiers.empty()) s.midiModifiers = { MidiModifier() };

    s.pluginFolders.clear();
    for (const auto& e : j.get ("pluginFolders").array) if (e.type == JsonValue::Type::String) s.pluginFolders.push_back (e.string);

    const auto& pi = j.get ("info");
    s.info.author = jString (pi, "author", "");
    s.info.copyright = jString (pi, "copyright", "");
    s.info.notes = jString (pi, "notes", "");
    s.info.originator = jString (pi, "originator", "");
    s.info.reference = jString (pi, "reference", "");
    s.info.sampleRate = jString (pi, "sampleRate", "48000");
    s.info.bitDepth = jString (pi, "bitDepth", "24");
    s.info.startTimecode = jString (pi, "startTimecode", "00:00:00:00");

    const auto& lo = j.get ("layout");
    s.layout.rulerFormat = jString (lo, "rulerFormat", "bars");
    s.layout.snapMode = jString (lo, "snapMode", "grid");
    s.layout.nudgeMode = jString (lo, "nudgeMode", "tick");
    s.layout.editMode = jString (lo, "editMode", "normal");
    s.layout.timebase = jString (lo, "timebase", "musical");
    s.layout.showToolbar = jBool (lo, "showToolbar", true);
    s.layout.showInspector = jBool (lo, "showInspector", true);
    s.layout.showOverview = jBool (lo, "showOverview", true);
    s.layout.showInfoline = jBool (lo, "showInfoline", true);
    s.layout.showMarkerTrack = jBool (lo, "showMarkerTrack", true);
    s.layout.trackHeight = clampValue (jNumber (lo, "trackHeight", 62.0), 24.0, 400.0);
    s.layout.toolbarItems.clear();
    for (const auto& n : lo.get ("toolbarItems").array) if (n.type == JsonValue::Type::String) s.layout.toolbarItems.push_back (n.string);
    if (s.layout.toolbarItems.empty()) { ProjectState def; s.layout.toolbarItems = def.layout.toolbarItems; }

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
            { "setClipLength", "Longueur d'événement", setClipLength },
            { "removeMedia", "Supprimer un média", removeMedia },
            { "renameMedia", "Renommer un média", renameMedia },
            { "replaceState", "Édition de l'interface", replaceState },
            // ---- commandes réelles du modèle étendu (audit v6)
            { "setChannelType", "Type de canal", setChannelType },
            { "setTrackRouting", "Routage de piste", setTrackRouting },
            { "setTrackLayout", "Disposition de piste", setTrackLayout },
            { "setBusRouting", "Routage de bus", setBusRouting },
            { "addSend", "Ajouter un départ", addSend },
            { "setSend", "Réglage de départ", setSend },
            { "removeSend", "Supprimer un départ", removeSend },
            { "addInsert", "Ajouter un insert", addInsert },
            { "removeInsert", "Supprimer un insert", removeInsert },
            { "moveInsert", "Déplacer un insert", moveInsert },
            { "setInsertBypass", "Bypass d'insert", setInsertBypass },
            { "setInsertParameter", "Paramètre d'insert", setInsertParameter },
            { "setInsertState", "État d'insert", setInsertState },
            { "setQuickControl", "Quick Control", setQuickControl },
            { "applyQuickControl", "Appliquer un Quick Control", applyQuickControl },
            { "addMarker", "Ajouter un marqueur", addMarker },
            { "removeMarker", "Supprimer un marqueur", removeMarker },
            { "renameMarker", "Renommer un marqueur", renameMarker },
            { "addTempoEvent", "Événement de tempo", addTempoEvent },
            { "removeTempoEvent", "Supprimer un événement de tempo", removeTempoEvent },
            { "addSignature", "Changement de mesure", addSignature },
            { "removeSignature", "Supprimer une mesure", removeSignature },
            { "setProjectInfo", "Informations du projet", setProjectInfo },
            { "storeWorkspace", "Mémoriser un espace de travail", storeWorkspace },
            { "recallWorkspace", "Rappeler un espace de travail", recallWorkspace },
            { "deleteWorkspace", "Supprimer un espace de travail", deleteWorkspace },
            { "setWorkspaceLock", "Verrou d'espace de travail", setWorkspaceLock },
            { "storeSnapshot", "Mémoriser un instantané de mix", storeSnapshot },
            { "recallSnapshot", "Rappeler un instantané de mix", recallSnapshot },
            { "deleteSnapshot", "Supprimer un instantané de mix", deleteSnapshot },
            { "addRecent", "Projet récent", addRecent },
            { "clearRecents", "Vider les projets récents", clearRecents },
            { "setKeyCommand", "Raccourci clavier", setKeyCommand },
            { "resetKeyCommands", "Raccourcis par défaut", resetKeyCommands },
            { "storeLogicalRule", "Règle d'éditeur logique", storeLogicalRule },
            { "deleteLogicalRule", "Supprimer une règle logique", deleteLogicalRule },
            { "applyLogicalEdit", "Édition logique MIDI", applyLogicalEdit },
            { "storeMidiModifier", "Modificateur MIDI", storeMidiModifier },
            { "deleteMidiModifier", "Supprimer un modificateur MIDI", deleteMidiModifier },
            { "applyMidiModifier", "Appliquer un modificateur MIDI", applyMidiModifier },
            { "transposeMidi", "Transposition MIDI", transposeMidi },
            { "removeEmptyTracks", "Retirer les pistes vides", removeEmptyTracks },
            { "addPluginFolder", "Dossier de greffons", addPluginFolder },
            { "removePluginFolder", "Retirer un dossier de greffons", removePluginFolder },
            { "setUiLayout", "Disposition de l'interface", setUiLayout },
            { "setTransportState", "Position du curseur", setTransportState },
            { "setTrackColour", "Couleur de piste", setTrackColour },
            { "closeProject", "Fermer le projet", closeProject }
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
        // AUDIT v6 (A121bis) : identifiant unique garanti — après suppression,
        // la taille du vecteur peut réutiliser un indice déjà attribué.
        int maxN = -1;
        for (const auto& other : s.tracks)
        {
            const std::string oid = other.id;
            if (oid.rfind ("native_", 0) == 0)
                maxN = std::max (maxN, std::atoi (oid.c_str() + 7));
        }
        t.id = "native_" + std::to_string (maxN + 1);
        t.name = jString (p, "name", "Audio " + std::to_string (s.tracks.size() + 1));
        t.bus = jInt (p, "bus", 0);
        // AUDIT v6 (A96) : le type choisi dans l'interface est réellement
        // conservé par le modèle — plus de piste audio par défaut.
        t.channelType = jString (p, "channelType", "audio");
        t.midiChannel = jInt (p, "midiChannel", 1);
        t.syncChannelFlags();
        s.tracks.push_back (t);
        s.selectedTrack = static_cast<int> (s.tracks.size() - 1);
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
            return true; // bande EQ traitée — ne pas retomber sur la dynamique
        }
        const auto field = jString (p, "field");
        if (field == "thresholdDb") fx.dynamics.thresholdDb = clampValue (jNumber (p, "value", fx.dynamics.thresholdDb), -60.0, 0.0);
        else if (field == "ratio") fx.dynamics.ratio = clampValue (jNumber (p, "value", fx.dynamics.ratio), 1.0, 20.0);
        else if (field == "attackMs") fx.dynamics.attackMs = clampValue (jNumber (p, "value", fx.dynamics.attackMs), 0.1, 200.0);
        else if (field == "releaseMs") fx.dynamics.releaseMs = clampValue (jNumber (p, "value", fx.dynamics.releaseMs), 1.0, 2000.0);
        else if (field == "makeupDb") fx.dynamics.makeupDb = clampValue (jNumber (p, "value", fx.dynamics.makeupDb), -24.0, 24.0);
        else if (field == "dynamicsEnabled" || field == "compressor") fx.dynamics.enabled = jBool (p, "value", fx.dynamics.enabled);
        // AUDIT v6 (A131) : un champ de dynamique inconnu est refusé au lieu
        // d'être accepté silencieusement.
        else if (! field.empty()) { err = "Champ de dynamique inconnu"; return false; }
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
    // AUDIT v6 (A116/A32) : longueur réelle d'un événement après étirement.
    static bool setClipLength (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int ti = jInt (p, "trackIndex", jInt (p, "index", -1));
        const int ci = jInt (p, "clipIndex", jInt (p, "clip", -1));
        if (! clipValid (s, ti, ci, err)) return false;
        auto& c = s.tracks[static_cast<size_t> (ti)].clips[static_cast<size_t> (ci)];
        c.lenBars = clampValue (jNumber (p, "lenBars", c.lenBars), 0.001, 100000.0);
        return true;
    }
    // AUDIT v6 (A121) : suppression/renommage réels d'un média — les
    // événements qui le référencent suivent, historisés par mutate().
    static bool removeMedia (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto path = jString (p, "path");
        if (path.empty()) { err = "Chemin de média invalide"; return false; }
        for (auto& t : s.tracks)
            t.clips.erase (std::remove_if (t.clips.begin(), t.clips.end(),
                                           [&] (const AudioClip& c) { return c.media == path; }),
                           t.clips.end());
        s.media.erase (std::remove (s.media.begin(), s.media.end(), path), s.media.end());
        return true;
    }
    static bool renameMedia (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto path = jString (p, "path"), nn = jString (p, "newName");
        if (path.empty() || nn.empty()) { err = "Arguments de renommage invalides"; return false; }
        for (auto& t : s.tracks)
            for (auto& c : t.clips) if (c.media == path) c.media = nn;
        for (auto& m : s.media) if (m == path) m = nn;
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

    // ============================================================ helpers réels
    static double gridToBars (const std::string& grid)
    {
        if (grid == "1/1") return 4.0;
        if (grid == "1/2") return 2.0;
        if (grid == "1/2T") return 4.0 / 3.0;
        if (grid == "1/4") return 1.0;
        if (grid == "1/4T") return 2.0 / 3.0;
        if (grid == "1/8") return 0.5;
        if (grid == "1/8T") return 1.0 / 3.0;
        if (grid == "1/16") return 0.25;
        if (grid == "1/16T") return 1.0 / 6.0;
        if (grid == "1/32") return 0.125;
        if (grid == "1/64") return 0.0625;
        if (grid == "tick") return 1.0 / 960.0;
        return 0.25;
    }
    static bool trackValid (const ProjectState& s, int i, std::string& err) { return indexValid (s, i, err); }
    static int busIndexByName (const ProjectState& s, const std::string& name)
    {
        for (size_t i = 0; i < s.buses.size(); ++i) if (s.buses[i].name == name) return static_cast<int> (i);
        return -1;
    }
    static double readValueNumber (const JsonValue& p, const std::string& key, double fallback)
    {
        const auto& v = p.get (key);
        if (v.type == JsonValue::Type::Number) return v.number;
        if (v.type == JsonValue::Type::Bool) return v.boolean ? 1.0 : 0.0;
        if (v.type == JsonValue::Type::String)
        {
            std::string t = v.string;
            for (auto& c : t) if (c == ',') c = '.';
            try { return std::stod (t); } catch (...) { return fallback; }
        }
        return fallback;
    }

    // ============================================== type de canal et routage
    static bool setChannelType (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        const auto type = jString (p, "type", s.tracks[static_cast<size_t> (i)].channelType);
        static const char* valid[] = { "audio", "instrument", "midi", "group", "fx" };
        if (std::find (std::begin (valid), std::end (valid), type) == std::end (valid))
        { err = "Type de canal inconnu : " + type; return false; }
        auto& t = s.tracks[static_cast<size_t> (i)];
        t.channelType = type;
        t.syncChannelFlags();
        if (type == "group" || type == "fx") { t.arm = false; t.clips.clear(); }
        if (type == "midi") { t.clips.clear(); t.arm = false; }
        return true;
    }
    static bool setTrackRouting (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& t = s.tracks[static_cast<size_t> (i)];
        if (p.has ("inputDevice")) t.inputDevice = jString (p, "inputDevice", t.inputDevice);
        if (p.has ("outputDevice")) t.outputDevice = jString (p, "outputDevice", t.outputDevice);
        if (p.has ("inputChannel")) t.inputChannel = std::max (0, jInt (p, "inputChannel", t.inputChannel));
        if (p.has ("outputChannel")) t.outputChannel = std::max (0, jInt (p, "outputChannel", t.outputChannel));
        if (p.has ("midiChannel")) t.midiChannel = static_cast<int> (clampValue (static_cast<double> (jInt (p, "midiChannel", t.midiChannel)), 1.0, 16.0));
        if (p.has ("bus"))
        {
            const int b = static_cast<int> (clampValue (static_cast<double> (jInt (p, "bus", t.bus)), 0.0,
                                                        std::max (0.0, static_cast<double> (s.buses.size()) - 1.0)));
            t.bus = b;
            if (b < static_cast<int> (s.buses.size())) t.outputDevice = s.buses[static_cast<size_t> (b)].name;
        }
        if (p.has ("delaySamples")) t.delaySamples = static_cast<long long> (clampValue (jNumber (p, "delaySamples", static_cast<double> (t.delaySamples)), 0.0, 1000000.0));
        if (p.has ("transposeSemitones")) t.transposeSemitones = static_cast<int> (clampValue (static_cast<double> (jInt (p, "transposeSemitones", t.transposeSemitones)), -24.0, 24.0));
        return true;
    }
    static bool setTrackLayout (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& t = s.tracks[static_cast<size_t> (i)];
        if (p.has ("height")) t.height = clampValue (jNumber (p, "height", t.height), 24.0, 400.0);
        if (p.has ("visible")) t.visible = jBool (p, "visible", t.visible);
        if (p.has ("frozen")) t.frozen = jBool (p, "frozen", t.frozen);
        if (p.has ("locked")) t.locked = jBool (p, "locked", t.locked);
        if (p.has ("colour")) t.colour = jString (p, "colour", t.colour);
        return true;
    }
    static bool setTrackColour (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        const auto colour = jString (p, "colour", s.tracks[static_cast<size_t> (i)].colour);
        if (colour.size() < 4) { err = "Couleur invalide : " + colour; return false; }
        s.tracks[static_cast<size_t> (i)].colour = colour;
        return true;
    }
    static bool setBusRouting (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (i < 0 || i >= static_cast<int> (s.buses.size())) { err = "Indice de bus invalide"; return false; }
        auto& b = s.buses[static_cast<size_t> (i)];
        if (p.has ("outputDevice")) b.outputDevice = jString (p, "outputDevice", b.outputDevice);
        if (p.has ("outputChannel")) b.outputChannel = std::max (0, jInt (p, "outputChannel", b.outputChannel));
        if (p.has ("solo")) b.solo = jBool (p, "solo", b.solo);
        if (p.has ("channelType")) b.channelType = jString (p, "channelType", b.channelType);
        return true;
    }

    // ================================================== départs auxiliaires
    static bool addSend (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        const int bus = static_cast<int> (clampValue (static_cast<double> (jInt (p, "bus", 0)), 0.0,
                                                      std::max (0.0, static_cast<double> (s.buses.size()) - 1.0)));
        SendState send;
        send.bus = bus;
        send.db = clampValue (jNumber (p, "db", -6.0), -60.0, 12.0);
        send.preFader = jBool (p, "preFader", false);
        send.enabled = jBool (p, "enabled", true);
        s.tracks[static_cast<size_t> (i)].sends.push_back (send);
        return true;
    }
    static bool setSend (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& sends = s.tracks[static_cast<size_t> (i)].sends;
        const int k = jInt (p, "sendIndex", -1);
        if (k < 0 || k >= static_cast<int> (sends.size())) { err = "Indice de départ invalide"; return false; }
        auto& send = sends[static_cast<size_t> (k)];
        const auto field = jString (p, "field");
        if (field == "db") send.db = clampValue (readValueNumber (p, "value", send.db), -60.0, 12.0);
        else if (field == "bus") send.bus = static_cast<int> (clampValue (readValueNumber (p, "value", static_cast<double> (send.bus)), 0.0, std::max (0.0, static_cast<double> (s.buses.size()) - 1.0)));
        else if (field == "preFader") send.preFader = jBool (p, "value", send.preFader);
        else if (field == "enabled") send.enabled = jBool (p, "value", send.enabled);
        else if (field.empty())
        {
            if (p.has ("db")) send.db = clampValue (jNumber (p, "db", send.db), -60.0, 12.0);
            if (p.has ("bus")) send.bus = static_cast<int> (clampValue (static_cast<double> (jInt (p, "bus", send.bus)), 0.0, std::max (0.0, static_cast<double> (s.buses.size()) - 1.0)));
            if (p.has ("preFader")) send.preFader = jBool (p, "preFader", send.preFader);
            if (p.has ("enabled")) send.enabled = jBool (p, "enabled", send.enabled);
        }
        else { err = "Champ de départ inconnu : " + field; return false; }
        return true;
    }
    static bool removeSend (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& sends = s.tracks[static_cast<size_t> (i)].sends;
        const int k = jInt (p, "sendIndex", -1);
        if (k < 0 || k >= static_cast<int> (sends.size())) { err = "Indice de départ invalide"; return false; }
        sends.erase (sends.begin() + k);
        return true;
    }

    // ============================================ inserts / greffons réels
    static InsertState insertFromPayload (const JsonValue& p)
    {
        InsertState i;
        i.uid = jString (p, "uid");
        i.name = jString (p, "name", "Insert");
        i.format = jString (p, "format", "VST3");
        i.file = jString (p, "file");
        i.manufacturer = jString (p, "manufacturer");
        i.category = jString (p, "category");
        i.bypassed = jBool (p, "bypassed", false);
        i.enabled = jBool (p, "enabled", true);
        i.stateBase64 = jString (p, "stateBase64");
        i.latencySamples = std::max (0, jInt (p, "latencySamples", 0));
        for (const auto& v : p.get ("params").array) i.params.push_back (v.number);
        for (const auto& v : p.get ("paramNames").array) i.paramNames.push_back (v.string);
        return i;
    }
    static bool insertTarget (ProjectState& s, const JsonValue& p, std::vector<InsertState>& out, std::string& err)
    {
        const auto kind = jString (p, "kind", "track");
        if (kind == "bus")
        {
            const int b = jInt (p, "busIndex", -1);
            if (b < 0 || b >= static_cast<int> (s.buses.size())) { err = "Indice de bus invalide"; return false; }
            out = s.buses[static_cast<size_t> (b)].inserts;
            return true;
        }
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        out = s.tracks[static_cast<size_t> (i)].inserts;
        return true;
    }
    static void commitInserts (ProjectState& s, const JsonValue& p, const std::vector<InsertState>& inserts)
    {
        if (jString (p, "kind", "track") == "bus")
            s.buses[static_cast<size_t> (std::max (0, jInt (p, "busIndex", 0)))].inserts = inserts;
        else
            s.tracks[static_cast<size_t> (std::max (0, jInt (p, "index", 0)))].inserts = inserts;
    }
    static bool addInsert (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        auto i = insertFromPayload (p);
        if (i.uid.empty() && i.file.empty()) { err = "Greffon sans identifiant réel"; return false; }
        const int slot = static_cast<int> (clampValue (static_cast<double> (jInt (p, "slot", static_cast<int> (inserts.size()))), 0.0, static_cast<double> (inserts.size())));
        inserts.insert (inserts.begin() + slot, i);
        commitInserts (s, p, inserts);
        return true;
    }
    static bool removeInsert (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        const int k = jInt (p, "insertIndex", -1);
        if (k < 0 || k >= static_cast<int> (inserts.size())) { err = "Indice d'insert invalide"; return false; }
        inserts.erase (inserts.begin() + k);
        commitInserts (s, p, inserts);
        return true;
    }
    static bool moveInsert (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        const int from = jInt (p, "insertIndex", -1), to = jInt (p, "to", -1);
        if (from < 0 || from >= static_cast<int> (inserts.size()) || to < 0 || to >= static_cast<int> (inserts.size()))
        { err = "Déplacement d'insert invalide"; return false; }
        const InsertState moved = inserts[static_cast<size_t> (from)];
        inserts.erase (inserts.begin() + from);
        inserts.insert (inserts.begin() + to, moved);
        commitInserts (s, p, inserts);
        return true;
    }
    static bool setInsertBypass (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        const int k = jInt (p, "insertIndex", -1);
        if (k < 0 || k >= static_cast<int> (inserts.size())) { err = "Indice d'insert invalide"; return false; }
        inserts[static_cast<size_t> (k)].bypassed = jBool (p, "bypassed", ! inserts[static_cast<size_t> (k)].bypassed);
        commitInserts (s, p, inserts);
        return true;
    }
    static bool setInsertParameter (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        const int k = jInt (p, "insertIndex", -1);
        if (k < 0 || k >= static_cast<int> (inserts.size())) { err = "Indice d'insert invalide"; return false; }
        auto& ins = inserts[static_cast<size_t> (k)];
        const int param = jInt (p, "paramIndex", -1);
        if (param < 0) { err = "Indice de paramètre invalide"; return false; }
        const double value = clampValue (readValueNumber (p, "value", 0.0), 0.0, 1.0);
        if (param >= static_cast<int> (ins.params.size())) ins.params.resize (static_cast<size_t> (param) + 1, 0.0);
        ins.params[static_cast<size_t> (param)] = value;
        commitInserts (s, p, inserts);
        return true;
    }
    static bool setInsertState (ProjectState& s, const JsonValue& p, std::string& err)
    {
        std::vector<InsertState> inserts;
        if (! insertTarget (s, p, inserts, err)) return false;
        const int k = jInt (p, "insertIndex", -1);
        if (k < 0 || k >= static_cast<int> (inserts.size())) { err = "Indice d'insert invalide"; return false; }
        auto& ins = inserts[static_cast<size_t> (k)];
        ins.stateBase64 = jString (p, "stateBase64", ins.stateBase64);
        ins.latencySamples = std::max (0, jInt (p, "latencySamples", ins.latencySamples));
        if (p.has ("enabled")) ins.enabled = jBool (p, "enabled", ins.enabled);
        commitInserts (s, p, inserts);
        return true;
    }

    // ======================================================== Quick Controls
    static bool setQuickControl (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& controls = s.tracks[static_cast<size_t> (i)].quickControls;
        const int slot = jInt (p, "slot", -1);
        if (slot < 0 || slot >= static_cast<int> (controls.size())) { err = "Emplacement de Quick Control invalide"; return false; }
        auto& c = controls[static_cast<size_t> (slot)];
        c.target = jString (p, "target", c.target);
        c.param = jString (p, "param", c.param);
        c.label = jString (p, "label", c.label.empty() ? c.param : c.label);
        c.index = std::max (0, jInt (p, "controllerIndex", c.index));
        c.assigned = jBool (p, "assigned", true);
        return true;
    }
    static bool applyQuickControl (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "index", -1);
        if (! trackValid (s, i, err)) return false;
        auto& t = s.tracks[static_cast<size_t> (i)];
        const int slot = jInt (p, "slot", -1);
        if (slot < 0 || slot >= static_cast<int> (t.quickControls.size())) { err = "Emplacement de Quick Control invalide"; return false; }
        const auto& c = t.quickControls[static_cast<size_t> (slot)];
        if (! c.assigned) { err = "Quick Control non affecté"; return false; }
        const double value = readValueNumber (p, "value", c.value);
        JsonValue q (JsonValue::Type::Object);
        q["index"] = JsonValue (i);
        q["value"] = JsonValue (value);
        std::string ignored;
        if (c.target == "track") return setTrackField (s, c.param, i, value, ignored);
        if (c.target == "bus") { q["index"] = JsonValue (c.index); q["field"] = JsonValue (c.param); return setBus (s, q, ignored); }
        if (c.target == "eq")
        {
            q["band"] = JsonValue (c.index);
            q["field"] = JsonValue (c.param);
            return setFx (s, q, ignored);
        }
        if (c.target == "send") { q["sendIndex"] = JsonValue (c.index); q["field"] = JsonValue (c.param); return setSend (s, q, ignored); }
        if (c.target == "insert" || c.target == "plugin")
        {
            q["insertIndex"] = JsonValue (c.index);
            q["paramIndex"] = JsonValue (static_cast<int> (std::max (0.0, value)));
            q["value"] = JsonValue (c.value);
            return setInsertParameter (s, q, ignored);
        }
        err = "Cible de Quick Control inconnue : " + c.target;
        return false;
    }
    static bool setTrackField (ProjectState& s, const std::string& field, int i, double value, std::string& err)
    {
        if (! trackValid (s, i, err)) return false;
        auto& t = s.tracks[static_cast<size_t> (i)];
        if (field == "volumeDb") t.volumeDb = clampValue (value, -60.0, 12.0);
        else if (field == "pan") t.pan = clampValue (value, -1.0, 1.0);
        else if (field == "sendDb") t.sendDb = clampValue (value, -60.0, 12.0);
        else if (field == "mute") t.mute = value > 0.5;
        else if (field == "solo") t.solo = value > 0.5;
        else if (field == "arm") t.arm = value > 0.5;
        else if (field == "bus") t.bus = static_cast<int> (clampValue (value, 0.0, std::max (0.0, static_cast<double> (s.buses.size()) - 1.0)));
        else { err = "Paramètre de piste inconnu : " + field; return false; }
        return true;
    }

    // ============================================================ marqueurs
    static bool addMarker (ProjectState& s, const JsonValue& p, std::string&)
    {
        MarkerState m;
        m.bars = clampValue (jNumber (p, "bars", s.positionBars), 1.0, 100000.0);
        m.endBars = std::max (m.bars, clampValue (jNumber (p, "endBars", m.bars), 1.0, 100000.0));
        m.name = jString (p, "name", "Marqueur " + std::to_string (s.markers.size() + 1));
        m.cycle = jBool (p, "cycle", false);
        s.markers.push_back (m);
        std::sort (s.markers.begin(), s.markers.end(), [] (const MarkerState& a, const MarkerState& b) { return a.bars < b.bars; });
        return true;
    }
    static bool removeMarker (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "markerIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.markers.size())) { err = "Indice de marqueur invalide"; return false; }
        s.markers.erase (s.markers.begin() + i);
        return true;
    }
    static bool renameMarker (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "markerIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.markers.size())) { err = "Indice de marqueur invalide"; return false; }
        const auto name = jString (p, "name", s.markers[static_cast<size_t> (i)].name);
        if (name.empty()) { err = "Nom de marqueur vide"; return false; }
        s.markers[static_cast<size_t> (i)].name = name;
        if (p.has ("bars")) s.markers[static_cast<size_t> (i)].bars = clampValue (jNumber (p, "bars", 1.0), 1.0, 100000.0);
        if (p.has ("endBars")) s.markers[static_cast<size_t> (i)].endBars = std::max (s.markers[static_cast<size_t> (i)].bars, clampValue (jNumber (p, "endBars", 1.0), 1.0, 100000.0));
        if (p.has ("cycle")) s.markers[static_cast<size_t> (i)].cycle = jBool (p, "cycle", false);
        return true;
    }

    // ============================================ carte de tempo et mesures
    static bool addTempoEvent (ProjectState& s, const JsonValue& p, std::string&)
    {
        const double bars = clampValue (jNumber (p, "bars", s.positionBars), 1.0, 100000.0);
        const double bpm = clampValue (jNumber (p, "bpm", s.bpm), 20.0, 300.0);
        for (auto& e : s.tempoEvents)
            if (std::fabs (e.bars - bars) < 1e-9) { e.bpm = bpm; if (bars <= 1.0) s.bpm = bpm; return true; }
        s.tempoEvents.push_back ({ bars, bpm });
        std::sort (s.tempoEvents.begin(), s.tempoEvents.end(), [] (const TempoEvent& a, const TempoEvent& b) { return a.bars < b.bars; });
        if (bars <= 1.0) s.bpm = bpm;
        return true;
    }
    static bool removeTempoEvent (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const double bars = jNumber (p, "bars", -1.0);
        for (size_t i = 0; i < s.tempoEvents.size(); ++i)
            if (std::fabs (s.tempoEvents[i].bars - bars) < 1e-9)
            {
                if (s.tempoEvents.size() == 1) { err = "Le projet doit conserver un tempo"; return false; }
                s.tempoEvents.erase (s.tempoEvents.begin() + static_cast<long> (i));
                s.bpm = s.tempoEvents.front().bpm;
                return true;
            }
        err = "Aucun événement de tempo à cette mesure";
        return false;
    }
    static bool addSignature (ProjectState& s, const JsonValue& p, std::string& err)
    {
        SignatureEvent v;
        v.bars = clampValue (jNumber (p, "bars", s.positionBars), 1.0, 100000.0);
        v.numerator = static_cast<int> (clampValue (static_cast<double> (jInt (p, "numerator", 4)), 1.0, 16.0));
        v.denominator = static_cast<int> (clampValue (static_cast<double> (jInt (p, "denominator", 4)), 1.0, 16.0));
        if ((v.denominator & (v.denominator - 1)) != 0) { err = "Le dénominateur doit être une puissance de 2"; return false; }
        for (auto& e : s.signatures)
            if (std::fabs (e.bars - v.bars) < 1e-9) { e = v; return true; }
        s.signatures.push_back (v);
        std::sort (s.signatures.begin(), s.signatures.end(), [] (const SignatureEvent& a, const SignatureEvent& b) { return a.bars < b.bars; });
        return true;
    }
    static bool removeSignature (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const double bars = jNumber (p, "bars", -1.0);
        for (size_t i = 0; i < s.signatures.size(); ++i)
            if (std::fabs (s.signatures[i].bars - bars) < 1e-9)
            {
                if (s.signatures.size() == 1) { err = "Le projet doit conserver une mesure"; return false; }
                s.signatures.erase (s.signatures.begin() + static_cast<long> (i));
                return true;
            }
        err = "Aucun changement de mesure à cette position";
        return false;
    }

    // ==================================================== informations projet
    static bool setProjectInfo (ProjectState& s, const JsonValue& p, std::string&)
    {
        if (p.has ("name")) { const auto n = jString (p, "name", s.name); if (! n.empty()) s.name = n; }
        if (p.has ("author")) s.info.author = jString (p, "author", s.info.author);
        if (p.has ("copyright")) s.info.copyright = jString (p, "copyright", s.info.copyright);
        if (p.has ("notes")) s.info.notes = jString (p, "notes", s.info.notes);
        if (p.has ("originator")) s.info.originator = jString (p, "originator", s.info.originator);
        if (p.has ("reference")) s.info.reference = jString (p, "reference", s.info.reference);
        if (p.has ("sampleRate")) s.info.sampleRate = jString (p, "sampleRate", s.info.sampleRate);
        if (p.has ("bitDepth")) s.info.bitDepth = jString (p, "bitDepth", s.info.bitDepth);
        if (p.has ("startTimecode")) s.info.startTimecode = jString (p, "startTimecode", s.info.startTimecode);
        return true;
    }

    // ==================================================== espaces de travail
    static int workspaceIndex (const ProjectState& s, const JsonValue& p)
    {
        const auto name = jString (p, "name");
        if (! name.empty())
            for (size_t i = 0; i < s.workspaces.size(); ++i) if (s.workspaces[i].name == name) return static_cast<int> (i);
        return jInt (p, "index", -1);
    }
    static bool storeWorkspace (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        if (name.empty()) { err = "Nom d'espace de travail requis"; return false; }
        WorkspaceState w;
        w.name = name;
        w.barW = clampValue (jNumber (p, "barW", 64.0), 4.0, 2000.0);
        w.scrollLeft = std::max (0.0, jNumber (p, "scrollLeft", 0.0));
        w.scrollTop = std::max (0.0, jNumber (p, "scrollTop", 0.0));
        w.positionBars = clampValue (jNumber (p, "positionBars", s.positionBars), 1.0, 1000000.0);
        w.selectedTrack = std::max (0, jInt (p, "selectedTrack", s.selectedTrack));
        w.panelState = jString (p, "panelState", "");
        w.locked = jBool (p, "locked", false);
        for (const auto& n : p.get ("windows").array) if (n.type == JsonValue::Type::String) w.windows.push_back (n.string);
        for (const auto& n : p.get ("toolbarItems").array) if (n.type == JsonValue::Type::String) w.toolbarItems.push_back (n.string);
        const int existing = workspaceIndex (s, p);
        if (existing >= 0 && existing < static_cast<int> (s.workspaces.size()))
        {
            if (s.workspaces[static_cast<size_t> (existing)].locked) { err = "Espace de travail verrouillé : " + name; return false; }
            w.locked = s.workspaces[static_cast<size_t> (existing)].locked;
            s.workspaces[static_cast<size_t> (existing)] = w;
        }
        else s.workspaces.push_back (w);
        return true;
    }
    static bool recallWorkspace (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = workspaceIndex (s, p);
        if (i < 0 || i >= static_cast<int> (s.workspaces.size())) { err = "Espace de travail introuvable"; return false; }
        const auto& w = s.workspaces[static_cast<size_t> (i)];
        s.positionBars = w.positionBars;
        s.selectedTrack = w.selectedTrack;
        s.layout.toolbarItems = w.toolbarItems.empty() ? s.layout.toolbarItems : w.toolbarItems;
        s.recalledWorkspace = w.name;
        return true;
    }
    static bool deleteWorkspace (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = workspaceIndex (s, p);
        if (i < 0 || i >= static_cast<int> (s.workspaces.size())) { err = "Espace de travail introuvable"; return false; }
        if (s.workspaces[static_cast<size_t> (i)].locked) { err = "Espace de travail verrouillé"; return false; }
        s.workspaces.erase (s.workspaces.begin() + i);
        return true;
    }
    static bool setWorkspaceLock (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = workspaceIndex (s, p);
        if (i < 0 || i >= static_cast<int> (s.workspaces.size())) { err = "Espace de travail introuvable"; return false; }
        s.workspaces[static_cast<size_t> (i)].locked = jBool (p, "locked", ! s.workspaces[static_cast<size_t> (i)].locked);
        return true;
    }

    // ================================================= instantanés de mixage
    static bool storeSnapshot (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        if (name.empty()) { err = "Nom d'instantané requis"; return false; }
        SnapshotState sn;
        sn.name = name;
        sn.masterDb = s.masterDb;
        sn.tracks = s.tracks;
        sn.buses = s.buses;
        for (auto& existing : s.snapshots)
            if (existing.name == name) { existing = sn; return true; }
        s.snapshots.push_back (sn);
        return true;
    }
    static bool recallSnapshot (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        const int index = jInt (p, "index", -1);
        int found = index;
        if (! name.empty())
            for (size_t i = 0; i < s.snapshots.size(); ++i) if (s.snapshots[i].name == name) found = static_cast<int> (i);
        if (found < 0 || found >= static_cast<int> (s.snapshots.size())) { err = "Instantané introuvable"; return false; }
        const auto& sn = s.snapshots[static_cast<size_t> (found)];
        s.masterDb = sn.masterDb;
        for (size_t i = 0; i < s.tracks.size() && i < sn.tracks.size(); ++i)
        {
            auto& t = s.tracks[i];
            const auto& src = sn.tracks[i];
            t.volumeDb = src.volumeDb; t.pan = src.pan; t.mute = src.mute; t.solo = src.solo;
            t.bus = src.bus; t.sendDb = src.sendDb; t.fx = src.fx; t.sends = src.sends;
        }
        for (size_t i = 0; i < s.buses.size() && i < sn.buses.size(); ++i)
        {
            auto& b = s.buses[i];
            const auto& src = sn.buses[i];
            b.volumeDb = src.volumeDb; b.pan = src.pan; b.mute = src.mute;
        }
        return true;
    }
    static bool deleteSnapshot (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        for (size_t i = 0; i < s.snapshots.size(); ++i)
            if (s.snapshots[i].name == name) { s.snapshots.erase (s.snapshots.begin() + static_cast<long> (i)); return true; }
        err = "Instantané introuvable : " + name;
        return false;
    }

    // ======================================================== projets récents
    static bool addRecent (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto path = jString (p, "path");
        if (path.empty()) { err = "Chemin de projet manquant"; return false; }
        const auto name = jString (p, "name", path);
        s.recents.erase (std::remove_if (s.recents.begin(), s.recents.end(),
                                         [&path] (const RecentProject& r) { return r.path == path; }), s.recents.end());
        s.recents.insert (s.recents.begin(), { name, path, utcNow() });
        if (s.recents.size() > 20) s.recents.resize (20);
        return true;
    }
    static bool clearRecents (ProjectState& s, const JsonValue&, std::string&) { s.recents.clear(); return true; }

    // ========================================================= raccourcis
    static bool setKeyCommand (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto combo = jString (p, "combo");
        const auto action = jString (p, "action");
        if (combo.empty() || action.empty()) { err = "Raccourci incomplet"; return false; }
        const bool replace = jBool (p, "replaceExisting", true);
        if (replace)
            for (auto& k : s.keyCommands) if (k.combo == combo) k.action = action;
        bool found = false;
        for (const auto& k : s.keyCommands) if (k.combo == combo && k.action == action) found = true;
        if (! found) s.keyCommands.push_back ({ combo, action });
        return true;
    }
    static bool resetKeyCommands (ProjectState& s, const JsonValue&, std::string&)
    {
        s.keyCommands = ProjectState::defaultKeyCommands();
        return true;
    }

    // ============================================== éditeur logique MIDI réel
    static bool ruleMatches (const LogicalRule& r, const MidiNote& n)
    {
        if (! r.enabled) return false;
        if (n.pitch < r.pitchMin || n.pitch > r.pitchMax) return false;
        if (n.velocity < r.velocityMin || n.velocity > r.velocityMax) return false;
        if (n.lenBars < r.lengthMinBars || n.lenBars > r.lengthMaxBars) return false;
        return true;
    }
    static bool applyRule (const LogicalRule& r, std::vector<MidiNote>& notes, int& touched)
    {
        const double grid = gridToBars (r.grid);
        std::vector<MidiNote> kept;
        kept.reserve (notes.size());
        for (const auto& n : notes)
        {
            if (! ruleMatches (r, n)) { kept.push_back (n); continue; }
            MidiNote m = n;
            ++touched;
            if (r.action == "setVelocity") m.velocity = static_cast<int> (clampValue (r.actionValue, 1.0, 127.0));
            else if (r.action == "scaleVelocity") m.velocity = static_cast<int> (clampValue (static_cast<double> (m.velocity) * r.actionValue / 100.0, 1.0, 127.0));
            else if (r.action == "transpose") m.pitch = static_cast<int> (clampValue (static_cast<double> (m.pitch) + r.actionValue, 0.0, 127.0));
            else if (r.action == "setLength") m.lenBars = std::max (grid, r.actionValue);
            else if (r.action == "scaleLength") m.lenBars = std::max (grid, m.lenBars * r.actionValue / 100.0);
            else if (r.action == "quantize") m.startBars = 1.0 + std::round ((m.startBars - 1.0) / grid) * grid;
            else if (r.action == "deleteNotes") continue;
            else if (r.action == "invertVelocity") m.velocity = 128 - m.velocity;
            kept.push_back (m);
        }
        notes.swap (kept);
        return true;
    }
    static bool storeLogicalRule (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        if (name.empty()) { err = "Nom de règle requis"; return false; }
        LogicalRule r;
        r.name = name;
        r.enabled = jBool (p, "enabled", true);
        r.pitchMin = static_cast<int> (clampValue (static_cast<double> (jInt (p, "pitchMin", 0)), 0.0, 127.0));
        r.pitchMax = static_cast<int> (clampValue (static_cast<double> (jInt (p, "pitchMax", 127)), 0.0, 127.0));
        r.velocityMin = static_cast<int> (clampValue (static_cast<double> (jInt (p, "velocityMin", 1)), 1.0, 127.0));
        r.velocityMax = static_cast<int> (clampValue (static_cast<double> (jInt (p, "velocityMax", 127)), 1.0, 127.0));
        r.lengthMinBars = clampValue (jNumber (p, "lengthMinBars", 0.0), 0.0, 100000.0);
        r.lengthMaxBars = clampValue (jNumber (p, "lengthMaxBars", 100000.0), 0.0, 100000.0);
        r.onlySelectedTrack = jBool (p, "onlySelectedTrack", true);
        r.typeFilter = jString (p, "typeFilter", "note");
        r.action = jString (p, "action", "setVelocity");
        r.actionValue = jNumber (p, "actionValue", 0.0);
        r.grid = jString (p, "grid", "1/16");
        const int index = jInt (p, "ruleIndex", -1);
        if (index >= 0 && index < static_cast<int> (s.logicalRules.size())) s.logicalRules[static_cast<size_t> (index)] = r;
        else s.logicalRules.push_back (r);
        return true;
    }
    static bool deleteLogicalRule (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "ruleIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.logicalRules.size())) { err = "Indice de règle invalide"; return false; }
        s.logicalRules.erase (s.logicalRules.begin() + i);
        return true;
    }
    static bool applyLogicalEdit (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "ruleIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.logicalRules.size())) { err = "Indice de règle invalide"; return false; }
        const auto rule = s.logicalRules[static_cast<size_t> (i)];
        int touched = 0;
        for (size_t ti = 0; ti < s.tracks.size(); ++ti)
        {
            if (rule.onlySelectedTrack && static_cast<int> (ti) != s.selectedTrack && ! jBool (p, "allTracks", false)) continue;
            applyRule (rule, s.tracks[ti].midiNotes, touched);
        }
        s.lastLogicalTouched = touched;
        return true;
    }

    // ================================================ modificateurs MIDI réels
    static bool storeMidiModifier (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto name = jString (p, "name");
        if (name.empty()) { err = "Nom de modificateur requis"; return false; }
        MidiModifier m;
        m.name = name;
        m.transposeSemitones = clampValue (jNumber (p, "transposeSemitones", 0.0), -24.0, 24.0);
        m.velocityOffset = clampValue (jNumber (p, "velocityOffset", 0.0), -127.0, 127.0);
        m.velocityScale = clampValue (jNumber (p, "velocityScale", 1.0), 0.0, 4.0);
        m.lengthScale = clampValue (jNumber (p, "lengthScale", 1.0), 0.01, 8.0);
        m.delayBars = clampValue (jNumber (p, "delayBars", 0.0), -8.0, 8.0);
        m.invert = jBool (p, "invert", false);
        const int index = jInt (p, "modifierIndex", -1);
        if (index >= 0 && index < static_cast<int> (s.midiModifiers.size())) s.midiModifiers[static_cast<size_t> (index)] = m;
        else s.midiModifiers.push_back (m);
        return true;
    }
    static bool deleteMidiModifier (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "modifierIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.midiModifiers.size())) { err = "Indice de modificateur invalide"; return false; }
        s.midiModifiers.erase (s.midiModifiers.begin() + i);
        return true;
    }
    static bool applyMidiModifier (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int i = jInt (p, "modifierIndex", -1);
        if (i < 0 || i >= static_cast<int> (s.midiModifiers.size())) { err = "Indice de modificateur invalide"; return false; }
        const auto m = s.midiModifiers[static_cast<size_t> (i)];
        const int track = jInt (p, "trackIndex", s.selectedTrack);
        if (! trackValid (s, track, err)) return false;
        auto& notes = s.tracks[static_cast<size_t> (track)].midiNotes;
        for (auto& n : notes)
        {
            double v = static_cast<double> (n.velocity) * m.velocityScale + m.velocityOffset;
            if (m.invert) v = 128.0 - v;
            n.velocity = static_cast<int> (clampValue (v, 1.0, 127.0));
            n.pitch = static_cast<int> (clampValue (static_cast<double> (n.pitch) + m.transposeSemitones, 0.0, 127.0));
            n.lenBars = std::max (gridToBars ("tick"), n.lenBars * m.lengthScale);
            n.startBars = std::max (1.0, n.startBars + m.delayBars);
        }
        s.lastLogicalTouched = static_cast<int> (notes.size());
        return true;
    }
    static bool transposeMidi (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const int track = jInt (p, "trackIndex", s.selectedTrack);
        if (! trackValid (s, track, err)) return false;
        const int semitones = static_cast<int> (clampValue (static_cast<double> (jInt (p, "semitones", 0)), -24.0, 24.0));
        auto& notes = s.tracks[static_cast<size_t> (track)].midiNotes;
        for (auto& n : notes) n.pitch = static_cast<int> (clampValue (static_cast<double> (n.pitch) + semitones, 0.0, 127.0));
        s.tracks[static_cast<size_t> (track)].transposeSemitones += semitones;
        s.lastLogicalTouched = static_cast<int> (notes.size());
        return true;
    }

    // ============================================ pistes vides, greffons, UI
    static bool removeEmptyTracks (ProjectState& s, const JsonValue&, std::string&)
    {
        std::vector<TrackState> kept;
        for (const auto& t : s.tracks)
            if (! t.clips.empty() || ! t.midiNotes.empty() || ! t.inserts.empty()) kept.push_back (t);
        s.lastRemovedEmpty = static_cast<int> (s.tracks.size()) - static_cast<int> (kept.size());
        s.tracks.swap (kept);
        return true;
    }
    static bool addPluginFolder (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto path = jString (p, "path");
        if (path.empty()) { err = "Chemin de dossier manquant"; return false; }
        if (std::find (s.pluginFolders.begin(), s.pluginFolders.end(), path) == s.pluginFolders.end())
            s.pluginFolders.push_back (path);
        return true;
    }
    static bool removePluginFolder (ProjectState& s, const JsonValue& p, std::string& err)
    {
        const auto path = jString (p, "path");
        const auto it = std::find (s.pluginFolders.begin(), s.pluginFolders.end(), path);
        if (it == s.pluginFolders.end()) { err = "Dossier de greffons absent : " + path; return false; }
        s.pluginFolders.erase (it);
        return true;
    }
    static bool setUiLayout (ProjectState& s, const JsonValue& p, std::string& err)
    {
        auto& l = s.layout;
        if (p.has ("rulerFormat")) { const auto v = jString (p, "rulerFormat", l.rulerFormat);
            static const char* ok[] = { "bars", "seconds", "timecode", "samples", "frames" };
            if (std::find (std::begin (ok), std::end (ok), v) == std::end (ok)) { err = "Format de règle inconnu : " + v; return false; }
            l.rulerFormat = v; }
        if (p.has ("snapMode")) l.snapMode = jString (p, "snapMode", l.snapMode);
        if (p.has ("nudgeMode")) l.nudgeMode = jString (p, "nudgeMode", l.nudgeMode);
        if (p.has ("editMode")) l.editMode = jString (p, "editMode", l.editMode);
        if (p.has ("timebase")) { const auto v = jString (p, "timebase", l.timebase);
            if (v != "musical" && v != "linear") { err = "Base temporelle inconnue : " + v; return false; }
            l.timebase = v; }
        if (p.has ("showToolbar")) l.showToolbar = jBool (p, "showToolbar", l.showToolbar);
        if (p.has ("showInspector")) l.showInspector = jBool (p, "showInspector", l.showInspector);
        if (p.has ("showOverview")) l.showOverview = jBool (p, "showOverview", l.showOverview);
        if (p.has ("showInfoline")) l.showInfoline = jBool (p, "showInfoline", l.showInfoline);
        if (p.has ("showMarkerTrack")) l.showMarkerTrack = jBool (p, "showMarkerTrack", l.showMarkerTrack);
        if (p.has ("trackHeight"))
        {
            l.trackHeight = clampValue (jNumber (p, "trackHeight", l.trackHeight), 24.0, 400.0);
            for (auto& t : s.tracks) t.height = l.trackHeight;
        }
        if (p.has ("toolbarItems"))
        {
            l.toolbarItems.clear();
            for (const auto& n : p.get ("toolbarItems").array) if (n.type == JsonValue::Type::String) l.toolbarItems.push_back (n.string);
        }
        if (p.has ("selectedTrack")) s.selectedTrack = std::max (0, jInt (p, "selectedTrack", s.selectedTrack));
        return true;
    }
    static bool setTransportState (ProjectState& s, const JsonValue& p, std::string&)
    {
        if (p.has ("positionBars")) s.positionBars = clampValue (jNumber (p, "positionBars", s.positionBars), 1.0, 1000000.0);
        if (p.has ("selectedTrack")) s.selectedTrack = std::max (0, jInt (p, "selectedTrack", s.selectedTrack));
        return true;
    }
    static bool closeProject (ProjectState& s, const JsonValue& p, std::string&)
    {
        // Fermeture réelle : l'état courant est conservé dans les projets récents
        // (chemin réel fourni par l'hôte), puis le projet est marqué fermé.
        const auto path = jString (p, "path", s.path);
        if (! path.empty())
        {
            s.path = path;
            s.recents.erase (std::remove_if (s.recents.begin(), s.recents.end(),
                                             [&path] (const RecentProject& r) { return r.path == path; }), s.recents.end());
            s.recents.insert (s.recents.begin(), { s.name, path, utcNow() });
            if (s.recents.size() > 20) s.recents.resize (20);
        }
        s.closed = true;
        s.tracks.clear();
        s.markers.clear();
        s.media.clear();
        s.name = "Projet sans titre";
        s.bpm = 120.0;
        s.tempoEvents = { { 1.0, 120.0 } };
        s.positionBars = 1.0;
        s.selectedTrack = 0;
        s.loopStartBars = 1.0;
        s.loopEndBars = 9.0;
        ProjectState def;
        s.buses = def.buses;
        s.markers = def.markers;
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
