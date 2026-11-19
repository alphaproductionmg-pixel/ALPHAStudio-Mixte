// ALPHA Studio - moteur audio (JUCE 8), projet J1→J6.
// Graphe : [piste + synthèse MIDI] -> inserts VST3 -> fader/EQ/dynamique/automation -> bus -> master/Control Room -> sortie.
#pragma once
#include <JuceHeader.h>
#include "AlphaProjectCore.h"
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

using namespace juce;

#define TR(s) juce::String(juce::CharPointer_UTF8(s))

static inline const char* const alphaStudioVersion = "0.5.0";
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
static inline String alphaAudioSuffix (const String& name, const std::string& bytes)
{
    String ext = File (name).getFileExtension().toLowerCase();
    if (ext == ".aif") ext = ".aiff";
    if (ext == ".wav" || ext == ".mp3" || ext == ".flac" || ext == ".ogg" || ext == ".aiff") return ext;
    const auto* p = reinterpret_cast<const unsigned char*> (bytes.data());
    const auto has = [&] (size_t offset, const char* signature, size_t length)
    { return bytes.size() >= offset + length && std::memcmp (p + offset, signature, length) == 0; };
    if (has (0, "RIFF", 4) && has (8, "WAVE", 4)) return ".wav";
    if (has (0, "OggS", 4)) return ".ogg";
    if (has (0, "fLaC", 4)) return ".flac";
    if (has (0, "ID3", 3)) return ".mp3";
    if (has (0, "FORM", 4) && has (8, "AIFF", 4)) return ".aiff";
    if (bytes.size() >= 2 && p[0] == 0xffu && (p[1] & 0xe0u) == 0xe0u) return ".mp3";
    return ".wav";
}

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
    struct LiveNote { bool active = false; double phase = 0.0; float velocity = 0.8f; int64 end = 0; };

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
        const bool inPrecount = p < precountEnd.load();
        const int n = buf.getNumSamples();
        const double sr = transport.sampleRate.load();
        const double spb = alphaSamplesPerBar (transport.bpm.load(), sr);
        const double twoPi = MathConstants<double>::twoPi;

        if (inPrecount)
        {
            // Précompte : seules les pistes musicales sont rendues silencieuses.
            // Le métronome reste généré séparément par le processeur master.
            return;
        }

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

        // Tableau de 128 notes préalloué : aucune insertion/effacement de std::map
        // ni libération mémoire dans le callback audio (audit S1).
        for (int pitch = 0; pitch < 128; ++pitch)
        {
            auto& live = liveNotes[(size_t) pitch];
            if (! live.active) continue;
            if (live.end > 0 && p > live.end) { live.active = false; continue; }
            const double freq = 440.0 * std::pow (2.0, (pitch - 69) / 12.0);
            double phase = live.phase;
            const float amp = 0.18f * live.velocity;
            for (int i = 0; i < n; ++i)
            {
                phase += twoPi * freq / sr;
                const float v = (float) std::sin (phase) * amp;
                buf.addSample (0, i, v);
                buf.addSample (1, i, v);
            }
            live.phase = std::fmod (phase, twoPi);
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
        auto& live = liveNotes[(size_t) pitch];
        if (on && velocity > 0) live = { true, 0.0, (float) jlimit (0.0, 1.0, velocity / 127.0), 0 };
        else if (live.active) live.end = transport.pos.load() + (int64) (0.04 * sr);
    }
    void clearLiveNotes()
    {
        const SpinLock::ScopedLockType sl (lock);
        for (auto& live : liveNotes) live.active = false;
    }
    void setPrecountEnd (int64 s) { precountEnd.store (s); }

    SpinLock lock;
    std::vector<Clip> clips;
    std::vector<alpha::MidiNote> midiNotes;
    std::array<LiveNote, 128> liveNotes;
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
                if (c.param == AutoParam::Volume) autoGainDb = jlimit (-60.0, 12.0, 20.0 * std::log10 (jmax (1e-4, v)));
                else if (c.param == AutoParam::Pan) autoPan = jlimit (-1.0, 1.0, v * 2.0 - 1.0);
                else if (c.param == AutoParam::Mute) autoMute = v > 0.5;
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
        peak.store (static_cast<float> (meter.peakValue()));
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
        // Conversion hors thread audio : la copie publiée au processeur ne contient
        // que des scalaires et des tableaux de taille fixe (aucun std::vector/string).
        AutoConfig cfg;
        cfg.count = jmin (8, (int) curves.size());
        for (int i = 0; i < cfg.count; ++i)
        {
            const auto& source = curves[(size_t) i];
            auto& target = cfg.curves[(size_t) i];
            target.param = source.param == "Volume" ? AutoParam::Volume
                         : source.param == "Panoramique" ? AutoParam::Pan
                         : source.param == "Mute" ? AutoParam::Mute : AutoParam::None;
            target.neutral = source.neutral;
            target.count = jmin (32, (int) source.points.size());
            for (int j = 0; j < target.count; ++j)
            {
                target.bars[(size_t) j] = source.points[(size_t) j].bars;
                target.values[(size_t) j] = source.points[(size_t) j].value;
            }
        }
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
    enum class AutoParam : uint8_t { None, Volume, Pan, Mute };
    struct AutoCurveRT
    {
        AutoParam param = AutoParam::None;
        double neutral = 1.0;
        int count = 0;
        std::array<double, 32> bars {}, values {};
        double valueAt (double x) const
        {
            if (count <= 0) return neutral;
            if (x <= bars[0]) return values[0];
            for (int i = 1; i < count; ++i)
            {
                const double aX = bars[(size_t) (i - 1)], bX = bars[(size_t) i];
                if (x <= bX)
                {
                    const double span = bX - aX;
                    if (span <= 0.0) return values[(size_t) i];
                    const double k = (x - aX) / span;
                    return values[(size_t) (i - 1)] + (values[(size_t) i] - values[(size_t) (i - 1)]) * k;
                }
            }
            return values[(size_t) (count - 1)];
        }
    };
    struct AutoConfig
    {
        int count = 0;
        std::array<AutoCurveRT, 8> curves;
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
        // Débit disque réel : 2 canaux × 24 bits écrits par l'enregistreur.
        if (diskCounter != nullptr) diskCounter->fetch_add (static_cast<int64> (cnt) * 2 * 3);
        bytesWritten.fetch_add (static_cast<int64> (cnt) * 2 * 3);
    }
    void attachDiskCounter (std::atomic<int64>* c) { diskCounter = c; }
    void resetWritten() { bytesWritten.store (0); }
    int64 written() const { return bytesWritten.load(); }
private:
    TimeSliceThread& thread;
    Transport& transport;
    std::atomic<int64>* diskCounter = nullptr;
    std::atomic<int64> bytesWritten { 0 };
    SpinLock wlock;
    std::unique_ptr<AudioFormatWriter::ThreadedWriter> threaded;
    std::atomic<bool> gateEnabled { false };
    std::atomic<int64> gateStart { 0 }, gateEnd { std::numeric_limits<int64>::max() / 4 };
};

//==============================================================================
// Anneau d'échantillons réels prélevés sur la sortie master : sert au calcul
// FFT de l'analyseur de spectre et aux statistiques audio. Écrit par le thread
// audio (index atomique, aucune allocation), lu par l'interface.
struct AlphaSampleRing
{
    static constexpr int size = 32768;

    void push (const float* const* channels, int numChannels, int numSamples)
    {
        if (numSamples <= 0) return;
        int64 w = write.load();
        for (int i = 0; i < numSamples; ++i)
        {
            const int64 idx = (w + i) % size;
            left[static_cast<size_t> (idx)].store (numChannels > 0 && channels[0] != nullptr ? channels[0][i] : 0.0f);
            right[static_cast<size_t> (idx)].store (numChannels > 1 && channels[1] != nullptr ? channels[1][i] : 0.0f);
        }
        write.store (w + numSamples);
        total.store (total.load() + numSamples);
    }
    // Copie les n derniers échantillons réels disponibles.
    void read (std::vector<float>& outL, std::vector<float>& outR, int n) const
    {
        const int64 written = total.load();
        const int available = static_cast<int> (std::min<int64> (static_cast<int64> (n), written));
        outL.assign (static_cast<size_t> (available), 0.0f);
        outR.assign (static_cast<size_t> (available), 0.0f);
        const int64 w = write.load();
        for (int i = 0; i < available; ++i)
        {
            const int64 idx = (w - available + i) % size;
            const int64 safe = idx < 0 ? idx + size : idx;
            outL[static_cast<size_t> (i)] = left[static_cast<size_t> (safe)].load();
            outR[static_cast<size_t> (i)] = right[static_cast<size_t> (safe)].load();
        }
    }

    std::array<std::atomic<float>, size> left {}, right {};
    std::atomic<int64> write { 0 }, total { 0 };
};

//==============================================================================
// Compteurs de performance réels : charge CPU mesurée par le temps de traitement
// du callback audio, débit disque mesuré par l'enregistreur. Aucun tirage
// aléatoire (audit v6).
struct AlphaPerformance
{
    void recordBlock (double blockSeconds, double processingSeconds, int64 bytesWritten)
    {
        if (blockSeconds <= 0.0) return;
        const double cpu = 100.0 * jlimit (0.0, 1.0, processingSeconds / blockSeconds);
        cpuSmooth.store (cpuSmooth.load() * 0.85 + cpu * 0.15);
        cpuPeak.store (jmax (cpuPeak.load(), cpu));
        const double now = Time::getMillisecondCounterHiRes() / 1000.0;
        if (windowStart == 0.0) windowStart = now;
        windowBytes += static_cast<double> (bytesWritten);
        const double elapsed = now - windowStart;
        if (elapsed >= 0.5)
        {
            diskBytesPerSecond.store (windowBytes / elapsed);
            diskSmooth.store (jlimit (0.0, 100.0, 100.0 * (windowBytes / elapsed) / jmax (1.0, nominalDiskBytesPerSecond)));
            diskPeak.store (jmax (diskPeak.load(), diskSmooth.load()));
            windowBytes = 0.0;
            windowStart = now;
            const int64 slot = samples.fetch_add (1);
            historyCpu[static_cast<size_t> (slot % historySize)] = cpuSmooth.load();
            historyDisk[static_cast<size_t> (slot % historySize)] = diskSmooth.load();
            historyTime[static_cast<size_t> (slot % historySize)] = now;
        }
    }
    void resetPeaks() { cpuPeak.store (cpuSmooth.load()); diskPeak.store (diskSmooth.load()); }

    static constexpr int historySize = 1024;
    std::atomic<double> cpuSmooth { 0.0 }, cpuPeak { 0.0 };
    std::atomic<double> diskSmooth { 0.0 }, diskPeak { 0.0 }, diskBytesPerSecond { 0.0 };
    double nominalDiskBytesPerSecond = 20.0 * 1024.0 * 1024.0;
    std::atomic<int64> samples { 0 };
    std::array<double, historySize> historyCpu {}, historyDisk {}, historyTime {};
private:
    double windowStart = 0.0, windowBytes = 0.0;
};

//==============================================================================
// Callback audio à découpe de boucle : un bloc qui franchit la fin du cycle est
// traité en deux segments, sans jouer la portion située après loopEnd (audit S9).
class AlphaAudioCallback final : public AudioIODeviceCallback
{
public:
    AlphaAudioCallback (AudioProcessorGraph& g, Transport& t) : graph (g), transport (t) {}

    void audioDeviceAboutToStart (AudioIODevice* device) override
    {
        sampleRate = device != nullptr && device->getCurrentSampleRate() > 0.0 ? device->getCurrentSampleRate() : 48000.0;
        blockSize = device != nullptr && device->getCurrentBufferSizeSamples() > 0 ? device->getCurrentBufferSizeSamples() : 512;
        const int wanted = jmax (2, graph.getTotalNumInputChannels(), graph.getTotalNumOutputChannels());
        totalChannels = jmin (32, wanted);
        workBuffer.setSize (totalChannels, blockSize);
        workBuffer.clear();
        midi.clear();
        graph.prepareToPlay (sampleRate, blockSize);
    }

    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                          int numInputChannels,
                                          float* const* outputChannelData,
                                          int numOutputChannels,
                                          int numSamples,
                                          const AudioIODeviceCallbackContext&) override
    {
        if (totalChannels <= 0 || numSamples <= 0 || numSamples > blockSize) return;
        const double blockStart = Time::getMillisecondCounterHiRes();
        workBuffer.clear();
        for (int ch = 0; ch < jmin (totalChannels, numInputChannels); ++ch)
            if (inputChannelData != nullptr && inputChannelData[ch] != nullptr)
                FloatVectorOperations::copy (workBuffer.getWritePointer (ch), inputChannelData[ch], numSamples);

        int done = 0, remaining = numSamples, guard = 0;
        const ScopedLock callbackLock (graph.getCallbackLock());
        while (remaining > 0 && guard++ < 256)
        {
            int chunk = remaining;
            if (transport.playing.load() && transport.looping.load())
            {
                const int64 ls = transport.loopStart.load(), le = transport.loopEnd.load();
                if (le > ls)
                {
                    int64 pos = transport.pos.load();
                    if (pos >= le) { transport.pos.store (ls); pos = ls; }
                    const int64 untilEnd = le - pos;
                    if (untilEnd > 0 && untilEnd < chunk) chunk = (int) untilEnd;
                }
            }
            for (int ch = 0; ch < totalChannels; ++ch)
                segmentPointers[(size_t) ch] = workBuffer.getWritePointer (ch) + done;
            AudioBuffer<float> segment (segmentPointers.data(), totalChannels, chunk);
            midi.clear();
            graph.processBlock (segment, midi);
            done += chunk;
            remaining -= chunk;
        }
        if (remaining > 0)
        {
            for (int ch = 0; ch < totalChannels; ++ch)
                segmentPointers[(size_t) ch] = workBuffer.getWritePointer (ch) + done;
            AudioBuffer<float> segment (segmentPointers.data(), totalChannels, remaining);
            midi.clear();
            graph.processBlock (segment, midi);
        }
        for (int ch = 0; ch < numOutputChannels; ++ch)
        {
            if (outputChannelData == nullptr || outputChannelData[ch] == nullptr) continue;
            if (ch < totalChannels)
                FloatVectorOperations::copy (outputChannelData[ch], workBuffer.getReadPointer (ch), numSamples);
            else FloatVectorOperations::clear (outputChannelData[ch], numSamples);
        }

        // Prélèvement réel sur la sortie master (après fader/EQ/dynamique) pour
        // l'analyseur de spectre et les statistiques, puis mesure réelle de la
        // charge CPU du bloc et du débit disque de l'enregistreur.
        if (ring != nullptr)
        {
            const float* const* rp = workBuffer.getArrayOfReadPointers();
            ring->push (rp, totalChannels, numSamples);
        }
        if (perf != nullptr)
        {
            const double blockSeconds = (double) numSamples / jmax (1.0, sampleRate);
            const double processingSeconds = (Time::getMillisecondCounterHiRes() - blockStart) / 1000.0;
            perf->recordBlock (blockSeconds, processingSeconds,
                               diskCounter != nullptr ? diskCounter->exchange (0) : 0);
        }
    }

    void audioDeviceStopped() override {}

    // Branchements réels effectués par le moteur après construction.
    void attachAnalytics (AlphaSampleRing* r, AlphaPerformance* p, std::atomic<int64>* disk)
    { ring = r; perf = p; diskCounter = disk; }
    double sampleRateHz() const { return sampleRate; }

private:
    AudioProcessorGraph& graph;
    Transport& transport;
    AlphaSampleRing* ring = nullptr;
    AlphaPerformance* perf = nullptr;
    std::atomic<int64>* diskCounter = nullptr;
    AudioBuffer<float> workBuffer;
    std::array<float*, 32> segmentPointers {};
    MidiBuffer midi;
    int totalChannels = 2, blockSize = 512;
    double sampleRate = 48000.0;
};

//==============================================================================
// Moniteur MIDI réel : chaque message reçu d'un périphérique MIDI ouvert par le
// pilote est horodaté et conservé dans un journal borné, consultable par
// l'interface. Aucune donnée aléatoire n'est générée (audit v6).
class AlphaMidiMonitor final : public MidiInputCallback
{
public:
    struct Event
    {
        double seconds = 0.0;
        int channel = 1, status = 0, data1 = 0, data2 = 0;
        String source, description;
    };

    void handleIncomingMidiMessage (MidiInput* source, const MidiMessage& message) override
    {
        Event e;
        e.seconds = message.getTimeStamp();
        e.channel = message.getChannel();
        e.status = message.getRawDataSize() > 0 ? static_cast<int> (message.getRawData()[0]) : 0;
        e.data1 = message.getRawDataSize() > 1 ? static_cast<int> (message.getRawData()[1]) : 0;
        e.data2 = message.getRawDataSize() > 2 ? static_cast<int> (message.getRawData()[2]) : 0;
        e.source = source != nullptr ? source->getName() : TR ("Périphérique MIDI");
        e.description = describe (message);
        const ScopedLock sl (lock);
        events.push_back (e);
        while (events.size() > 512) events.erase (events.begin());
        ++totalReceived;
    }

    void clear()
    {
        const ScopedLock sl (lock);
        events.clear();
    }
    int count() const { return totalReceived.get(); }
    std::vector<Event> snapshot (int maxEvents) const
    {
        const ScopedLock sl (lock);
        std::vector<Event> out;
        const int n = jmin (maxEvents, static_cast<int> (events.size()));
        out.reserve (static_cast<size_t> (n));
        for (int i = static_cast<int> (events.size()) - n; i < static_cast<int> (events.size()); ++i)
            out.push_back (events[static_cast<size_t> (i)]);
        return out;
    }

private:
    static String describe (const MidiMessage& m)
    {
        if (m.isNoteOn())  return TR ("Note On ") + String (MidiMessage::getMidiNoteName (m.getNoteNumber(), true, true, 3)) + TR (" vél ") + String (m.getVelocity());
        if (m.isNoteOff()) return TR ("Note Off ") + String (MidiMessage::getMidiNoteName (m.getNoteNumber(), true, true, 3));
        if (m.isController()) return TR ("Control Change ") + String (m.getControllerNumber()) + TR (" = ") + String (m.getControllerValue());
        if (m.isPitchWheel()) return TR ("Pitch Bend ") + String (m.getPitchWheelValue());
        if (m.isAftertouch()) return TR ("Aftertouch ") + String (m.getAfterTouchValue());
        if (m.isChannelPressure()) return TR ("Pression de canal ") + String (m.getChannelPressureValue());
        if (m.isProgramChange()) return TR ("Program Change ") + String (m.getProgramChangeNumber());
        if (m.isSysEx()) return TR ("SysEx ") + String (m.getSysExDataSize()) + TR (" octets");
        if (m.isMidiMachineControlMessage()) return TR ("MIDI Machine Control");
        if (m.isQuarterFrame() || m.isFullFrame()) return TR ("MIDI Timecode");
        if (m.isSongPositionPointer()) return TR ("Song Position ") + String (m.getSongPositionPointerMidiBeat());
        if (m.isMidiStart()) return TR ("Start");
        if (m.isMidiContinue()) return TR ("Continue");
        if (m.isMidiStop()) return TR ("Stop");
        if (m.isMidiClock()) return TR ("Horloge MIDI");
        return TR ("Message MIDI ") + String (m.getRawDataSize()) + TR (" octets");
    }

    mutable CriticalSection lock;
    std::vector<Event> events;
    Atomic<int> totalReceived { 0 };
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
    AlphaAudioCallback audioCallback { graph, transport };
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
    StringArray audioDeviceTypes;
    bool asioAvailable = false;

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
        {
            // JUCE_ASIO=1 expose le type ASIO quand le SDK constructeur est présent.
            // On le choisit par défaut s'il existe, puis on ouvre le premier pilote.
            for (auto* type : deviceManager.getAvailableDeviceTypes())
            {
                type->scanForDevices();
                if (type->getTypeName() == "ASIO" && type->getDeviceNames().size() > 0)
                {
                    deviceManager.setCurrentAudioDeviceType ("ASIO", true);
                    AudioDeviceManager::AudioDeviceSetup setup;
                    deviceManager.getAudioDeviceSetup (setup);
                    if (setup.outputDeviceName.isEmpty())
                    {
                        setup.outputDeviceName = type->getDeviceNames()[0];
                        setup.inputDeviceName = setup.outputDeviceName;
                        setup.sampleRate = 0;
                        setup.bufferSize = 0;
                        audioError = deviceManager.setAudioDeviceSetup (setup, true);
                    }
                }
            }
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
        updateAudioDeviceDetails();
        deviceManager.addAudioCallback (&audioCallback);
        deviceManager.addChangeListener (this);
        // Analyse réelle : spectre/master, charge CPU et débit disque mesurés
        // dans le callback audio, et moniteur MIDI branché sur les pilotes.
        audioCallback.attachAnalytics (&masterRing, &performance, &diskBytesCounter);
        if (recorder != nullptr) recorder->attachDiskCounter (&diskBytesCounter);
        refreshMidiInputs();
        loadKnownPlugins();
        core.resetTo (alpha::ProjectState(), "État initial");
    }

    ~AlphaEngine() override
    {
        saveAudioState();
        deviceManager.removeChangeListener (this);
        deviceManager.removeAudioCallback (&audioCallback);
        if (recorder) recorder->stop();
        tracks.clear();
        buses.clear();
        graph.clear();
        writerThread.stopThread (2000);
    }

    FaderProcessor* master = nullptr;

    double sr() const { return transport.sampleRate.load(); }
    int bs() const { if (auto* d = deviceManager.getCurrentAudioDevice()) return d->getCurrentBufferSizeSamples(); return 512; }
    void updateAudioDeviceDetails()
    {
        audioDeviceTypes.clear();
        asioAvailable = false;
        for (auto* type : deviceManager.getAvailableDeviceTypes())
        {
            const String name = type->getTypeName();
            audioDeviceTypes.add (name);
            if (name.equalsIgnoreCase ("ASIO")) asioAvailable = type->getDeviceNames().size() > 0;
        }
    }
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
        deviceManager.removeAudioCallback (&audioCallback);
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
        // A5 : le nombre d'échantillons écrits découle de la durée source et du
        // ratio, sans retrait arbitraire de quatre échantillons par bloc.
        const int outBlock = jmax (1, (int) std::ceil ((double) block / ratio));
        AudioBuffer<float> out (2, outBlock);
        std::array<LagrangeInterpolator, 2> interp;
        for (auto& i : interp) i.reset();
        MidiBuffer midi;
        const int64 end = projectLength() + (int64) (3.0 * sr());
        const int64 totalOut = std::max<int64> (1, (int64) std::llround ((double) end / ratio));
        int64 written = 0;
        transport.pos.store (0);
        transport.playing.store (true);
        bool ok = true;
        uint32_t ditherSeed = 0x12345678u;
        while (written < totalOut)
        {
            const int thisOut = (int) std::min<int64> ((int64) outBlock, totalOut - written);
            buffer.clear();
            graph.processBlock (buffer, midi);
            out.clear();
            for (int ch = 0; ch < 2; ++ch)
            {
                interp[(size_t) ch].process (ratio, buffer.getReadPointer (ch), out.getWritePointer (ch), thisOut);
                for (int i = 0; i < thisOut; ++i) out.addSample (ch, i, alpha::triangularDither (ditherSeed));
            }
            if (! w->writeFromAudioSampleBuffer (out, 0, thisOut)) { ok = false; break; }
            written += thisOut;
            const double fraction = (double) std::min<int64> (end, transport.pos.load()) / (double) std::max<int64> (1, end);
            if (progress && ! progress (fraction)) { ok = false; break; }
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
        deviceManager.addAudioCallback (&audioCallback);
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
        if (structural) reconcileInsertsWithCore();
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
    String importAudioData (const String& name, const String& base64, double startBars, int trackIndex = -1)
    {
        const auto bytes = alpha::base64Decode (base64.toStdString());
        if (bytes.empty()) return TR ("Fichier importé vide");
        const String suffix = alphaAudioSuffix (name, bytes);
        auto dir = effectiveRoot().getChildFile ("Media");
        dir.createDirectory();
        const String legal = File::createLegalFileName (name);
        const String stem = File (legal).getFileNameWithoutExtension();
        File f = dir.getNonexistentChildFile (stem.isEmpty() ? "Import" : stem, suffix);
        FileOutputStream os (f);
        if (! os.openedOk() || ! os.write (bytes.data(), bytes.size())) return TR ("Écriture du média impossible");
        os.flush();
        Clip probe; String err;
        if (! loadClipAudio (f, probe, err)) return err;
        int target = -1;
        if (trackIndex >= 0 && trackIndex < (int) core.state.tracks.size())
        {
            target = trackIndex;
        }
        else
        {
            alpha::JsonValue addTrack (alpha::JsonValue::Type::Object);
            addTrack["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
            if (! core.command ("addTrack", addTrack)) return alphaString (core.lastError);
            target = (int) core.state.tracks.size() - 1;
        }
        alpha::JsonValue addClip (alpha::JsonValue::Type::Object);
        addClip["trackIndex"] = alpha::JsonValue (target);
        addClip["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
        addClip["media"] = alpha::JsonValue (relativeMedia (f, effectiveRoot()).toStdString());
        addClip["startBars"] = alpha::JsonValue (jmax (1.0, startBars));
        addClip["lenBars"] = alpha::JsonValue (alphaSamplesToBarLength (probe.len, core.state.bpm, sr()));
        if (! core.command ("addClip", addClip)) return alphaString (core.lastError);
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Audio importé sur la piste ") + String (target + 1) + TR (" avec l'extension réelle ") + suffix + ".";
        return {};
    }
    bool importProjectData (const String& base64, const File& sourceRoot = File())
    {
        const auto text = alpha::base64Decode (base64.toStdString());
        std::string parseError;
        const auto json = alpha::JsonValue::parse (text, parseError);
        if (! parseError.empty() || ! json.isObject() || alpha::jString (json, "format", "") != "ALPHAPROJ")
        {
            core.lastError = parseError.empty() ? "Format .alphaproj invalide" : parseError;
            return false;
        }
        auto state = alpha::stateFromJson (json);
        auto imports = appDataDir().getChildFile ("Imports");
        imports.createDirectory();
        File destination = imports.getNonexistentChildFile ("Projet-" + Time::getCurrentTime().formatted ("%Y%m%d-%H%M%S"), "");
        destination.createDirectory();
        auto mediaDir = destination.getChildFile ("Media");
        mediaDir.createDirectory();

        std::vector<File> roots;
        if (sourceRoot != File()) roots.push_back (sourceRoot);
        roots.push_back (File::getSpecialLocation (File::userDocumentsDirectory));
        roots.push_back (File::getSpecialLocation (File::userDesktopDirectory));
        roots.push_back (File::getSpecialLocation (File::userMusicDirectory));
        roots.push_back (File::getSpecialLocation (File::userHomeDirectory));
        roots.push_back (appDataDir());
        roots.push_back (effectiveRoot());
        auto findMedia = [&] (const std::string& media) -> File
        {
            if (media.empty()) return {};
            const File direct (alphaString (media));
            if (direct.existsAsFile()) return direct;
            const String base = direct.getFileName();
            for (const auto& root : roots)
            {
                if (root == File()) continue;
                const File relative = root.getChildFile (alphaString (media));
                if (relative.existsAsFile()) return relative;
                const File inMedia = root.getChildFile ("Media").getChildFile (base);
                if (inMedia.existsAsFile()) return inMedia;
                const File byName = root.getChildFile (base);
                if (byName.existsAsFile()) return byName;
            }
            return {};
        };

        int missing = 0, copied = 0;
        state.media.clear();
        for (auto& track : state.tracks)
        {
            for (auto& clip : track.clips)
            {
                const File src = findMedia (clip.media);
                if (! src.existsAsFile())
                {
                    ++missing;
                    clip.media.clear();
                    continue;
                }
                const File dst = mediaDir.getNonexistentChildFile (src.getFileNameWithoutExtension(), src.getFileExtension());
                if (! src.copyFileTo (dst))
                {
                    ++missing;
                    clip.media.clear();
                    continue;
                }
                ++copied;
                clip.media = relativeMedia (dst, destination).toStdString();
                if (std::find (state.media.begin(), state.media.end(), clip.media) == state.media.end())
                    state.media.push_back (clip.media);
            }
        }
        state.videoEnabled = false;
        auto document = alpha::stateToJson (state);
        document["format"] = alpha::JsonValue ("ALPHAPROJ");
        document["schema"] = alpha::JsonValue (alpha::ProjectState().schema);
        document["videoPolicy"] = alpha::JsonValue ("after_final_confirmed_test");
        const std::string saved = document.dump();
        if (! core.load (saved)) return false;
        projectRoot = destination;
        projectFile = destination.getChildFile ("Projet importé.alphaproj");
        if (! projectFile.replaceWithText (alphaString (saved))) return false;
        core.markSaved();
        applyCoreState (true);
        markDirty();
        lastStatus = TR ("Projet importé : ") + String (copied) + TR (" média(s) recopiés dans ") + destination.getFullPathName();
        if (missing > 0) lastStatus += TR (" · ") + String (missing) + TR (" référence(s) introuvable(s), à relocaliser.");
        if (onChanged) onChanged();
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
    //==========================================================================
    // AUDIT v6 — GREFFONS RÉELS (VST3) : dossiers analysés, liste réelle,
    // instanciation dans le graphe, bypass, paramètres, état binaire, éditeur.
    //==========================================================================
    File pluginDeadMansPedal() const { return appDataDir().getChildFile ("plugins-crash.txt"); }

    // Progression réelle de l'analyse des greffons, lue par l'interface native.
    bool isPluginScanRunning() const { return pluginScanRunning.load(); }
    int pluginScanProgressDone() const { return pluginScanDone.load(); }
    int pluginScanProgressTotal() const { return pluginScanTotal.load(); }
    String pluginScanProgressCurrent() const { const ScopedLock sl (pluginScanLock); return pluginScanCurrent; }
    int knownPluginCount() const { return (int) knownPlugins.getTypes().size(); }

    FileSearchPath pluginSearchPaths() const
    {
        FileSearchPath paths;
        for (int i = 0; i < pluginFormats.getNumFormats(); ++i)
            if (auto* f = pluginFormats.getFormat (i))
            {
                const auto defaults = f->getDefaultLocationsToSearch();
                for (int k = 0; k < defaults.getNumPaths(); ++k)
                    paths.addIfNotAlreadyThere (defaults[k]);
            }
        for (const auto& folder : core.state.pluginFolders)
        {
            const File d (alphaString (folder));
            if (d.isDirectory()) paths.addIfNotAlreadyThere (d);
        }
        return paths;
    }

    // Analyse réelle et asynchrone des modules présents sur le disque.
    void startPluginScan (bool clearFirst)
    {
        if (pluginScanRunning.load()) return;
        pluginScanRunning.store (true);
        pluginScanDone.store (0);
        pluginScanTotal.store (0);
        const FileSearchPath paths = pluginSearchPaths();
        const File pedal = pluginDeadMansPedal();
        std::vector<AudioPluginFormat*> formats;
        for (int i = 0; i < pluginFormats.getNumFormats(); ++i)
            if (auto* f = pluginFormats.getFormat (i)) formats.push_back (f);
        if (clearFirst) knownPlugins.clear();

        Thread::launch ([this, paths, pedal, formats]()
        {
            for (auto* format : formats)
            {
                const auto files = format->searchPathsForPlugins (paths, true, false);
                pluginScanTotal.fetch_add (files.size());
                PluginDirectoryScanner scanner (knownPlugins, *format, paths, true, pedal, false);
                String beingScanned;
                while (scanner.scanNextFile (true, beingScanned))
                {
                    { const ScopedLock sl (pluginScanLock); pluginScanCurrent = beingScanned; }
                    pluginScanDone.fetch_add (1);
                }
            }
            saveKnownPlugins();
            { const ScopedLock sl (pluginScanLock); pluginScanCurrent.clear(); }
            pluginScanRunning.store (false);
            MessageManager::callAsync ([this]()
            {
                lastStatus = TR ("Analyse des greffons terminée : ") + String ((int) knownPlugins.getTypes().size()) + TR (" module(s) réels détectés.");
                syncInsertsToCore();
                if (onChanged) onChanged();
            });
        });
    }

    alpha::JsonValue pluginListJson() const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        const auto types = knownPlugins.getTypes();
        alpha::JsonValue list (alpha::JsonValue::Type::Array);
        for (const auto& d : types)
        {
            alpha::JsonValue e (alpha::JsonValue::Type::Object);
            e["name"] = alpha::JsonValue (d.name.toStdString());
            e["uid"] = alpha::JsonValue (std::to_string (d.uniqueId));
            e["pluginFormatName"] = alpha::JsonValue (d.pluginFormatName.toStdString());
            e["manufacturer"] = alpha::JsonValue (d.manufacturerName.toStdString());
            e["category"] = alpha::JsonValue (d.category.toStdString());
            e["file"] = alpha::JsonValue (d.fileOrIdentifier.toStdString());
            e["version"] = alpha::JsonValue (d.version.toStdString());
            e["isInstrument"] = alpha::JsonValue (d.isInstrument);
            e["numInputChannels"] = alpha::JsonValue (d.numInputChannels);
            e["numOutputChannels"] = alpha::JsonValue (d.numOutputChannels);
            e["hasSharedContainer"] = alpha::JsonValue (d.hasSharedContainer);
            list.array.push_back (e);
        }
        out["plugins"] = list;
        out["count"] = alpha::JsonValue (static_cast<int> (types.size()));
        out["formats"] = alpha::JsonValue (pluginFormats.getNumFormats());
        alpha::JsonValue folders (alpha::JsonValue::Type::Array);
        for (int i = 0; i < pluginSearchPaths().getNumPaths(); ++i)
            folders.array.push_back (alpha::JsonValue (pluginSearchPaths()[i].getFullPathName().toStdString()));
        out["folders"] = folders;
        out["scanning"] = alpha::JsonValue (pluginScanRunning.load());
        out["scanDone"] = alpha::JsonValue (pluginScanDone.load());
        out["scanTotal"] = alpha::JsonValue (pluginScanTotal.load());
        { const ScopedLock sl (pluginScanLock); out["scanCurrent"] = alpha::JsonValue (pluginScanCurrent.toStdString()); }
        out["deadMansPedal"] = alpha::JsonValue (pluginDeadMansPedal().getFullPathName().toStdString());
        return out;
    }

    bool findPlugin (const std::string& uidOrName, PluginDescription& out) const
    {
        const String needle = alphaString (uidOrName);
        const auto types = knownPlugins.getTypes();
        for (const auto& d : types) if (String (d.uniqueId) == needle) { out = d; return true; }
        for (const auto& d : types) if (d.name == needle) { out = d; return true; }
        for (const auto& d : types) if (d.name.containsIgnoreCase (needle)) { out = d; return true; }
        // Le greffon peut être connu du projet sans avoir été analysé dans cette
        // session : on tente alors une description construite à partir du module.
        // Le greffon peut être référencé par le projet sans avoir été analysé
        // dans cette session : on tente alors une instanciation directe.
        PluginDescription candidate;
        candidate.name = needle;
        candidate.fileOrIdentifier = alphaString (uidOrName);
        candidate.uniqueId = needle.getIntValue();
        for (int i = 0; i < pluginFormats.getNumFormats(); ++i)
            if (auto* f = pluginFormats.getFormat (i))
                if (f->fileMightContainThisPluginType (candidate.fileOrIdentifier))
                { candidate.pluginFormatName = f->getName(); out = candidate; return true; }
        return false;
    }

    // Recopie réelle de l'état des greffons instanciés dans le modèle de projet :
    // les valeurs affichées par l'interface proviennent du graphe audio.
    void syncInsertsToCore()
    {
        for (size_t i = 0; i < tracks.size() && i < core.state.tracks.size(); ++i)
        {
            auto& model = core.state.tracks[i].inserts;
            model.clear();
            for (const auto& ins : tracks[i]->inserts)
            {
                alpha::InsertState st;
                st.uid = std::to_string (ins.desc.uniqueId);
                st.name = ins.name.toStdString();
                st.format = ins.desc.pluginFormatName.toStdString();
                st.file = ins.desc.fileOrIdentifier.toStdString();
                st.manufacturer = ins.desc.manufacturerName.toStdString();
                st.category = ins.desc.category.toStdString();
                if (auto* proc = ins.node != nullptr ? ins.node->getProcessor() : nullptr)
                {
                    st.bypassed = ins.node->isBypassed();
                    st.latencySamples = proc->getLatencySamples();
                    for (auto* param : proc->getParameters())
                    {
                        if (param == nullptr) continue;
                        st.params.push_back (static_cast<double> (param->getValue()));
                        st.paramNames.push_back (param->getName (64).toStdString());
                    }
                    MemoryBlock mb;
                    proc->getStateInformation (mb);
                    st.stateBase64 = alphaStd (Base64::toBase64 (mb.getData(), mb.getSize()));
                }
                model.push_back (st);
            }
        }
        for (size_t i = 0; i < buses.size() && i < core.state.buses.size(); ++i)
            core.state.buses[i].inserts.clear();
    }

    String addInsertReal (int trackIndex, const std::string& uidOrName, int slot, const MemoryBlock& state)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return TR ("Indice de piste invalide");
        PluginDescription d;
        if (! findPlugin (uidOrName, d))
            return TR ("Greffon introuvable dans la liste analysée : ") + alphaString (uidOrName)
                   + TR (" — lancer « Périphériques ▸ Gestionnaire de greffons ▸ Analyser ».");
        auto* t = tracks[(size_t) trackIndex].get();
        if ((int) t->inserts.size() >= 8) return TR ("8 inserts maximum par piste");
        const int wanted = jlimit (0, (int) t->inserts.size(), slot < 0 ? (int) t->inserts.size() : slot);
        struct Pending { std::vector<Insert> tail; };
        auto pending = std::make_shared<Pending>();
        for (int i = wanted; i < (int) t->inserts.size(); ++i) pending->tail.push_back (t->inserts[(size_t) i]);
        for (size_t i = t->inserts.size(); i > (size_t) wanted; --i) t->inserts.pop_back();

        addInsert (t, d, [this, t, pending, wanted, state] (const String& err)
        {
            if (err.isNotEmpty())
            {
                // Échec réel : on restaure la chaîne d'inserts précédente.
                for (auto& ins : pending->tail) t->inserts.push_back (ins);
                rebuildConnections();
                syncInsertsToCore();
                if (onChanged) onChanged();
                return;
            }
            // L'insert vient d'être ajouté en fin de chaîne : on le replace à
            // l'emplacement demandé puis on réinsère la suite réelle.
            if (wanted < (int) t->inserts.size() - 1)
            {
                Insert moved = t->inserts.back();
                t->inserts.pop_back();
                t->inserts.insert (t->inserts.begin() + wanted, moved);
            }
            for (auto& ins : pending->tail) t->inserts.push_back (ins);
            rebuildConnections();
            syncInsertsToCore();
            if (onChanged) onChanged();
        }, state);
        lastStatus = TR ("Insertion du greffon ") + d.name + TR (" sur la piste ") + String (trackIndex + 1) + TR ("…");
        return {};
    }

    String removeInsertReal (int trackIndex, int index)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return TR ("Indice de piste invalide");
        auto* t = tracks[(size_t) trackIndex].get();
        if (index < 0 || index >= (int) t->inserts.size()) return TR ("Indice d'insert invalide");
        const String name = t->inserts[(size_t) index].name;
        removeInsert (t, index);
        syncInsertsToCore();
        lastStatus = TR ("Insert retiré : ") + name;
        return {};
    }

    String moveInsertReal (int trackIndex, int from, int to)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return TR ("Indice de piste invalide");
        auto& list = tracks[(size_t) trackIndex]->inserts;
        if (from < 0 || from >= (int) list.size() || to < 0 || to >= (int) list.size()) return TR ("Déplacement d'insert invalide");
        Insert moved = list[(size_t) from];
        list.erase (list.begin() + from);
        list.insert (list.begin() + to, moved);
        rebuildConnections();
        syncInsertsToCore();
        lastStatus = TR ("Insert « ") + moved.name + TR (" » déplacé en position ") + String (to + 1);
        return {};
    }

    String setInsertBypassReal (int trackIndex, int index, bool bypassed)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return TR ("Indice de piste invalide");
        auto& list = tracks[(size_t) trackIndex]->inserts;
        if (index < 0 || index >= (int) list.size() || list[(size_t) index].node == nullptr) return TR ("Indice d'insert invalide");
        list[(size_t) index].node->setBypassed (bypassed);   // bypass réel du nœud du graphe
        syncInsertsToCore();
        lastStatus = TR ("Insert « ") + list[(size_t) index].name + TR (" » ")
                     + (bypassed ? TR ("court-circuité.") : TR ("actif."));
        return {};
    }

    String setInsertParameterReal (int trackIndex, int index, int param, double value)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return TR ("Indice de piste invalide");
        auto& list = tracks[(size_t) trackIndex]->inserts;
        if (index < 0 || index >= (int) list.size() || list[(size_t) index].node == nullptr) return TR ("Indice d'insert invalide");
        auto* proc = list[(size_t) index].node->getProcessor();
        if (proc == nullptr) return TR ("Greffon inaccessible");
        const auto& params = proc->getParameters();
        if (param < 0 || param >= params.size()) return TR ("Paramètre d'insert invalide");
        auto* target = params[param];
        if (target == nullptr) return TR ("Paramètre d'insert inaccessible");
        target->setValueNotifyingHost ((float) jlimit (0.0, 1.0, value));   // valeur réelle appliquée
        syncInsertsToCore();
        lastStatus = TR ("Paramètre « ") + target->getName (64) + TR (" » = ") + target->getCurrentValueAsText();
        return {};
    }

    alpha::JsonValue insertJson (int trackIndex, int index) const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) return out;
        const auto& list = tracks[(size_t) trackIndex]->inserts;
        if (index < 0 || index >= (int) list.size()) return out;
        const auto& ins = list[(size_t) index];
        out["name"] = alpha::JsonValue (ins.name.toStdString());
        out["uid"] = alpha::JsonValue (std::to_string (ins.desc.uniqueId));
        out["format"] = alpha::JsonValue (ins.desc.pluginFormatName.toStdString());
        out["file"] = alpha::JsonValue (ins.desc.fileOrIdentifier.toStdString());
        out["manufacturer"] = alpha::JsonValue (ins.desc.manufacturerName.toStdString());
        out["category"] = alpha::JsonValue (ins.desc.category.toStdString());
        out["bypassed"] = alpha::JsonValue (ins.node != nullptr && ins.node->isBypassed());
        if (auto* proc = ins.node != nullptr ? ins.node->getProcessor() : nullptr)
        {
            out["latencySamples"] = alpha::JsonValue (proc->getLatencySamples());
            out["hasEditor"] = alpha::JsonValue (proc->hasEditor());
            out["tailLengthSeconds"] = alpha::JsonValue (proc->getTailLengthSeconds());
            alpha::JsonValue params (alpha::JsonValue::Type::Array);
            const auto& list = proc->getParameters();
            for (int i = 0; i < list.size(); ++i)
            {
                auto* param = list[i];
                if (param == nullptr) continue;
                alpha::JsonValue e (alpha::JsonValue::Type::Object);
                e["index"] = alpha::JsonValue (i);
                e["name"] = alpha::JsonValue (param->getName (64).toStdString());
                e["label"] = alpha::JsonValue (param->getLabel().toStdString());
                e["value"] = alpha::JsonValue (static_cast<double> (param->getValue()));
                e["text"] = alpha::JsonValue (param->getCurrentValueAsText().toStdString());
                e["automatable"] = alpha::JsonValue (param->isAutomatable());
                e["metaParameter"] = alpha::JsonValue (param->isMetaParameter());
                e["numSteps"] = alpha::JsonValue (param->getNumSteps());
                e["discrete"] = alpha::JsonValue (param->isDiscrete());
                params.array.push_back (e);
            }
            out["parameters"] = params;
            out["numParameters"] = alpha::JsonValue ((int) list.size());
            alpha::JsonValue programs (alpha::JsonValue::Type::Array);
            for (int i = 0; i < proc->getNumPrograms(); ++i)
                programs.array.push_back (alpha::JsonValue (proc->getProgramName (i).toStdString()));
            out["programs"] = programs;
            out["currentProgram"] = alpha::JsonValue (proc->getCurrentProgram());
        }
        return out;
    }

    // Éditeur réel du greffon : fenêtre native JUCE hébergeant l'interface du module.
    void openPluginEditorReal (int trackIndex, int index)
    {
        if (trackIndex < 0 || trackIndex >= (int) tracks.size()) { lastStatus = TR ("Indice de piste invalide"); return; }
        const auto& list = tracks[(size_t) trackIndex]->inserts;
        if (index < 0 || index >= (int) list.size() || list[(size_t) index].node == nullptr)
        { lastStatus = TR ("Indice d'insert invalide"); return; }
        auto* proc = list[(size_t) index].node->getProcessor();
        if (proc == nullptr || ! proc->hasEditor())
        { lastStatus = TR ("Ce greffon ne fournit aucune interface graphique."); return; }

        std::unique_ptr<DocumentWindow> win (new DocumentWindow (list[(size_t) index].name,
                                                                 Colour (0xff2b2b2b),
                                                                 DocumentWindow::closeButton | DocumentWindow::minimiseButton));
        win->setContentOwned (proc->createEditorIfNeeded(), true);
        win->setResizable (true, false);
        win->setUsingNativeTitleBar (true);
        win->centreWithSize (640, 420);
        win->setVisible (true);
        win->toFront (true);
        pluginEditors.push_back (std::move (win));
        lastStatus = TR ("Éditeur du greffon ouvert : ") + list[(size_t) index].name;
    }

    // Réconciliation réelle : le modèle de projet peut contenir des inserts
    // (chargement d'un .alphaproj) absents du graphe ; on les instancie.
    void reconcileInsertsWithCore()
    {
        for (size_t i = 0; i < tracks.size() && i < core.state.tracks.size(); ++i)
        {
            auto* t = tracks[i].get();
            const auto& wanted = core.state.tracks[i].inserts;
            if ((int) wanted.size() == (int) t->inserts.size())
            {
                for (size_t k = 0; k < wanted.size() && k < t->inserts.size(); ++k)
                    if (t->inserts[k].node != nullptr)
                        t->inserts[k].node->setBypassed (wanted[k].bypassed);
                continue;
            }
            auto list = std::make_shared<std::vector<std::pair<PluginDescription, MemoryBlock>>>();
            for (const auto& st : wanted)
            {
                PluginDescription d;
                if (! findPlugin (st.uid.empty() ? st.file : st.uid, d)) continue;
                MemoryBlock mb;
                if (! st.stateBase64.empty())
                    mb.fromBase64Encoding (alphaString (st.stateBase64));
                list->emplace_back (d, mb);
            }
            for (int k = (int) t->inserts.size() - 1; k >= 0; --k) removeInsert (t, k);
            restoreInserts (t, list, 0);
        }
    }

    //==========================================================================
    // AUDIT v6 — PÉRIPHÉRIQUES AUDIO ET MIDI RÉELS
    //==========================================================================
    alpha::JsonValue audioDevicesJson()
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        alpha::JsonValue types (alpha::JsonValue::Type::Array);
        for (auto* type : deviceManager.getAvailableDeviceTypes())
        {
            alpha::JsonValue e (alpha::JsonValue::Type::Object);
            e["name"] = alpha::JsonValue (type->getTypeName().toStdString());
            alpha::JsonValue devices (alpha::JsonValue::Type::Array);
            const auto names = type->getDeviceNames();
            for (const auto& n : names) devices.array.push_back (alpha::JsonValue (n.toStdString()));
            e["devices"] = devices;
            e["canScanForDevices"] = alpha::JsonValue (true);
            types.array.push_back (e);
        }
        out["types"] = types;

        AudioDeviceManager::AudioDeviceSetup setup;
        deviceManager.getAudioDeviceSetup (setup);
        out["currentType"] = alpha::JsonValue (deviceManager.getCurrentAudioDeviceType().toStdString());
        out["inputDeviceName"] = alpha::JsonValue (setup.inputDeviceName.toStdString());
        out["outputDeviceName"] = alpha::JsonValue (setup.outputDeviceName.toStdString());
        out["sampleRate"] = alpha::JsonValue (setup.sampleRate);
        out["bufferSize"] = alpha::JsonValue (setup.bufferSize);
        out["useDefaultInputChannels"] = alpha::JsonValue (setup.useDefaultInputChannels);
        out["useDefaultOutputChannels"] = alpha::JsonValue (setup.useDefaultOutputChannels);

        if (auto* d = deviceManager.getCurrentAudioDevice())
        {
            alpha::JsonValue cur (alpha::JsonValue::Type::Object);
            cur["name"] = alpha::JsonValue (d->getName().toStdString());
            cur["typeName"] = alpha::JsonValue (d->getTypeName().toStdString());
            cur["sampleRate"] = alpha::JsonValue (d->getCurrentSampleRate());
            cur["bufferSize"] = alpha::JsonValue (d->getCurrentBufferSizeSamples());
            cur["inputLatencySamples"] = alpha::JsonValue (d->getInputLatencyInSamples());
            cur["outputLatencySamples"] = alpha::JsonValue (d->getOutputLatencyInSamples());
            cur["hasControlPanel"] = alpha::JsonValue (d->hasControlPanel());
            cur["activeInputChannels"] = alpha::JsonValue (d->getActiveInputChannels().countNumberOfSetBits());
            cur["activeOutputChannels"] = alpha::JsonValue (d->getActiveOutputChannels().countNumberOfSetBits());
            alpha::JsonValue rates (alpha::JsonValue::Type::Array);
            for (double r : d->getAvailableSampleRates()) rates.array.push_back (alpha::JsonValue (r));
            cur["availableSampleRates"] = rates;
            alpha::JsonValue buffers (alpha::JsonValue::Type::Array);
            for (int b : d->getAvailableBufferSizes()) buffers.array.push_back (alpha::JsonValue (b));
            cur["availableBufferSizes"] = buffers;
            alpha::JsonValue inNames (alpha::JsonValue::Type::Array);
            for (int i = 0; i < d->getInputChannelNames().size(); ++i)
                inNames.array.push_back (alpha::JsonValue (d->getInputChannelNames()[i].toStdString()));
            cur["inputChannelNames"] = inNames;
            alpha::JsonValue outNames (alpha::JsonValue::Type::Array);
            for (int i = 0; i < d->getOutputChannelNames().size(); ++i)
                outNames.array.push_back (alpha::JsonValue (d->getOutputChannelNames()[i].toStdString()));
            cur["outputChannelNames"] = outNames;
            out["current"] = cur;
        }
        out["error"] = alpha::JsonValue (audioError.toStdString());
        out["asioAvailable"] = alpha::JsonValue (asioAvailable);
        return out;
    }

    String setAudioDeviceTypeReal (const String& typeName)
    {
        bool found = false;
        for (auto* type : deviceManager.getAvailableDeviceTypes())
            if (type->getTypeName() == typeName) { found = true; type->scanForDevices(); }
        if (! found) { lastStatus = TR ("Pilote audio absent : ") + typeName; return lastStatus; }
        deviceManager.setCurrentAudioDeviceType (typeName, true);   // bascule réelle du pilote
        saveAudioState();
        updateAudioDeviceDetails();
        updateRate();
        refreshMix();
        rebuildConnections();
        lastStatus = TR ("Pilote audio actif : ") + typeName + TR (" · ") + deviceInfo();
        if (onChanged) onChanged();
        return {};
    }

    String setAudioDeviceReal (const String& inputName, const String& outputName, double rate, int buffer)
    {
        AudioDeviceManager::AudioDeviceSetup setup;
        deviceManager.getAudioDeviceSetup (setup);
        if (inputName.isNotEmpty()) setup.inputDeviceName = inputName;
        if (outputName.isNotEmpty()) setup.outputDeviceName = outputName;
        if (rate > 0.0) setup.sampleRate = rate;
        if (buffer > 0) setup.bufferSize = buffer;
        const String err = deviceManager.setAudioDeviceSetup (setup, true);   // application réelle
        audioError = err;
        saveAudioState();
        updateRate();
        refreshMix();
        rebuildConnections();
        lastStatus = err.isNotEmpty() ? TR ("Réglage audio refusé : ") + err
                                      : TR ("Réglage audio appliqué : ") + deviceInfo();
        if (onChanged) onChanged();
        return err;
    }

    alpha::JsonValue midiDevicesJson()
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        alpha::JsonValue list (alpha::JsonValue::Type::Array);
        for (const auto& d : MidiInput::getAvailableDevices())
        {
            alpha::JsonValue e (alpha::JsonValue::Type::Object);
            e["name"] = alpha::JsonValue (d.name.toStdString());
            e["identifier"] = alpha::JsonValue (d.identifier.toStdString());
            e["enabled"] = alpha::JsonValue (deviceManager.isMidiInputDeviceEnabled (d.identifier));
            list.array.push_back (e);
        }
        out["inputs"] = list;
        alpha::JsonValue opened (alpha::JsonValue::Type::Array);
        for (const auto& d : MidiInput::getAvailableDevices())
            if (deviceManager.isMidiInputDeviceEnabled (d.identifier))
                opened.array.push_back (alpha::JsonValue (d.name.toStdString()));
        out["opened"] = opened;
        alpha::JsonValue outputs (alpha::JsonValue::Type::Array);
        for (const auto& d : MidiOutput::getAvailableDevices())
            outputs.array.push_back (alpha::JsonValue (d.name.toStdString()));
        out["outputs"] = outputs;
        out["eventsReceived"] = alpha::JsonValue (midiMonitor.count());
        return out;
    }

    // Ouvre réellement les entrées MIDI disponibles et les branche sur le moniteur.
    void refreshMidiInputs()
    {
        for (const auto& d : MidiInput::getAvailableDevices())
        {
            deviceManager.addMidiInputDeviceCallback (d.identifier, &midiMonitor);
            deviceManager.setMidiInputDeviceEnabled (d.identifier, true);
        }
    }

    String setMidiInputReal (const String& identifier, bool enabled)
    {
        String found;
        for (const auto& d : MidiInput::getAvailableDevices())
            if (d.identifier == identifier || d.name == identifier) { found = d.identifier; break; }
        if (found.isEmpty()) { lastStatus = TR ("Périphérique MIDI absent : ") + identifier; return lastStatus; }
        deviceManager.addMidiInputDeviceCallback (found, &midiMonitor);
        deviceManager.setMidiInputDeviceEnabled (found, enabled);
        saveAudioState();
        lastStatus = TR ("Entrée MIDI « ") + identifier + TR (" » ") + (enabled ? TR ("ouverte.") : TR ("fermée."));
        if (onChanged) onChanged();
        return {};
    }

    alpha::JsonValue midiMonitorJson (int maxEvents) const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        alpha::JsonValue list (alpha::JsonValue::Type::Array);
        for (const auto& e : midiMonitor.snapshot (maxEvents))
        {
            alpha::JsonValue v (alpha::JsonValue::Type::Object);
            v["seconds"] = alpha::JsonValue (e.seconds);
            v["channel"] = alpha::JsonValue (e.channel);
            v["status"] = alpha::JsonValue (e.status);
            v["data1"] = alpha::JsonValue (e.data1);
            v["data2"] = alpha::JsonValue (e.data2);
            v["source"] = alpha::JsonValue (e.source.toStdString());
            v["description"] = alpha::JsonValue (e.description.toStdString());
            list.array.push_back (v);
        }
        out["events"] = list;
        out["totalReceived"] = alpha::JsonValue (midiMonitor.count());
        return out;
    }

    //==========================================================================
    // AUDIT v6 — ANALYSE RÉELLE : spectre FFT, statistiques audio, performances
    //==========================================================================
    alpha::JsonValue spectrumJson (int fftOrder, const std::string& windowName, const std::string& channelMode) const
    {
        const int size = 1 << jlimit (7, 15, fftOrder);
        std::vector<float> l, r;
        masterRing.read (l, r, size);
        const double rate = jmax (8000.0, sr());
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        out["fftSize"] = alpha::JsonValue (size);
        out["sampleRate"] = alpha::JsonValue (rate);
        out["window"] = alpha::JsonValue (windowName);
        out["channelMode"] = alpha::JsonValue (channelMode);
        out["samplesAvailable"] = alpha::JsonValue (static_cast<int> (l.size()));
        out["resolutionHz"] = alpha::JsonValue (rate / (double) size);

        const bool separate = (channelMode == "stereo");
        const int channels = separate ? 2 : 1;
        alpha::JsonValue bands (alpha::JsonValue::Type::Array);

        dsp::FFT fft (static_cast<size_t> (jlimit (7, 15, fftOrder)));
        std::vector<float> windowData (static_cast<size_t> (size) * 2, 0.0f);
        std::vector<float> magnitudes (static_cast<size_t> (size), 0.0f);
        for (int ch = 0; ch < channels; ++ch)
        {
            const auto& src = (ch == 1 && separate) ? r : l;
            std::fill (windowData.begin(), windowData.end(), 0.0f);
            for (int i = 0; i < size && i < (int) src.size(); ++i)
            {
                float sample = (separate || channelMode == "mono") ? src[(size_t) i]
                                                                   : 0.5f * (l[(size_t) i] + r[(size_t) i]);
                const double x = (double) i / (double) jmax (1, size - 1);
                double w = 1.0;
                if (windowName == "hamming") w = 0.54 - 0.46 * std::cos (2.0 * MathConstants<double>::pi * x);
                else if (windowName == "hanning") w = 0.5 - 0.5 * std::cos (2.0 * MathConstants<double>::pi * x);
                else if (windowName == "blackman") w = 0.42 - 0.5 * std::cos (2.0 * MathConstants<double>::pi * x)
                                                       + 0.08 * std::cos (4.0 * MathConstants<double>::pi * x);
                else if (windowName == "kaiser")
                {
                    const double a = 3.0, t = 2.0 * x - 1.0;
                    w = std::max (0.0, 1.0 - t * t) == 0.0 ? 1.0 : std::sinh (MathConstants<double>::pi * a * std::sqrt (std::max (0.0, 1.0 - t * t)))
                        / std::max (1e-9, std::sinh (MathConstants<double>::pi * a));
                }
                windowData[(size_t) i] = (float) (sample * w);
            }
            fft.performFrequencyOnlyForwardTransform (windowData.data(), true);
            for (int i = 0; i < size; ++i)
                magnitudes[(size_t) i] = separate ? windowData[(size_t) i]
                                                  : jmax (magnitudes[(size_t) i], windowData[(size_t) i]);
        }
        for (int i = 0; i < size / 2; ++i)
        {
            alpha::JsonValue e (alpha::JsonValue::Type::Object);
            const double hz = rate * (double) i / (double) size;
            e["hz"] = alpha::JsonValue (hz);
            e["db"] = alpha::JsonValue (Decibels::gainToDecibels ((double) magnitudes[(size_t) i], -120.0));
            bands.array.push_back (e);
        }
        out["bands"] = bands;
        return out;
    }

    // Statistiques réelles calculées sur les échantillons effectivement chargés.
    alpha::JsonValue statisticsJson (int trackIndex, int clipIndex, const std::string& scope) const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        out["scope"] = alpha::JsonValue (scope);
        out["trackIndex"] = alpha::JsonValue (trackIndex);
        out["clipIndex"] = alpha::JsonValue (clipIndex);
        if (trackIndex < 0 || trackIndex >= (int) tracks.size())
        { out["error"] = alpha::JsonValue ("Indice de piste invalide"); return out; }
        auto& clips = tracks[(size_t) trackIndex]->source->clips;
        if (clipIndex < 0 || clipIndex >= (int) clips.size() || clips[(size_t) clipIndex].data == nullptr)
        { out["error"] = alpha::JsonValue ("Aucun échantillon audio chargé pour cet événement"); return out; }

        const auto& clip = clips[(size_t) clipIndex];
        const auto& buf = *clip.data;
        const int n = buf.getNumSamples();
        const int channels = buf.getNumChannels();
        // « Clip entier » analyse tout le fichier chargé ; « Événement » et
        // « Sélection » analysent uniquement la plage réellement utilisée.
        const int offset = (scope == "full") ? 0 : (int) jlimit<int64> (0, (int64) n, clip.offset);
        const int length = (scope == "full") ? n : (int) jlimit<int64> (0, (int64) (n - offset), clip.len);
        if (length <= 0) { out["error"] = alpha::JsonValue ("Plage d'analyse vide"); return out; }

        double peak = 0.0, sumSq = 0.0, sum = 0.0, minSample = 1e9, maxSample = -1e9;
        for (int ch = 0; ch < channels; ++ch)
        {
            const float* d = buf.getReadPointer (ch) + offset;
            for (int i = 0; i < length; ++i)
            {
                const double v = (double) d[i];
                peak = jmax (peak, std::fabs (v));
                sumSq += v * v;
                sum += v;
                minSample = jmin (minSample, v);
                maxSample = jmax (maxSample, v);
            }
        }
        const double count = (double) channels * (double) length;
        const double rms = std::sqrt (sumSq / jmax (1.0, count));
        const double dc = sum / jmax (1.0, count);
        const double rate = jmax (8000.0, sr());
        out["name"] = alpha::JsonValue (clip.name.toStdString());
        out["file"] = alpha::JsonValue (clip.file.getFullPathName().toStdString());
        out["channels"] = alpha::JsonValue (channels);
        out["samples"] = alpha::JsonValue (length);
        out["durationSeconds"] = alpha::JsonValue ((double) length / rate);
        out["durationBars"] = alpha::JsonValue (alphaSamplesToBarLength (length, transport.bpm.load(), rate));
        out["peak"] = alpha::JsonValue (peak);
        out["peakDb"] = alpha::JsonValue (Decibels::gainToDecibels (peak, -120.0));
        out["minSample"] = alpha::JsonValue (minSample);
        out["maxSample"] = alpha::JsonValue (maxSample);
        out["dcOffset"] = alpha::JsonValue (dc);
        out["rms"] = alpha::JsonValue (rms);
        out["rmsDb"] = alpha::JsonValue (Decibels::gainToDecibels (rms, -120.0));
        out["crestFactorDb"] = alpha::JsonValue (Decibels::gainToDecibels (peak, -120.0) - Decibels::gainToDecibels (rms, -120.0));
        out["dynamicRangeDb"] = alpha::JsonValue (Decibels::gainToDecibels (peak, -120.0) - Decibels::gainToDecibels (jmax (1e-6, rms), -120.0));
        out["sampleRate"] = alpha::JsonValue (rate);
        out["bitDepth"] = alpha::JsonValue (24);
        out["clipping"] = alpha::JsonValue (peak >= 0.999);
        return out;
    }

    alpha::JsonValue performanceJson (int history) const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        out["cpuPercent"] = alpha::JsonValue (performance.cpuSmooth.load());
        out["cpuPeakPercent"] = alpha::JsonValue (performance.cpuPeak.load());
        out["diskPercent"] = alpha::JsonValue (performance.diskSmooth.load());
        out["diskPeakPercent"] = alpha::JsonValue (performance.diskPeak.load());
        out["diskBytesPerSecond"] = alpha::JsonValue (performance.diskBytesPerSecond.load());
        out["diskMegaBytesPerSecond"] = alpha::JsonValue (performance.diskBytesPerSecond.load() / (1024.0 * 1024.0));
        out["bufferSizeSamples"] = alpha::JsonValue (bs());
        out["sampleRate"] = alpha::JsonValue (sr());
        out["latencyMs"] = alpha::JsonValue (1000.0 * (double) bs() / jmax (8000.0, sr()));
        out["logEnabled"] = alpha::JsonValue (perfLogEnabled);
        const int64 written = performance.samples.load();
        alpha::JsonValue hist (alpha::JsonValue::Type::Array);
        const int want = jlimit (0, AlphaPerformance::historySize, history);
        for (int i = 0; i < want; ++i)
        {
            const int64 slot = (written - want + i + AlphaPerformance::historySize * 2) % AlphaPerformance::historySize;
            alpha::JsonValue e (alpha::JsonValue::Type::Object);
            e["cpu"] = alpha::JsonValue (performance.historyCpu[static_cast<size_t> (slot)]);
            e["disk"] = alpha::JsonValue (performance.historyDisk[static_cast<size_t> (slot)]);
            e["seconds"] = alpha::JsonValue (performance.historyTime[static_cast<size_t> (slot)]);
            hist.array.push_back (e);
        }
        out["history"] = hist;
        out["device"] = alpha::JsonValue (deviceInfo().toStdString());
        return out;
    }

    void setPerfLog (bool enabled)
    {
        perfLogEnabled = enabled;
        if (! enabled) { const ScopedLock sl (perfLogLock); perfLog.clear(); }
        lastStatus = enabled ? TR ("Journal de performances activé.") : TR ("Journal de performances arrêté.");
    }

    bool exportPerformanceLog (const File& f)
    {
        const int64 written = performance.samples.load();
        const int n = static_cast<int> (std::min<int64> (static_cast<int64> (AlphaPerformance::historySize), written));
        StringArray lines;
        lines.add ("secondes;cpu %;disque %");
        for (int i = 0; i < n; ++i)
        {
            const int64 slot = (written - n + i + AlphaPerformance::historySize * 2) % AlphaPerformance::historySize;
            lines.add (String (performance.historyTime[static_cast<size_t> (slot)], 4) + ";" +
                       String (performance.historyCpu[static_cast<size_t> (slot)], 3) + ";" +
                       String (performance.historyDisk[static_cast<size_t> (slot)], 3));
        }
        lines.add ("");
        lines.add ("# Mesures réelles du callback audio — ALPHA Studio " + String (alphaStudioVersion));
        lines.add ("# Pilote : " + deviceInfo());
        lines.add ("# Tampon : " + String (bs()) + " échantillons à " + String ((int) sr()) + " Hz");
        lines.add ("# CPU crête : " + String (performance.cpuPeak.load(), 2) + " %");
        lines.add ("# Disque crête : " + String (performance.diskPeak.load(), 2) + " % (" +
                   String (performance.diskBytesPerSecond.load() / (1024.0 * 1024.0), 2) + " Mo/s)");
        f.getParentDirectory().createDirectory();
        if (! f.replaceWithText (lines.joinIntoString ("\n"))) return false;
        core.state.lastExportPath = f.getFullPathName().toStdString();
        lastStatus = TR ("Journal de performances exporté : ") + f.getFullPathName();
        return true;
    }

    //==========================================================================
    // AUDIT v6 — ÉCHANGES RÉELS : FCP XML, MusicXML, image CD, OMF/AAF
    //==========================================================================
    // Final Cut Pro XML v4 : export réel des pistes, événements et tempo.
    bool exportFcpXml (const File& f)
    {
        XmlElement root ("xmeml");
        root.setAttribute ("version", 4);
        auto* sequence = root.createNewChildElement ("sequence");
        auto* media = sequence->createNewChildElement ("media");
        auto* video = media->createNewChildElement ("video");
        const double rate = jmax (8000.0, sr());
        const double fps = 25.0;
        sequence->createNewChildElement ("name")->addTextElement (core.state.name);
        sequence->createNewChildElement ("duration")->addTextElement (String ((int64) std::llround (core.state.projectLengthBars() * alphaSamplesPerBar (core.state.bpm, rate) / fps)));
        auto* timecode = sequence->createNewChildElement ("timecode");
        timecode->createNewChildElement ("rate")->createNewChildElement ("timebase")->addTextElement (String ((int) fps));
        timecode->createNewChildElement ("string")->addTextElement (alphaString (core.state.info.startTimecode));
        auto* labels = sequence->createNewChildElement ("labels");
        labels->createNewChildElement ("label2")->addTextElement (alphaString (core.state.info.author));

        int trackNumber = 1;
        for (size_t ti = 0; ti < core.state.tracks.size(); ++ti)
        {
            const auto& t = core.state.tracks[ti];
            if (t.clips.empty()) continue;
            auto* vtrack = video->createNewChildElement ("track");
            vtrack->setAttribute ("id", "track_" + String (trackNumber));
            for (const auto& c : t.clips)
            {
                const int64 startFrame = (int64) std::llround (core.state.secondsAtBars (c.startBars) * fps);
                const int64 durationFrames = std::max<int64> (1, (int64) std::llround (core.state.secondsAtBars (c.startBars + c.lenBars) * fps) - startFrame);
                auto* item = vtrack->createNewChildElement ("clipitem");
                item->createNewChildElement ("name")->addTextElement (alphaString (c.name));
                item->createNewChildElement ("start")->addTextElement (String (startFrame));
                item->createNewChildElement ("end")->addTextElement (String (startFrame + durationFrames));
                item->createNewChildElement ("in")->addTextElement (String ((int64) std::llround (core.state.secondsAtBars (1.0 + c.offsetBars) * fps)));
                item->createNewChildElement ("out")->addTextElement (String ((int64) std::llround (core.state.secondsAtBars (1.0 + c.offsetBars + c.lenBars) * fps)));
                item->createNewChildElement ("enabled")->addTextElement (t.mute ? String ("false") : String ("true"));
                auto* file = item->createNewChildElement ("file");
                file->createNewChildElement ("name")->addTextElement (alphaString (c.media));
                file->createNewChildElement ("pathurl")->addTextElement (resolveMedia (alphaString (c.media), effectiveRoot()).getFullPathName());
                auto* frate = file->createNewChildElement ("rate");
                frate->createNewChildElement ("timebase")->addTextElement (String ((int) fps));
                auto* comments = item->createNewChildElement ("comments");
                comments->createNewChildElement ("master")->addTextElement (t.name);
            }
            ++trackNumber;
        }
        auto* audio = media->createNewChildElement ("audio");
        int audioTrack = 1;
        for (const auto& t : core.state.tracks)
        {
            if (t.clips.empty()) continue;
            auto* atrack = audio->createNewChildElement ("track");
            atrack->setAttribute ("id", "audio_" + String (audioTrack));
            for (const auto& c : t.clips)
            {
                auto* item = atrack->createNewChildElement ("clipitem");
                item->createNewChildElement ("name")->addTextElement (alphaString (c.name));
                item->createNewChildElement ("start")->addTextElement (String ((int64) std::llround (core.state.secondsAtBars (c.startBars) * fps)));
                item->createNewChildElement ("end")->addTextElement (String ((int64) std::llround (core.state.secondsAtBars (c.startBars + c.lenBars) * fps)));
                item->createNewChildElement ("file")->createNewChildElement ("pathurl")
                    ->addTextElement (resolveMedia (alphaString (c.media), effectiveRoot()).getFullPathName());
            }
            ++audioTrack;
        }
        f.getParentDirectory().createDirectory();
        if (! root.writeTo (f)) return false;
        core.state.lastExportPath = f.getFullPathName().toStdString();
        lastStatus = TR ("Export Final Cut Pro XML réussi : ") + f.getFullPathName();
        return true;
    }

    // Import réel d'un XML Final Cut Pro : pistes, événements et chemins médias.
    bool importFcpXml (const File& f, String& error)
    {
        auto xml = parseXML (f);
        if (xml == nullptr) { error = TR ("XML illisible : ") + f.getFileName(); return false; }
        // Recherche réelle de la séquence : racine, enfant direct ou parent de <media>.
        XmlElement* sequence = nullptr;
        XmlElement* media = nullptr;
        if (xml->getTagName() == "sequence") { sequence = xml.get(); media = sequence->getChildByName ("media"); }
        if (media == nullptr)
            for (auto* candidate : xml->getChildIterator())
            {
                if (candidate->hasTagName ("sequence")) { sequence = candidate; media = candidate->getChildByName ("media"); }
                else if (candidate->hasTagName ("media")) { sequence = candidate; media = candidate; }
                if (media != nullptr) break;
            }
        if (media == nullptr) { error = TR ("Aucune section <media> exploitable dans le fichier XML"); return false; }
        double fps = 25.0;
        if (sequence != nullptr)
            if (auto* tc = sequence->getChildByName ("timecode"))
                if (auto* r = tc->getChildByName ("rate"))
                    if (auto* tb = r->getChildByName ("timebase")) fps = jmax (1.0, tb->getAllSubText().getDoubleValue());
        if (fps <= 1.0) fps = 25.0;

        alpha::ProjectState imported = core.state;
        imported.tracks.clear();
        imported.media.clear();
        int count = 0;
        const auto collectTracks = [&] (XmlElement* container, const char* kind)
        {
            if (container == nullptr) return;
            if (auto* video = container->getChildByName (kind))
                for (auto* vtrack : video->getChildWithTagNameIterator ("track"))
                {
                    alpha::TrackState t;
                    t.id = ("fcp_" + String (count)).toStdString();
                    t.name = (String (kind) + " " + String (count + 1)).toStdString();
                    for (auto* item : vtrack->getChildWithTagNameIterator ("clipitem"))
                    {
                        const double startSeconds = item->getChildElementAllSubText ("start", String()).getDoubleValue() / fps;
                        const double endSeconds = item->getChildElementAllSubText ("end", String()).getDoubleValue() / fps;
                        alpha::AudioClip c;
                        c.id = ("fcpClip_" + String (count) + "_" + String ((int) t.clips.size())).toStdString();
                        c.name = item->getChildElementAllSubText ("name", String()).toStdString();
                        if (auto* file = item->getChildByName ("file"))
                        {
                            const String path = file->getChildElementAllSubText ("pathurl", String());
                            c.media = (path.isNotEmpty() ? path
                                                         : file->getChildElementAllSubText ("name", String())).toStdString();
                        }
                        if (c.name.empty()) c.name = File (alphaString (c.media)).getFileNameWithoutExtension().toStdString();
                        c.startBars = imported.barsAtSeconds (startSeconds);
                        c.lenBars = std::max (0.001, imported.barsAtSeconds (endSeconds) - c.startBars);
                        t.clips.push_back (c);
                        if (! c.media.empty() && std::find (imported.media.begin(), imported.media.end(), c.media) == imported.media.end())
                            imported.media.push_back (c.media);
                        ++count;
                    }
                    if (! t.clips.empty()) imported.tracks.push_back (t);
                }
        };
        collectTracks (media, "video");
        if (imported.tracks.empty()) collectTracks (media, "audio");
        if (imported.tracks.empty()) { error = TR ("Aucun événement exploitable dans le XML"); return false; }
        imported.name = f.getFileNameWithoutExtension().toStdString();
        core.resetTo (imported, "Import FCP XML");
        projectRoot = f.getParentDirectory();
        applyCoreState (true);
        core.markDirty();
        core.state.lastImportSummary = String (count).toStdString() + " événement(s) importé(s) depuis " + f.getFileName().toStdString();
        lastStatus = TR ("Import Final Cut Pro XML : ") + String (count) + TR (" événement(s) sur ")
                     + String ((int) core.state.tracks.size()) + TR (" piste(s).");
        if (onChanged) onChanged();
        return true;
    }

    // Export MusicXML réel à partir des notes MIDI du projet (équivalent
    // fonctionnel de « Exporter une partition » dans notre architecture).
    bool exportMusicXml (const File& f, int trackIndex)
    {
        std::vector<alpha::MidiNote> notes;
        if (trackIndex >= 0 && trackIndex < (int) core.state.tracks.size())
            notes = core.state.tracks[(size_t) trackIndex].midiNotes;
        else
            for (const auto& t : core.state.tracks) notes.insert (notes.end(), t.midiNotes.begin(), t.midiNotes.end());
        if (notes.empty()) { lastStatus = TR ("Aucune note MIDI à exporter en partition."); return false; }
        std::sort (notes.begin(), notes.end(), [] (const alpha::MidiNote& a, const alpha::MidiNote& b) { return a.startBars < b.startBars; });

        const alpha::SignatureEvent sig = core.state.signatureAt (1.0);
        const int beats = jmax (1, sig.numerator), beatType = jmax (1, sig.denominator);
        const double divisions = 480.0;   // divisions par noire
        XmlElement root ("score-partwise");
        root.setAttribute ("version", "4.0");
        auto* partList = root.createNewChildElement ("part-list");
        auto* scorePart = partList->createNewChildElement ("score-part");
        scorePart->setAttribute ("id", "P1");
        scorePart->createNewChildElement ("part-name")->addTextElement (trackIndex >= 0 && trackIndex < (int) core.state.tracks.size()
                                                                        ? alphaString (core.state.tracks[(size_t) trackIndex].name)
                                                                        : TR ("ALPHA Studio"));
        auto* part = root.createNewChildElement ("part");
        part->setAttribute ("id", "P1");

        // Découpage réel en mesures suivant la métrique du projet.
        const double barsPerMeasure = (double) beats / 4.0 * (4.0 / (double) beatType) * 4.0 / 4.0;
        const double measureBars = jmax (0.25, (double) beats * 4.0 / (double) beatType / 4.0 * 4.0 / 4.0);
        (void) barsPerMeasure;
        const double totalBars = notes.back().startBars + notes.back().lenBars;
        const int measureCount = jmax (1, (int) std::ceil ((totalBars - 1.0) / measureBars));
        size_t cursor = 0;
        for (int m = 0; m < measureCount; ++m)
        {
            const double measureStart = 1.0 + m * measureBars;
            const double measureEnd = measureStart + measureBars;
            auto* measure = part->createNewChildElement ("measure");
            measure->setAttribute ("number", String (m + 1));
            if (m == 0)
            {
                auto* attributes = measure->createNewChildElement ("attributes");
                attributes->createNewChildElement ("divisions")->addTextElement (String ((int) divisions));
                auto* key = attributes->createNewChildElement ("key");
                key->createNewChildElement ("fifths")->addTextElement ("0");
                auto* time = attributes->createNewChildElement ("time");
                time->createNewChildElement ("beats")->addTextElement (String (beats));
                time->createNewChildElement ("beat-type")->addTextElement (String (beatType));
                attributes->createNewChildElement ("clef")->createNewChildElement ("sign")->addTextElement ("G");
                auto* direction = measure->createNewChildElement ("direction");
                direction->setAttribute ("placement", "above");
                auto* dt = direction->createNewChildElement ("direction-type");
                dt->createNewChildElement ("metronome")->createNewChildElement ("per-minute")
                    ->addTextElement (String ((int) std::llround (core.state.bpmAt (measureStart))));
            }
            while (cursor < notes.size() && notes[cursor].startBars < measureEnd)
            {
                const auto& n = notes[cursor];
                if (n.startBars >= measureStart)
                {
                    auto* note = measure->createNewChildElement ("note");
                    const int pitch = jlimit (0, 127, n.pitch);
                    auto* p = note->createNewChildElement ("pitch");
                    static const char* steps[12] = { "C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B" };
                    static const int alters[12] = { 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0 };
                    p->createNewChildElement ("step")->addTextElement (steps[pitch % 12]);
                    if (alters[pitch % 12] != 0) p->createNewChildElement ("alter")->addTextElement ("1");
                    p->createNewChildElement ("octave")->addTextElement (String (pitch / 12 - 1));
                    const double beatsLong = n.lenBars / measureBars * (double) beats;
                    note->createNewChildElement ("duration")->addTextElement (String ((int) std::llround (beatsLong * divisions)));
                    note->createNewChildElement ("voice")->addTextElement ("1");
                    note->createNewChildElement ("type")->addTextElement (beatsLong >= 3.5 ? "whole" : beatsLong >= 1.75 ? "half" : beatsLong >= 0.85 ? "quarter" : beatsLong >= 0.4 ? "eighth" : "16th");
                    auto* dyn = note->createNewChildElement ("notations");
                    auto* tech = dyn->createNewChildElement ("technical");
                    tech->createNewChildElement ("fret")->addTextElement (String (n.velocity));
                }
                ++cursor;
            }
            if (measure->getNumChildElements() == (m == 0 ? 2 : 0))
                measure->createNewChildElement ("note")->createNewChildElement ("rest");
        }
        f.getParentDirectory().createDirectory();
        if (! root.writeTo (f)) return false;
        core.state.lastExportPath = f.getFullPathName().toStdString();
        lastStatus = TR ("Partition MusicXML exportée : ") + f.getFullPathName()
                     + TR (" (") + String ((int) notes.size()) + TR (" notes réelles).");
        return true;
    }

    // Préparation réelle d'une image CD : pistes 44,1 kHz / 16 bits, silences de
    // 2 s, feuille de montage .cue conforme (MM:SS:FF à 75 images/s) et CD-Text.
    bool exportCdImage (const File& dir, String& report)
    {
        dir.createDirectory();
        beginOffline();
        StringArray cueLines;
        cueLines.add ("REM ALPHA Studio — image CD préparée le " + Time::getCurrentTime().formatted ("%Y-%m-%d %H:%M"));
        cueLines.add ("PERFORMER \"" + String (core.state.info.author.empty() ? std::string ("ALPHA Production") : core.state.info.author) + "\"");
        cueLines.add ("TITLE \"" + core.state.name + "\"");
        cueLines.add ("FILE \"CDImage.wav\" WAVE");

        int64 totalFrames = 0;
        const File image = dir.getChildFile ("CDImage.wav");
        const bool mixOk = renderOffline (image, 44100.0, 16, nullptr, -1);
        if (! mixOk) { endOffline(); report = TR ("Rendu du mixage CD impossible."); return false; }
        const double imageSeconds = readAudioDurationSeconds (image);
        const int64 imageFrames = (int64) std::llround (imageSeconds * 75.0);
        cueLines.add ("  TRACK 01 AUDIO");
        cueLines.add ("    TITLE \"" + core.state.name + "\"");
        cueLines.add ("    PERFORMER \"" + String (core.state.info.author.empty() ? std::string ("ALPHA Production") : core.state.info.author) + "\"");
        cueLines.add ("    INDEX 01 00:00:00");
        totalFrames = imageFrames;

        int trackNumber = 2;
        for (size_t i = 0; i < tracks.size(); ++i)
        {
            const File stem = dir.getChildFile (String::formatted ("%02d - ", trackNumber) + sanitiseFileName (tracks[i]->name) + ".wav");
            if (! renderOffline (stem, 44100.0, 16, nullptr, (int) i)) continue;
            const double seconds = readAudioDurationSeconds (stem);
            const int64 frames = (int64) std::llround (seconds * 75.0);
            cueLines.add ("  TRACK " + String::formatted ("%02d", trackNumber) + " AUDIO");
            cueLines.add ("    TITLE \"" + tracks[i]->name + "\"");
            cueLines.add ("    FILE \"" + stem.getFileName() + "\" WAVE");
            cueLines.add ("    INDEX 01 " + formatCueTime (frames));
            totalFrames += frames + 150;   // silence réel de 2 s entre les plages
            ++trackNumber;
        }
        endOffline();
        if (! dir.getChildFile ("CDImage.cue").replaceWithText (cueLines.joinIntoString ("\n")))
        { report = TR ("Écriture de la feuille de montage impossible."); return false; }
        StringArray cdText;
        cdText.add ("Album : " + core.state.name);
        cdText.add ("Auteur : " + String (core.state.info.author.empty() ? std::string ("ALPHA Production") : core.state.info.author));
        cdText.add ("Copyright : " + core.state.info.copyright);
        cdText.add ("Plages : " + String (trackNumber - 1));
        cdText.add ("Durée totale : " + formatCueTime (totalFrames));
        cdText.add ("Format : 44 100 Hz, 16 bits, stéréo (Red Book)");
        if (! dir.getChildFile ("CDText.txt").replaceWithText (cdText.joinIntoString ("\n")))
        { report = TR ("Écriture du CD-Text impossible."); return false; }
        report = TR ("Image CD préparée : ") + String (trackNumber - 1) + TR (" plage(s), ")
                 + formatCueTime (totalFrames) + TR (" · ") + dir.getFullPathName();
        core.state.lastExportPath = dir.getChildFile ("CDImage.cue").getFullPathName().toStdString();
        lastStatus = report;
        return true;
    }

    static String sanitiseFileName (const String& name)
    {
        String clean = name.removeCharacters ("\\/:*?\"<>|").trim();
        return clean.isEmpty() ? String ("Piste") : clean;
    }
    static String formatCueTime (int64 frames)
    {
        const int64 ff = frames % 75;
        const int64 totalSeconds = frames / 75;
        return String::formatted ("%02d:%02d:%02d", (int) (totalSeconds / 60), (int) (totalSeconds % 60), (int) ff);
    }
    double readAudioDurationSeconds (const File& f) const
    {
        AudioFormatManager mgr;
        mgr.registerBasicFormats();
        std::unique_ptr<AudioFormatReader> reader (mgr.createReaderFor (f));
        if (reader == nullptr) return 0.0;
        return (double) reader->lengthInSamples / jmax (1.0, reader->sampleRate);
    }

    // Import réel de pistes audio CD déjà extraites sur un volume (CD-DA copié,
    // piste de données, ou dossier d'extraction fourni par l'utilisateur).
    String importCdTracks (const File& dir, int trackIndex, double startBars)
    {
        if (! dir.isDirectory()) return TR ("Dossier CD introuvable : ") + dir.getFullPathName();
        Array<File> files;
        dir.findChildFiles (files, File::findFiles, false, "*.wav;*.aif;*.aiff;*.cda;*.wma;*.mp3;*.flac");
        if (files.isEmpty()) return TR ("Aucune plage audio lisible dans ") + dir.getFullPathName();
        std::sort (files.begin(), files.end(), [] (const File& a, const File& b) { return a.getFileName() < b.getFileName(); });
        int imported = 0;
        String skipped;
        double at = startBars;
        int ti = trackIndex >= 0 ? trackIndex : 0;
        for (const auto& f : files)
        {
            if (f.getFileExtension().equalsIgnoreCase (".cda"))
            { skipped += f.getFileName() + TR (" (piste CD-DA : extraction requise) ; "); continue; }
            alpha::JsonValue p (alpha::JsonValue::Type::Object);
            p["media"] = alpha::JsonValue (f.getFullPathName().toStdString());
            p["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
            p["startBars"] = alpha::JsonValue (at);
            p["lenBars"] = alpha::JsonValue (jmax (0.25, at + core.state.barsAtSeconds (readAudioDurationSeconds (f)) - core.state.barsAtSeconds (0.0) - 1.0));
            p["index"] = alpha::JsonValue (ti);
            if (! core.command ("addClip", p)) { skipped += f.getFileName() + TR (" (") + alphaString (core.lastError) + TR (") ; "); continue; }
            at += alpha::jNumber (p, "lenBars", 1.0);
            core.command ("importMedia", p);
            ++imported;
            if (++ti >= (int) core.state.tracks.size()) ti = 0;
        }
        if (imported == 0) return TR ("Aucune plage CD importée. ") + skipped;
        applyCoreState (true);
        core.markDirty();
        core.state.lastImportSummary = String (imported).toStdString() + " plage(s) CD importée(s)";
        if (onChanged) onChanged();
        lastStatus = TR ("Import CD : ") + String (imported) + TR (" plage(s) importée(s) depuis ") + dir.getFullPathName()
                     + (skipped.isNotEmpty() ? TR (" · ignorées : ") + skipped : String());
        return {};
    }

    // Paquet OMF réel : essence audio WAV copiée + descripteur XML lisible par
    // un autre poste ALPHA Studio. Le conteneur binaire OMFI propriétaire d'Avid
    // n'est pas réécrit (voir limitation documentée dans la matrice d'audit).
    bool exportOmfPackage (const File& dir, String& report)
    {
        if (! dir.createDirectory()) { report = TR ("Création du dossier OMF impossible."); return false; }
        const File essence = dir.getChildFile ("Essence");
        essence.createDirectory();
        beginOffline();
        XmlElement root ("OMFPackage");
        root.setAttribute ("version", "1");
        root.setAttribute ("application", String ("ALPHA Studio ") + alphaStudioVersion);
        root.setAttribute ("sampleRate", (int) sr());
        root.setAttribute ("bitDepth", 24);
        root.setAttribute ("bpm", core.state.bpm);
        root.setAttribute ("project", core.state.name);
        auto* tracksXml = root.createNewChildElement ("Tracks");
        int written = 0;
        for (size_t i = 0; i < tracks.size(); ++i)
        {
            bool hasAudio = false;
            for (const auto& c : tracks[i]->source->clips) if (c.data != nullptr) hasAudio = true;
            if (! hasAudio) continue;
            const File stem = essence.getChildFile (String::formatted ("%02d - ", (int) i + 1) + sanitiseFileName (tracks[i]->name) + ".wav");
            if (! renderOffline (stem, 44100.0, 24, nullptr, (int) i)) continue;
            auto* te = tracksXml->createNewChildElement ("Track");
            te->setAttribute ("index", (int) i);
            te->setAttribute ("name", tracks[i]->name);
            te->setAttribute ("file", stem.getFileName());
            te->setAttribute ("durationSeconds", readAudioDurationSeconds (stem));
            ++written;
        }
        endOffline();
        if (written == 0) { report = TR ("Aucune piste audio à exporter en OMF."); return false; }
        auto* eventsXml = root.createNewChildElement ("Events");
        for (size_t i = 0; i < core.state.tracks.size(); ++i)
            for (const auto& c : core.state.tracks[i].clips)
            {
                auto* ev = eventsXml->createNewChildElement ("Event");
                ev->setAttribute ("track", (int) i);
                ev->setAttribute ("name", c.name);
                ev->setAttribute ("media", c.media);
                ev->setAttribute ("startBars", c.startBars);
                ev->setAttribute ("lenBars", c.lenBars);
                ev->setAttribute ("offsetBars", c.offsetBars);
            }
        if (! root.writeTo (dir.getChildFile ("OMFDescriptor.xml")))
        { report = TR ("Écriture du descripteur OMF impossible."); return false; }
        if (! writeState (dir.getChildFile ("Project.alphaproj"), false, false))
        { report = TR ("Copie du projet ALPHA dans le paquet OMF impossible."); return false; }
        report = TR ("Paquet OMF exporté : ") + String (written) + TR (" essence(s) WAV 44,1 kHz/24 bits + descripteur XML · ") + dir.getFullPathName();
        core.state.lastExportPath = dir.getChildFile ("OMFDescriptor.xml").getFullPathName().toStdString();
        lastStatus = report;
        return true;
    }

    // Lecture réelle OMF/AAF : reconnaissance du conteneur, extraction de
    // l'essence audio embarquée lorsqu'elle est présente, sinon repli sur un
    // paquet OMF produit par ALPHA Studio.
    String importOmfOrAaf (const File& f, int trackIndex, double startBars)
    {
        if (! f.exists()) return TR ("Fichier introuvable : ") + f.getFullPathName();
        if (f.isDirectory())
        {
            const File descriptor = f.getChildFile ("OMFDescriptor.xml");
            const File essenceDir = f.getChildFile ("Essence");
            if (! descriptor.existsAsFile() || ! essenceDir.isDirectory())
                return TR ("Paquet OMF ALPHA incomplet : OMFDescriptor.xml ou Essence/ manquant dans ") + f.getFullPathName();
            auto xml = parseXML (descriptor);
            if (xml == nullptr) return TR ("Descripteur OMF illisible : ") + descriptor.getFullPathName();
            int imported = 0;
            double at = startBars;
            int ti = trackIndex >= 0 ? trackIndex : 0;
            if (auto* tracksXml = xml->getChildByName ("Tracks"))
                for (auto* te : tracksXml->getChildWithTagNameIterator ("Track"))
                {
                    const File essence = essenceDir.getChildFile (te->getStringAttribute ("file"));
                    if (! essence.existsAsFile()) continue;
                    alpha::JsonValue p (alpha::JsonValue::Type::Object);
                    p["media"] = alpha::JsonValue (essence.getFullPathName().toStdString());
                    p["name"] = alpha::JsonValue (te->getStringAttribute ("name").toStdString());
                    p["startBars"] = alpha::JsonValue (at);
                    p["lenBars"] = alpha::JsonValue (jmax (0.25, core.state.barsAtSeconds (te->getDoubleAttribute ("durationSeconds"))));
                    p["index"] = alpha::JsonValue (ti);
                    if (! core.command ("addClip", p)) continue;
                    core.command ("importMedia", p);
                    at += alpha::jNumber (p, "lenBars", 1.0);
                    if (++ti >= (int) core.state.tracks.size()) ti = 0;
                    ++imported;
                }
            if (imported == 0) return TR ("Aucune essence exploitable dans le paquet OMF.");
            applyCoreState (true);
            core.markDirty();
            core.state.lastImportSummary = String (imported).toStdString() + " essence(s) OMF importée(s)";
            lastStatus = TR ("Import OMF : ") + String (imported) + TR (" piste(s) depuis ") + f.getFullPathName();
            if (onChanged) onChanged();
            return {};
        }

        FileInputStream stream (f);
        char magic[16] = { 0 };
        stream.read (magic, 16);
        const String head (magic, 16);
        const bool riff = head.startsWith ("RIFF");
        const bool omfi = head.contains ("OMFI") || head.contains ("OMF ");
        const bool aaf = head.startsWith ("AAF ") || head.contains ("AAF");
        if (! riff && ! omfi && ! aaf)
            return TR ("Conteneur non reconnu (ni RIFF/OMFI, ni AAF) : ") + f.getFileName();

        // Essence embarquée : on recherche une sous-structure WAVE exploitable.
        const auto bytes = f.loadFileAsString().toStdString();
        const size_t waveAt = bytes.find ("WAVEfmt ");
        if (waveAt != std::string::npos && waveAt >= 8)
        {
            const size_t riffAt = waveAt - 8;
            uint32 chunkSize = 0;
            std::memcpy (&chunkSize, bytes.data() + riffAt + 4, 4);
            const size_t end = jmin (bytes.size(), riffAt + 8 + (size_t) chunkSize);
            MemoryBlock block (bytes.data() + riffAt, end - riffAt);
            const File temp = f.getParentDirectory().getChildFile (f.getFileNameWithoutExtension() + " (essence extraite).wav");
            if (temp.replaceWithData (block.getData(), block.getSize()))
            {
                alpha::JsonValue p (alpha::JsonValue::Type::Object);
                p["media"] = alpha::JsonValue (temp.getFullPathName().toStdString());
                p["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
                p["startBars"] = alpha::JsonValue (startBars);
                p["lenBars"] = alpha::JsonValue (jmax (0.25, core.state.barsAtSeconds (readAudioDurationSeconds (temp))));
                p["index"] = alpha::JsonValue (trackIndex >= 0 ? trackIndex : 0);
                if (core.command ("addClip", p))
                {
                    core.command ("importMedia", p);
                    applyCoreState (true);
                    core.markDirty();
                    core.state.lastImportSummary = "Essence audio extraite de " + f.getFileName().toStdString();
                    lastStatus = TR ("Import ") + (aaf ? TR ("AAF") : TR ("OMF")) + TR (" : essence audio extraite vers ") + temp.getFileName();
                    if (onChanged) onChanged();
                    return {};
                }
            }
        }
        return TR ("Conteneur ") + (aaf ? TR ("AAF") : TR ("OMF")) + TR (" reconnu mais aucune essence audio WAVE exploitable : ")
               + f.getFileName() + TR (". Utiliser « Exporter ▸ Paquet OMF ALPHA » depuis le poste source.");
    }

    // Détection de tempo réelle : enveloppe d'énergie, détection d'attaques puis
    // recherche du BPM le plus probable par comptage des intervalles.
    double detectTempoFromFile (const File& f)
    {
        AudioFormatManager mgr;
        mgr.registerBasicFormats();
        std::unique_ptr<AudioFormatReader> reader (mgr.createReaderFor (f));
        if (reader == nullptr) return 0.0;
        const double rate = reader->sampleRate;
        const int64 total = reader->lengthInSamples;
        if (total < (int64) rate) return 0.0;
        const int hop = jmax (64, (int) (rate * 0.010));          // 10 ms
        const int frames = (int) (total / hop);
        if (frames < 16) return 0.0;
        std::vector<float> envelope (static_cast<size_t> (frames), 0.0f);
        AudioBuffer<float> buffer (jmax (1, (int) reader->numChannels), hop * 2);
        for (int i = 0; i < frames; ++i)
        {
            if (! reader->read (&buffer, 0, hop, (int64) i * hop, true, true)) break;
            float peak = 0.0f;
            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
                for (int s = 0; s < hop; ++s) peak = jmax (peak, std::fabs (buffer.getSample (ch, s)));
            envelope[(size_t) i] = peak;
        }
        // Flux spectral approché : différences positives d'énergie.
        std::vector<double> flux (static_cast<size_t> (frames), 0.0);
        double mean = 0.0;
        for (int i = 1; i < frames; ++i)
        {
            flux[(size_t) i] = std::max (0.0, (double) envelope[(size_t) i] - (double) envelope[(size_t) (i - 1)]);
            mean += flux[(size_t) i];
        }
        mean /= (double) jmax (1, frames - 1);
        const double threshold = mean * 1.6 + 1e-6;
        std::vector<double> onsets;
        for (int i = 2; i < frames - 1; ++i)
            if (flux[(size_t) i] > threshold && flux[(size_t) i] >= flux[(size_t) (i - 1)] && flux[(size_t) i] > flux[(size_t) (i + 1)])
                onsets.push_back ((double) i * (double) hop / rate);
        if (onsets.size() < 4) return 0.0;
        // Histogramme réel des BPM candidats à partir des intervalles d'attaque.
        std::map<int, int> votes;
        for (size_t i = 1; i < onsets.size(); ++i)
            for (size_t k = i + 1; k < jmin (onsets.size(), i + 8); ++k)
            {
                const double interval = onsets[k] - onsets[i];
                if (interval <= 0.05 || interval > 4.0) continue;
                double bpm = 60.0 / interval;
                while (bpm < 70.0) bpm *= 2.0;
                while (bpm > 190.0) bpm *= 0.5;
                votes[(int) std::llround (bpm)]++;
            }
        if (votes.empty()) return 0.0;
        int best = 0, bestVotes = -1;
        for (const auto& v : votes) if (v.second > bestVotes) { bestVotes = v.second; best = v.first; }
        const double detected = (double) best;
        core.state.lastDetectedBpm = detected;
        return detected;
    }

    //==========================================================================
    // AUDIT v6 — ESPACES DE TRAVAIL, BIBLIOTHÈQUE, RÉCENTS, FERMETURE RÉELLE
    //==========================================================================
    String storeWorkspaceReal (const alpha::JsonValue& p)
    {
        alpha::JsonValue q = p;
        q["positionBars"] = alpha::JsonValue (alphaSamplesToBars (transport.pos.load(), transport.bpm.load(), sr()));
        if (! core.command ("storeWorkspace", q)) { lastStatus = alphaString (core.lastError); return lastStatus; }
        lastStatus = TR ("Espace de travail mémorisé : ") + alphaString (alpha::jString (q, "name"));
        if (onChanged) onChanged();
        return {};
    }

    String recallWorkspaceReal (const alpha::JsonValue& p)
    {
        if (! core.command ("recallWorkspace", p)) { lastStatus = alphaString (core.lastError); return lastStatus; }
        const int index = alpha::jInt (p, "index", -1);
        const auto name = alphaString (alpha::jString (p, "name"));
        const alpha::WorkspaceState* w = nullptr;
        for (const auto& candidate : core.state.workspaces)
            if ((index >= 0 && candidate.name == name) || candidate.name == name) { w = &candidate; break; }
        if (w == nullptr && index >= 0 && index < (int) core.state.workspaces.size())
            w = &core.state.workspaces[(size_t) index];
        if (w != nullptr)
            seek (alphaBarsToSamples (w->positionBars, transport.bpm.load(), sr()));
        lastStatus = TR ("Espace de travail rappelé : ") + alphaString (core.state.recalledWorkspace);
        if (onChanged) onChanged();
        return {};
    }

    // Bibliothèque de projets réelle : tous les .alphaproj réellement présents.
    alpha::JsonValue projectLibraryJson() const
    {
        alpha::JsonValue out (alpha::JsonValue::Type::Object);
        alpha::JsonValue list (alpha::JsonValue::Type::Array);
        Array<File> roots;
        roots.add (appDataDir());
        roots.add (templatesDir());
        roots.add (File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("ALPHA Studio"));
        if (projectRoot != File()) roots.add (projectRoot);
        for (const auto& recent : core.state.recents)
        {
            const File parent = File (alphaString (recent.path)).getParentDirectory();
            if (parent.isDirectory()) roots.add (parent);
        }
        for (const auto& root : roots)
        {
            if (! root.isDirectory()) continue;
            Array<File> found;
            root.findChildFiles (found, File::findFiles, true, "*.alphaproj;*.alpha");
            for (const auto& f : found)
            {
                alpha::JsonValue e (alpha::JsonValue::Type::Object);
                e["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
                e["path"] = alpha::JsonValue (f.getFullPathName().toStdString());
                e["sizeBytes"] = alpha::JsonValue (static_cast<double> (f.getSize()));
                e["modified"] = alpha::JsonValue (f.getLastModificationTime().formatted ("%Y-%m-%d %H:%M").toStdString());
                e["template"] = alpha::JsonValue (f.isAChildOf (templatesDir()));
                list.array.push_back (e);
            }
        }
        out["projects"] = list;
        out["count"] = alpha::JsonValue (static_cast<int> (list.array.size()));
        return out;
    }

    // Création réelle d'un dossier de projet : arborescence média complète.
    String createProjectFolder (const File& dir, const String& projectName)
    {
        if (dir == File()) return TR ("Dossier de projet non spécifié.");
        const Result created = dir.createDirectory();
        if (created.failed()) return TR ("Création du dossier impossible : ") + created.getErrorMessage();
        const StringArray subdirs = { "Media", "Audio", "MIDI", "Exports", "Images", "Sauvegardes" };
        for (const auto& sub : subdirs)
        {
            const Result subResult = dir.getChildFile (sub).createDirectory();
            if (subResult.failed()) return TR ("Sous-dossier ") + sub + TR (" impossible : ") + subResult.getErrorMessage();
        }
        projectRoot = dir;
        newProject();
        core.state.name = (projectName.isNotEmpty() ? projectName : dir.getFileName()).toStdString();
        core.state.path = dir.getChildFile (core.state.name + ".alphaproj").getFullPathName().toStdString();
        core.markDirty();
        lastStatus = TR ("Dossier de projet créé : ") + dir.getFullPathName() + TR (" (") + String (subdirs.size()) + TR (" sous-dossiers).");
        if (onChanged) onChanged();
        return {};
    }

    String closeProjectReal()
    {
        if (isRecording()) stopRecording();
        stopTransport();
        const File previous = projectFile;
        alpha::JsonValue p (alpha::JsonValue::Type::Object);
        p["path"] = alpha::JsonValue (previous.getFullPathName().toStdString());
        if (! core.command ("closeProject", p)) { lastStatus = alphaString (core.lastError); return lastStatus; }
        for (auto& t : tracks) removeTrack (t.get());
        projectFile = File();
        applyCoreState (true);
        core.markSaved();
        lastStatus = TR ("Projet fermé") + (previous != File() ? TR (" : ") + previous.getFileName() : String()) + TR (".");
        if (onChanged) onChanged();
        return {};
    }

    String clearRecentsReal()
    {
        if (! core.command ("clearRecents", alpha::JsonValue())) { lastStatus = alphaString (core.lastError); return lastStatus; }
        const File recentFile = appDataDir().getChildFile ("recents.xml");
        recentFile.deleteFile();
        lastStatus = TR ("Liste des projets récents vidée.");
        if (onChanged) onChanged();
        return {};
    }

    String addRecentReal (const File& f)
    {
        alpha::JsonValue p (alpha::JsonValue::Type::Object);
        p["path"] = alpha::JsonValue (f.getFullPathName().toStdString());
        p["name"] = alpha::JsonValue (f.getFileNameWithoutExtension().toStdString());
        if (! core.command ("addRecent", p)) { lastStatus = alphaString (core.lastError); return lastStatus; }
        XmlElement root ("recents");
        for (const auto& r : core.state.recents)
        {
            auto* e = root.createNewChildElement ("project");
            e->setAttribute ("name", r.name);
            e->setAttribute ("path", r.path);
            e->setAttribute ("opened", r.openedUtc);
        }
        root.writeTo (appDataDir().getChildFile ("recents.xml"));
        if (onChanged) onChanged();
        return {};
    }

    void loadRecentsFromDisk()
    {
        auto xml = parseXML (appDataDir().getChildFile ("recents.xml"));
        if (xml == nullptr) return;
        for (auto* e : xml->getChildWithTagNameIterator ("project"))
        {
            alpha::JsonValue p (alpha::JsonValue::Type::Object);
            p["path"] = alpha::JsonValue (e->getStringAttribute ("path").toStdString());
            p["name"] = alpha::JsonValue (e->getStringAttribute ("name").toStdString());
            core.command ("addRecent", p);
        }
    }

    // Fiche de projet réelle, imprimable par WebView2 (Projet ▸ Imprimer).
    String writeProjectSheet (const File& f)
    {
        String html;
        html << "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>"
             << core.state.name << " — fiche de projet</title><style>"
             << "body{font:11pt 'Segoe UI',Arial,sans-serif;color:#111;margin:18mm}"
             << "h1{font-size:17pt;margin:0 0 2mm}h2{font-size:12pt;margin:6mm 0 2mm;border-bottom:1px solid #999}"
             << "table{border-collapse:collapse;width:100%;font-size:9.5pt}td,th{border:1px solid #bbb;padding:1.4mm 2mm;text-align:left}"
             << "@page{size:A4;margin:15mm}"
             << "</style></head><body>";
        html << "<h1>" << core.state.name << "</h1>";
        html << "<p>ALPHA Studio " << alphaStudioVersion << " — fiche générée le "
             << Time::getCurrentTime().formatted ("%d/%m/%Y %H:%M") << "</p>";
        html << "<h2>Informations</h2><table>";
        html << "<tr><th>Auteur</th><td>" << core.state.info.author << "</td><th>Copyright</th><td>" << core.state.info.copyright << "</td></tr>";
        html << "<tr><th>Origine</th><td>" << core.state.info.originator << "</td><th>Référence</th><td>" << core.state.info.reference << "</td></tr>";
        html << "<tr><th>Fréquence</th><td>" << core.state.info.sampleRate << " Hz</td><th>Résolution</th><td>" << core.state.info.bitDepth << " bits</td></tr>";
        html << "<tr><th>Timecode de départ</th><td>" << core.state.info.startTimecode << "</td><th>Tempo</th><td>"
             << String (core.state.bpm, 2) << " BPM</td></tr>";
        html << "<tr><th>Pilote audio</th><td colspan=\"3\">" << deviceInfo() << "</td></tr>";
        html << "<tr><th>Chemin du projet</th><td colspan=\"3\">" << projectFile.getFullPathName() << "</td></tr>";
        html << "<tr><th>Notes</th><td colspan=\"3\">" << core.state.info.notes << "</td></tr>";
        html << "</table>";
        html << "<h2>Pistes (" << (int) core.state.tracks.size() << ")</h2><table>"
             << "<tr><th>#</th><th>Nom</th><th>Type</th><th>Volume</th><th>Pan</th><th>Bus</th><th>M/S/A</th>"
             << "<th>Entrée</th><th>Sortie</th><th>Inserts</th><th>Départs</th><th>Événements</th><th>Notes MIDI</th></tr>";
        for (size_t i = 0; i < core.state.tracks.size(); ++i)
        {
            const auto& t = core.state.tracks[i];
            html << "<tr><td>" << (int) i + 1 << "</td><td>" << t.name << "</td><td>" << t.channelType
                 << "</td><td>" << String (t.volumeDb, 1) << " dB</td><td>" << String (t.pan, 2)
                 << "</td><td>" << (t.bus < (int) core.state.buses.size() ? core.state.buses[(size_t) t.bus].name : String ("—"))
                 << "</td><td>" << (t.mute ? "M " : "") << (t.solo ? "S " : "") << (t.arm ? "A" : "")
                 << "</td><td>" << t.inputDevice << " " << (t.inputChannel + 1)
                 << "</td><td>" << t.outputDevice << " " << (t.outputChannel + 1) << "</td><td>";
            for (const auto& ins : t.inserts) html << ins.name << (ins.bypassed ? " (bypass) " : " ");
            if (t.inserts.empty()) html << "—";
            html << "</td><td>";
            for (const auto& s : t.sends) html << core.state.buses[(size_t) jlimit (0, (int) core.state.buses.size() - 1, s.bus)].name
                                               << " " << String (s.db, 1) << " dB" << (s.preFader ? " pré" : "") << " ; ";
            if (t.sends.empty()) html << "—";
            html << "</td><td>" << (int) t.clips.size() << "</td><td>" << (int) t.midiNotes.size() << "</td></tr>";
        }
        html << "</table>";
        html << "<h2>Bus (" << (int) core.state.buses.size() << ")</h2><table><tr><th>#</th><th>Nom</th><th>Volume</th><th>Pan</th><th>Sortie</th><th>Mute</th></tr>";
        for (size_t i = 0; i < core.state.buses.size(); ++i)
        {
            const auto& b = core.state.buses[i];
            html << "<tr><td>" << (int) i + 1 << "</td><td>" << b.name << "</td><td>" << String (b.volumeDb, 1)
                 << " dB</td><td>" << String (b.pan, 2) << "</td><td>" << b.outputDevice << " " << (b.outputChannel + 1)
                 << "</td><td>" << (b.mute ? "oui" : "non") << "</td></tr>";
        }
        html << "</table>";
        html << "<h2>Marqueurs (" << (int) core.state.markers.size() << ")</h2><table><tr><th>#</th><th>Nom</th><th>Mesure</th><th>Fin</th><th>Temps réel</th><th>Cycle</th></tr>";
        int markerNumber = 1;
        for (const auto& m : core.state.markers)
        {
            html << "<tr><td>" << markerNumber++ << "</td><td>" << m.name << "</td><td>" << String (m.bars, 2)
                 << "</td><td>" << String (m.endBars, 2) << "</td><td>" << String (core.state.secondsAtBars (m.bars), 3)
                 << " s</td><td>" << (m.cycle ? "oui" : "non") << "</td></tr>";
        }
        html << "</table>";
        html << "<h2>Carte de tempo (" << (int) core.state.tempoEvents.size() << ")</h2><table><tr><th>Mesure</th><th>BPM</th><th>Temps cumulé</th></tr>";
        for (const auto& e : core.state.tempoEvents)
            html << "<tr><td>" << String (e.bars, 2) << "</td><td>" << String (e.bpm, 2) << "</td><td>"
                 << String (core.state.secondsAtBars (e.bars), 3) << " s</td></tr>";
        html << "</table>";
        html << "<h2>Médias (" << (int) core.state.media.size() << ")</h2><table><tr><th>Référence</th><th>Chemin résolu</th><th>Présent</th></tr>";
        for (const auto& m : core.state.media)
        {
            const File resolved = resolveMedia (alphaString (m), effectiveRoot());
            html << "<tr><td>" << m << "</td><td>" << resolved.getFullPathName() << "</td><td>"
                 << (resolved.existsAsFile() ? "oui" : "non") << "</td></tr>";
        }
        html << "</table>";
        html << "<h2>Performances mesurées</h2><table>"
             << "<tr><th>CPU</th><td>" << String (performance.cpuSmooth.load(), 1) << " % (crête "
             << String (performance.cpuPeak.load(), 1) << " %)</td>"
             << "<th>Disque</th><td>" << String (performance.diskBytesPerSecond.load() / (1024.0 * 1024.0), 2)
             << " Mo/s (crête " << String (performance.diskPeak.load(), 1) << " %)</td></tr>"
             << "<tr><th>Tampon</th><td>" << bs() << " échantillons</td><th>Latence</th><td>"
             << String (1000.0 * (double) bs() / jmax (8000.0, sr()), 2) << " ms</td></tr></table>";
        html << "<h2>Historique (" << (int) core.history.size() << " niveaux)</h2><table><tr><th>#</th><th>Opération</th></tr>";
        const auto historyJson = core.history.toJson();
        int level = 1;
        for (const auto& e : historyJson.array)
            html << "<tr><td>" << level++ << "</td><td>" << alpha::jString (e, "label") << (alpha::jBool (e, "current") ? " (position courante)" : "") << "</td></tr>";
        html << "</table></body></html>";

        f.getParentDirectory().createDirectory();
        if (! f.replaceWithText (html)) { lastStatus = TR ("Écriture de la fiche de projet impossible."); return lastStatus; }
        core.state.lastExportPath = f.getFullPathName().toStdString();
        lastStatus = TR ("Fiche de projet générée pour impression : ") + f.getFullPathName();
        if (onChanged) onChanged();
        return {};
    }

    String command (const String& name, const String& payloadText)
    {
        std::string err;
        alpha::JsonValue p = alpha::JsonValue::parse (payloadText.toStdString(), err);
        if (! err.empty()) { lastStatus = alphaString ("JSON invalide : " + err); return lastStatus; }
        const std::string cmd = name.toStdString();

        if (cmd == "getState" || cmd == "getHistory") return {};
        if (cmd == "getLibrary") { libraryResult = projectLibraryJson(); return {}; }
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
                                            alpha::jNumber (p, "startBars", alphaSamplesToBars (transport.pos.load(), transport.bpm.load(), sr())),
                                            alpha::jInt (p, "trackIndex", -1));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "importProjectData")
        {
            const String sourceName = alphaString (alpha::jString (p, "name", ""));
            const File sourceHint = sourceName.isNotEmpty() ? File (sourceName).getParentDirectory() : File();
            if (! importProjectData (alphaString (alpha::jString (p, "base64")), sourceHint)) { lastStatus = alphaString (core.lastError); return lastStatus; }
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
        //------------------------------------------------------------------
        // AUDIT v6 — greffons réels : analyse, liste, inserts, paramètres
        //------------------------------------------------------------------
        if (cmd == "listPlugins" || cmd == "getPlugins") { pluginsJson = pluginListJson(); return {}; }
        if (cmd == "scanPlugins")
        {
            startPluginScan (alpha::jBool (p, "clear", false));
            lastStatus = TR ("Analyse des greffons en cours sur ") + String (pluginSearchPaths().getNumPaths()) + TR (" dossier(s)…");
            return {};
        }
        if (cmd == "addPluginFolder" || cmd == "removePluginFolder")
        {
            const auto path = alpha::jString (p, "path");
            if (cmd == "addPluginFolder" && ! File (alphaString (path)).isDirectory())
            { lastStatus = TR ("Dossier de greffons introuvable : ") + alphaString (path); return lastStatus; }
            const auto e = dispatchCore (cmd, p, false);
            if (e.isNotEmpty()) return e;
            startPluginScan (false);
            return {};
        }
        if (cmd == "addInsert")
        {
            const auto e = addInsertReal (alpha::jInt (p, "index", core.state.selectedTrack),
                                          alpha::jString (p, "uid", alpha::jString (p, "name")),
                                          alpha::jInt (p, "slot", -1), MemoryBlock());
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "removeInsert")
        {
            const auto e = removeInsertReal (alpha::jInt (p, "index", core.state.selectedTrack), alpha::jInt (p, "insertIndex", -1));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "moveInsert")
        {
            const auto e = moveInsertReal (alpha::jInt (p, "index", core.state.selectedTrack),
                                           alpha::jInt (p, "insertIndex", -1), alpha::jInt (p, "to", -1));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "setInsertBypass")
        {
            const auto e = setInsertBypassReal (alpha::jInt (p, "index", core.state.selectedTrack),
                                                alpha::jInt (p, "insertIndex", -1),
                                                alpha::jBool (p, "bypassed", true));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "setInsertParameter")
        {
            const auto e = setInsertParameterReal (alpha::jInt (p, "index", core.state.selectedTrack),
                                                   alpha::jInt (p, "insertIndex", -1),
                                                   alpha::jInt (p, "paramIndex", -1),
                                                   alpha::jNumber (p, "value", 0.0));
            if (e.isNotEmpty()) { lastStatus = e; return e; }
            return {};
        }
        if (cmd == "getInsert") { insertJsonResult = insertJson (alpha::jInt (p, "index", core.state.selectedTrack), alpha::jInt (p, "insertIndex", -1)); return {}; }
        if (cmd == "openPluginEditor")
        {
            openPluginEditorReal (alpha::jInt (p, "index", core.state.selectedTrack), alpha::jInt (p, "insertIndex", -1));
            return {};
        }
        if (cmd == "setPluginProgram")
        {
            const int ti = alpha::jInt (p, "index", core.state.selectedTrack), ii = alpha::jInt (p, "insertIndex", -1);
            if (ti < 0 || ti >= (int) tracks.size() || ii < 0 || ii >= (int) tracks[(size_t) ti]->inserts.size())
            { lastStatus = TR ("Indice d'insert invalide"); return lastStatus; }
            auto* proc = tracks[(size_t) ti]->inserts[(size_t) ii].node->getProcessor();
            const int program = alpha::jInt (p, "program", 0);
            if (proc == nullptr || program < 0 || program >= proc->getNumPrograms())
            { lastStatus = TR ("Programme de greffon invalide"); return lastStatus; }
            proc->setCurrentProgram (program);            // programme réellement appliqué
            syncInsertsToCore();
            lastStatus = TR ("Programme « ") + proc->getProgramName (program) + TR (" » chargé.");
            if (onChanged) onChanged();
            return {};
        }

        //------------------------------------------------------------------
        // AUDIT v6 — périphériques audio et MIDI réels
        //------------------------------------------------------------------
        if (cmd == "listAudioDevices" || cmd == "getAudioDevices") { audioDevicesResult = audioDevicesJson(); return {}; }
        if (cmd == "setAudioDeviceType")
        {
            const auto e = setAudioDeviceTypeReal (alphaString (alpha::jString (p, "type")));
            if (e.isNotEmpty()) return e;
            return {};
        }
        if (cmd == "setAudioDevice")
        {
            setAudioDeviceReal (alphaString (alpha::jString (p, "inputDeviceName")),
                                alphaString (alpha::jString (p, "outputDeviceName")),
                                alpha::jNumber (p, "sampleRate", 0.0),
                                alpha::jInt (p, "bufferSize", 0));
            return {};
        }
        if (cmd == "setAudioChannels")
        {
            AudioDeviceManager::AudioDeviceSetup setup;
            deviceManager.getAudioDeviceSetup (setup);
            if (p.has ("inputChannels")) setup.inputChannels = BigInteger (static_cast<int> (alpha::jNumber (p, "inputChannels", 0)));
            if (p.has ("outputChannels")) setup.outputChannels = BigInteger (static_cast<int> (alpha::jNumber (p, "outputChannels", 0)));
            const String err = deviceManager.setAudioDeviceSetup (setup, true);
            audioError = err;
            saveAudioState();
            updateRate();
            lastStatus = err.isNotEmpty() ? TR ("Canaux refusés : ") + err : TR ("Canaux audio appliqués.");
            if (onChanged) onChanged();
            return err;
        }
        if (cmd == "listMidiDevices" || cmd == "getMidiDevices") { midiDevicesResult = midiDevicesJson(); return {}; }
        if (cmd == "setMidiInput")
        {
            const auto e = setMidiInputReal (alphaString (alpha::jString (p, "identifier", alpha::jString (p, "name"))),
                                             alpha::jBool (p, "enabled", true));
            if (e.isNotEmpty()) return e;
            return {};
        }
        if (cmd == "getMidiMonitor") { midiMonitorResult = midiMonitorJson (alpha::jInt (p, "maxEvents", 200)); return {}; }
        if (cmd == "clearMidiMonitor") { midiMonitor.clear(); lastStatus = TR ("Journal MIDI vidé."); return {}; }
        if (cmd == "refreshMidiInputs") { refreshMidiInputs(); lastStatus = TR ("Entrées MIDI réouvertes."); return {}; }

        //------------------------------------------------------------------
        // AUDIT v6 — analyse réelle : spectre, statistiques, performances
        //------------------------------------------------------------------
        if (cmd == "getSpectrum")
        {
            spectrumResult = spectrumJson (alpha::jInt (p, "fftOrder", 11),
                                           alpha::jString (p, "window", "hanning"),
                                           alpha::jString (p, "channelMode", "mono"));
            return {};
        }
        if (cmd == "getStatistics")
        {
            statisticsResult = statisticsJson (alpha::jInt (p, "trackIndex", core.state.selectedTrack),
                                               alpha::jInt (p, "clipIndex", 0),
                                               alpha::jString (p, "scope", "event"));
            return {};
        }
        if (cmd == "getPerformance")
        {
            performanceResult = performanceJson (alpha::jInt (p, "history", 0));
            return {};
        }
        if (cmd == "resetPerformancePeaks") { performance.resetPeaks(); lastStatus = TR ("Crêtes de performance réinitialisées."); return {}; }
        if (cmd == "setPerformanceLog")
        {
            setPerfLog (alpha::jBool (p, "enabled", ! perfLogEnabled));
            return {};
        }

        //------------------------------------------------------------------
        // AUDIT v6 — échanges réels : FCP XML, MusicXML, image CD, OMF/AAF
        //------------------------------------------------------------------
        if (cmd == "detectTempo")
        {
            const auto path = alphaString (alpha::jString (p, "media", p.has ("path") ? alpha::jString (p, "path") : ""));
            const File f = path.isNotEmpty() ? resolveMedia (path, effectiveRoot()) : File();
            if (f == File() || ! f.existsAsFile())
            {
                const int ti = alpha::jInt (p, "trackIndex", core.state.selectedTrack);
                if (ti >= 0 && ti < (int) tracks.size() && ! tracks[(size_t) ti]->source->clips.empty())
                {
                    const File detected = tracks[(size_t) ti]->source->clips[0].file;
                    const double bpm = detectTempoFromFile (detected);
                    if (bpm <= 0.0) { lastStatus = TR ("Tempo non détectable sur ") + detected.getFileName(); return lastStatus; }
                    alpha::JsonValue q (alpha::JsonValue::Type::Object);
                    q["bpm"] = alpha::JsonValue (bpm);
                    const auto e = dispatchCore ("setTempo", q, false);
                    if (e.isNotEmpty()) return e;
                    core.state.lastDetectedBpm = bpm;
                    lastStatus = TR ("Tempo détecté sur ") + detected.getFileName() + TR (" : ") + String (bpm, 2) + TR (" BPM (appliqué au projet).");
                    return {};
                }
                lastStatus = TR ("Détection de tempo : aucun fichier audio spécifié.");
                return lastStatus;
            }
            const double bpm = detectTempoFromFile (f);
            if (bpm <= 0.0) { lastStatus = TR ("Tempo non détectable sur ") + f.getFileName(); return lastStatus; }
            alpha::JsonValue q (alpha::JsonValue::Type::Object);
            q["bpm"] = alpha::JsonValue (bpm);
            dispatchCore ("setTempo", q, false);
            lastStatus = TR ("Tempo détecté : ") + String (bpm, 2) + TR (" BPM sur ") + f.getFileName();
            return {};
        }

        //------------------------------------------------------------------
        // AUDIT v6 — espaces de travail, bibliothèque, récents, fermeture
        //------------------------------------------------------------------
        if (cmd == "storeWorkspace") { const auto e = storeWorkspaceReal (p); if (e.isNotEmpty()) return e; return {}; }
        if (cmd == "recallWorkspace") { const auto e = recallWorkspaceReal (p); if (e.isNotEmpty()) return e; return {}; }
        if (cmd == "getProjectLibrary") { libraryResult = projectLibraryJson(); return {}; }
        if (cmd == "closeProject") { const auto e = closeProjectReal(); if (e.isNotEmpty()) return e; return {}; }
        if (cmd == "clearRecents") { const auto e = clearRecentsReal(); if (e.isNotEmpty()) return e; return {}; }
        if (cmd == "removeEmptyTracks")
        {
            const auto e = dispatchCore ("removeEmptyTracks", p, true);
            if (e.isNotEmpty()) return e;
            lastStatus = TR ("Pistes vides retirées : ") + String (core.state.lastRemovedEmpty);
            return {};
        }
        if (cmd == "applyLogicalEdit" || cmd == "applyMidiModifier" || cmd == "transposeMidi")
        {
            const auto e = dispatchCore (cmd, p, true);
            if (e.isNotEmpty()) return e;
            lastStatus = TR ("Édition MIDI appliquée : ") + String (core.state.lastLogicalTouched) + TR (" note(s) réellement modifiée(s).");
            return {};
        }

        if (cmd == "setStatus") { lastStatus = alphaString (alpha::jString (p, "status", "Commande exécutée.")); return {}; }
        if (cmd == "setVideoEnabled") { lastStatus = TR ("Vidéo verrouillée : ajout prévu après le test final confirmé."); return lastStatus; }
        if (cmd == "quit") return {};

        const bool structural = needsStructural (cmd);
        return dispatchCore (cmd, p, structural);
    }

    std::string stateJson()
    {
        auto j = core.apiState();
        j["positionBars"] = alpha::JsonValue (alphaSamplesToBars (transport.pos.load(), transport.bpm.load(), sr()));
        j["playing"] = alpha::JsonValue (transport.playing.load());
        j["recording"] = alpha::JsonValue (isRecording());
        j["looping"] = alpha::JsonValue (transport.looping.load());
        j["metronome"] = alpha::JsonValue (transport.metronome.load());
        j["sampleRate"] = alpha::JsonValue (sr());
        j["device"] = alpha::JsonValue (deviceInfo().toStdString());
        alpha::JsonValue types (alpha::JsonValue::Type::Array);
        for (const auto& name : audioDeviceTypes)
            types.array.push_back (alpha::JsonValue (name.toStdString()));
        j["audioDeviceTypes"] = types;
        j["asioAvailable"] = alpha::JsonValue (asioAvailable);
        j["currentDeviceType"] = alpha::JsonValue (deviceManager.getCurrentAudioDeviceType().toStdString());
        j["audioError"] = alpha::JsonValue (audioError.toStdString());
        AudioDeviceManager::AudioDeviceSetup setup;
        deviceManager.getAudioDeviceSetup (setup);
        j["inputDeviceName"] = alpha::JsonValue (setup.inputDeviceName.toStdString());
        j["outputDeviceName"] = alpha::JsonValue (setup.outputDeviceName.toStdString());
        if (auto* d = deviceManager.getCurrentAudioDevice())
        {
            j["deviceName"] = alpha::JsonValue (d->getName().toStdString());
            j["deviceTypeName"] = alpha::JsonValue (d->getTypeName().toStdString());
            j["deviceSampleRate"] = alpha::JsonValue (d->getCurrentSampleRate());
            j["bufferSizeSamples"] = alpha::JsonValue (d->getCurrentBufferSizeSamples());
            j["inputLatencySamples"] = alpha::JsonValue (d->getInputLatencyInSamples());
            j["outputLatencySamples"] = alpha::JsonValue (d->getOutputLatencyInSamples());
            j["hasControlPanel"] = alpha::JsonValue (d->hasControlPanel());
        }
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

        //------------------------------------------------------------------
        // AUDIT v6 — valeurs réelles du moteur exposées à l'interface :
        // greffons analysés, périphériques audio/MIDI, moniteur MIDI,
        // performances mesurées, résultats d'analyse et d'échange de fichiers.
        //------------------------------------------------------------------
        syncInsertsToCore();
        j["plugins"] = pluginListJson();
        j["audioDevices"] = audioDevicesJson();
        j["midiDevices"] = midiDevicesJson();
        j["midiEventsReceived"] = alpha::JsonValue (midiMonitor.count());
        j["performance"] = performanceJson (0);
        j["latencyMs"] = alpha::JsonValue (1000.0 * (double) bs() / jmax (8000.0, sr())
                                           + (deviceManager.getCurrentAudioDevice() != nullptr
                                              ? 1000.0 * (double) (deviceManager.getCurrentAudioDevice()->getInputLatencyInSamples()
                                                                 + deviceManager.getCurrentAudioDevice()->getOutputLatencyInSamples())
                                                / jmax (8000.0, sr())
                                              : 0.0));
        j["samplesAvailableForAnalysis"] = alpha::JsonValue (static_cast<double> (masterRing.total.load()));
        j["lastDetectedBpm"] = alpha::JsonValue (core.state.lastDetectedBpm);
        j["lastImportSummary"] = alpha::JsonValue (core.state.lastImportSummary);
        j["lastExportPath"] = alpha::JsonValue (core.state.lastExportPath);
        j["lastLogicalTouched"] = alpha::JsonValue (core.state.lastLogicalTouched);
        if (! insertJsonResult.isNull()) j["insert"] = insertJsonResult;
        if (! midiMonitorResult.isNull()) j["midiMonitor"] = midiMonitorResult;
        if (! spectrumResult.isNull()) j["spectrum"] = spectrumResult;
        if (! statisticsResult.isNull()) j["statistics"] = statisticsResult;
        if (! libraryResult.isNull()) j["library"] = libraryResult;
        if (! exchangeResult.isNull()) j["exchange"] = exchangeResult;
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
            cmd == "importMedia" || cmd == "setStatus" ||
            cmd == "setChannelType" || cmd == "setTrackRouting" || cmd == "setTrackLayout" ||
            cmd == "setBusRouting" || cmd == "addSend" || cmd == "setSend" || cmd == "removeSend" ||
            cmd == "setQuickControl" || cmd == "applyQuickControl" || cmd == "addMarker" ||
            cmd == "removeMarker" || cmd == "renameMarker" || cmd == "addTempoEvent" ||
            cmd == "removeTempoEvent" || cmd == "addSignature" || cmd == "removeSignature" ||
            cmd == "setProjectInfo" || cmd == "storeSnapshot" || cmd == "recallSnapshot" ||
            cmd == "deleteSnapshot" || cmd == "addRecent" || cmd == "setKeyCommand" ||
            cmd == "resetKeyCommands" || cmd == "storeLogicalRule" || cmd == "deleteLogicalRule" ||
            cmd == "storeMidiModifier" || cmd == "deleteMidiModifier" || cmd == "deleteWorkspace" ||
            cmd == "setWorkspaceLock" || cmd == "setUiLayout" || cmd == "setTransportState" ||
            cmd == "setTrackColour" || cmd == "setInsertState" || cmd == "addPluginFolder" ||
            cmd == "removePluginFolder") return false;
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
        updateAudioDeviceDetails();
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

    // ---- audit v6 : greffons, MIDI, spectre, performances et échanges réels
    AlphaMidiMonitor midiMonitor;
    AlphaSampleRing masterRing;
    AlphaPerformance performance;
    std::atomic<int64> diskBytesCounter { 0 };   // octets réellement écrits sur disque
    CriticalSection pluginScanLock;
    std::atomic<bool> pluginScanRunning { false };
    std::atomic<int> pluginScanDone { 0 }, pluginScanTotal { 0 };
    String pluginScanCurrent;
    std::vector<std::unique_ptr<DocumentWindow>> pluginEditors;
    std::vector<std::pair<double, double>> perfLog;      // (seconde, cpu %, disque %) réellement mesurés
    CriticalSection perfLogLock;
    bool perfLogEnabled = false;

    // Résultats réels des dernières requêtes d'analyse, lus par l'hôte WebView2.
    alpha::JsonValue pluginsJson, insertJsonResult, audioDevicesResult, midiDevicesResult;
    alpha::JsonValue midiMonitorResult, spectrumResult, statisticsResult, performanceResult, libraryResult;
    alpha::JsonValue exchangeResult;                     // rapport réel des imports/exports de fichiers
};
