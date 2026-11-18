// ALPHA Studio - moteur audio (JUCE 8). Graphe: [piste] -> inserts VST3 -> fader -> master -> sortie.
#pragma once
#include <JuceHeader.h>
using namespace juce;

#define TR(s) juce::String(juce::CharPointer_UTF8(s))

struct Transport
{
    std::atomic<bool> playing { false }, looping { false }, metronome { false };
    std::atomic<int64> pos { 0 }, loopStart { 0 }, loopEnd { 0 };
    std::atomic<double> sampleRate { 44100.0 }, bpm { 120.0 };
};

static constexpr int kPeakBlock = 256;

struct Clip
{
    String name;
    File file;
    std::shared_ptr<AudioBuffer<float>> data;
    std::shared_ptr<std::vector<float>> peaks; // min,max par bloc de 256 echantillons
    int64 start = 0, offset = 0, len = 0;      // en echantillons (timeline / source)
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
        const int n = buf.getNumSamples();
        for (auto& c : clips)
        {
            if (! c.data) continue;
            const int64 cs = c.start, ce = cs + c.len;
            if (ce <= p || cs >= p + n) continue;
            const int dst = (int) jmax<int64> (0, cs - p);
            const int src = (int) (c.offset + jmax<int64> (0, p - cs));
            const int num = (int) jmin<int64> (n - dst, ce - jmax (cs, p));
            const int avail = c.data->getNumSamples() - src;
            const int cnt = jmin (num, avail);
            if (cnt <= 0) continue;
            for (int ch = 0; ch < jmin (2, buf.getNumChannels()); ++ch)
                buf.addFrom (ch, dst, *c.data, jmin (ch, c.data->getNumChannels() - 1), src, cnt);
        }
    }

    SpinLock lock;
    std::vector<Clip> clips;
private:
    Transport& transport;
};

//==============================================================================
// Volume / pan / mute + vumetre. Si "transport" est fourni (master) : avance la position, boucle, metronome.
class FaderProcessor : public AudioProcessor
{
public:
    FaderProcessor (Transport* t = nullptr)
        : AudioProcessor (BusesProperties().withInput ("In", AudioChannelSet::stereo(), true)
                                           .withOutput ("Out", AudioChannelSet::stereo(), true)),
          transport (t) {}
    ALPHA_PROC_BOILERPLATE ("Fader")

    void processBlock (AudioBuffer<float>& b, MidiBuffer&) override
    {
        const int n = b.getNumSamples();
        if (b.getNumChannels() < 2) return;
        const float g = audible.load() ? gain.load() : 0.0f;
        const float ang = (pan.load() + 1.0f) * MathConstants<float>::pi * 0.25f;
        const float gl = std::cos (ang) * g, gr = std::sin (ang) * g;
        b.applyGainRamp (0, 0, n, lastL, gl);
        b.applyGainRamp (1, 0, n, lastR, gr);
        lastL = gl; lastR = gr;

        levelL.store (jmax (b.getMagnitude (0, 0, n), levelL.load() * 0.9f));
        levelR.store (jmax (b.getMagnitude (1, 0, n), levelR.load() * 0.9f));

        if (transport != nullptr)
        {
            const double sr = transport->sampleRate.load();
            const int64 pos = transport->pos.load();
            if (transport->playing.load())
            {
                if (transport->metronome.load())
                {
                    const double spb = sr * 60.0 / transport->bpm.load();
                    for (int i = 0; i < n; ++i)
                    {
                        const int64 a = pos + i;
                        const int64 beat = (int64) ((double) a / spb);
                        const double off = (double) a - (double) beat * spb;
                        if (off < 0.03 * sr)
                        {
                            const float env = (float) std::exp (-off / (0.006 * sr));
                            const float s = env * 0.4f * (float) std::sin (MathConstants<double>::twoPi * ((beat % 4 == 0) ? 1600.0 : 1050.0) * off / sr);
                            b.addSample (0, i, s);
                            b.addSample (1, i, s);
                        }
                    }
                }
                int64 np = pos + n;
                const int64 ls = transport->loopStart.load(), le = transport->loopEnd.load();
                if (transport->looping.load() && le > ls && np >= le) np = ls + (np - le);
                transport->pos.store (np);
            }
        }
    }

    std::atomic<float> gain { 0.5f }, pan { 0.0f }, levelL { 0.0f }, levelR { 0.0f };
    std::atomic<bool> audible { true };
private:
    Transport* transport;
    float lastL = 0.5f, lastR = 0.5f;
};

//==============================================================================
class RecorderProcessor : public AudioProcessor
{
public:
    RecorderProcessor (TimeSliceThread& th)
        : AudioProcessor (BusesProperties().withInput ("In", AudioChannelSet::stereo(), true)), thread (th) {}
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
        const SpinLock::ScopedLockType sl (wlock);
        threaded = std::move (tw);
        return true;
    }
    void stop()
    {
        std::unique_ptr<AudioFormatWriter::ThreadedWriter> old;
        { const SpinLock::ScopedLockType sl (wlock); old = std::move (threaded); }
        old.reset(); // vide le tampon et ferme le fichier
    }
    void processBlock (AudioBuffer<float>& b, MidiBuffer&) override
    {
        const SpinLock::ScopedTryLockType tl (wlock);
        if (tl.isLocked() && threaded != nullptr && b.getNumChannels() >= 2)
            threaded->write (b.getArrayOfReadPointers(), b.getNumSamples());
    }
private:
    TimeSliceThread& thread;
    SpinLock wlock;
    std::unique_ptr<AudioFormatWriter::ThreadedWriter> threaded;
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
        bool mute = false, solo = false, arm = false;
        float volDb = -6.0f, pan = 0.0f;
    };

    Transport transport;
    AudioDeviceManager deviceManager;
    AudioProcessorGraph graph;
    AudioProcessorPlayer player;
    AudioFormatManager basicFormats;
    AudioPluginFormatManager pluginFormats;
    KnownPluginList knownPlugins;
    std::vector<std::unique_ptr<Track>> tracks;
    float masterDb = 0.0f;
    std::function<void()> onChanged;
    std::function<void (AudioProcessorGraph::NodeID)> onInsertRemoved;

    AlphaEngine() : writerThread ("ALPHA enregistrement")
    {
        basicFormats.registerBasicFormats();
        pluginFormats.addFormat (new VST3PluginFormat());
        writerThread.startThread();
        std::unique_ptr<XmlElement> saved = parseXML (appDataDir().getChildFile ("audio.xml"));
        audioError = deviceManager.initialise (2, 2, saved.get(), true);
        if (saved == nullptr)
            for (auto* type : deviceManager.getAvailableDeviceTypes())
                if (type->getTypeName() == "ASIO")   // present seulement si compile avec le SDK ASIO
                {
                    type->scanForDevices();
                    if (type->getDeviceNames().size() > 0) deviceManager.setCurrentAudioDeviceType ("ASIO", true);
                }
        updateRate();

        using IO = AudioProcessorGraph::AudioGraphIOProcessor;
        inputId  = graph.addNode (std::make_unique<IO> (IO::audioInputNode))->nodeID;
        outputId = graph.addNode (std::make_unique<IO> (IO::audioOutputNode))->nodeID;
        auto m = std::make_unique<FaderProcessor> (&transport);
        master = m.get();
        masterId = graph.addNode (std::move (m))->nodeID;
        auto r = std::make_unique<RecorderProcessor> (writerThread);
        recorder = r.get();
        recId = graph.addNode (std::move (r))->nodeID;
        refreshMix();
        rebuildConnections();

        player.setProcessor (&graph);
        deviceManager.addAudioCallback (&player);
        deviceManager.addChangeListener (this);
        loadKnownPlugins();
    }

    ~AlphaEngine() override
    {
        saveAudioState();
        deviceManager.removeChangeListener (this);
        deviceManager.removeAudioCallback (&player);
        player.setProcessor (nullptr);
        if (recorder) recorder->stop();
        tracks.clear();
        graph.clear();
        writerThread.stopThread (2000);
    }

    String audioError;
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

    //-------------------------------------------------------------- transport
    void play() { transport.playing.store (true); }
    void stopTransport() { transport.playing.store (false); }
    void rewind() { transport.pos.store (transport.looping.load() ? transport.loopStart.load() : 0); }
    void seek (int64 s) { transport.pos.store (jmax<int64> (0, s)); }

    //-------------------------------------------------------------- pistes
    Track* addTrack (String name = {})
    {
        static const uint32 pal[] = { 0xffe0a53a, 0xff4ea3e6, 0xff7fd06b, 0xffd86f9a, 0xff9b82e6, 0xffe6784a, 0xff4ec9c0, 0xffc9c94e };
        auto t = std::make_unique<Track>();
        t->name = name.isEmpty() ? "Audio " + String ((int) tracks.size() + 1) : name;
        t->colour = Colour (pal[tracks.size() % 8]);
        auto s = std::make_unique<TrackSource> (transport);
        t->source = s.get();
        t->srcId = graph.addNode (std::move (s))->nodeID;
        auto f = std::make_unique<FaderProcessor>();
        t->fader = f.get();
        t->faderId = graph.addNode (std::move (f))->nodeID;
        tracks.push_back (std::move (t));
        refreshMix();
        rebuildConnections();
        return tracks.back().get();
    }
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
        while (! tracks.empty()) removeTrack (tracks.back().get());
        transport.pos.store (0);
    }
    void refreshMix()
    {
        bool anySolo = false;
        for (auto& t : tracks) anySolo = anySolo || t->solo;
        for (auto& t : tracks)
        {
            t->fader->gain.store (Decibels::decibelsToGain (t->volDb, -60.0f));
            t->fader->pan.store (t->pan);
            t->fader->audible.store (! t->mute && (! anySolo || t->solo));
        }
        if (master) master->gain.store (Decibels::decibelsToGain (masterDb, -60.0f));
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
            stereo (t->faderId, masterId);
        }
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
        t->source->clips[(size_t) idx].start = jmax<int64> (0, s);
    }

    //-------------------------------------------------------------- enregistrement
    bool isRecording() const { return recording; }
    String startRecording (Track* t)
    {
        if (recording) return {};
        auto dir = File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("ALPHA Studio").getChildFile ("Prises");
        dir.createDirectory();
        recFile = dir.getNonexistentChildFile ("Prise-" + Time::getCurrentTime().formatted ("%Y%m%d-%H%M%S"), ".wav");
        if (! recorder->start (recFile, sr())) return TR ("Impossible de créer le fichier d'enregistrement");
        recStart = transport.pos.load();
        recTrack = t;
        recording = true;
        play();
        return {};
    }
    String stopRecording()
    {
        if (! recording) return {};
        recording = false;
        stopTransport();
        recorder->stop();
        String err;
        if (owns (recTrack))
        {
            if (! importAudio (recTrack, recFile, recStart, err)) return err;
            auto& cl = recTrack->source->clips.back();
            cl.name = TR ("Prise ") + String ((int) recTrack->source->clips.size());
        }
        return err;
    }

    //-------------------------------------------------------------- rendu WAV hors ligne
    void beginOffline()
    {
        stopTransport();
        deviceManager.removeAudioCallback (&player);
        savedLoop = transport.looping.load();
        savedMetro = transport.metronome.load();
        transport.looping.store (false);
        transport.metronome.store (false);
        graph.prepareToPlay (sr(), bs());
    }
    bool renderOffline (const File& f, std::function<bool (double)> progress)
    {
        const int block = bs();
        f.deleteFile();
        std::unique_ptr<FileOutputStream> os (f.createOutputStream());
        if (os == nullptr) return false;
        WavAudioFormat wav;
        std::unique_ptr<AudioFormatWriter> w (wav.createWriterFor (os.get(), sr(), 2, 24, {}, 0));
        if (w == nullptr) return false;
        os.release();

        const int chans = jmax (2, graph.getTotalNumInputChannels(), graph.getTotalNumOutputChannels());
        AudioBuffer<float> buffer (chans, block);
        MidiBuffer midi;
        const int64 end = projectLength() + (int64) (3.0 * sr());
        transport.pos.store (0);
        transport.playing.store (true);
        bool ok = true;
        while (transport.pos.load() < end)
        {
            buffer.clear();
            graph.processBlock (buffer, midi);
            w->writeFromAudioSampleBuffer (buffer, 0, block);
            if (! progress ((double) transport.pos.load() / (double) end)) { ok = false; break; }
        }
        transport.playing.store (false);
        w.reset();
        return ok;
    }
    void endOffline()
    {
        graph.releaseResources();
        transport.playing.store (false);
        transport.pos.store (0);
        transport.looping.store (savedLoop);
        transport.metronome.store (savedMetro);
        deviceManager.addAudioCallback (&player);
    }

    //-------------------------------------------------------------- projet demo (sons generes)
    void loadDemo()
    {
        newProject();
        transport.bpm.store (120.0);
        const double r = sr();
        const double twoPi = MathConstants<double>::twoPi;
        Random rng (7);
        auto buf = [&] (double sec) { auto b = std::make_shared<AudioBuffer<float>> (1, (int) (sec * r)); b->clear(); return b; };
        auto addClip = [&] (Track* t, std::shared_ptr<AudioBuffer<float>> b, const String& n, double startSec)
        {
            Clip c; c.name = n; c.data = b; c.peaks = makePeaks (*b); c.len = b->getNumSamples(); c.start = (int64) (startSec * r);
            t->source->clips.push_back (c);
        };

        auto drums = buf (16.0);
        { float* p = drums->getWritePointer (0); const int N = drums->getNumSamples();
          for (int bt = 0; bt < 32; ++bt)
          {
              const int s0 = (int) (bt * 0.5 * r); double ph = 0;
              for (int i = 0; i < (int) (0.3 * r) && s0 + i < N; ++i)
              { const double t = i / r; ph += twoPi * (45.0 + 90.0 * std::exp (-28.0 * t)) / r; p[s0 + i] += (float) (std::sin (ph) * std::exp (-9.0 * t) * 0.5); }
              if (bt % 2 == 1)
                  for (int i = 0; i < (int) (0.2 * r) && s0 + i < N; ++i) p[s0 + i] += (rng.nextFloat() * 2 - 1) * (float) std::exp (-22.0 * i / r) * 0.3f;
              const int sh = s0 + (int) (0.25 * r);
              for (int i = 0; i < (int) (0.05 * r) && sh + i < N; ++i) p[sh + i] += (rng.nextFloat() * 2 - 1) * (float) std::exp (-70.0 * i / r) * 0.12f;
          } }

        auto bass = buf (16.0);
        { float* p = bass->getWritePointer (0); const int N = bass->getNumSamples();
          const double roots[] = { 55.0, 43.65, 65.41, 49.0 };
          for (int k = 0; k < 64; ++k)
          {
              const double f = roots[(k / 16) % 4] * (k % 4 == 3 ? 2.0 : 1.0); const int s0 = (int) (k * 0.25 * r); double ph = 0, lp = 0;
              for (int i = 0; i < (int) (0.23 * r) && s0 + i < N; ++i)
              { ph = std::fmod (ph + f / r, 1.0); const double v = (ph * 2 - 1) * std::exp (-7.0 * i / r) * 0.45; lp += (v - lp) * 0.14; p[s0 + i] += (float) (lp * 1.3); }
          } }

        auto pad = buf (16.0);
        { float* p = pad->getWritePointer (0); const int N = pad->getNumSamples();
          const double ch[4][3] = { { 220, 261.63, 329.63 }, { 174.61, 220, 261.63 }, { 261.63, 329.63, 392 }, { 196, 246.94, 293.66 } };
          for (int c = 0; c < 4; ++c) for (int n = 0; n < 3; ++n)
          { const int s0 = (int) (c * 4 * r);
            for (int i = 0; i < (int) (4.6 * r) && s0 + i < N; ++i)
            { const double t = i / r, env = jmin (1.0, t / 0.7) * jmin (1.0, jmax (0.0, (4.6 - t) / 0.8)); p[s0 + i] += (float) (std::sin (twoPi * ch[c][n] * t) * env * 0.06); } } }

        auto arp = buf (12.0);
        { float* p = arp->getWritePointer (0); const int N = arp->getNumSamples();
          const double pent[] = { 440, 523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25 };
          for (int k = 0; k < 96; ++k)
          { const double f = pent[(k * 3) % 8] * (k % 16 >= 8 ? 1.5 : 1.0); const int s0 = (int) (k * 0.125 * r);
            for (int i = 0; i < (int) (0.2 * r) && s0 + i < N; ++i) { const double t = i / r; p[s0 + i] += (float) (std::sin (twoPi * f * t) * std::exp (-16.0 * t) * 0.25); } } }

        auto* t1 = addTrack (TR ("Batterie")); auto* t2 = addTrack ("Basse"); auto* t3 = addTrack ("Nappes"); auto* t4 = addTrack (TR ("Arpège"));
        t1->volDb = -4; t2->volDb = -5; t3->volDb = -9; t3->pan = -0.2f; t4->volDb = -10; t4->pan = 0.35f;
        addClip (t1, drums, "Beat 120", 0); addClip (t2, bass, "Ligne de basse", 0);
        addClip (t3, pad, "Accords Am F C G", 0); addClip (t4, arp, TR ("Arpège pentatonique"), 4.0);
        refreshMix();
        if (onChanged) onChanged();
    }

    //-------------------------------------------------------------- carte son
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

    //-------------------------------------------------------------- liste des plugins
    File appDataDir() const
    {
        auto d = File::getSpecialLocation (File::userApplicationDataDirectory).getChildFile ("ALPHA Studio");
        d.createDirectory();
        return d;
    }
    void loadKnownPlugins()
    {
        if (auto xml = parseXML (appDataDir().getChildFile ("plugins.xml"))) knownPlugins.recreateFromXml (*xml);
    }
    void saveKnownPlugins()
    {
        if (auto xml = knownPlugins.createXml()) xml->writeTo (appDataDir().getChildFile ("plugins.xml"));
    }

    //-------------------------------------------------------------- projet
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
                ce->setAttribute ("name", c.name);
                ce->setAttribute ("start", (double) c.start);
                ce->setAttribute ("offset", (double) c.offset);
                ce->setAttribute ("len", (double) c.len);
            }
        }
        return root.writeTo (f);
    }
    String loadProject (const File& f)
    {
        auto xml = parseXML (f);
        if (xml == nullptr || xml->getTagName() != "ALPHAPROJECT") return TR ("Fichier de projet invalide");
        newProject();
        transport.bpm.store (xml->getDoubleAttribute ("bpm", 120.0));
        masterDb = (float) xml->getDoubleAttribute ("master", 0.0);
        String missing;
        for (auto* te : xml->getChildWithTagNameIterator ("TRACK"))
        {
            auto* t = addTrack (te->getStringAttribute ("name"));
            t->colour = Colour::fromString (te->getStringAttribute ("colour", t->colour.toString()));
            t->volDb = (float) te->getDoubleAttribute ("vol", -6.0);
            t->pan = (float) te->getDoubleAttribute ("pan", 0.0);
            t->mute = te->getBoolAttribute ("mute");
            t->solo = te->getBoolAttribute ("solo");
            for (auto* ce : te->getChildWithTagNameIterator ("CLIP"))
            {
                Clip c; String err;
                if (! loadClipAudio (File (ce->getStringAttribute ("file")), c, err)) { missing += err + "\n"; continue; }
                c.name = ce->getStringAttribute ("name");
                c.start = (int64) ce->getDoubleAttribute ("start");
                c.offset = (int64) ce->getDoubleAttribute ("offset");
                c.len = jmin ((int64) ce->getDoubleAttribute ("len"), (int64) c.data->getNumSamples() - c.offset);
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
        refreshMix();
        if (onChanged) onChanged();
        return missing;
    }

private:
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
        if (onChanged) onChanged();
    }

    TimeSliceThread writerThread;
    AudioProcessorGraph::NodeID inputId, outputId, masterId, recId;
    RecorderProcessor* recorder = nullptr;
    bool recording = false, savedLoop = false, savedMetro = false;
    File recFile; int64 recStart = 0; Track* recTrack = nullptr;
};
