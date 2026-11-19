#include "AlphaWebMain.h"
using namespace juce;

AlphaWebMainComponent::AlphaWebMainComponent()
{
    auto options = WebBrowserComponent::Options{}
        .withBackend (WebBrowserComponent::Options::Backend::webview2)
        .withWinWebView2Options (WebBrowserComponent::Options::WinWebView2{}
            .withUserDataFolder (engine.appDataDir().getChildFile ("WebView2")))
        .withNativeIntegrationEnabled()
        .withNativeFunction ("alphaCommand",
            [this] (const Array<var>& args, WebBrowserComponent::NativeFunctionCompletion complete)
            {
                handleCommand (args, std::move (complete));
            });

    browser = std::make_unique<Browser> (options);
    browser->onPageReady = [this] { pageReady = true; publishState(); };
    addAndMakeVisible (*browser);

    const auto appDir = File::getSpecialLocation (File::currentExecutableFile).getParentDirectory();
    const auto html = appDir.getChildFile ("UI").getChildFile ("AlphaStudio").getChildFile ("alpha-studio.html");
    if (html.existsAsFile())
        browser->goToURL (html.getURL().toString (false));
    else
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio",
            "Interface introuvable : UI/AlphaStudio/alpha-studio.html");

    setSize (1600, 900);
    startTimerHz (20);
}

AlphaWebMainComponent::~AlphaWebMainComponent()
{
    stopTimer();
    browser.reset();
}

void AlphaWebMainComponent::resized()
{
    if (browser != nullptr) browser->setBounds (getLocalBounds());
}

static double barsToSamples (double bars, double bpm, double sampleRate)
{
    return (jmax (1.0, bars) - 1.0) * 4.0 * 60.0 / bpm * sampleRate;
}

static double samplesToBars (double samples, double bpm, double sampleRate)
{
    return 1.0 + samples / (4.0 * 60.0 / bpm * sampleRate);
}

var AlphaWebMainComponent::buildState() const
{
    auto* root = new DynamicObject();
    const double bpm = engine.transport.bpm.load();
    const double sr = engine.sr();
    const double samplesPerBar = 4.0 * 60.0 / bpm * sr;

    root->setProperty ("tempo", bpm);
    root->setProperty ("sampleRate", sr);
    root->setProperty ("positionBars", samplesToBars ((double) engine.transport.pos.load(), bpm, sr));
    root->setProperty ("playing", engine.transport.playing.load());
    root->setProperty ("recording", engine.isRecording());
    root->setProperty ("looping", engine.transport.looping.load());
    root->setProperty ("metronome", engine.transport.metronome.load());
    root->setProperty ("loopStartBars", samplesToBars ((double) engine.transport.loopStart.load(), bpm, sr));
    root->setProperty ("loopEndBars", samplesToBars ((double) engine.transport.loopEnd.load(), bpm, sr));
    root->setProperty ("device", engine.deviceInfo());

    Array<var> trackArray;
    for (size_t ti = 0; ti < engine.tracks.size(); ++ti)
    {
        const auto& track = engine.tracks[ti];
        auto* item = new DynamicObject();
        item->setProperty ("id", "native_" + String ((int) ti));
        item->setProperty ("name", track->name);
        item->setProperty ("volumeDb", (double) track->volDb);
        item->setProperty ("pan", (double) track->pan);
        item->setProperty ("mute", track->mute);
        item->setProperty ("solo", track->solo);
        item->setProperty ("arm", track->arm);
        item->setProperty ("colour", "#" + track->colour.toString().substring (2));
        item->setProperty ("levelL", (double) track->fader->levelL.load());
        item->setProperty ("levelR", (double) track->fader->levelR.load());

        Array<var> clips;
        const SpinLock::ScopedLockType lock (track->source->lock);
        for (size_t ci = 0; ci < track->source->clips.size(); ++ci)
        {
            const auto& clip = track->source->clips[ci];
            auto* c = new DynamicObject();
            c->setProperty ("id", "nativeClip_" + String ((int) ti) + "_" + String ((int) ci));
            c->setProperty ("name", clip.name);
            c->setProperty ("startBars", samplesToBars ((double) clip.start, bpm, sr));
            c->setProperty ("lengthBars", (double) clip.len / samplesPerBar);
            clips.add (var (c));
        }
        item->setProperty ("clips", var (clips));
        trackArray.add (var (item));
    }
    root->setProperty ("tracks", var (trackArray));
    return var (root);
}

void AlphaWebMainComponent::publishState()
{
    if (browser == nullptr || ! pageReady) return;
    browser->evaluateJavascript ("window.ALPHA_NATIVE && window.ALPHA_NATIVE.applyState("
                                 + JSON::toString (buildState()) + ");");
}

void AlphaWebMainComponent::handleCommand (const Array<var>& args,
                                           WebBrowserComponent::NativeFunctionCompletion complete)
{
    const auto command = args.size() > 0 ? args[0].toString() : String();
    const var payload = args.size() > 1 ? args[1] : var (new DynamicObject());
    const auto value = [&payload] (const char* key, const var& fallback = var())
    {
        return payload.getProperty (Identifier (key), fallback);
    };

    if (command == "getState") { complete (buildState()); return; }
    if (command == "play") engine.play();
    else if (command == "stop")
    {
        if (engine.isRecording())
        {
            const auto error = engine.stopRecording();
            if (error.isNotEmpty())
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", error);
        }
        else engine.stopTransport();
    }
    else if (command == "record")
    {
        if (engine.isRecording()) engine.stopRecording();
        else
        {
            AlphaEngine::Track* target = nullptr;
            for (auto& track : engine.tracks) if (track->arm) { target = track.get(); break; }
            if (target == nullptr && ! engine.tracks.empty()) target = engine.tracks.front().get();
            if (target == nullptr) target = engine.addTrack ("Audio 1");
            const auto error = engine.startRecording (target);
            if (error.isNotEmpty())
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", error);
        }
    }
    else if (command == "newProject") engine.newProject();
    else if (command == "cycle")
    {
        const bool enabled = (bool) value ("enabled", ! engine.transport.looping.load());
        engine.transport.looping.store (enabled);
        if (engine.transport.loopEnd.load() <= engine.transport.loopStart.load())
        {
            engine.transport.loopStart.store (0);
            engine.transport.loopEnd.store ((int64) barsToSamples (9.0, engine.transport.bpm.load(), engine.sr()));
        }
    }
    else if (command == "metronome")
        engine.transport.metronome.store ((bool) value ("enabled", ! engine.transport.metronome.load()));
    else if (command == "seek")
        engine.seek ((int64) barsToSamples ((double) value ("bars", 1.0), engine.transport.bpm.load(), engine.sr()));
    else if (command == "tempo")
        engine.transport.bpm.store (jlimit (20.0, 300.0, (double) value ("bpm", 120.0)));
    else if (command == "setLoop")
    {
        const double bpm = engine.transport.bpm.load(), sr = engine.sr();
        engine.transport.loopStart.store ((int64) barsToSamples ((double) value ("start", 1.0), bpm, sr));
        engine.transport.loopEnd.store ((int64) barsToSamples ((double) value ("end", 9.0), bpm, sr));
        engine.transport.looping.store (true);
    }
    else if (command == "addTrack")
        engine.addTrack (value ("name", "Audio").toString());
    else if (command == "importAudio") importAudio();
    else if (command == "openProject") openProject();
    else if (command == "saveProject") saveProject();
    else if (command == "setTrack")
    {
        const int index = (int) value ("index", -1);
        const auto field = value ("field").toString();
        if (isPositiveAndBelow (index, (int) engine.tracks.size()))
        {
            auto* track = engine.tracks[(size_t) index].get();
            const auto v = value ("value");
            if (field == "mute") track->mute = (bool) v;
            else if (field == "solo") track->solo = (bool) v;
            else if (field == "arm") track->arm = (bool) v;
            else if (field == "volumeDb") track->volDb = (float) jlimit (-60.0, 6.0, (double) v);
            else if (field == "pan") track->pan = (float) jlimit (-1.0, 1.0, (double) v);
            engine.refreshMix();
        }
    }

    publishState();
    complete (true);
}

void AlphaWebMainComponent::importAudio()
{
    chooser = std::make_unique<FileChooser> ("Importer des fichiers audio",
        File::getSpecialLocation (File::userMusicDirectory), "*.wav;*.mp3;*.flac;*.ogg;*.aif;*.aiff");
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles
                          | FileBrowserComponent::canSelectMultipleItems,
        [safe] (const FileChooser& fc)
        {
            if (safe == nullptr) return;
            for (const auto& file : fc.getResults())
            {
                auto* track = safe->engine.addTrack (file.getFileNameWithoutExtension());
                String error;
                if (! safe->engine.importAudio (track, file, safe->engine.transport.pos.load(), error))
                {
                    safe->engine.removeTrack (track);
                    AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "Import audio", error);
                }
            }
            safe->publishState();
        });
}

void AlphaWebMainComponent::openProject()
{
    chooser = std::make_unique<FileChooser> ("Ouvrir un projet",
        File::getSpecialLocation (File::userDocumentsDirectory), "*.alpha");
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles,
        [safe] (const FileChooser& fc)
        {
            if (safe == nullptr || ! fc.getResult().existsAsFile()) return;
            const auto error = safe->engine.loadProject (fc.getResult());
            if (error.isNotEmpty())
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "Ouvrir le projet", error);
            safe->publishState();
        });
}

void AlphaWebMainComponent::saveProject()
{
    chooser = std::make_unique<FileChooser> ("Enregistrer le projet",
        File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("Projet.alpha"), "*.alpha");
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    chooser->launchAsync (FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting,
        [safe] (const FileChooser& fc)
        {
            if (safe == nullptr || fc.getResult() == File()) return;
            if (! safe->engine.saveProject (fc.getResult().withFileExtension ("alpha")))
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio",
                                                  "Impossible d'enregistrer le projet.");
            safe->publishState();
        });
}

void AlphaWebMainComponent::timerCallback() { publishState(); }

class AlphaApp final : public JUCEApplication
{
public:
    const String getApplicationName() override { return "ALPHA Studio"; }
    const String getApplicationVersion() override { return "0.3.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void initialise (const String&) override { window = std::make_unique<MainWindow>(); }
    void shutdown() override { window.reset(); }
    void systemRequestedQuit() override { quit(); }

    class MainWindow final : public DocumentWindow
    {
    public:
        MainWindow() : DocumentWindow ("ALPHA Studio", Colour (0xff1a1c1e), allButtons)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (new AlphaWebMainComponent(), true);
            setResizable (true, true);
            setResizeLimits (1100, 650, 3840, 2160);
            centreWithSize (1600, 900);
            setVisible (true);
        }
        void closeButtonPressed() override { JUCEApplication::getInstance()->systemRequestedQuit(); }
    };
private:
    std::unique_ptr<MainWindow> window;
};
START_JUCE_APPLICATION (AlphaApp)
