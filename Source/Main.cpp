#include "AlphaWebMain.h"
#include <cstdint>
#include <cstring>
using namespace juce;

static double alphaDisplayScale()
{
    const auto* display = Desktop::getInstance().getDisplays().getPrimaryDisplay();
    return display != nullptr ? jlimit (0.75, 3.0, display->scale) : 1.0;
}

static double alphaWindowsTextScale()
{
   #if JUCE_WINDOWS
    // Windows « Agrandir le texte » : REG_DWORD 100 = 100 %, 150 = 150 %.
    const String raw = WindowsRegistry::getValue ("HKEY_CURRENT_USER\\Software\\Microsoft\\Accessibility\\TextScaleFactor", "100");
    const int percent = raw.getIntValue();
    if (percent >= 75 && percent <= 250)
        return jlimit (0.8, 2.5, (double) percent / 100.0);
   #endif
    return 1.0;
}

static Rectangle<int> alphaInitialWindowBounds()
{
    const auto* display = Desktop::getInstance().getDisplays().getPrimaryDisplay();
    const auto area = display != nullptr ? display->userArea : Rectangle<int> (0, 0, 1920, 1080);
    const int availableW = jmax (800, area.getWidth() - 40);
    const int availableH = jmax (500, area.getHeight() - 40);
    const int w = jmax (800, jmin (1840, availableW));
    const int h = jmax (500, jmin (1000, availableH));
    return { area.getX() + (area.getWidth() - w) / 2,
             area.getY() + (area.getHeight() - h) / 2, w, h };
}

static File alphaWindowStateFile()
{
    auto dir = File::getSpecialLocation (File::userApplicationDataDirectory).getChildFile ("ALPHA Studio");
    dir.createDirectory();
    return dir.getChildFile ("window.xml");
}

struct AlphaExportDoneSignal
{
    std::shared_ptr<WaitableEvent> event;
    ~AlphaExportDoneSignal() { if (event != nullptr) event->signal(); }
};

AlphaWebMainComponent::AlphaWebMainComponent()
    : engineOwner (std::make_shared<AlphaEngine>()), engine (*engineOwner)
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
                         .withUserDataFolder (engine.applicationDataDir().getChildFile ("WebView2"))
                         .withStatusBarDisabled()
                         .withBuiltInErrorPageDisabled()
                         .withBackgroundColour (Colour (0xff1f2022)));
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

    const auto initial = alphaInitialWindowBounds();
    setSize (initial.getWidth(), initial.getHeight());
    startTimerHz (20);
}

AlphaWebMainComponent::~AlphaWebMainComponent()
{
    stopTimer();
    alive->store (false); // annulation coopérative de l'export en cours.
    if (exporting.load()) exportDone->wait(); // attente réelle, sans limite arbitraire.
    engine.onChanged = nullptr;
    browser.reset();
}

void AlphaWebMainComponent::resized()
{
    if (browser != nullptr) browser->setBounds (getLocalBounds());
    publishState();
}

var AlphaWebMainComponent::buildState()
{
    auto state = JSON::parse (alphaString (engine.stateJson()));
    addDisplayMetrics (state);
    return state;
}

void AlphaWebMainComponent::addDisplayMetrics (var& state) const
{
    auto* object = state.getDynamicObject();
    if (object == nullptr) return;
    const double dpiScale = alphaDisplayScale();
    const double fontScale = jlimit (0.8, 2.0, alphaWindowsTextScale() * fontScaleOverride);
    const double widthScale = (double) jmax (1, getWidth()) / 1600.0;
    const double heightScale = (double) jmax (1, getHeight()) / 900.0;
    const double fittedScale = jlimit (0.65, 1.0, jmin (widthScale, heightScale));
    const double uiScale = jlimit (0.60, 1.25, fittedScale * uiScaleOverride);
    object->setProperty ("dpiScale", dpiScale);
    object->setProperty ("devicePixelRatio", dpiScale);
    object->setProperty ("fontScale", fontScale);
    object->setProperty ("uiScale", uiScale);
    object->setProperty ("appVersion", "0.5.0");
    auto* safeArea = new DynamicObject();
    safeArea->setProperty ("x", 0);
    safeArea->setProperty ("y", 0);
    safeArea->setProperty ("width", jmax (1, getWidth()));
    safeArea->setProperty ("height", jmax (1, getHeight()));
    object->setProperty ("safeArea", var (safeArea));
}

void AlphaWebMainComponent::publishState()
{
    if (browser == nullptr || ! pageReady) return;
    const String script = String ("window.ALPHA_NATIVE && window.ALPHA_NATIVE.applyState(")
                          + JSON::toString (buildState()) + ");";
    browser->evaluateJavascript (script);
}

void AlphaWebMainComponent::showAudioSettings()
{
    auto* selector = new AudioDeviceSelectorComponent (engine.deviceManager, 0, 2, 0, 2,
                                                       true, false, true, false);
    selector->setSize (680, 540);
    DialogWindow::LaunchOptions options;
    options.dialogTitle = TR ("Périphériques audio / ASIO");
    options.dialogBackgroundColour = Colours::darkgrey;
    options.content.setOwned (selector);
    options.componentToCentreAround = this;
    options.escapeKeyTriggersCloseButton = true;
    options.useNativeTitleBar = true;
    options.resizable = true;
    options.launchAsync();
}

void AlphaWebMainComponent::showAsioPanel()
{
    if (auto* device = engine.deviceManager.getCurrentAudioDevice())
    {
        if (device->hasControlPanel() && device->showControlPanel())
            engine.setNativeStatus (TR ("Panneau de configuration du pilote ASIO ouvert."));
        else
            engine.setNativeStatus (TR ("Aucun panneau constructeur ASIO disponible pour ce périphérique."));
    }
    else
    {
        engine.setNativeStatus (TR ("Aucun périphérique audio actif : ouvrir les réglages audio."));
    }
    publishState();
}

void AlphaWebMainComponent::fitWindowToScreen()
{
    if (auto* window = findParentComponentOfClass<DocumentWindow>())
    {
        const auto* display = Desktop::getInstance().getDisplays().getPrimaryDisplay();
        const auto area = display != nullptr ? display->userArea : Rectangle<int> (0, 0, 1920, 1080);
        window->setMinimised (false);
        window->setFullScreen (false);
        window->setBounds (area.reduced (20));
    }
    publishState();
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
        int singleTrack = (int) payload.getProperty (Identifier ("trackIndex"), -1);
        if (singleTrack < 0 || singleTrack >= (int) engine.tracks.size()) singleTrack = -1;
        exportWav (command == "exportStems", command == "exportTrack" ? singleTrack : -1);
        complete (buildState());
        return;
    }

    if (command == "audioSettings")
    {
        showAudioSettings();
        complete (buildState());
        return;
    }
    if (command == "asioPanel")
    {
        showAsioPanel();
        complete (buildState());
        return;
    }
    if (command == "getDisplayMetrics")
    {
        complete (buildState());
        return;
    }
    if (command == "windowMinimize" || command == "windowMaximize" ||
        command == "windowRestore" || command == "windowFitToScreen")
    {
        if (auto* window = findParentComponentOfClass<DocumentWindow>())
        {
            if (command == "windowMinimize") window->minimiseButtonPressed();
            else if (command == "windowMaximize") window->maximiseButtonPressed();
            else if (command == "windowRestore") { window->setMinimised (false); window->setFullScreen (false); }
            else fitWindowToScreen();
        }
        publishState();
        complete (buildState());
        return;
    }
    if (command == "windowDrag")
    {
        if (auto* window = findParentComponentOfClass<DocumentWindow>())
        {
            const double scale = jmax (0.75, alphaDisplayScale());
            const int dx = roundToInt ((double) payload.getProperty (Identifier ("dx"), var (0.0)) / scale);
            const int dy = roundToInt ((double) payload.getProperty (Identifier ("dy"), var (0.0)) / scale);
            const auto* display = Desktop::getInstance().getDisplays().getPrimaryDisplay();
            const auto area = display != nullptr ? display->userArea : Rectangle<int> (0, 0, 1920, 1080);
            if (! window->isMinimised())
            {
                if (window->isFullScreen()) window->setFullScreen (false);
                const auto bounds = window->getBounds();
                const int x = jlimit (area.getX() - bounds.getWidth() + 120, area.getRight() - 120, bounds.getX() + dx);
                const int y = jlimit (area.getY(), area.getBottom() - 40, bounds.getY() + dy);
                window->setTopLeftPosition (x, y);
            }
        }
        complete (buildState());
        return;
    }
    if (command == "uiScale" || command == "fontScale" || command == "resetLayout")
    {
        if (command == "uiScale")
            uiScaleOverride = jlimit (0.70, 1.25, uiScaleOverride + (double) payload.getProperty (Identifier ("delta"), var (0.0)));
        else if (command == "fontScale")
            fontScaleOverride = jlimit (0.80, 2.00, fontScaleOverride + (double) payload.getProperty (Identifier ("delta"), var (0.0)));
        else { uiScaleOverride = 1.0; fontScaleOverride = 1.0; }
        publishState();
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
    int dialogFlags = FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles;

    if (save)
    {
        title = kind == "exportMidi" ? "Exporter un fichier MIDI"
              : kind == "saveTemplate" ? "Enregistrer comme modèle" : "Enregistrer le projet";
        initial = kind == "saveTemplate"
                    ? eng.templatesDir().getChildFile ("Nouveau modèle.alphaproj")
                    : File::getSpecialLocation (File::userDocumentsDirectory).getChildFile (kind == "exportMidi" ? "Export.mid" : "Projet.alphaproj");
        filters = kind == "exportMidi" ? "*.mid;*.midi" : "*.alphaproj;*.alpha";
        dialogFlags = FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting;
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
        dialogFlags |= FileBrowserComponent::canSelectMultipleItems;
    }

    chooser = std::make_unique<FileChooser> (title, initial, filters);
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    chooser->launchAsync (dialogFlags, [safe, kind, payload] (const FileChooser& fc)
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
                    if (file.loadFileAsData (mb)) eng.importProjectData (mb.toBase64Encoding(), file.getParentDirectory());
                    continue;
                }
                if (kind == "importOmf" || kind == "importAaf" || kind == "importXml" || kind == "importCd")
                {
                    eng.setNativeStatus (TR ("Format d'échange non pris en charge ; importer un WAV, MIDI ou .alphaproj."));
                    continue;
                }
                MemoryBlock mb;
                if (! file.loadFileAsData (mb)) continue;
                eng.importAudioData (file.getFileName(), mb.toBase64Encoding(), startBars, trackIndex);
            }
        }
        safe->publishState();
    });
}

void AlphaWebMainComponent::exportWav (bool stems, int singleTrack)
{
    if (exporting.exchange (true))
    {
        engine.setNativeStatus (TR ("Un export WAV est déjà en cours."));
        publishState();
        return;
    }
    exportDone->reset();
    const bool single = ! stems && singleTrack >= 0;
    const auto title = stems ? "Choisir le dossier des stems"
                            : single ? "Exporter la piste sélectionnée WAV 48 kHz / 24 bits"
                                     : "Exporter le mixage WAV 48 kHz / 24 bits";
    const auto initial = File::getSpecialLocation (File::userDocumentsDirectory)
                             .getChildFile (stems ? "Stems" : single ? "Piste.wav" : "Mixage.wav");
    chooser = std::make_unique<FileChooser> (title, initial, stems ? "" : "*.wav");
    const int exportFlags = stems ? (FileBrowserComponent::openMode | FileBrowserComponent::canSelectDirectories)
                                  : (FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting);
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    auto aliveFlag = alive;
    auto done = exportDone;
    auto engineRef = engineOwner;

    chooser->launchAsync (exportFlags, [safe, aliveFlag, done, stems, singleTrack, engineRef] (const FileChooser& fc)
    {
        const File target = fc.getResult();
        if (safe == nullptr || target == File())
        {
            if (safe != nullptr) safe->exporting.store (false);
            done->signal();
            return;
        }
        const bool launched = Thread::launch ([safe, aliveFlag, done, stems, singleTrack, target, engineRef]
        {
            AlphaExportDoneSignal completion { done };
            if (! aliveFlag->load()) return;
            std::function<bool (double)> progress = [aliveFlag] (double) { return aliveFlag->load(); };
            bool ok = false;
            engineRef->beginOffline();
            if (stems)
            {
                target.createDirectory();
                ok = true;
                for (size_t i = 0; i < engineRef->tracks.size() && aliveFlag->load(); ++i)
                {
                    const String name = engineRef->tracks[i]->name.removeCharacters ("\\/:*?\"<>|");
                    const File f = target.getNonexistentChildFile (name.isEmpty() ? "Stem" : name, ".wav");
                    ok = engineRef->renderOffline (f, 48000.0, 24, progress, (int) i) && ok;
                }
            }
            else
            {
                const int onlyTrack = singleTrack >= 0 && singleTrack < (int) engineRef->tracks.size() ? singleTrack : -1;
                if (! stems && singleTrack >= 0 && onlyTrack < 0)
                {
                    ok = false;
                    engineRef->setNativeStatus (TR ("Export de piste annulé : la piste sélectionnée est introuvable."));
                }
                else
                {
                    ok = engineRef->renderOffline (target.withFileExtension ("wav"), 48000.0, 24, progress, onlyTrack);
                }
            }
            engineRef->endOffline();
            engineRef->setNativeStatus (ok ? TR ("Export WAV 48 kHz / 24 bits terminé.") : TR ("Export WAV interrompu."));
            MessageManager::callAsync ([safe]
            {
                if (safe != nullptr) { safe->exporting.store (false); safe->publishState(); }
            });
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
    const String getApplicationVersion() override { return "0.5.0"; }
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
            setResizeLimits (800, 500, 3840, 2160);
            if (! restoreWindowState())
                setBounds (alphaInitialWindowBounds());
            setVisible (true);
        }
        ~MainWindow() override { saveWindowState(); }
        void closeButtonPressed() override
        {
            saveWindowState();
            JUCEApplication::getInstance()->systemRequestedQuit();
        }
    private:
        bool restoreWindowState()
        {
            auto xml = parseXML (alphaWindowStateFile());
            if (xml == nullptr || ! xml->hasTagName ("ALPHA_WINDOW")) return false;
            const Rectangle<int> bounds (xml->getIntAttribute ("x", 0), xml->getIntAttribute ("y", 0),
                                         xml->getIntAttribute ("w", 0), xml->getIntAttribute ("h", 0));
            const auto* display = Desktop::getInstance().getDisplays().getPrimaryDisplay();
            const auto area = display != nullptr ? display->userArea : Rectangle<int> (0, 0, 1920, 1080);
            if (bounds.getWidth() < 800 || bounds.getHeight() < 500 || ! area.intersects (bounds)) return false;
            setBounds (bounds);
            if (xml->getBoolAttribute ("maximised", false)) setFullScreen (true);
            return true;
        }
        void saveWindowState()
        {
            const auto bounds = getBounds();
            auto xml = std::make_unique<XmlElement> ("ALPHA_WINDOW");
            xml->setAttribute ("x", bounds.getX());
            xml->setAttribute ("y", bounds.getY());
            xml->setAttribute ("w", bounds.getWidth());
            xml->setAttribute ("h", bounds.getHeight());
            xml->setAttribute ("maximised", isFullScreen());
            xml->writeTo (alphaWindowStateFile());
        }
    };
private:
    std::unique_ptr<MainWindow> window;
};
START_JUCE_APPLICATION (AlphaApp)
