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
    // AUDIT v6 — commandes d'échange de fichiers réelles : chacune ouvre un
    // sélecteur Windows natif puis appelle le traitement moteur correspondant.
    if (command == "openProject" || command == "saveProject" || command == "saveAs" ||
        command == "saveNewVersion" || command == "saveTemplate" || command == "loadTemplateFile" ||
        command == "importAudio" || command == "importMidi" ||
        command == "exportMidi" || command == "importTrack" || command == "importTrackArchive" ||
        command == "importOmf" || command == "importAaf" || command == "importXml" || command == "importCd" ||
        command == "newFolder" || command == "exportOmf" || command == "exportCd" ||
        command == "exportXml" || command == "exportScore" || command == "exportPerf" ||
        command == "printSheet")
    {
        openDialog (command, payload);
        complete (buildState());
        return;
    }

    // Impression réelle de la fiche de projet par le moteur WebView2.
    if (command == "print" || command == "pageSetup")
    {
        openDialog ("printSheet", payload);
        complete (buildState());
        return;
    }

    // Navigateur de greffons réel : liste des modules effectivement analysés.
    if (command == "addFX" || command == "pluginBrowser" || command == "addPluginFolderDialog")
    {
        if (command == "addPluginFolderDialog") choosePluginFolder();
        else showPluginBrowser (payload);
        complete (buildState());
        return;
    }

    // Bibliothèque de projets réelle : tous les .alphaproj présents sur le disque.
    if (command == "newLibrary" || command == "projectLibrary")
    {
        showProjectLibrary();
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

    // ------------------------------------------------------------------
    // AUDIT v6 — dialogues natifs réels : chaque commande d'échange de
    // fichiers ouvre un véritable sélecteur Windows et appelle le
    // traitement moteur correspondant. Aucun format n'est refusé par un
    // simple message d'état.
    // ------------------------------------------------------------------
    const bool saveProjectFamily = kind == "saveProject" || kind == "saveAs" || kind == "saveNewVersion" ||
                                   kind == "saveTemplate" || kind == "loadTemplateFile";
    const bool saveExchange = kind == "exportMidi" || kind == "exportXml" || kind == "exportScore" ||
                              kind == "exportPerf" || kind == "printSheet";
    const bool directoryMode = kind == "newFolder" || kind == "exportOmf" || kind == "exportCd" || kind == "importCd";
    const bool importExchange = kind == "importOmf" || kind == "importAaf" || kind == "importXml";
    const bool importAudioFamily = kind == "importAudio" || kind == "importTrack" || kind == "importTrackArchive";

    String filters = "*.alphaproj;*.alpha";
    String title = TR ("Ouvrir un projet");
    File initial = File::getSpecialLocation (File::userDocumentsDirectory);
    int dialogFlags = FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles;

    if (saveProjectFamily)
    {
        title = kind == "saveTemplate" ? TR ("Enregistrer comme modèle") : TR ("Enregistrer le projet");
        initial = kind == "saveTemplate"
                    ? eng.templatesDir().getChildFile (TR ("Nouveau modèle.alphaproj"))
                    : File::getSpecialLocation (File::userDocumentsDirectory).getChildFile (TR ("Projet.alphaproj"));
        dialogFlags = FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting;
    }
    else if (saveExchange)
    {
        dialogFlags = FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting;
        const File docs = File::getSpecialLocation (File::userDocumentsDirectory);
        if (kind == "exportMidi")      { title = TR ("Exporter un fichier MIDI");        initial = docs.getChildFile ("Export.mid");              filters = "*.mid;*.midi"; }
        else if (kind == "exportXml")  { title = TR ("Exporter un XML Final Cut Pro");   initial = docs.getChildFile ("Projet.xml");              filters = "*.xml"; }
        else if (kind == "exportScore"){ title = TR ("Exporter une partition MusicXML"); initial = docs.getChildFile ("Partition.musicxml");      filters = "*.musicxml;*.xml"; }
        else if (kind == "exportPerf") { title = TR ("Exporter le journal de performances"); initial = docs.getChildFile ("Performances.csv");    filters = "*.csv;*.txt"; }
        else                           { title = TR ("Générer la fiche de projet imprimable"); initial = docs.getChildFile ("Fiche-projet.html"); filters = "*.html"; }
    }
    else if (directoryMode)
    {
        dialogFlags = FileBrowserComponent::openMode | FileBrowserComponent::canSelectDirectories;
        filters = String();
        if (kind == "newFolder")  { title = TR ("Créer un dossier de projet");        initial = File::getSpecialLocation (File::userDocumentsDirectory); }
        else if (kind == "exportOmf") { title = TR ("Exporter un paquet OMF");        initial = File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("Paquet OMF"); }
        else if (kind == "exportCd")  { title = TR ("Préparer une image CD");         initial = File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("Image CD"); }
        else                          { title = TR ("Importer les plages d'un CD audio"); initial = File::getSpecialLocation (File::userMusicDirectory); }
    }
    else if (importExchange)
    {
        if (kind == "importXml") { title = TR ("Importer un XML Final Cut Pro"); filters = "*.xml"; }
        else                     { title = kind == "importAaf" ? TR ("Importer un fichier AAF") : TR ("Importer un fichier OMF");
                                   filters = "*.omf;*.aaf;*.xml"; }
    }
    else if (kind == "importMidi")
    {
        title = TR ("Importer un fichier MIDI"); filters = "*.mid;*.midi";
    }
    else if (importAudioFamily)
    {
        title = TR ("Importer des fichiers audio ou un document");
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

        if (result == File() && results.isEmpty()) return;

        // ---- création réelle d'un dossier de projet avec son arborescence
        if (kind == "newFolder")
        {
            const auto e = eng.createProjectFolder (result, result.getFileName());
            if (e.isNotEmpty()) AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", e);
            safe->publishState();
            return;
        }

        // ---- échanges réels nécessitant un rendu hors ligne (thread dédié)
        if (kind == "exportOmf" || kind == "exportCd")
        {
            safe->runHeavyExchange (kind, result);
            return;
        }

        // ---- imports d'échange réels
        if (kind == "importXml")
        {
            String error;
            if (! eng.importFcpXml (result, error))
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", error);
            safe->publishState();
            return;
        }
        if (kind == "importOmf" || kind == "importAaf")
        {
            const auto e = eng.importOmfOrAaf (result, trackIndex, startBars);
            if (e.isNotEmpty()) AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", e);
            safe->publishState();
            return;
        }
        if (kind == "importCd")
        {
            const auto e = eng.importCdTracks (result, trackIndex, startBars);
            if (e.isNotEmpty()) AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", e);
            safe->publishState();
            return;
        }

        // ---- exports de documents réels
        if (kind == "exportXml")
        {
            const File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("xml") : result;
            if (! eng.exportFcpXml (f)) eng.setNativeStatus (TR ("Export XML Final Cut Pro impossible."));
            safe->publishState();
            return;
        }
        if (kind == "exportScore")
        {
            const File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("musicxml") : result;
            if (! eng.exportMusicXml (f, trackIndex)) eng.setNativeStatus (TR ("Export de partition impossible : aucune note MIDI."));
            safe->publishState();
            return;
        }
        if (kind == "exportPerf")
        {
            const File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("csv") : result;
            if (! eng.exportPerformanceLog (f)) eng.setNativeStatus (TR ("Export du journal de performances impossible."));
            safe->publishState();
            return;
        }
        if (kind == "printSheet")
        {
            const File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("html") : result;
            const auto e = eng.writeProjectSheet (f);
            if (e.isEmpty()) safe->printDocument (f);
            safe->publishState();
            return;
        }

        if (kind == "openProject")
        {
            if (! result.existsAsFile()) return;
            if (result.hasFileExtension (".alpha")) eng.loadProject (result);
            else eng.loadProjectJson (result.withFileExtension ("alphaproj"));
            eng.addRecentReal (result);
        }
        else if (kind == "saveProject" || kind == "saveAs" || kind == "saveNewVersion")
        {
            File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("alphaproj") : result;
            if (f.hasFileExtension (".alpha")) eng.saveProject (f);
            else eng.saveProjectJson (f);
            eng.addRecentReal (f);
        }
        else if (kind == "saveTemplate")
        {
            eng.saveTemplate (result.getFileNameWithoutExtension());
        }
        else if (kind == "loadTemplateFile")
        {
            if (! result.existsAsFile()) return;
            eng.loadTemplateFile (result.withFileExtension ("alphaproj"));
        }
        else if (kind == "exportMidi")
        {
            const File f = result.getFileExtension().isEmpty() ? result.withFileExtension ("mid") : result;
            const auto bytes = alpha::base64Decode (eng.exportMidiData (trackIndex).toStdString());
            FileOutputStream os (f);
            if (! os.openedOk() || ! os.write (bytes.data(), bytes.size()))
                eng.setNativeStatus (TR ("Export MIDI impossible."));
            else eng.setNativeStatus (TR ("Fichier MIDI exporté : ") + f.getFullPathName());
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
                if (file.hasFileExtension (".xml"))
                {
                    String error;
                    if (! eng.importFcpXml (file, error)) eng.setNativeStatus (error);
                    continue;
                }
                if (file.hasFileExtension (".omf") || file.hasFileExtension (".aaf"))
                {
                    const auto e = eng.importOmfOrAaf (file, trackIndex, startBars);
                    if (e.isNotEmpty()) eng.setNativeStatus (e);
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

//==============================================================================
// AUDIT v6 — fenêtres natives réelles appelées par les commandes d'interface.
//==============================================================================
namespace
{
    // Navigateur de greffons : liste réellement alimentée par l'analyse des
    // modules VST3 présents sur le disque, insertion réelle dans le graphe.
    class AlphaPluginBrowser final : public Component, private ListBoxModel, private Button::Listener, private Timer
    {
    public:
        AlphaPluginBrowser (std::shared_ptr<AlphaEngine> engineRef,
                            std::function<void()> publish,
                            std::function<void()> chooseFolder,
                            int trackIndex)
            : engine (std::move (engineRef)), onPublish (std::move (publish)),
              onChooseFolder (std::move (chooseFolder)), targetTrack (trackIndex),
              scanButton (TR ("Analyser les greffons")),
              folderButton (TR ("Ajouter un dossier…")),
              insertButton (TR ("Insérer sur la piste " ) + String (trackIndex + 1)),
              editorButton (TR ("Ouvrir l'éditeur")),
              closeButton (TR ("Fermer"))
        {
            addAndMakeVisible (list);
            list.setModel (this);
            list.setRowHeight (22);
            list.setMultipleSelectionEnabled (false);
            for (auto* b : { &scanButton, &folderButton, &insertButton, &editorButton, &closeButton })
            {
                addAndMakeVisible (b);
                b->addListener (this);
            }
            addAndMakeVisible (info);
            info.setMultiLine (true);
            info.setReadOnly (true);
            info.setCaretVisible (false);
            refresh();
        }

        void resized() override
        {
            auto area = getLocalBounds().reduced (8);
            auto top = area.removeFromTop (28);
            scanButton.setBounds (top.removeFromLeft (180).reduced (2));
            folderButton.setBounds (top.removeFromLeft (170).reduced (2));
            top.removeFromLeft (8);
            closeButton.setBounds (top.removeFromRight (90).reduced (2));
            editorButton.setBounds (top.removeFromRight (140).reduced (2));
            insertButton.setBounds (top.removeFromRight (210).reduced (2));
            area.removeFromTop (6);
            info.setBounds (area.removeFromBottom (58));
            area.removeFromBottom (6);
            list.setBounds (area);
        }

        int getNumRows() override { return descriptions.size(); }

        void paintListBoxItem (int row, Graphics& g, int width, int height, bool selected) override
        {
            if (row < 0 || row >= descriptions.size()) return;
            if (selected) g.fillAll (Colour (0xff3a5f82));
            g.setColour (selected ? Colours::white : Colours::lightgrey);
            const auto& d = descriptions[(size_t) row];
            g.setFont ((float) height * 0.55f);
            g.drawText (d.name + "   [" + d.pluginFormatName + "]   " + d.manufacturerName,
                        8, 0, width - 16, height, Justification::centredLeft);
        }

        void selectedRowsChanged (int) override { updateInfo(); }

        void buttonClicked (Button* b) override
        {
            if (b == &closeButton) { if (auto* w = findParentComponentOfClass<DocumentWindow>()) w->closeButtonPressed(); return; }
            if (b == &scanButton)
            {
                engine->startPluginScan (false);
                info.setText (TR ("Analyse en cours sur les dossiers VST3…"));
                Timer::startTimer (400);
                return;
            }
            if (b == &folderButton)
            {
                if (onChooseFolder) onChooseFolder();
                return;
            }
            const int row = list.getSelectedRow();
            if (row < 0 || row >= descriptions.size())
            { info.setText (TR ("Sélectionnez d'abord un greffon dans la liste.")); return; }
            const auto& d = descriptions[(size_t) row];
            if (b == &insertButton)
            {
                const auto err = engine->addInsertReal (targetTrack, String (d.uniqueId).toStdString(), -1, MemoryBlock());
                info.setText (err.isNotEmpty() ? err : TR ("Insert « ") + d.name + TR (" » ajouté à la piste ") + String (targetTrack + 1) + TR ("."));
                if (onPublish) onPublish();
                return;
            }
            if (b == &editorButton)
            {
                const auto err = engine->addInsertReal (targetTrack, String (d.uniqueId).toStdString(), -1, MemoryBlock());
                if (err.isNotEmpty()) { info.setText (err); return; }
                const int track = jlimit (0, (int) engine->core.state.tracks.size() - 1, targetTrack);
                const int index = (int) engine->core.state.tracks[(size_t) track].inserts.size() - 1;
                engine->openPluginEditorReal (track, index);
                info.setText (engine->lastStatus);
                if (onPublish) onPublish();
            }
        }

        void timerCallback() override
        {
            if (! engine->isPluginScanRunning()) { Timer::stopTimer(); refresh(); }
            else info.setText (TR ("Analyse en cours : ") + String (engine->pluginScanProgressDone()) + TR (" / ")
                               + String (engine->pluginScanProgressTotal()) + TR ("  —  ") + engine->pluginScanProgressCurrent());
        }

    private:
        void refresh()
        {
            descriptions = engine->knownPlugins.getTypes();
            list.updateContent();
            list.repaint();
            updateInfo();
        }
        void updateInfo()
        {
            const int row = list.getSelectedRow();
            String text = TR ("Greffons analysés : ") + String (descriptions.size());
            if (row >= 0 && row < descriptions.size())
            {
                const auto& d = descriptions[(size_t) row];
                text += String ("\n") + TR ("Sélection : ") + d.name + " — " + d.manufacturerName
                      + "\n" + TR ("Format : ") + d.pluginFormatName + "  ·  UID : " + String (d.uniqueId)
                      + "  ·  Entrées : " + String (d.numInputChannels) + "  ·  Sorties : " + String (d.numOutputChannels)
                      + "\n" + TR ("Module : ") + d.fileOrIdentifier;
            }
            info.setText (text);
        }

        std::shared_ptr<AlphaEngine> engine;
        std::function<void()> onPublish, onChooseFolder;
        int targetTrack = 0;
        Array<PluginDescription> descriptions;
        ListBox list;
        TextEditor info;
        TextButton scanButton, folderButton, insertButton, editorButton, closeButton;
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AlphaPluginBrowser)
    };

    //==========================================================================
    // Bibliothèque de projets : liste réellement construite à partir des
    // fichiers .alphaproj présents sur le disque, ouverture réelle du projet.
    //==========================================================================
    class AlphaProjectLibrary final : public Component, private ListBoxModel, private Button::Listener
    {
    public:
        AlphaProjectLibrary (std::shared_ptr<AlphaEngine> engineRef,
                             std::function<void()> publish)
            : engine (std::move (engineRef)), onPublish (std::move (publish)),
              openButton (TR ("Ouvrir le projet")),
              revealButton (TR ("Ouvrir le dossier")),
              refreshButton (TR ("Actualiser")),
              closeButton (TR ("Fermer"))
        {
            addAndMakeVisible (list);
            list.setModel (this);
            list.setRowHeight (24);
            for (auto* b : { &openButton, &revealButton, &refreshButton, &closeButton })
            {
                addAndMakeVisible (b);
                b->addListener (this);
            }
            addAndMakeVisible (info);
            info.setMultiLine (true);
            info.setReadOnly (true);
            info.setCaretVisible (false);
            refresh();
        }

        void resized() override
        {
            auto area = getLocalBounds().reduced (8);
            auto top = area.removeFromTop (28);
            openButton.setBounds (top.removeFromLeft (170).reduced (2));
            revealButton.setBounds (top.removeFromLeft (150).reduced (2));
            refreshButton.setBounds (top.removeFromLeft (110).reduced (2));
            closeButton.setBounds (top.removeFromRight (90).reduced (2));
            area.removeFromTop (6);
            info.setBounds (area.removeFromBottom (52));
            area.removeFromBottom (6);
            list.setBounds (area);
        }

        int getNumRows() override { return projects.size(); }

        void paintListBoxItem (int row, Graphics& g, int width, int height, bool selected) override
        {
            if (row < 0 || row >= projects.size()) return;
            if (selected) g.fillAll (Colour (0xff3a5f82));
            g.setColour (selected ? Colours::white : Colours::lightgrey);
            g.setFont ((float) height * 0.5f);
            const auto& f = projects[(size_t) row];
            g.drawText (f.getFileName() + "   —   " + f.getParentDirectory().getFullPathName()
                        + "   —   " + f.getLastModificationTime().formatted ("%d/%m/%Y %H:%M"),
                        8, 0, width - 16, height, Justification::centredLeft);
        }

        void selectedRowsChanged (int) override
        {
            const int row = list.getSelectedRow();
            info.setText (row >= 0 && row < projects.size()
                          ? TR ("Projet : ") + projects[(size_t) row].getFullPathName()
                            + "\n" + TR ("Taille : ") + String (projects[(size_t) row].getSize() / 1024) + TR (" Ko")
                            + TR ("  ·  Modifié le ") + projects[(size_t) row].getLastModificationTime().formatted ("%d/%m/%Y à %H:%M")
                          : TR ("Aucun projet sélectionné."));
        }

        void buttonClicked (Button* b) override
        {
            if (b == &closeButton) { if (auto* w = findParentComponentOfClass<DocumentWindow>()) w->closeButtonPressed(); return; }
            if (b == &refreshButton) { refresh(); return; }
            const int row = list.getSelectedRow();
            if (row < 0 || row >= projects.size()) { info.setText (TR ("Sélectionnez d'abord un projet.")); return; }
            const File f = projects[(size_t) row];
            if (b == &openButton)
            {
                if (! engine->loadProjectJson (f)) info.setText (TR ("Projet illisible : ") + f.getFileName());
                else
                {
                    engine->addRecentReal (f);
                    info.setText (TR ("Projet ouvert : ") + f.getFileName());
                }
                if (onPublish) onPublish();
                return;
            }
            if (b == &revealButton) f.getParentDirectory().startAsProcess();
        }

    private:
        void refresh()
        {
            projects.clear();
            Array<File> roots;
            roots.add (engine->applicationDataDir());
            roots.add (engine->templatesDir());
            roots.add (File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("ALPHA Studio"));
            roots.add (File::getSpecialLocation (File::userDocumentsDirectory));
            roots.add (File::getSpecialLocation (File::userDesktopDirectory));
            for (const auto& recent : engine->core.state.recents)
                roots.add (File (alphaString (recent.path)).getParentDirectory());
            for (const auto& root : roots)
            {
                if (! root.isDirectory()) continue;
                Array<File> found;
                root.findChildFiles (found, File::findFiles, true, "*.alphaproj");
                for (const auto& f : found)
                {
                    bool duplicate = false;
                    for (const auto& existing : projects) if (existing == f) duplicate = true;
                    if (! duplicate) projects.add (f);
                }
            }
            projects.sort();
            list.updateContent();
            list.repaint();
            info.setText (TR ("Bibliothèque : ") + String (projects.size())
                          + TR (" projet(s) ALPHA réellement présents sur ce poste."));
        }

        std::shared_ptr<AlphaEngine> engine;
        std::function<void()> onPublish;
        Array<File> projects;
        ListBox list;
        TextEditor info;
        TextButton openButton, revealButton, refreshButton, closeButton;
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AlphaProjectLibrary)
    };
}

//==============================================================================
// AUDIT v6 — exports lourds réels (paquet OMF, image CD) sur thread dédié.
//==============================================================================
void AlphaWebMainComponent::runHeavyExchange (const String& kind, const File& target)
{
    if (target == File()) return;
    if (exporting.exchange (true))
    {
        engine.setNativeStatus (TR ("Un export est déjà en cours."));
        publishState();
        return;
    }
    exportDone->reset();
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    auto aliveFlag = alive;
    auto done = exportDone;
    auto engineRef = engineOwner;

    const bool launched = Thread::launch ([safe, aliveFlag, done, kind, target, engineRef]()
    {
        AlphaExportDoneSignal completion { done };
        if (! aliveFlag->load()) return;
        String report;
        bool ok = false;
        if (kind == "exportOmf") ok = engineRef->exportOmfPackage (target, report);
        else if (kind == "exportCd") ok = engineRef->exportCdImage (target, report);
        else report = TR ("Commande d'échange inconnue : ") + kind;
        MessageManager::callAsync ([safe, ok, report]()
        {
            if (safe == nullptr) return;
            safe->exporting.store (false);
            safe->engine.setNativeStatus (report);
            if (! ok && report.isNotEmpty())
                AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", report);
            safe->publishState();
        });
    });
    if (! launched) { exporting.store (false); done->signal(); }
}

//==============================================================================
// AUDIT v6 — impression réelle : WebView2 affiche la fiche de projet générée
// puis déclenche le dialogue d'impression Windows (Projet ▸ Imprimer).
//==============================================================================
void AlphaWebMainComponent::printDocument (const File& document)
{
    if (! document.existsAsFile())
    {
        engine.setNativeStatus (TR ("Document à imprimer introuvable."));
        return;
    }
    auto options = WebBrowserComponent::Options{}.withNativeIntegrationEnabled();
   #if JUCE_WEB_BROWSER && JUCE_USE_WIN_WEBVIEW2
    options = options.withBackend (WebBrowserComponent::Options::Backend::webview2)
                     .withWinWebView2Options (WebBrowserComponent::Options::WinWebView2{}
                         .withUserDataFolder (engine.applicationDataDir().getChildFile ("WebView2-print"))
                         .withStatusBarDisabled()
                         .withBackgroundColour (Colour (0xffffffff)));
   #endif
    std::unique_ptr<Browser> view (new Browser (options));
    Component::SafePointer<Browser> viewSafe (view.get());
    view->onPageReady = [viewSafe]()
    {
        if (viewSafe == nullptr) return;
        viewSafe->evaluateJavascript ("window.print()");   // dialogue d'impression réel
    };
    view->goToURL (URL (document).toString (false));

    std::unique_ptr<DocumentWindow> win (new DocumentWindow (TR ("Impression — ") + document.getFileName(),
                                                             Colour (0xff2b2b2b),
                                                             DocumentWindow::closeButton));
    win->setContentOwned (view.release(), true);
    win->setUsingNativeTitleBar (true);
    win->centreWithSize (960, 720);
    win->setVisible (true);
    win->toFront (true);
    nativeWindows.push_back (std::move (win));
    engine.setNativeStatus (TR ("Aperçu avant impression ouvert : ") + document.getFullPathName());
}

//==============================================================================
// AUDIT v6 — navigateur de greffons et bibliothèque de projets natifs.
//==============================================================================
void AlphaWebMainComponent::showPluginBrowser (const var& payload)
{
    int trackIndex = (int) payload.getProperty (Identifier ("trackIndex"), var ((int) engine.core.state.selectedTrack));
    if (trackIndex < 0 || trackIndex >= (int) engine.tracks.size()) trackIndex = jmax (0, (int) engine.tracks.size() - 1);

    Component::SafePointer<AlphaWebMainComponent> safe (this);
    auto* browserComponent = new AlphaPluginBrowser (engineOwner,
                                                     [safe]() { if (safe != nullptr) safe->publishState(); },
                                                     [safe]() { if (safe != nullptr) safe->choosePluginFolder(); },
                                                     trackIndex);
    browserComponent->setSize (820, 560);
    std::unique_ptr<DocumentWindow> win (new DocumentWindow (TR ("Greffons — piste ") + String (trackIndex + 1),
                                                             Colour (0xff1f2022),
                                                             DocumentWindow::closeButton | DocumentWindow::minimiseButton));
    win->setContentOwned (browserComponent, true);
    win->setUsingNativeTitleBar (true);
    win->setResizable (true, false);
    win->centreWithSize (820, 560);
    win->setVisible (true);
    win->toFront (true);
    nativeWindows.push_back (std::move (win));
    if (engine.knownPlugins.getTypes().isEmpty()) engine.startPluginScan (false);
    engine.setNativeStatus (TR ("Navigateur de greffons ouvert : ") + String ((int) engine.knownPlugins.getTypes().size())
                            + TR (" module(s) déjà analysé(s)."));
}

void AlphaWebMainComponent::showProjectLibrary()
{
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    auto* library = new AlphaProjectLibrary (engineOwner,
                                             [safe]() { if (safe != nullptr) safe->publishState(); });
    library->setSize (880, 560);
    std::unique_ptr<DocumentWindow> win (new DocumentWindow (TR ("Bibliothèque de projets"),
                                                             Colour (0xff1f2022),
                                                             DocumentWindow::closeButton | DocumentWindow::minimiseButton));
    win->setContentOwned (library, true);
    win->setUsingNativeTitleBar (true);
    win->setResizable (true, false);
    win->centreWithSize (880, 560);
    win->setVisible (true);
    win->toFront (true);
    nativeWindows.push_back (std::move (win));
    engine.setNativeStatus (TR ("Bibliothèque de projets ouverte."));
}

void AlphaWebMainComponent::choosePluginFolder()
{
    folderChooser = std::make_unique<FileChooser> (TR ("Choisir un dossier de greffons VST3"),
                                                   File::getSpecialLocation (File::currentApplicationFile).getParentDirectory());
    Component::SafePointer<AlphaWebMainComponent> safe (this);
    folderChooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectDirectories,
        [safe] (const FileChooser& fc)
        {
            if (safe == nullptr) return;
            const File dir = fc.getResult();
            if (dir == File()) return;
            alpha::JsonValue p (alpha::JsonValue::Type::Object);
            p["path"] = alpha::JsonValue (dir.getFullPathName().toStdString());
            const auto err = safe->engine.command ("addPluginFolder", alphaString (p.dump()));
            if (err.isNotEmpty()) AlertWindow::showMessageBoxAsync (MessageBoxIconType::WarningIcon, "ALPHA Studio", err);
            safe->publishState();
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
