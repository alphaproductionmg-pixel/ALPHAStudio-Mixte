// ALPHA Studio - moteur audio (JUCE 8), projet J1→J6.
// Graphe : [piste + synthèse MIDI] -> inserts VST3 -> fader/EQ/dynamique/automation -> bus -> master/Control Room -> sortie.
#pragma once
#include <JuceHeader.h>
#include "AlphaProjectCore.h"
#include <array>
#include <atomic>
#include <limits>
#include <map>
#include <memory>
#include <utility>

using namespace juce;

#define TR(s) juce::String(juce::CharPointer_UTF8(s))

static inline String alphaString (const std::string& s) { return String::fromUTF8 (s.c_str()); }
static inline std::string alphaStd (const String& s) { return s.toStdString(); }
static inline String alphaColourToHex (const Colour& c) { return "#" + c.toString().substring (2); }
static inline Colour alphaColourFromHex (const String& s)
{
    const String t = s.startsWithChar ('#') ? s.substring (1) : s;
    return Colour::fromString (t.length() == 6 ? "ff" + t : t);
}
static inline double alphaSamplesPerBar (double bpm, double sr) { return 4.0 * 60.0 / jmax (20.0, bpm) * jmax (8000.0, sr); }
static inline int64 alphaBarsToSamples (double bars, double bpm, double sr) { return (int64) jmax (0.0, (bars - 1.0) * alphaSamplesPerBar (bpm, sr)); }
static inline int64 alphaBarLengthToSamples (double bars, double bpm, double sr) { return (int64) jmax (0.0, bars * alphaSamplesPerBar (bpm, sr)); }
static inline double alphaSamplesToBars (int64 samples, double bpm, double sr) { return 1.0 + (double) samples / alphaSamplesPerBar (bpm, sr); }
static inline double alphaSamplesToBarLength (int64 samples, double bpm, double sr) { return (double) samples / alphaSamplesPerBar (bpm, sr); }

struct Transport
{
    std::atomic<bool> playing { false }, looping { false }, metronome { false };
    std::atomic<int64> pos { 0 }, loopStart { 0 }, loopEnd { 0 };
    std::atomic<double> sampleRate { 44100.0 }, bpm { 120.0 };
};

static constexpr int kPeakBlock = 256;

struct Clip
{
    String name, id, media;
    File file;
    std::shared_ptr<AudioBuffer<float>> data;
    std::shared_ptr<std::vector<float>> peaks;
    int64 start = 0, offset = 0, len = 0;
    bool loop = false;
};

inline std::shared_ptr<std::vector<float>> makePeaks (const AudioBuffer<float>& b)
{
    const int n = b.getNumSamples(), blocks = (n + kPeakBlock - 1) / kPeakBlock;
    auto p = std::make_shared<std::vector<float>> ((size_t) blocks * 2);
    if (n == 0) return p;
    const float* d = b.getReadPointer (0);
    for (int i = 0; i < blocks; ++i)
    {
        const int s = i * kPeakBlock, e = jmin (n, s + kPeakBlock);
        float mn = 1e9f, mx = -1e9f;
        for (int k = s; k < e; ++k) { mn = jmin (mn, d[k]); mx = jmax (mx, d[k]); }
        (*p)[(size_t) (2 * i)] = mn;
        (*p)[(size_t) (2 * i + 1)] = mx;
    }
    return p;
}

#define ALPHA_PROC_BOILERPLATE(NAME)                                                   \
    const String getName() const override { return NAME; }                            \
    void prepareToPlay (double, int) override {}                                       \
    void releaseResources() override {}                                                \
    double getTailLengthSeconds() const override { return 0; }                         \
    bool acceptsMidi() const override { return false; }                                \
    bool producesMidi() const override { return false; }                               \
    AudioProcessorEditor* createEditor() override { return nullptr; }                  \
    bool hasEditor() const override { return false; }                                  \
    int getNumPrograms() override { return 1; }                                        \
    int getCurrentProgram() override { return 0; }                                     \
    void setCurrentProgram (int) override {}                                           \
    const String getProgramName (int) override { return {}; }                          \
    void changeProgramName (int, const String&) override {}                            \
    void getStateInformation (MemoryBlock&) override {}                                \
    void setStateInformation (const void*, int) override {}

//==============================================================================
class TrackSource : public AudioProcessor
{
public:
    struct LiveNote { double phase = 0.0; float velocity = 0.8f; int64 end = 0; };

    TrackSource (Transport& t)
        : AudioProcessor (BusesProperties().withOutput ("Out", AudioChannelSet::stereo(), true)), transport (t) {}
    ALPHA_PROC_BOILERPLATE ("Piste")

    void processBlock (AudioBuffer<float>& buf, MidiBuffer&) override
    {
        buf.clear();
        if (! transport.playing.load()) return;
        SpinLock::ScopedTryLockType tl (lock);
        if (! tl.isLocked()) return;

        const int64 p = transport.pos.load();
        if (p < precountEnd.load()) return;
        const int n = buf.getNumSamples();
        const double sr = transport.sampleRate.load();
        const double spb = alphaSamplesPerBar (transport.bpm.load(), sr);
        const double twoPi = MathConstants<double>::twoPi;

        for (const auto& c : clips)
        {
            if (! c.data) continue;
            const int64 cs = c.start, ce = cs + c.len;
            if (ce <= p || cs >= p + n) continue;
            const int dst = (int) std::max<int64> ((int64) 0, cs - p);
            const int src = (int) (c.offset + std::max<int64> ((int64) 0, p - cs));
            const int num = (int) std::min<int64> ((int64) (n - dst), ce - std::max (cs, p));
            const int avail = c.data->getNumSamples() - src;
            const int cnt = jmin (num, avail);
            if (cnt <= 0) continue;
            for (int ch = 0; ch < jmin (2, buf.getNumChannels()); ++ch)
                buf.addFrom (ch, dst, *c.data, jmin (ch, c.data->getNumChannels() - 1), src, cnt);
        }

        for (const auto& note : midiNotes)
        {
            if (! note.on) continue;
            const int64 cs = (int64) jmax (0.0, (note.startBars - 1.0) * spb);
            const int64 length = (int64) jmax (1.0, note.lenBars * spb);
            const int64 ce = cs + length;
            if (ce <= p || cs >= p + n) continue;
            const int dst = (int) std::max<int64> ((int64) 0, cs - p);
            const int cnt = (int) std::min<int64> ((int64) (n - dst), ce - std::max (cs, p));
            const double freq = 440.0 * std::pow (2.0, (note.pitch - 69) / 12.0);
            const double amp = 0.22 * jlimit (0.0, 1.0, note.velocity / 127.0);
            for (int i = 0; i < cnt; ++i)
            {
                const double elapsed = (double) (p + dst + i - cs) / sr;
                const double attack = jmin (1.0, elapsed / 0.005);
                const double release = jmin (1.0, (length - elapsed * sr) / (0.05 * sr));
                const float v = (float) (std::sin (twoPi * freq * elapsed) * amp * jmax (0.0, attack) * jmax (0.0, release));
                buf.addSample (0, dst + i, v);
                buf.addSample (1, dst + i, v);
            }
        }

        for (auto it = liveNotes.begin(); it != liveNotes.end();)
        {
            if (it->second.end > 0 && p > it->second.end) { it = liveNotes.erase (it); continue; }
            const double freq = 440.0 * std::pow (2.0, (it->first - 69) / 12.0);
            double phase = it->second.phase;
            const float amp = 0.18f * it->second.velocity;
            for (int i = 0; i < n; ++i)
            {
                phase += twoPi * freq / sr;
                const float v = (float) std::sin (phase) * amp;
                buf.addSample (0, i, v);
                buf.addSample (1, i, v);
            }
            it->second.phase = std::fmod (phase, twoPi);
            ++it;
        }
    }

    void setMidiNotes (const std::vector<alpha::MidiNote>& n)
    {
        const SpinLock::ScopedLockType sl (lock);
        midiNotes = n;
    }
    void handleMidi (int pitch, int velocity, bool on, double sr)
    {
        const SpinLock::ScopedLockType sl (lock);
        pitch = jlimit (0, 127, pitch);
        if (on && velocity > 0) liveNotes[pitch] = { 0.0, (float) jlimit (0.0, 1.0, velocity / 127.0), 0 };
        else if (auto it = liveNotes.find (pitch); it != liveNotes.end())
            it->second.end = transport.pos.load() + (int64) (0.04 * sr);
    }
    void clearLiveNotes()
    {
        const SpinLock::ScopedLockType sl (lock);
        liveNotes.clear();
    }
    void setPrecountEnd (int64 s) { precountEnd.store (s); }

    SpinLock lock;
    std::vector<Clip> clips;
    std::vector<alpha::MidiNote> midiNotes;
    std::map<int, LiveNote> liveNotes;
    std::atomic<int64> precountEnd { 0 };
private:
    Transport& transport;
};

//==============================================================================
// Fader + EQ 4 bandes + dynamique + automation lue + VU/crête/LUFS simplifié.
// Seul le processeur master fait avancer le transport ; les autres lisent l'horloge.
class FaderProcessor : public AudioProcessor
{
public:
    FaderProcessor (Transport* t = nullptr, bool isMaster = false)
        : AudioProcessor (BusesProperties().withInput ("In", AudioChannelSet::stereo(), true)
                                           .withOutput ("Out", AudioChannelSet::stereo(), true)),
          clock (t), masterProcessor (isMaster) {}
    ALPHA_PROC_BOILERPLATE ("Fader")

    void processBlock (AudioBuffer<float>& b, MidiBuffer&) override
    {
        const int n = b.getNumSamples();
        if (b.getNumChannels() < 2) return;

        const int fxRev = fxRevision.load();
        if (fxRev != activeFxRevision)
        {
            SpinLock::ScopedTryLockType sl (configLock);
            if (sl.isLocked())
            {
                activeFx = targetFx;
                dynamicsProcessor.configure (clock != nullptr ? clock->sampleRate.load() : 48000.0, activeFx.dynamics);
                for (int band = 0; band < 4; ++band)
                    for (int ch = 0; ch < 2; ++ch)
                    {
                        auto& dst = filters[(size_t) (band * 2 + ch)];
                        const auto& src = activeFx.coefs[(size_t) (band * 2 + ch)];
                        dst.b0 = src.b0; dst.b1 = src.b1; dst.b2 = src.b2;
                        dst.a1 = src.a1; dst.a2 = src.a2;
                    }
                activeFxRevision = fxRev;
            }
        }
        const int autoRev = automationRevision.load();
        if (autoRev != activeAutomationRevision)
        {
            SpinLock::ScopedTryLockType sl (configLock);
            if (sl.isLocked()) { activeAutomation = targetAutomation; activeAutomationRevision = autoRev; }
        }

        double autoGainDb = 0.0, autoPan = 0.0;
        bool autoMute = false;
        if (clock != nullptr && clock->playing.load())
        {
            const double bars = alphaSamplesToBars (clock->pos.load(), clock->bpm.load(), clock->sampleRate.load());
            for (int i = 0; i < activeAutomation.count; ++i)
            {
                const auto& c = activeAutomation.curves[(size_t) i];
                const double v = c.valueAt (bars);
                if (c.param == "Volume") autoGainDb = jlimit (-60.0, 12.0, 20.0 * std::log10 (jmax (1e-4, v)));
                else if (c.param == "Panoramique") autoPan = jlimit (-1.0, 1.0, v * 2.0 - 1.0);
                else if (c.param == "Mute") autoMute = v > 0.5;
            }
        }

        const float g = (audible.load() && ! autoMute)
                        ? (float) (gain.load() * std::pow (10.0, autoGainDb / 20.0)) : 0.0f;
        const float p = jlimit (-1.0f, 1.0f, (float) (pan.load() + autoPan));
        const float ang = (p + 1.0f) * MathConstants<float>::pi * 0.25f;
        const float gl = std::cos (ang) * g, gr = std::sin (ang) * g;
        b.applyGainRamp (0, 0, n, lastL, gl);
        b.applyGainRamp (1, 0, n, lastR, gr);
        lastL = gl; lastR = gr;

        if (mono.load())
            for (int i = 0; i < n; ++i)
            {
                const float m = 0.5f * (b.getSample (0, i) + b.getSample (1, i));
                b.setSample (0, i, m); b.setSample (1, i, m);
            }

        if (activeFx.eqEnabled)
            for (int band = 0; band < 4; ++band)
                if (activeFx.bandEnabled[(size_t) band])
                    for (int ch = 0; ch < 2; ++ch)
                    {
                        auto& f = filters[(size_t) (band * 2 + ch)];
                        for (int i = 0; i < n; ++i) b.setSample (ch, i, f.process (b.getSample (ch, i)));
                    }
        if (activeFx.dynamics.enabled)
            for (int i = 0; i < n; ++i)
            {
                float l = b.getSample (0, i), r = b.getSample (1, i);
                dynamicsProcessor.process (l, r);
                b.setSample (0, i, l); b.setSample (1, i, r);
            }

        for (int i = 0; i < n; ++i) meter.add (b.getSample (0, i), b.getSample (1, i));
        levelL.store (jmax (b.getMagnitude (0, 0, n), levelL.load() * 0.9f));
        levelR.store (jmax (b.getMagnitude (1, 0, n), levelR.load() * 0.9f));
        peak.store (meter.peakValue());
        lufs.store ((float) meter.lufs());

        if (masterProcessor && clock != nullptr)
        {
            const double sr = clock->sampleRate.load();
            const int64 pos = clock->pos.load();
            if (clock->playing.load())
            {
                if (clock->metronome.load())
                {
                    const double spb = sr * 60.0 / clock->bpm.load();
                    for (int i = 0; i < n; ++i)
                    {
                        const int64 a = pos + i;
                        const int64 beat = (int64) ((double) a / spb);
                        const double off = (double) a - (double) beat * spb;
                        if (off < 0.03 * sr)
                        {
                            const float env = (float) std::exp (-off / (0.006 * sr));
                            const float s = env * 0.4f * (float) std::sin (MathConstants<double>::twoPi * ((beat % 4 == 0) ? 1600.0 : 1050.0) * off / sr);
                            b.addSample (0, i, s); b.addSample (1, i, s);
                        }
                    }
                }
                int64 np = pos + n;
                const int64 ls = clock->loopStart.load(), le = clock->loopEnd.load();
                if (clock->looping.load() && le > ls && np >= le) np = ls + (np - le);
                clock->pos.store (np);
            }
        }
    }

    void setFx (const alpha::FxState& fx, double sampleRate)
    {
        FxConfig cfg;
        cfg.eqEnabled = fx.eqEnabled;
        cfg.dynamics = fx.dynamics;
        for (int band = 0; band < 4; ++band)
        {
            cfg.bandEnabled[(size_t) band] = fx.eq[(size_t) band].enabled && std::abs (fx.eq[(size_t) band].gainDb) > 0.001;
            const auto coef = alpha::makeBiquad (fx.eq[(size_t) band], sampleRate);
            cfg.coefs[(size_t) (band * 2)] = coef;
            cfg.coefs[(size_t) (band * 2 + 1)] = coef;
        }
        { const SpinLock::ScopedLockType sl (configLock); targetFx = cfg; }
        fxRevision.fetch_add (1);
    }
    void setAutomation (const std::vector<alpha::AutomationCurve>& curves)
    {
        AutoConfig cfg;
        cfg.count = jmin (8, (int) curves.size());
        for (int i = 0; i < cfg.count; ++i) cfg.curves[(size_t) i] = curves[(size_t) i];
        { const SpinLock::ScopedLockType sl (configLock); targetAutomation = cfg; }
        automationRevision.fetch_add (1);
    }
    void setMono (bool v) { mono.store (v); }
    void resetMeters()
    {
        const SpinLock::ScopedLockType sl (configLock); // sérialise aussi l'accès au compteur audio
        meter.reset();
        peak.store (0.0f);
        lufs.store (-70.0f);
    }

    std::atomic<float> gain { 0.5f }, pan { 0.0f }, levelL { 0.0f }, levelR { 0.0f };
    std::atomic<float> lufs { -70.0f }, peak { 0.0f };
    std::atomic<bool> audible { true }, mono { false };

private:
    struct FxConfig
    {
        bool eqEnabled = true;
        std::array<bool, 4> bandEnabled { false, false, false, false };
        std::array<alpha::Biquad, 8> coefs;
        alpha::Dynamics dynamics;
    };
    struct AutoConfig
    {
        int count = 0;
        std::array<alpha::AutomationCurve, 8> curves;
    };

    Transport* clock = nullptr;
    bool masterProcessor = false;
    float lastL = 0.5f, lastR = 0.5f;
    std::array<alpha::Biquad, 8> filters;
    alpha::DynamicsProcessor dynamicsProcessor;
    alpha::MeterAccumulator meter;
    SpinLock configLock;
    FxConfig targetFx, activeFx;
    AutoConfig targetAutomation, activeAutomation;
    std::atomic<int> fxRevision { 0 }, automationRevision { 0 };
    int activeFxRevision = -1, activeAutomationRevision = -1;
};

//==============================================================================
class RecorderProcessor : public AudioProcessor
{
public:
    RecorderProcessor (TimeSliceThread& th, Transport& t)
        : AudioProcessor (BusesProperties().withInput ("In", AudioChannelSet::stereo(), true)), thread (th), transport (t) {}
    ALPHA_PROC_BOILERPLATE ("Enregistreur")

    bool start (const File& f, double sr)
    {
        stop();
        f.deleteFile();
        std::unique_ptr<FileOutputStream> os (f.createOutputStream());
        if (os == nullptr) return false;
        WavAudioFormat wav;
        std::unique_ptr<AudioFormatWriter> w (wav.createWriterFor (os.get(), sr, 2, 24, {}, 0));
        if (w == nullptr) return false;
        os.release();
        auto tw = std::make_unique<AudioFormatWriter::ThreadedWriter> (w.release(), thread, 32768);
        { const SpinLock::ScopedLockType sl (wlock); threaded = std::move (tw); }
        return true;
    }
    void stop()
    {
        std::unique_ptr<AudioFormatWriter::ThreadedWriter> old;
        { const SpinLock::ScopedLockType sl (wlock); old = std::move (threaded); }
        old.reset();
    }
    void setGate (bool enabled, int64 start, int64 end)
    {
        gateEnabled.store (enabled);
        gateStart.store (start);
        gateEnd.store (end);
    }
    void processBlock (AudioBuffer<float>& b, MidiBuffer&) override
    {
        SpinLock::ScopedTryLockType tl (wlock);
        if (! tl.isLocked() || threaded == nullptr || b.getNumChannels() < 2) return;
        const int n = b.getNumSamples();
        const int64 p = transport.pos.load();
        int64 a = p, e = p + n;
        if (gateEnabled.load())
        {
            a = jmax (a, gateStart.load());
            e = jmin (e, gateEnd.load());
        }
        if (e <= a) return;
        const int dst = (int) (a - p);
        const int cnt = (int) (e - a);
        const float* const* rp = b.getArrayOfReadPointers();
        const float* ptrs[2] = { rp[0] + dst, rp[1] + dst };
        threaded->write (ptrs, cnt);
    }
private:
    TimeSliceThread& thread;
    Transport& transport;
    SpinLock wlock;
    std::unique_ptr<AudioFormatWriter::ThreadedWriter> threaded;
    std::atomic<bool> gateEnabled { false };
    std::atomic<int64> gateStart { 0 }, gateEnd { std::numeric_limits<int64>::max() / 4 };
};

//==============================================================================
class AlphaEngine : private ChangeListener
{
public:
    struct Insert { AudioProcessorGraph::Node::Ptr node; String name; PluginDescription desc; };
    struct Track
    {
        String name; Colour colour;
        TrackSource* source = nullptr; FaderProcessor* fader = nullptr;
        AudioProcessorGraph::NodeID srcId, faderId;
        std::vector<Insert> inserts;
        bool mute = false, solo = false, arm = false, instrument = false;
        float volDb = -6.0f, pan = 0.0f;
        int bus = 0;
        float sendDb = 0.0f;
        alpha::FxState fx;
        std::vector<alpha::MidiNote> midiNotes;
        std::vector<alpha::AutomationCurve> automation;
    };
    struct Bus
    {
        String name = "Bus";
        FaderProcessor* fader = nullptr;
        AudioProcessorGraph::NodeID id;
        double volDb = 0.0, pan = 0.0;
        bool mute = false;
    };

    Transport transport;
    AudioDeviceManager deviceManager;
    AudioProcessorGraph graph;
    AudioProcessorPlayer player;
    AudioFormatManager basicFormats;
    AudioPluginFormatManager pluginFormats;
    KnownPluginList knownPlugins;
    std::vector<std::unique_ptr<Track>> tracks;
    std::vector<std::unique_ptr<Bus>> buses;
    alpha::ProjectCore core;
    float masterDb = 0.0f;
    std::function<void()> onChanged;
    std::function<void (AudioProcessorGraph::NodeID)> onInsertRemoved;
    String audioError, lastStatus;

    File applicationDataDir() const { return appDataDir(); }
    File templatesDir() const
    {
        auto d = applicationDataDir().getChildFile ("Templates");
        d.createDirectory();
        return d;
    }
    bool saveTemplate (const String& name)
    {
        const String clean = name.removeCharacters ("\\/:*?\"<>|").trim();
        if (clean.isEmpty()) { lastStatus = TR ("Nom de modèle invalide"); return false; }
        const File f = templatesDir().getChildFile (clean).withFileExtension (".alphaproj");
        if (! writeState (f, false, false)) { lastStatus = TR ("Écriture du modèle impossible"); return false; }
        const std::string key = clean.toStdString();
        if (std::find (core.state.templates.begin(), core.state.templates.end(), key) == core.state.templates.end())
            core.state.templates.push_back (key);
        core.markDirty();
        lastStatus = TR ("Modèle enregistré : ") + clean;
        if (onChanged) onChanged();
        return true;
    }
    bool loadTemplateFile (const File& f)
    {
        if (! f.existsAsFile() || ! loadProjectJson (f)) return false;
        projectFile = File();
        markDirty();
        lastStatus = TR ("Modèle chargé : ") + f.getFileNameWithoutExtension();
        return true;
    }

    AlphaEngine() : writerThread ("ALPHA enregistrement")
    {
        projectRoot = appDataDir();
        basicFormats.registerBasicFormats();
        #if JUCE_PLUGINHOST_VST3
        pluginFormats.addFormat (new VST3PluginFormat());
        #endif
        writerThread.startThread();
        std::unique_ptr<XmlElement> saved = parseXML (appDataDir().getChildFile ("audio.xml"));
        audioError = deviceManager.initialise (2, 2, saved.get(), true);
        if (saved == nullptr)
            for (auto* type : deviceManager.getAvailableDeviceTypes())
                if (type->getTypeName() == "ASIO")
                {
                    type->scanForDevices();
                    if (type->getDeviceNames().size() > 0) deviceManager.setCurrentAudioDeviceType ("ASIO", true);
                }
        updateRate();

        using IO = AudioProcessorGraph::AudioGraphIOProcessor;
        inputId = graph.addNode (std::make_unique<IO> (IO::audioInputNode))->nodeID;
        outputId = graph.addNode (std::make_unique<IO> (IO::audioOutputNode))->nodeID;
        auto m = std::make_unique<FaderProcessor> (&transport, true);
        master = m.get();
        masterId = graph.addNode (std::move (m))->nodeID;
        auto r = std::make_unique<RecorderProcessor> (writerThread, transport);
        recorder = r.get();
        recId = graph.addNode (std::move (r))->nodeID;
        for (int i = 0; i < 4; ++i)
        {
            auto f = std::make_unique<FaderProcessor> (&transport, false);
            auto bus = std::make_unique<Bus>();
            bus->name = "Bus " + String (char ('A' + i));
            bus->fader = f.get();
            bus->id = graph.addNode (std::move (f))->nodeID;
            buses.push_back (std::move (bus));
        }
        refreshMix();
        rebuildConnections();
        player.setProcessor (&graph);
        deviceManager.addAudioCallback (&player);
        deviceManager.addChangeListener (this);
        loadKnownPlugins();
        core.resetTo (alpha::ProjectState(), "État initial");
    }

    ~AlphaEngine() override
    {
        saveAudioState();
        deviceManager.removeChangeListener (this);
        deviceManager.removeAudioCallback (&player);
        player.setProcessor (nullptr);
        if (recorder) recorder->stop();
        tracks.clear();
        buses.clear();
        graph.clear();
        writerThread.stopThread (2000);
    }

    FaderProcessor* master = nullptr;

    double sr() const { return transport.sampleRate.load(); }
    int bs() const { if (auto* d = deviceManager.getCurrentAudioDevice()) return d->getCurrentBufferSizeSamples(); return 512; }
    int64 projectLength() const
    {
        int64 m = 0;
        for (auto& t : tracks) for (auto& c : t->source->clips) m = jmax (m, c.start + c.len);
        return m;
    }
    bool owns (Track* t) const { for (auto& x : tracks) if (x.get() == t) return true; return false; }
    void setNativeStatus (const String& s) { lastStatus = s; }
    void markDirty() { core.markDirty(); }

    //-------------------------------------------------------------- transport
    void play() { transport.playing.store (true); }
    void stopTransport() { transport.playing.store (false); }
    void rewind() { transport.pos.store (transport.looping.load() ? transport.loopStart.load() : 0); }
    void seek (int64 s) { transport.pos.store (std::max<int64> (0, s)); }

    //-------------------------------------------------------------- pistes brutes
    Track* createTrack (String name = {})
    {
        static const uint32 pal[] = { 0xffe0a53a, 0xff4ea3e6, 0xff7fd06b, 0xffd86f9a, 0xff9b82e6, 0xffe6784a, 0xff4ec9c0, 0xffc9c94e };
        auto t = std::make_unique<Track>();
        t->name = name.isEmpty() ? "Audio " + String ((int) tracks.size() + 1) : name;
        t->colour = Colour (pal[tracks.size() % 8]);
        auto s = std::make_unique<TrackSource> (transport);
        t->source = s.get();
        t->srcId = graph.addNode (std::move (s))->nodeID;
        auto f = std::make_unique<FaderProcessor> (&transport, false);
        t->fader = f.get();
        t->faderId = graph.addNode (std::move (f))->nodeID;
        tracks.push_back (std::move (t));
        refreshMix();
        rebuildConnections();
        return tracks.back().get();
    }
    Track* addTrack (String name = {}) { return createTrack (name); }
    void removeTrack (Track* t)
    {
        for (size_t i = 0; i < tracks.size(); ++i)
            if (tracks[i].get() == t)
            {
                for (auto& ins : t->inserts)
                {
                    if (onInsertRemoved) onInsertRemoved (ins.node->nodeID);
                    graph.removeNode (ins.node->nodeID);
                }
                graph.removeNode (t->srcId);
                graph.removeNode (t->faderId);
                tracks.erase (tracks.begin() + (long) i);
                break;
            }
        refreshMix();
        rebuildConnections();
    }
    void newProject()
    {
        stopTransport();
        transport.pos.store (0);
        core.resetTo (alpha::ProjectState(), "Nouveau projet");
        projectFile = File();
        projectRoot = appDataDir();
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Nouveau projet créé.");
    }
    void refreshMix()
    {
        const double rate = sr();
        bool anySolo = false;
        for (auto& t : tracks) anySolo = anySolo || t->solo;
        for (auto& t : tracks)
        {
            if (t->fader != nullptr)
            {
                t->fader->gain.store ((float) Decibels::decibelsToGain (t->volDb + t->sendDb, -60.0f));
                t->fader->pan.store (t->pan);
                t->fader->audible.store (! t->mute && (! anySolo || t->solo));
                t->fader->setMono (false);
                t->fader->setFx (t->fx, rate);
                t->fader->setAutomation (t->automation);
            }
            if (t->source != nullptr) t->source->setMidiNotes (t->midiNotes);
        }
        for (auto& b : buses)
        {
            b->fader->gain.store ((float) std::pow (10.0, b->volDb / 20.0));
            b->fader->pan.store ((float) b->pan);
            b->fader->audible.store (! b->mute);
            b->fader->setMono (false);
        }
        if (master != nullptr)
        {
            const double dim = core.state.controlRoom.dim ? -20.0 : 0.0;
            master->gain.store ((float) std::pow (10.0, (core.state.masterDb + core.state.controlRoom.monitorDb + dim) / 20.0));
            master->setMono (core.state.controlRoom.mono);
        }
    }

    //-------------------------------------------------------------- inserts VST3
    void addInsert (Track* t, const PluginDescription& d, std::function<void (const String&)> done, MemoryBlock state = MemoryBlock())
    {
        if (t->inserts.size() >= 6) { done (TR ("6 inserts maximum par piste")); return; }
        pluginFormats.createPluginInstanceAsync (d, sr(), bs(),
            [this, t, d, done, state] (std::unique_ptr<AudioPluginInstance> inst, const String& err)
            {
                if (inst == nullptr) { done (err.isEmpty() ? TR ("Plugin impossible à charger") : err); return; }
                if (! owns (t)) return;
                if (state.getSize() > 0) inst->setStateInformation (state.getData(), (int) state.getSize());
                Insert ins;
                ins.desc = d;
                ins.name = inst->getName();
                ins.node = graph.addNode (std::move (inst));
                t->inserts.push_back (ins);
                rebuildConnections();
                if (onChanged) onChanged();
                done ({});
            });
    }
    void removeInsert (Track* t, int idx)
    {
        if (idx < 0 || idx >= (int) t->inserts.size()) return;
        auto id = t->inserts[(size_t) idx].node->nodeID;
        if (onInsertRemoved) onInsertRemoved (id);
        t->inserts.erase (t->inserts.begin() + idx);
        graph.removeNode (id);
        rebuildConnections();
        if (onChanged) onChanged();
    }
    void rebuildConnections()
    {
        for (auto& c : graph.getConnections()) graph.removeConnection (c);
        for (auto& t : tracks)
        {
            auto prev = t->srcId;
            for (auto& ins : t->inserts) { stereo (prev, ins.node->nodeID); prev = ins.node->nodeID; }
            stereo (prev, t->faderId);
            const int bi = jlimit (0, (int) buses.size() - 1, t->bus);
            stereo (t->faderId, buses[(size_t) bi]->id);
        }
        for (auto& b : buses) stereo (b->id, masterId);
        stereo (masterId, outputId);
        for (int ch = 0; ch < 2; ++ch) graph.addConnection ({ { inputId, ch }, { recId, ch } });
    }

    //-------------------------------------------------------------- audio / clips
    bool loadClipAudio (const File& f, Clip& out, String& err)
    {
        std::unique_ptr<AudioFormatReader> r (basicFormats.createReaderFor (f));
        if (r == nullptr) { err = TR ("Format non reconnu : ") + f.getFileName(); return false; }
        const int ch = jmin (2, (int) r->numChannels), len = (int) r->lengthInSamples;
        AudioBuffer<float> in (ch, len);
        r->read (&in, 0, len, 0, true, true);
        auto buf = std::make_shared<AudioBuffer<float>>();
        if (std::abs (r->sampleRate - sr()) > 1.0)
        {
            const double ratio = r->sampleRate / sr();
            const int nl = (int) ((double) len / ratio);
            buf->setSize (ch, nl);
            for (int c = 0; c < ch; ++c)
            {
                LagrangeInterpolator li;
                li.process (ratio, in.getReadPointer (c), buf->getWritePointer (c), nl);
            }
        }
        else buf->makeCopyOf (in);
        out.name = f.getFileNameWithoutExtension();
        out.file = f;
        out.media = relativeMedia (f, effectiveRoot()).toStdString();
        out.data = buf;
        out.peaks = makePeaks (*buf);
        out.offset = 0;
        out.len = buf->getNumSamples();
        return true;
    }
    bool importAudio (Track* t, const File& f, int64 start, String& err)
    {
        Clip c;
        if (! loadClipAudio (f, c, err)) return false;
        c.start = start;
        const SpinLock::ScopedLockType sl (t->source->lock);
        t->source->clips.push_back (c);
        return true;
    }
    void splitClip (Track* t, int idx, int64 at)
    {
        if (idx < 0 || idx >= (int) t->source->clips.size()) return;
        Clip a = t->source->clips[(size_t) idx];
        if (at <= a.start + 256 || at >= a.start + a.len - 256) return;
        Clip b = a;
        b.id += "-b";
        b.start = at; b.offset = a.offset + (at - a.start); b.len = a.start + a.len - at;
        a.len = at - a.start;
        const SpinLock::ScopedLockType sl (t->source->lock);
        t->source->clips[(size_t) idx] = a;
        t->source->clips.push_back (b);
    }
    void duplicateClip (Track* t, int idx)
    {
        if (idx < 0 || idx >= (int) t->source->clips.size()) return;
        Clip c = t->source->clips[(size_t) idx];
        c.id += "-dup";
        c.start += c.len;
        const SpinLock::ScopedLockType sl (t->source->lock);
        t->source->clips.push_back (c);
    }
    void removeClip (Track* t, int idx)
    {
        if (idx < 0 || idx >= (int) t->source->clips.size()) return;
        const SpinLock::ScopedLockType sl (t->source->lock);
        t->source->clips.erase (t->source->clips.begin() + idx);
    }
    void setClipStart (Track* t, int idx, int64 s)
    {
        if (idx < 0 || idx >= (int) t->source->clips.size()) return;
        const SpinLock::ScopedLockType sl (t->source->lock);
        t->source->clips[(size_t) idx].start = std::max<int64> (0, s);
    }

    //-------------------------------------------------------------- enregistrement J3
    bool isRecording() const { return recording; }
    String startRecording (Track* target = nullptr)
    {
        if (recording) return {};
        if (tracks.empty())
        {
            alpha::JsonValue p (alpha::JsonValue::Type::Object);
            p["name"] = alpha::JsonValue ("Audio 1");
            core.command ("addTrack", p);
            applyCoreState (true);
        }
        if (target == nullptr)
        {
            for (size_t i = 0; i < core.state.tracks.size() && i < tracks.size(); ++i)
                if (core.state.tracks[i].arm) { target = tracks[i].get(); break; }
        }
        if (target == nullptr && ! tracks.empty()) target = tracks.front().get();
        if (! owns (target)) return TR ("Piste d'enregistrement invalide");

        const double bpm = transport.bpm.load(), rate = sr();
        const double spb = alphaSamplesPerBar (bpm, rate);
        const bool punch = core.state.punchEnabled;
        const int64 gateStart = punch ? alphaBarsToSamples (core.state.punchInBars, bpm, rate) : transport.pos.load();
        const int64 gateEnd = punch ? alphaBarsToSamples (core.state.punchOutBars, bpm, rate) : std::numeric_limits<int64>::max() / 4;
        const int64 precountSamples = (int64) (core.state.precountBars * spb);
        const int64 startPos = std::max<int64> (0, gateStart - precountSamples);
        recLatencySamples = (int64) (core.state.latencyMs * rate / 1000.0);

        auto dir = File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("ALPHA Studio").getChildFile ("Prises");
        dir.createDirectory();
        recFile = dir.getNonexistentChildFile ("Prise-" + Time::getCurrentTime().formatted ("%Y%m%d-%H%M%S"), ".wav");
        if (! recorder->start (recFile, rate)) return TR ("Impossible de créer le fichier d'enregistrement");
        recorder->setGate (true, gateStart, gateEnd);
        recStart = std::max<int64> (0, gateStart - recLatencySamples);
        recTrack = target;
        recPunchEnd = gateEnd;
        recPrecountEnd = gateStart;
        recSavedMetro = transport.metronome.load();
        for (auto& t : tracks) t->source->setPrecountEnd (recPrecountEnd);
        transport.metronome.store (true); // décompte audible
        transport.pos.store (startPos);
        recording = true;
        play();
        lastStatus = punch ? TR ("Enregistrement punch in/out armé.") : TR ("Enregistrement armé.");
        return {};
    }
    String stopRecording()
    {
        if (! recording) return {};
        recording = false;
        stopTransport();
        recorder->stop();
        recorder->setGate (false, 0, std::numeric_limits<int64>::max() / 4);
        for (auto& t : tracks) { t->source->setPrecountEnd (0); t->source->clearLiveNotes(); }
        transport.metronome.store (recSavedMetro);
        String err;
        if (owns (recTrack))
        {
            if (! importAudio (recTrack, recFile, recStart, err)) return err;
            auto& cl = recTrack->source->clips.back();
            cl.name = TR ("Prise ") + String ((int) recTrack->source->clips.size());
            const double bpm = transport.bpm.load(), rate = sr();
            alpha::JsonValue add (alpha::JsonValue::Type::Object);
            add["trackIndex"] = alpha::JsonValue ((int) (std::find_if (tracks.begin(), tracks.end(), [this] (const std::unique_ptr<Track>& t) { return t.get() == recTrack; }) - tracks.begin()));
            add["name"] = alpha::JsonValue (cl.name.toStdString());
            add["media"] = alpha::JsonValue (cl.media.toStdString());
            add["startBars"] = alpha::JsonValue (alphaSamplesToBars (cl.start, bpm, rate));
            add["lenBars"] = alpha::JsonValue (alphaSamplesToBarLength (cl.len, bpm, rate));
            core.command ("addClip", add);
            applyCoreState (true);
            markDirty();
            lastStatus = TR ("Prise importée, latence compensée.");
        }
        return err;
    }
    void recordingTick()
    {
        if (recording && recPunchEnd < std::numeric_limits<int64>::max() / 8 && transport.pos.load() >= recPunchEnd)
            stopRecording();
    }
    void handleMidiNote (int trackIndex, int pitch, int velocity, bool on)
    {
        if (! isPositiveAndBelow (trackIndex, (int) tracks.size())) return;
        tracks[(size_t) trackIndex]->source->handleMidi (pitch, velocity, on, sr());
    }

    //-------------------------------------------------------------- rendu WAV J5
    void beginOffline()
    {
        stopTransport();
        deviceManager.removeAudioCallback (&player);
        savedLoop = transport.looping.load();
        savedMetro = transport.metronome.load();
        savedPos = transport.pos.load();
        savedPlaying = transport.playing.load();
        transport.looping.store (false);
        transport.metronome.store (false);
        graph.prepareToPlay (sr(), bs());
    }
    bool renderOffline (const File& f, std::function<bool (double)> progress)
    {
        return renderOffline (f, 48000.0, 24, std::move (progress), -1);
    }
    bool renderOffline (const File& f, double targetRate, int bitDepth,
                        std::function<bool (double)> progress, int onlyTrack = -1)
    {
        const int block = bs();
        f.deleteFile();
        std::unique_ptr<FileOutputStream> os (f.createOutputStream());
        if (os == nullptr) return false;
        WavAudioFormat wav;
        std::unique_ptr<AudioFormatWriter> w (wav.createWriterFor (os.get(), targetRate, 2, bitDepth, {}, 0));
        if (w == nullptr) return false;
        os.release();

        if (onlyTrack >= 0)
            for (size_t i = 0; i < tracks.size(); ++i) tracks[i]->fader->audible.store ((int) i == onlyTrack);

        const int chans = jmax (2, graph.getTotalNumInputChannels(), graph.getTotalNumOutputChannels());
        AudioBuffer<float> buffer (chans, block);
        const double ratio = jmax (0.1, sr() / jmax (8000.0, targetRate));
        const int outBlock = jmax (1, (int) ((block - 4) / ratio));
        AudioBuffer<float> out (2, outBlock);
        std::array<LagrangeInterpolator, 2> interp;
        for (auto& i : interp) i.reset();
        MidiBuffer midi;
        const int64 end = projectLength() + (int64) (3.0 * sr());
        transport.pos.store (0);
        transport.playing.store (true);
        bool ok = true;
        uint32_t ditherSeed = 0x12345678u;
        while (transport.pos.load() < end)
        {
            buffer.clear();
            graph.processBlock (buffer, midi);
            out.clear();
            for (int ch = 0; ch < 2; ++ch)
            {
                interp[(size_t) ch].process (ratio, buffer.getReadPointer (ch), out.getWritePointer (ch), outBlock);
                for (int i = 0; i < outBlock; ++i) out.addSample (ch, i, alpha::triangularDither (ditherSeed));
            }
            if (! w->writeFromAudioSampleBuffer (out, 0, outBlock)) { ok = false; break; }
            if (progress && ! progress ((double) transport.pos.load() / (double) std::max<int64> (1, end))) { ok = false; break; }
        }
        transport.playing.store (false);
        w.reset();
        if (onlyTrack >= 0) refreshMix();
        if (! ok) f.deleteFile();
        return ok;
    }
    void endOffline()
    {
        graph.releaseResources();
        transport.playing.store (savedPlaying);
        transport.pos.store (savedPos);
        transport.looping.store (savedLoop);
        transport.metronome.store (savedMetro);
        refreshMix();
        deviceManager.addAudioCallback (&player);
    }

    //-------------------------------------------------------------- projet / médias
    void applyCoreState (bool structural)
    {
        core.state.videoEnabled = false;
        transport.bpm.store (core.state.bpm);
        transport.looping.store (core.state.looping);
        transport.metronome.store (core.state.metronome);
        transport.loopStart.store (alphaBarsToSamples (core.state.loopStartBars, core.state.bpm, sr()));
        transport.loopEnd.store (alphaBarsToSamples (core.state.loopEndBars, core.state.bpm, sr()));
        masterDb = (float) core.state.masterDb;

        while (tracks.size() < core.state.tracks.size()) createTrack();
        while (tracks.size() > core.state.tracks.size()) removeTrack (tracks.back().get());
        for (size_t i = 0; i < tracks.size(); ++i)
        {
            const auto& cs = core.state.tracks[i];
            auto* t = tracks[i].get();
            t->name = alphaString (cs.name);
            t->colour = alphaColourFromHex (alphaString (cs.colour));
            t->volDb = (float) cs.volumeDb;
            t->pan = (float) cs.pan;
            t->mute = cs.mute; t->solo = cs.solo; t->arm = cs.arm; t->instrument = cs.instrument;
            t->bus = cs.bus; t->sendDb = (float) cs.sendDb;
            t->fx = cs.fx;
            t->automation = cs.automation;
            t->midiNotes = cs.midiNotes;
        }
        for (size_t i = 0; i < buses.size() && i < core.state.buses.size(); ++i)
        {
            buses[i]->name = alphaString (core.state.buses[i].name);
            buses[i]->volDb = core.state.buses[i].volumeDb;
            buses[i]->pan = core.state.buses[i].pan;
            buses[i]->mute = core.state.buses[i].mute;
        }
        if (structural) syncClipsFromCore();
        refreshMix();
        rebuildConnections();
    }
    void syncClipsFromCore()
    {
        const double bpm = core.state.bpm, rate = sr();
        for (size_t ti = 0; ti < tracks.size() && ti < core.state.tracks.size(); ++ti)
        {
            auto* source = tracks[ti]->source;
            const SpinLock::ScopedLockType sl (source->lock);
            source->clips.clear();
            source->midiNotes = core.state.tracks[ti].midiNotes;
            for (const auto& cc : core.state.tracks[ti].clips)
            {
                const File f = resolveMedia (alphaString (cc.media), effectiveRoot());
                if (! f.existsAsFile()) continue;
                Clip c; String err;
                if (! loadClipAudio (f, c, err)) continue;
                c.id = alphaString (cc.id);
                c.name = alphaString (cc.name);
                c.media = cc.media;
                c.start = alphaBarsToSamples (cc.startBars, bpm, rate);
                c.offset = alphaBarLengthToSamples (cc.offsetBars, bpm, rate);
                c.len = alphaBarLengthToSamples (cc.lenBars, bpm, rate);
                c.len = std::min (c.len, (int64) std::max<int64> ((int64) 0, (int64) c.data->getNumSamples() - c.offset));
                c.loop = cc.loop;
                if (c.len > 0) source->clips.push_back (c);
            }
        }
    }
    void syncCoreFromEngine (const String& label)
    {
        alpha::ProjectState s = core.state;
        s.tracks.clear();
        const double bpm = transport.bpm.load(), rate = sr();
        s.bpm = bpm;
        s.masterDb = masterDb;
        s.looping = transport.looping.load();
        s.metronome = transport.metronome.load();
        s.loopStartBars = alphaSamplesToBars (transport.loopStart.load(), bpm, rate);
        s.loopEndBars = alphaSamplesToBars (transport.loopEnd.load(), bpm, rate);
        for (size_t ti = 0; ti < tracks.size(); ++ti)
        {
            auto* t = tracks[ti].get();
            alpha::TrackState ts;
            ts.id = "native_" + std::to_string (ti);
            ts.name = t->name.toStdString();
            ts.colour = alphaColourToHex (t->colour).toStdString();
            ts.volumeDb = t->volDb; ts.pan = t->pan;
            ts.mute = t->mute; ts.solo = t->solo; ts.arm = t->arm; ts.instrument = t->instrument;
            ts.bus = t->bus; ts.sendDb = t->sendDb;
            ts.fx = t->fx; ts.automation = t->automation; ts.midiNotes = t->midiNotes;
            for (const auto& c : t->source->clips)
            {
                alpha::AudioClip ac;
                ac.id = c.id.toStdString();
                ac.name = c.name.toStdString();
                ac.media = c.media.toStdString();
                ac.startBars = alphaSamplesToBars (c.start, bpm, rate);
                ac.lenBars = alphaSamplesToBarLength (c.len, bpm, rate);
                ac.offsetBars = alphaSamplesToBarLength (c.offset, bpm, rate);
                ac.loop = c.loop;
                ts.clips.push_back (ac);
            }
            s.tracks.push_back (ts);
        }
        s.normaliseMedia();
        core.resetTo (s, label.toStdString());
    }

    //-------------------------------------------------------------- E/S .alphaproj
    alpha::ProjectState portableState (const File& destination, bool copyMedia, const File& sourceRoot) const
    {
        auto s = core.state;
        auto mediaDir = destination.getChildFile ("Media");
        if (copyMedia) mediaDir.createDirectory();
        for (auto& t : s.tracks)
            for (auto& c : t.clips)
            {
                if (c.media.empty()) continue;
                const File src = resolveMedia (alphaString (c.media), sourceRoot);
                if (! src.existsAsFile()) continue;
                if (copyMedia)
                {
                    const File dst = mediaDir.getChildFile (src.getFileName());
                    if (src != dst) src.copyFileTo (dst);
                    c.media = relativeMedia (dst, destination).toStdString();
                }
                else if (! src.isAChildOf (destination))
                    c.media = src.getFullPathName().toStdString();
            }
        s.media.clear();
        for (const auto& t : s.tracks)
            for (const auto& c : t.clips)
                if (! c.media.empty() && std::find (s.media.begin(), s.media.end(), c.media) == s.media.end())
                    s.media.push_back (c.media);
        s.videoEnabled = false;
        return s;
    }
    bool writeState (const File& f, bool copyMedia, bool markSavedState)
    {
        f.getParentDirectory().createDirectory();
        const File sourceRoot = effectiveRoot();
        const auto doc = portableState (f.getParentDirectory(), copyMedia, sourceRoot);
        if (! f.replaceWithText (alphaString (alpha::stateToJson (doc).dump()))) return false;
        if (markSavedState) core.markSaved();
        return true;
    }
    bool saveProjectJson (const File& f)
    {
        const File oldRoot = effectiveRoot();
        const auto doc = portableState (f.getParentDirectory(), true, oldRoot);
        f.getParentDirectory().createDirectory();
        if (! f.replaceWithText (alphaString (alpha::stateToJson (doc).dump()))) return false;
        projectRoot = f.getParentDirectory();
        projectFile = f;
        core.markSaved();
        lastStatus = TR ("Projet .alphaproj enregistré avec ses médias.");
        return true;
    }
    bool loadProjectJson (const File& f)
    {
        if (! core.load (f.loadFileAsString().toStdString())) return false;
        projectRoot = f.getParentDirectory();
        projectFile = f;
        applyCoreState (true);
        core.markSaved();
        lastStatus = TR ("Projet .alphaproj chargé.");
        return true;
    }
    File autosaveFile() const { return appDataDir().getChildFile ("Autosave.alphaproj"); }
    bool hasAutosave() const { return autosaveFile().existsAsFile(); }
    void autosaveTick (bool force)
    {
        if (! force && (! core.dirty || ! core.state.preferences.autoSave)) return;
        const double now = Time::getMillisecondCounterHiRes();
        if (! force && now - lastAutosaveMs < core.state.preferences.autoSaveSeconds * 1000.0) return;
        lastAutosaveMs = now;
        if (writeState (autosaveFile(), false, false)) lastStatus = TR ("Autosauvegarde .alphaproj écrite.");
    }
    bool restoreAutosave()
    {
        if (! loadProjectJson (autosaveFile())) return false;
        projectFile = File();
        projectRoot = appDataDir();
        lastStatus = TR ("Autosauvegarde restaurée.");
        markDirty();
        return true;
    }
    bool backupProject()
    {
        auto dir = appDataDir().getChildFile ("Backups");
        dir.createDirectory();
        const File f = dir.getNonexistentChildFile ("Projet-" + Time::getCurrentTime().formatted ("%Y%m%d-%H%M%S"), ".alphaproj");
        if (! writeState (f, true, false)) return false;
        lastStatus = TR ("Sauvegarde de secours créée : ") + f.getFullPathName();
        return true;
    }
    String importAudioData (const String& name, const String& base64, double startBars)
    {
        const auto bytes = alpha::base64Decode (base64.toStdString());
        if (bytes.empty()) return TR ("Fichier importé vide");
        auto dir = effectiveRoot().getChildFile ("Media");
        dir.createDirectory();
        const String clean = name.removeCharacters ("\\/:*?\"<>|");
        File f = dir.getNonexistentChildFile (clean.isEmpty() ? "Import" : clean, ".wav");
        FileOutputStream os (f);
        if (! os.openedOk() || ! os.write (bytes.data(), bytes.size())) return TR ("Écriture du média impossible");
        os.flush();
        Clip probe; String err;
        if (! loadClipAudio (f, probe, err)) return err;
        alpha::JsonValue addTrack (alpha::JsonValue::Type::Object);
        addTrack["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
        core.command ("addTrack", addTrack);
        alpha::JsonValue addClip (alpha::JsonValue::Type::Object);
        addClip["trackIndex"] = alpha::JsonValue ((int) core.state.tracks.size() - 1);
        addClip["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
        addClip["media"] = alpha::JsonValue (relativeMedia (f, effectiveRoot()).toStdString());
        addClip["startBars"] = alpha::JsonValue (jmax (1.0, startBars));
        addClip["lenBars"] = alpha::JsonValue (alphaSamplesToBarLength (probe.len, core.state.bpm, sr()));
        core.command ("addClip", addClip);
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Audio importé par glisser-déposer.");
        return {};
    }
    bool importProjectData (const String& base64)
    {
        const auto text = alpha::base64Decode (base64.toStdString());
        if (! core.load (text)) return false;
        projectRoot = appDataDir();
        projectFile = File();
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Document de projet importé.");
        return true;
    }
    String importMidiData (const String& base64, int trackIndex, double startBars)
    {
        const auto bytes = alpha::base64Decode (base64.toStdString());
        const auto parsed = alpha::parseSmf (bytes);
        if (! parsed.error.empty()) return alphaString (parsed.error);
        if (core.state.tracks.empty())
        {
            alpha::JsonValue addTrack (alpha::JsonValue::Type::Object);
            addTrack["name"] = alpha::JsonValue ("Instrument MIDI");
            core.command ("addTrack", addTrack);
        }
        trackIndex = jlimit (0, (int) core.state.tracks.size() - 1, trackIndex);
        alpha::JsonValue p (alpha::JsonValue::Type::Object);
        p["trackIndex"] = alpha::JsonValue (trackIndex);
        alpha::JsonValue notes (alpha::JsonValue::Type::Array);
        const double shift = jmax (1.0, startBars) - 1.0;
        for (const auto& n : parsed.notes)
        {
            alpha::JsonValue k (alpha::JsonValue::Type::Object);
            k["startBars"] = alpha::JsonValue (n.startBars + shift);
            k["lenBars"] = alpha::JsonValue (n.lenBars);
            k["pitch"] = alpha::JsonValue (n.pitch);
            k["velocity"] = alpha::JsonValue (n.velocity);
            k["on"] = alpha::JsonValue (n.on);
            notes.array.push_back (k);
        }
        p["notes"] = notes;
        if (! core.command ("setMidiNotes", p)) return alphaString (core.lastError);
        applyCoreState (false);
        markDirty();
        lastStatus = TR ("Fichier MIDI importé : ") + String ((int) parsed.notes.size()) + TR (" note(s).");
        return {};
    }
    String exportMidiData (int trackIndex) const
    {
        if (core.state.tracks.empty()) return {};
        trackIndex = jlimit (0, (int) core.state.tracks.size() - 1, trackIndex);
        return alphaString (alpha::base64Encode (alpha::makeSmf (core.state.tracks[(size_t) trackIndex].midiNotes)));
    }

    //-------------------------------------------------------------- projet démo
    bool writeDemoWav (const File& f, std::function<void (float*, float*, int, double)> fill)
    {
        const int N = (int) (16.0 * sr());
        AudioBuffer<float> b (2, N);
        b.clear();
        fill (b.getWritePointer (0), b.getWritePointer (1), N, sr());
        f.deleteFile();
        std::unique_ptr<FileOutputStream> os (f.createOutputStream());
        if (os == nullptr) return false;
        WavAudioFormat wav;
        std::unique_ptr<AudioFormatWriter> w (wav.createWriterFor (os.get(), sr(), 2, 24, {}, 0));
        if (w == nullptr) return false;
        os.release();
        const bool ok = w->writeFromAudioSampleBuffer (b, 0, N);
        w.reset();
        return ok;
    }
    void generateDemoMedia()
    {
        projectRoot = appDataDir();
        auto media = projectRoot.getChildFile ("Media");
        media.createDirectory();
        Random rng (7);
        writeDemoWav (media.getChildFile ("Beat 120.wav"), [&] (float* l, float* r, int N, double s)
        {
            for (int bt = 0; bt < 32; ++bt)
            {
                const int s0 = (int) (bt * 0.5 * s); double ph = 0;
                for (int i = 0; i < (int) (0.3 * s) && s0 + i < N; ++i)
                {
                    const double t = i / s; ph += MathConstants<double>::twoPi * (45.0 + 90.0 * std::exp (-28.0 * t)) / s;
                    const float v = (float) (std::sin (ph) * std::exp (-9.0 * t) * 0.5);
                    l[s0 + i] += v; r[s0 + i] += v;
                }
                if (bt % 2 == 1)
                    for (int i = 0; i < (int) (0.2 * s) && s0 + i < N; ++i)
                    {
                        const float v = (rng.nextFloat() * 2 - 1) * (float) std::exp (-22.0 * i / s) * 0.3f;
                        l[s0 + i] += v; r[s0 + i] += v;
                    }
                const int sh = s0 + (int) (0.25 * s);
                for (int i = 0; i < (int) (0.05 * s) && sh + i < N; ++i)
                {
                    const float v = (rng.nextFloat() * 2 - 1) * (float) std::exp (-70.0 * i / s) * 0.12f;
                    l[sh + i] += v; r[sh + i] += v;
                }
            }
        });
        writeDemoWav (media.getChildFile ("Ligne de basse.wav"), [&] (float* l, float* r, int N, double s)
        {
            const double roots[] = { 55.0, 43.65, 65.41, 49.0 };
            for (int k = 0; k < 64; ++k)
            {
                const double f = roots[(k / 16) % 4] * (k % 4 == 3 ? 2.0 : 1.0);
                const int s0 = (int) (k * 0.25 * s); double ph = 0, lp = 0;
                for (int i = 0; i < (int) (0.23 * s) && s0 + i < N; ++i)
                {
                    ph = std::fmod (ph + f / s, 1.0);
                    const double v = (ph * 2 - 1) * std::exp (-7.0 * i / s) * 0.45;
                    lp += (v - lp) * 0.14;
                    const float out = (float) (lp * 1.3);
                    l[s0 + i] += out; r[s0 + i] += out;
                }
            }
        });
        writeDemoWav (media.getChildFile ("Accords Am F C G.wav"), [&] (float* l, float* r, int N, double s)
        {
            const double ch[4][3] = { { 220, 261.63, 329.63 }, { 174.61, 220, 261.63 }, { 261.63, 329.63, 392 }, { 196, 246.94, 293.66 } };
            for (int c = 0; c < 4; ++c) for (int n = 0; n < 3; ++n)
            {
                const int s0 = (int) (c * 4 * s);
                for (int i = 0; i < (int) (4.6 * s) && s0 + i < N; ++i)
                {
                    const double t = i / s, env = jmin (1.0, t / 0.7) * jmin (1.0, jmax (0.0, (4.6 - t) / 0.8));
                    const float out = (float) (std::sin (MathConstants<double>::twoPi * ch[c][n] * t) * env * 0.06);
                    l[s0 + i] += out; r[s0 + i] += out;
                }
            }
        });
        writeDemoWav (media.getChildFile ("Arpège pentatonique.wav"), [&] (float* l, float* r, int N, double s)
        {
            const double pent[] = { 440, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25 };
            for (int k = 0; k < 80; ++k)
            {
                const double f = pent[(k * 3) % 8] * (k % 16 >= 8 ? 1.5 : 1.0);
                const int s0 = (int) (k * 0.125 * s);
                for (int i = 0; i < (int) (0.2 * s) && s0 + i < N; ++i)
                {
                    const double t = i / s;
                    const float out = (float) (std::sin (MathConstants<double>::twoPi * f * t) * std::exp (-16.0 * t) * 0.25);
                    l[s0 + i] += out; r[s0 + i] += out;
                }
            }
        });
    }
    void loadDemo()
    {
        newProject();
        generateDemoMedia();
        core.resetTo (alpha::templateState ("Démo 4 pistes"), "Modèle : Démo 4 pistes");
        projectRoot = appDataDir();
        projectFile = File();
        applyCoreState (true);
        core.markSaved();
        transport.bpm.store (120.0);
        transport.looping.store (true);
        transport.loopStart.store (0);
        transport.loopEnd.store (alphaBarsToSamples (9.0, 120.0, sr()));
        lastStatus = TR ("Démo 4 pistes chargée : Espace pour écouter.");
        if (onChanged) onChanged();
    }
    bool loadTemplate (const String& name)
    {
        const File custom = templatesDir().getChildFile (name.removeCharacters ("\\/:*?\"<>|")).withFileExtension (".alphaproj");
        if (custom.existsAsFile()) return loadTemplateFile (custom);
        if (name == "Démo 4 pistes") { loadDemo(); return true; }
        alpha::JsonValue p (alpha::JsonValue::Type::Object);
        p["name"] = alpha::JsonValue (name.toStdString());
        if (! core.command ("applyTemplate", p)) return false;
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Modèle chargé : ") + name;
        return true;
    }

    //-------------------------------------------------------------- carte son / plugins
    void saveAudioState()
    {
        if (auto xml = deviceManager.createStateXml()) xml->writeTo (appDataDir().getChildFile ("audio.xml"));
    }
    String deviceInfo() const
    {
        if (auto* d = deviceManager.getCurrentAudioDevice())
            return d->getTypeName() + " : " + d->getName() + String::formatted (" | %.0f Hz | %d ech. | latence %.1f ms", d->getCurrentSampleRate(), d->getCurrentBufferSizeSamples(),
                                                                                1000.0 * (double) (d->getCurrentBufferSizeSamples() + d->getOutputLatencyInSamples()) / d->getCurrentSampleRate());
        return TR ("Aucune carte son active");
    }
    File appDataDir() const
    {
        auto d = File::getSpecialLocation (File::userApplicationDataDirectory).getChildFile ("ALPHA Studio");
        d.createDirectory();
        return d;
    }
    File effectiveRoot() const { return projectRoot != File() ? projectRoot : appDataDir(); }
    File resolveMedia (const String& media, const File& root) const
    {
        if (media.isEmpty()) return {};
        File direct (media);
        if (direct.existsAsFile()) return direct;
        const File inRoot = root.getChildFile (media);
        if (inRoot.existsAsFile()) return inRoot;
        const File inApp = appDataDir().getChildFile (media);
        if (inApp.existsAsFile()) return inApp;
        return {};
    }
    String relativeMedia (const File& f, const File& root) const
    {
        if (f == File()) return {};
        if (f.isAChildOf (root)) return f.getRelativePathFrom (root);
        return f.getFullPathName();
    }
    void loadKnownPlugins()
    {
        if (auto xml = parseXML (appDataDir().getChildFile ("plugins.xml"))) knownPlugins.recreateFromXml (*xml);
    }
    void saveKnownPlugins()
    {
        if (auto xml = knownPlugins.createXml()) xml->writeTo (appDataDir().getChildFile ("plugins.xml"));
    }

    //-------------------------------------------------------------- .alpha historique
    bool saveProject (const File& f)
    {
        XmlElement root ("ALPHAPROJECT");
        root.setAttribute ("bpm", transport.bpm.load());
        root.setAttribute ("master", (double) masterDb);
        for (auto& t : tracks)
        {
            auto* te = root.createNewChildElement ("TRACK");
            te->setAttribute ("name", t->name);
            te->setAttribute ("colour", t->colour.toString());
            te->setAttribute ("vol", (double) t->volDb);
            te->setAttribute ("pan", (double) t->pan);
            te->setAttribute ("mute", t->mute);
            te->setAttribute ("solo", t->solo);
            te->setAttribute ("arm", t->arm);
            te->setAttribute ("bus", t->bus);
            te->setAttribute ("send", (double) t->sendDb);
            for (auto& ins : t->inserts)
            {
                auto* ie = te->createNewChildElement ("INSERT");
                if (auto x = ins.desc.createXml()) ie->addChildElement (x.release());
                MemoryBlock mb;
                ins.node->getProcessor()->getStateInformation (mb);
                ie->setAttribute ("state", mb.toBase64Encoding());
            }
            for (auto& c : t->source->clips)
            {
                auto* ce = te->createNewChildElement ("CLIP");
                ce->setAttribute ("file", c.file.getFullPathName());
                ce->setAttribute ("media", c.media);
                ce->setAttribute ("name", c.name);
                ce->setAttribute ("id", c.id);
                ce->setAttribute ("start", (double) c.start);
                ce->setAttribute ("offset", (double) c.offset);
                ce->setAttribute ("len", (double) c.len);
                ce->setAttribute ("loop", c.loop);
            }
        }
        const bool ok = root.writeTo (f);
        if (ok) { projectFile = f; projectRoot = f.getParentDirectory(); core.markSaved(); lastStatus = TR ("Projet .alpha enregistré."); }
        return ok;
    }
    String loadProject (const File& f)
    {
        auto xml = parseXML (f);
        if (xml == nullptr || xml->getTagName() != "ALPHAPROJECT") return TR ("Fichier de projet invalide");
        newProject();
        projectRoot = f.getParentDirectory();
        transport.bpm.store (xml->getDoubleAttribute ("bpm", 120.0));
        masterDb = (float) xml->getDoubleAttribute ("master", 0.0);
        String missing;
        for (auto* te : xml->getChildWithTagNameIterator ("TRACK"))
        {
            auto* t = createTrack (te->getStringAttribute ("name"));
            t->colour = Colour::fromString (te->getStringAttribute ("colour", t->colour.toString()));
            t->volDb = (float) te->getDoubleAttribute ("vol", -6.0);
            t->pan = (float) te->getDoubleAttribute ("pan", 0.0);
            t->mute = te->getBoolAttribute ("mute");
            t->solo = te->getBoolAttribute ("solo");
            t->arm = te->getBoolAttribute ("arm");
            t->bus = jlimit (0, 3, te->getIntAttribute ("bus", 0));
            t->sendDb = (float) te->getDoubleAttribute ("send", 0.0);
            for (auto* ce : te->getChildWithTagNameIterator ("CLIP"))
            {
                const String path = ce->getStringAttribute ("file");
                Clip c; String err;
                if (! loadClipAudio (File (path), c, err)) { missing += err + "\n"; continue; }
                c.name = ce->getStringAttribute ("name", c.name);
                c.id = ce->getStringAttribute ("id");
                c.media = ce->getStringAttribute ("media", c.media).toStdString();
                c.start = (int64) ce->getDoubleAttribute ("start");
                c.offset = (int64) ce->getDoubleAttribute ("offset");
                c.len = jmin ((int64) ce->getDoubleAttribute ("len"), (int64) c.data->getNumSamples() - c.offset);
                c.loop = ce->getBoolAttribute ("loop");
                t->source->clips.push_back (c);
            }
            auto list = std::make_shared<std::vector<std::pair<PluginDescription, MemoryBlock>>>();
            for (auto* ie : te->getChildWithTagNameIterator ("INSERT"))
            {
                PluginDescription d;
                if (ie->getFirstChildElement() != nullptr && d.loadFromXml (*ie->getFirstChildElement()))
                {
                    MemoryBlock mb; mb.fromBase64Encoding (ie->getStringAttribute ("state"));
                    list->emplace_back (d, mb);
                }
            }
            restoreInserts (t, list, 0);
        }
        syncCoreFromEngine ("Ouverture .alpha");
        projectFile = f;
        projectRoot = f.getParentDirectory();
        refreshMix();
        core.markSaved();
        lastStatus = TR ("Projet .alpha chargé.");
        if (onChanged) onChanged();
        return missing;
    }

    //-------------------------------------------------------------- commandes WebView2
    String command (const String& name, const String& payloadText)
    {
        std::string err;
        alpha::JsonValue p = alpha::JsonValue::parse (payloadText.toStdString(), err);
        if (! err.empty()) { lastStatus = alphaString ("JSON invalide : " + err); return lastStatus; }
        const std::string cmd = name.toStdString();

        if (cmd == "getState" || cmd == "getHistory") return {};
        if (cmd == "play") { play(); lastStatus = TR ("Lecture."); return {}; }
        if (cmd == "stop")
        {
            if (isRecording()) { const auto e = stopRecording(); if (e.isNotEmpty()) { lastStatus = e; return e; } }
            else stopTransport();
            lastStatus = TR ("Arrêt.");
            return {};
        }
        if (cmd == "record")
        {
            if (isRecording()) { const auto e = stopRecording(); if (e.isNotEmpty()) { lastStatus = e; return e; } }
            else { const auto e = startRecording (nullptr); if (e.isNotEmpty()) { lastStatus = e; return e; } }
            return {};
        }
        if (cmd == "seek") { seek (alphaBarsToSamples (alpha::jNumber (p, "bars", 1.0), transport.bpm.load(), sr())); return {}; }
        if (cmd == "tempo") return dispatchCore ("setTempo", p, false);
        if (cmd == "newProject") { newProject(); return {}; }
        if (cmd == "loadDemo") { loadDemo(); return {}; }
        if (cmd == "cycle") { alpha::JsonValue q = p; q["enabled"] = alpha::JsonValue (alpha::jBool (p, "enabled", ! transport.looping.load())); return dispatchCore ("setLoop", q, false); }
        if (cmd == "metronome")
        {
            core.state.metronome = alpha::jBool (p, "enabled", ! transport.metronome.load());
            core.markDirty();
            transport.metronome.store (core.state.metronome);
            lastStatus = core.state.metronome ? TR ("Métronome activé.") : TR ("Métronome désactivé.");
            return {};
        }
        if (cmd == "newFromTemplate" || cmd == "applyTemplate" || cmd == "loadTemplate")
        {
            const auto t = alphaString (alpha::jString (p, "name", "Vide"));
            if (! loadTemplate (t)) { lastStatus = TR ("Modèle inconnu"); return lastStatus; }
            return {};
        }
        if (cmd == "setTrack")
        {
            alpha::JsonValue q = p;
            const auto field = alpha::jString (p, "field");
            if (field == "rec") q["field"] = alpha::JsonValue ("arm");
            else if (field == "db" || field == "volume") q["field"] = alpha::JsonValue ("volumeDb");
            return dispatchCore ("setTrack", q, false);
        }
        if (cmd == "midiNote")
        {
            handleMidiNote (alpha::jInt (p, "trackIndex", 0), alpha::jInt (p, "pitch", 60), alpha::jInt (p, "velocity", 0),
                            alpha::jBool (p, "on", alpha::jNumber (p, "command", 0) != 0x80 && alpha::jInt (p, "velocity", 0) > 0));
            return {};
        }
        if (cmd == "midiCC")
        {
            alpha::JsonValue q (alpha::JsonValue::Type::Object);
            q["index"] = alpha::JsonValue (alpha::jInt (p, "trackIndex", 0));
            const int cc = alpha::jInt (p, "cc", -1);
            if (cc == 7) { q["field"] = alpha::JsonValue ("volumeDb"); q["value"] = alpha::JsonValue (-60.0 + alpha::jNumber (p, "value", 0) / 127.0 * 72.0); }
            else if (cc == 10) { q["field"] = alpha::JsonValue ("pan"); q["value"] = alpha::JsonValue (alpha::jNumber (p, "value", 64) / 63.5 - 1.0); }
            else { lastStatus = TR ("Contrôleur MIDI ignoré : ") + String (cc); return {}; }
            return dispatchCore ("setTrack", q, false);
        }
        if (cmd == "uiControl") return dispatchUiControl (p);
        if (cmd == "autosave") { autosaveTick (true); return {}; }
        if (cmd == "restoreAutosave") { if (! restoreAutosave()) { lastStatus = TR ("Aucune autosauvegarde"); return lastStatus; } return {}; }
        if (cmd == "backupProject") { if (! backupProject()) { lastStatus = TR ("Sauvegarde de secours impossible"); return lastStatus; } return {}; }
        if (cmd == "importAudioData")
        {
            const auto e = importAudioData (alphaString (alpha::jString (p, "name", "Import.wav")),
                                            alphaString (alpha::jString (p, "base64")),
                                            alpha::jNumber (p, "startBars", alphaSamplesToBars (transport.pos.load(), transport.bpm.load(), sr())));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "importProjectData")
        {
            if (! importProjectData (alphaString (alpha::jString (p, "base64")))) { lastStatus = alphaString (core.lastError); return lastStatus; }
            return {};
        }
        if (cmd == "importMidiData")
        {
            const auto e = importMidiData (alphaString (alpha::jString (p, "base64")),
                                           alpha::jInt (p, "trackIndex", 0),
                                           alpha::jNumber (p, "startBars", 1.0));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "setStatus") { lastStatus = alphaString (alpha::jString (p, "status", "Commande exécutée.")); return {}; }
        if (cmd == "setVideoEnabled") { lastStatus = TR ("Vidéo verrouillée : ajout prévu après le test final confirmé."); return lastStatus; }
        if (cmd == "quit") return {};

        const bool structural = needsStructural (cmd);
        return dispatchCore (cmd, p, structural);
    }

    std::string stateJson() const
    {
        auto j = core.apiState();
        j["positionBars"] = alpha::JsonValue (alphaSamplesToBars (transport.pos.load(), transport.bpm.load(), sr()));
        j["playing"] = alpha::JsonValue (transport.playing.load());
        j["recording"] = alpha::JsonValue (isRecording());
        j["looping"] = alpha::JsonValue (transport.looping.load());
        j["metronome"] = alpha::JsonValue (transport.metronome.load());
        j["sampleRate"] = alpha::JsonValue (sr());
        j["device"] = alpha::JsonValue (deviceInfo().toStdString());
        j["status"] = alpha::JsonValue (lastStatus.toStdString());
        j["projectPath"] = alpha::JsonValue (projectFile.getFullPathName().toStdString());
        j["autosavePath"] = alpha::JsonValue (autosaveFile().getFullPathName().toStdString());
        j["projectLengthBars"] = alpha::JsonValue (core.state.projectLengthBars());
        j["videoEnabled"] = alpha::JsonValue (false);
        j["videoPolicy"] = alpha::JsonValue ("after_final_confirmed_test");
        if (master != nullptr)
        {
            j["masterLevelL"] = alpha::JsonValue ((double) master->levelL.load());
            j["masterLevelR"] = alpha::JsonValue ((double) master->levelR.load());
            j["masterPeak"] = alpha::JsonValue ((double) master->peak.load());
            j["masterLufs"] = alpha::JsonValue ((double) master->lufs.load());
        }
        for (size_t i = 0; i < j["tracks"].array.size(); ++i)
        {
            auto& t = j["tracks"].array[i];
            t["id"] = alpha::JsonValue ("native_" + std::to_string (i));
            t["startBars"] = alpha::JsonValue (1.0);
            if (i < tracks.size())
            {
                t["levelL"] = alpha::JsonValue ((double) tracks[i]->fader->levelL.load());
                t["levelR"] = alpha::JsonValue ((double) tracks[i]->fader->levelR.load());
                t["peak"] = alpha::JsonValue ((double) tracks[i]->fader->peak.load());
                t["lufs"] = alpha::JsonValue ((double) tracks[i]->fader->lufs.load());
            }
            auto& clips = t["clips"];
            for (auto& c : clips.array)
            {
                c["lengthBars"] = alpha::JsonValue (alpha::jNumber (c, "lenBars", 1.0));
                c["type"] = alpha::JsonValue ("audio");
            }
        }
        for (size_t i = 0; i < j["buses"].array.size() && i < buses.size(); ++i)
        {
            auto& b = j["buses"].array[i];
            b["index"] = alpha::JsonValue ((int) i);
            b["levelL"] = alpha::JsonValue ((double) buses[i]->fader->levelL.load());
            b["levelR"] = alpha::JsonValue ((double) buses[i]->fader->levelR.load());
            b["lufs"] = alpha::JsonValue ((double) buses[i]->fader->lufs.load());
        }
        return j.dump();
    }

private:
    String dispatchCore (const std::string& cmd, const alpha::JsonValue& p, bool structural)
    {
        if (! core.command (cmd, p)) { lastStatus = alphaString (core.lastError); return lastStatus; }
        applyCoreState (structural);
        lastStatus = alphaString ("Commande native exécutée : " + cmd);
        if (onChanged) onChanged();
        return {};
    }
    String dispatchUiControl (const alpha::JsonValue& p)
    {
        const auto control = alpha::jString (p, "control", "");
        alpha::JsonValue q (alpha::JsonValue::Type::Object);
        if (control == "eq")
        {
            q["trackIndex"] = alpha::JsonValue (alpha::jInt (p, "index", 0));
            q["band"] = alpha::JsonValue (alpha::jInt (p, "band", 0));
            q["field"] = alpha::JsonValue (alpha::jString (p, "field", "gainDb"));
            q["value"] = p.get ("value");
            return dispatchCore ("setFx", q, false);
        }
        if (control == "bus")
        {
            q["index"] = alpha::JsonValue (alpha::jInt (p, "index", 0));
            q["field"] = alpha::JsonValue (alpha::jString (p, "field", "volumeDb"));
            q["value"] = p.get ("value");
            return dispatchCore ("setBus", q, false);
        }
        if (control == "controlRoom" || control == "preferences" || control == "automation" || control == "markers")
        {
            for (const auto& kv : p.object) q[kv.first] = kv.second;
            if (control == "controlRoom") return dispatchCore ("setControlRoom", q, false);
            if (control == "preferences") return dispatchCore ("setPreferences", q, false);
            if (control == "automation") return dispatchCore ("setAutomation", q, false);
            return dispatchCore ("setMarkers", q, false);
        }
        lastStatus = TR ("Contrôle d'interface inconnu : ") + alphaString (control);
        return lastStatus;
    }
    static bool needsStructural (const std::string& cmd)
    {
        if (cmd == "setTempo" || cmd == "setLoop" || cmd == "setMaster" || cmd == "setControlRoom" ||
            cmd == "setPreferences" || cmd == "setRecordingOptions" || cmd == "setMarkers" ||
            cmd == "setTrack" || cmd == "setBus" || cmd == "setFx" || cmd == "setAutomation" ||
            cmd == "setMidiNotes" || cmd == "quantizeMidi" || cmd == "saveSnapshot" ||
            cmd == "importMedia" || cmd == "setStatus") return false;
        return true;
    }
    void restoreInserts (Track* t, std::shared_ptr<std::vector<std::pair<PluginDescription, MemoryBlock>>> list, size_t i)
    {
        if (i >= list->size()) return;
        addInsert (t, (*list)[i].first, [this, t, list, i] (const String&) { if (owns (t)) restoreInserts (t, list, i + 1); }, (*list)[i].second);
    }
    void stereo (AudioProcessorGraph::NodeID a, AudioProcessorGraph::NodeID b)
    {
        for (int ch = 0; ch < 2; ++ch) graph.addConnection ({ { a, ch }, { b, ch } });
    }
    void updateRate()
    {
        if (auto* d = deviceManager.getCurrentAudioDevice()) transport.sampleRate.store (d->getCurrentSampleRate());
    }
    void changeListenerCallback (ChangeBroadcaster*) override
    {
        updateRate();
        saveAudioState();
        rebuildConnections();
        refreshMix();
        if (onChanged) onChanged();
    }

    TimeSliceThread writerThread;
    AudioProcessorGraph::NodeID inputId, outputId, masterId, recId;
    RecorderProcessor* recorder = nullptr;
    bool recording = false, savedLoop = false, savedMetro = false, savedPlaying = false, recSavedMetro = false;
    int64 savedPos = 0, recStart = 0, recPunchEnd = std::numeric_limits<int64>::max() / 4;
    int64 recPrecountEnd = 0, recLatencySamples = 0;
    File recFile, projectFile, projectRoot;
    Track* recTrack = nullptr;
    double lastAutosaveMs = 0.0;
};
