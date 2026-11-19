#include "AlphaWebMain.h"
using namespace juce;

AlphaWebMainComponent::AlphaWebMainComponent()
{
    auto options = WebBrowserComponent::Options{}
        .withNativeIntegrationEnabled()
        .withNativeFunction ("alphaCommand",
            [this] (const Array<var>& args, WebBrowserComponent::NativeFunctionCompletion complete)
            {
                handleCommand (args, std::move (complete));
            });

   #if JUCE_WEB_BROWSER && JUCE_USE_WIN_WEBVIEW2
    options = options.withBackend (WebBrowserComponent::Options::Backend::webview2)
                     .withWinWebView2Options (WebBrowserComponent::Options::WinWebView2{}
                         .withUserDataFolder (engine.applicationDataDir().getChildFile ("WebView2")));
   #endif

    browser = std::make_unique<Browser> (options);
    browser->onPageReady = [this] { pageReady = true; publishState(); };
    addAndMakeVisible (*browser);

    const auto appDir = File::getSpecialLocation (File::currentExecutableFile).getParentDirectory();
    const auto html = appDir.getChildFile ("UI").getChildFile ("AlphaStudio").getChildFile ("alpha-studio.html");
    if (html.existsAsFile())
        browser->goToURL (URL (html).toString (false));
    else
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio",
            "Interface introuvable : UI/AlphaStudio/alpha-studio.html");

    engine.onChanged = [this] { publishState(); };
    if (engine.hasAutosave()) engine.restoreAutosave();
    else engine.loadDemo();
    engine.setNativeStatus (TR ("Moteur Windows/JUCE prêt : projet, édition, enregistrement, mixage, MIDI et export WAV."));

    setSize (1600, 900);
    startTimerHz (20);
}

AlphaWebMainComponent::~AlphaWebMainComponent()
{
    stopTimer();
    alive->store (false);
    if (exporting.load()) exportDone->wait (5000.0);
    engine.onChanged = nullptr;
    browser.reset();
}

void AlphaWebMainComponent::resized()
{
    if (browser != nullptr) browser->setBounds (getLocalBounds());
}

var AlphaWebMainComponent::buildState() const
{
    return JSON::parse (alphaString (engine.stateJson()));
}

void AlphaWebMainComponent::publishState()
{
    if (browser == nullptr || ! pageReady) return;
    browser->evaluateJavascript ("window.ALPHA_NATIVE && window.ALPHA_NATIVE.applyState("
                                 + alphaString (engine.stateJson()) + ");");
}

void AlphaWebMainComponent::handleCommand (const Array<var>& args,
                                           WebBrowserComponent::NativeFunctionCompletion complete)
{
    const String command = args.size() > 0 ? args[0].toString() : String();
    const var payload = args.size() > 1 ? args[1] : var (new DynamicObject());
    const String payloadText = JSON::toString (payload);

    if (command == "getState") { complete (buildState()); return; }
    if (command == "quit")
    {
        complete (buildState());
        JUCEApplication::getInstance()->systemRequestedQuit();
        return;
    }
    if (command == "openProject" || command == "saveProject" || command == "saveAs" ||
        command == "saveNewVersion" || command == "saveTemplate" || command == "loadTemplateFile" ||
        command == "importAudio" || command == "importMidi" ||
        command == "exportMidi" || command == "importTrack" || command == "importTrackArchive" ||
        command == "importOmf" || command == "importAaf" || command == "importXml" || command == "importCd")
    {
        openDialog (command, payload);
        complete (buildState());
        return;
    }
    if (command == "exportWav" || command == "exportTrack" || command == "exportStems")
    {
        exportWav (command == "exportStems" || command == "exportTrack");
        complete (buildState());
        return;
    }

    const String error = engine.command (command, payloadText);
    if (error.isNotEmpty())
    {
        engine.setNativeStatus (error);
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", error);
    }
    publishState();
    complete (buildState());
}

void AlphaWebMainComponent::openDialog (const String& kind, const var& payload)
{
    auto& eng = engine;
    const bool save = kind == "saveProject" || kind == "saveAs" || kind == "saveNewVersion" ||
                      kind == "saveTemplate" || kind == "exportMidi";
    const bool audio = kind == "importAudio" || kind == "importTrack" || kind == "importTrackArchive" ||
                       kind == "importOmf" || kind == "importAaf" || kind == "importXml" || kind == "importCd";
    String filters = "*.alphaproj;*.alpha";
    String title = "Ouvrir un projet";
    File initial = File::getSpecialLocation (File::userDocumentsDirectory);
    int flags = FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles;

    if (save)
    {
        title = kind == "exportMidi" ? "Exporter un fichier MIDI"
              : kind == "saveTemplate" ? "Enregistrer comme modèle" : "Enregistrer le projet";
        initial = kind == "saveTemplate"
                    ? eng.templatesDir().getChildFile ("Nouveau modèle.alphaproj")
                    : File::getSpecialLocation (File::userDocumentsDirectory).getChildFile (kind == "exportMidi" ? "Export.mid" : "Projet.alphaproj");
        filters = kind == "exportMidi" ? "*.mid;*.midi" : "*.alphaproj;*.alpha";
        flags = FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting;
    }
    else if (kind == "loadTemplateFile")
    {
        title = "Charger un modèle de projet";
        initial = eng.templatesDir();
        filters = "*.alphaproj";
    }
    else if (kind == "importMidi")
    {
        title = "Importer un fichier MIDI"; filters = "*.mid;*.midi";
    }
    else if (audio)
    {
        title = "Importer des fichiers audio ou un document";
        filters = "*.wav;*.mp3;*.flac;*.ogg;*.aif;*.aiff;*.alphaproj;*.json;*.mid;*.midi";
        flags |= FileBrowserComponent::canSelectMultipleItems;
    }

    chooser = std::make_unique<FileChooser> (title, initial, filters);
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    chooser->launchAsync (flags, [safe, kind, payload] (const FileChooser& fc)
    {
        if (safe == nullptr) return;
        auto& eng = safe->engine;
        const auto results = fc.getResults();
        const File result = fc.getResult();
        const double startBars = (double) payload.getProperty (Identifier ("startBars"), var (1.0));
        const int trackIndex = (int) payload.getProperty (Identifier ("trackIndex"), var (0));

        if (kind == "openProject")
        {
            if (! result.existsAsFile()) return;
            if (result.hasFileExtension (".alpha")) eng.loadProject (result);
            else eng.loadProjectJson (result.withFileExtension ("alphaproj"));
        }
        else if (kind == "saveProject" || kind == "saveAs" || kind == "saveNewVersion")
        {
            if (result == File()) return;
            File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("alphaproj") : result;
            if (f.hasFileExtension (".alpha")) eng.saveProject (f);
            else eng.saveProjectJson (f);
        }
        else if (kind == "saveTemplate")
        {
            if (result == File()) return;
            eng.saveTemplate (result.getFileNameWithoutExtension());
        }
        else if (kind == "loadTemplateFile")
        {
            if (! result.existsAsFile()) return;
            eng.loadTemplateFile (result.withFileExtension ("alphaproj"));
        }
        else if (kind == "exportMidi")
        {
            if (result == File()) return;
            const File f = result.withFileExtension ("mid");
            const auto bytes = alpha::base64Decode (eng.exportMidiData (trackIndex).toStdString());
            FileOutputStream os (f);
            if (! os.openedOk() || ! os.write (bytes.data(), bytes.size()))
                eng.setNativeStatus (TR ("Export MIDI impossible."));
            else eng.setNativeStatus (TR ("Fichier MIDI exporté."));
        }
        else if (kind == "importMidi")
        {
            if (! result.existsAsFile()) return;
            MemoryBlock mb;
            if (! result.loadFileAsData (mb)) return;
            const auto e = eng.importMidiData (mb.toBase64Encoding(), trackIndex, startBars);
            if (e.isNotEmpty()) eng.setNativeStatus (e);
        }
        else
        {
            for (const auto& file : results)
            {
                if (! file.existsAsFile()) continue;
                if (file.hasFileExtension (".mid") || file.hasFileExtension (".midi"))
                {
                    MemoryBlock mb;
                    if (file.loadFileAsData (mb)) eng.importMidiData (mb.toBase64Encoding(), trackIndex, startBars);
                    continue;
                }
                if (file.hasFileExtension (".alphaproj") || file.hasFileExtension (".json"))
                {
                    MemoryBlock mb;
                    if (file.loadFileAsData (mb)) eng.importProjectData (mb.toBase64Encoding());
                    continue;
                }
                if (kind == "importOmf" || kind == "importAaf" || kind == "importXml" || kind == "importCd")
                {
                    eng.setNativeStatus (TR ("Format d'échange non pris en charge ; importer un WAV, MIDI ou .alphaproj."));
                    continue;
                }
                MemoryBlock mb;
                if (! file.loadFileAsData (mb)) continue;
                eng.importAudioData (file.getFileName(), mb.toBase64Encoding(), startBars);
            }
        }
        safe->publishState();
    });
}

void AlphaWebMainComponent::exportWav (bool stems)
{
    if (exporting.exchange (true))
    {
        engine.setNativeStatus (TR ("Un export WAV est déjà en cours."));
        publishState();
        return;
    }
    exportDone->reset();
    const auto title = stems ? "Choisir le dossier des stems" : "Exporter le mixage WAV 48 kHz / 24 bits";
    const auto initial = File::getSpecialLocation (File::userDocumentsDirectory).getChildFile (stems ? "Stems" : "Mixage.wav");
    chooser = std::make_unique<FileChooser> (title, initial, stems ? "" : "*.wav");
    const int flags = stems ? (FileBrowserComponent::openMode | FileBrowserComponent::canSelectDirectories)
                            : (FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting);
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    auto* self = this;
    auto aliveFlag = alive;
    auto done = exportDone;

    chooser->launchAsync (flags, [safe, self, aliveFlag, done, stems] (const FileChooser& fc)
    {
        const File target = fc.getResult();
        if (safe == nullptr || target == File())
        {
            if (safe != nullptr) safe->exporting.store (false);
            done->signal();
            return;
        }
        const bool launched = Thread::launch ([safe, self, aliveFlag, done, stems, target]
        {
            bool ok = false;
            if (aliveFlag->load() && self != nullptr)
            {
                std::function<bool (double)> progress = [] (double) { return true; };
                self->engine.beginOffline();
                if (stems)
                {
                    target.createDirectory();
                    ok = true;
                    for (size_t i = 0; i < self->engine.tracks.size(); ++i)
                    {
                        const String name = self->engine.tracks[i]->name.removeCharacters ("\\/:*?\"<>|");
                        const File f = target.getNonexistentChildFile (name.isEmpty() ? "Stem" : name, ".wav");
                        ok = self->engine.renderOffline (f, 48000.0, 24, progress, (int) i) && ok;
                    }
                }
                else
                {
                    ok = self->engine.renderOffline (target.withFileExtension ("wav"), 48000.0, 24, progress, -1);
                }
                self->engine.endOffline();
                self->engine.setNativeStatus (ok ? TR ("Export WAV 48 kHz / 24 bits terminé.") : TR ("Export WAV interrompu."));
            }
            MessageManager::callAsync ([safe, done]
            {
                if (safe != nullptr) { safe->exporting.store (false); safe->publishState(); }
            });
            done->signal();
        });
        if (! launched)
        {
            if (safe != nullptr) safe->exporting.store (false);
            done->signal();
        }
    });
}

void AlphaWebMainComponent::timerCallback()
{
    engine.recordingTick();
    engine.autosaveTick (false);
    publishState();
}

class AlphaApp final : public JUCEApplication
{
public:
    const String getApplicationName() override { return "ALPHA Studio"; }
    const String getApplicationVersion() override { return "0.4.0"; }
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
