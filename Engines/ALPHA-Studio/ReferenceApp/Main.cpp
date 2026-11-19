// ALPHA Studio - application principale (usage personnel).
#include "UI.h"

//==============================================================================
struct AlphaLook : LookAndFeel_V4
{
    AlphaLook()
    {
        setColourScheme (LookAndFeel_V4::ColourScheme (0xff2b2e33, 0xff3c4046, 0xff33363b, 0xff1c1e22,
                                                       0xffd6d9de, 0xff4a4f57, 0xffffffff, 0xff3b86d6, 0xffe6e9ec));
        setColour (TextButton::buttonColourId, Colour (0xff4a4f57));
        setColour (TextButton::buttonOnColourId, Colour (0xff3b86d6));
        setColour (TextButton::textColourOffId, Colour (0xffe4e7ea));
        setColour (TextButton::textColourOnId, Colours::white);
        setColour (Slider::backgroundColourId, Colour (0xff1c1e22));
        setColour (Slider::trackColourId, Colour (0xff3b86d6));
        setColour (ComboBox::backgroundColourId, Colour (0xff4a4f57));
        setColour (ScrollBar::thumbColourId, Colour (0xff6a707a));
        setColour (Label::textColourId, Colour (0xffd6d9de));
    }
};

//==============================================================================
class IconButton : public Button
{
public:
    enum Icon { Home, Back, Fwd, Stop, Play, Rec, Loop };
    IconButton (Icon i) : Button ({}), icon (i) { setMouseClickGrabsKeyboardFocus (false); }
    Colour onColour { 0xff3b86d6 };

    void paintButton (Graphics& g, bool over, bool down) override
    {
        auto r = getLocalBounds().toFloat().reduced (1.0f);
        const bool on = getToggleState();
        auto top = on ? onColour.brighter (0.2f) : Colour (0xff5a5f67);
        auto bot = on ? onColour.darker (0.4f) : Colour (0xff3d4147);
        if (down) std::swap (top, bot);
        if (over && ! on) { top = top.brighter (0.1f); bot = bot.brighter (0.1f); }
        g.setGradientFill (ColourGradient (top, 0, r.getY(), bot, 0, r.getBottom(), false));
        g.fillRoundedRectangle (r, 3.0f);
        g.setColour (Colour (0xff1a1c20));
        g.drawRoundedRectangle (r, 3.0f, 1.0f);
        const float cx = r.getCentreX(), cy = r.getCentreY(), s = jmin (r.getWidth(), r.getHeight()) * 0.26f;
        g.setColour (icon == Rec ? Colour (0xffff5a4c) : Colours::white.withAlpha (0.93f));
        auto tri = [&] (float x1, float y1, float x2, float y2, float x3, float y3)
        { Path p; p.addTriangle (x1, y1, x2, y2, x3, y3); g.fillPath (p); };
        switch (icon)
        {
            case Play: tri (cx - s * 0.7f, cy - s, cx - s * 0.7f, cy + s, cx + s, cy); break;
            case Stop: g.fillRect (cx - s, cy - s, 2 * s, 2 * s); break;
            case Rec:  g.fillEllipse (cx - s, cy - s, 2 * s, 2 * s); break;
            case Home: g.fillRect (cx - s, cy - s, s * 0.3f, 2 * s); tri (cx + s, cy - s, cx + s, cy + s, cx - s * 0.5f, cy); break;
            case Back: tri (cx, cy - s, cx, cy + s, cx - s, cy); tri (cx + s, cy - s, cx + s, cy + s, cx, cy); break;
            case Fwd:  tri (cx, cy - s, cx, cy + s, cx + s, cy); tri (cx - s, cy - s, cx - s, cy + s, cx, cy); break;
            case Loop:
            {
                Path p;
                p.addCentredArc (cx, cy, s, s, 0.0f, 0.7f, MathConstants<float>::twoPi - 0.3f, true);
                g.strokePath (p, PathStrokeType (2.0f));
                tri (cx + s * 0.1f, cy - s * 1.0f - 3.0f, cx + s * 0.1f, cy - s * 1.0f + 5.0f, cx + s * 0.8f, cy - s * 1.0f + 1.0f);
                break;
            }
        }
    }
private:
    Icon icon;
};

//==============================================================================
class PluginWindow : public DocumentWindow
{
public:
    PluginWindow (AudioProcessorGraph::Node::Ptr n, std::function<void()> onClose)
        : DocumentWindow (n->getProcessor()->getName(), Colours::darkgrey, DocumentWindow::closeButton),
          closeFn (std::move (onClose)), node (n)
    {
        auto* p = n->getProcessor();
        if (p->hasEditor()) setContentOwned (p->createEditorIfNeeded(), true);
        else                setContentOwned (new GenericAudioProcessorEditor (*p), true);
        setUsingNativeTitleBar (true);
        setResizable (false, false);
        centreWithSize (getWidth(), getHeight());
        setVisible (true);
    }
    void closeButtonPressed() override { closeFn(); }
private:
    std::function<void()> closeFn;
    AudioProcessorGraph::Node::Ptr node;
};

class ScanJob : public ThreadWithProgressWindow
{
public:
    ScanJob (AlphaEngine& e) : ThreadWithProgressWindow (TR ("Analyse des plugins VST3…"), true, true), engine (e) {}
    void run() override
    {
        VST3PluginFormat fmt;
        PluginDirectoryScanner scanner (engine.knownPlugins, fmt, fmt.getDefaultLocationsToSearch(), true,
                                        engine.appDataDir().getChildFile ("scan-crash.txt"));
        String name;
        while (scanner.scanNextFile (true, name))
        {
            setStatusMessage (TR ("Analyse : ") + name);
            setProgress (scanner.getProgress());
            if (threadShouldExit()) break;
        }
    }
private:
    AlphaEngine& engine;
};

class ExportJob : public ThreadWithProgressWindow
{
public:
    ExportJob (AlphaEngine& e, File f) : ThreadWithProgressWindow (TR ("Rendu du mixage…"), true, true), engine (e), file (f) {}
    void run() override
    {
        ok = engine.renderOffline (file, [this] (double p) { setProgress (p); return ! threadShouldExit(); });
    }
    bool ok = false;
private:
    AlphaEngine& engine; File file;
};

//==============================================================================
// Panneau d'information a gauche (inspecteur).
class InfoPanel : public Component
{
public:
    InfoPanel (UICtx& c, std::function<AlphaEngine::Track*()> gt, std::function<int()> gc) : ctx (c), getTrack (gt), getClip (gc) {}

    static String fmtBars (AlphaEngine& e, int64 s)
    {
        const double beat = (double) s / (e.sr() * 60.0 / e.transport.bpm.load());
        return String::formatted ("%03d.%d", (int) (beat / 4) + 1, (int) std::fmod (beat, 4.0) + 1);
    }
    static String fmtTime (AlphaEngine& e, int64 s)
    {
        const double sec = (double) s / e.sr();
        return String::formatted ("%02d:%05.2f", (int) (sec / 60), std::fmod (sec, 60.0));
    }

    void paint (Graphics& g) override
    {
        auto& e = *ctx.engine;
        g.fillAll (Colour (0xff33363b));
        auto r = getLocalBounds().reduced (6);
        auto section = [&] (const String& title, const std::vector<std::pair<String, String>>& rows)
        {
            auto box = r.removeFromTop (22 + 18 * (int) rows.size() + 6);
            g.setColour (Colour (0xff3c4046)); g.fillRect (box);
            g.setColour (Colour (0xff1f2125)); g.drawRect (box);
            auto head = box.removeFromTop (20);
            g.setGradientFill (ColourGradient (Colour (0xff52565e), 0, (float) head.getY(), Colour (0xff3f434a), 0, (float) head.getBottom(), false));
            g.fillRect (head);
            g.setColour (Colour (0xffe6e9ec)); g.setFont (Font (FontOptions (12.0f, Font::bold)));
            g.drawText (title, head.reduced (6, 0), Justification::centredLeft);
            box.removeFromTop (2);
            g.setFont (12.0f);
            for (auto& row : rows)
            {
                auto line = box.removeFromTop (18).reduced (6, 0);
                g.setColour (Colour (0xffb6bbc2)); g.drawText (row.first, line, Justification::centredLeft);
                g.setColour (Colour (0xffe6e9ec)); g.drawText (row.second, line, Justification::centredRight);
            }
            r.removeFromTop (6);
        };

        auto* t = getTrack();
        if (t != nullptr && e.owns (t))
            section (TR ("Inspecteur : ") + t->name,
                     { { "Volume", String (t->volDb, 1) + " dB" },
                       { "Pan", std::abs (t->pan) < 0.02f ? String ("C") : (t->pan < 0 ? "G " : "D ") + String (juce::roundToInt (std::abs (t->pan) * 100)) },
                       { "Inserts", String ((int) t->inserts.size()) + " / 6" },
                       { "REC", t->arm ? TR ("Armée") : TR ("Désarmée") },
                       { "État", e.isRecording() ? TR ("Enregistrement") : TR ("Prêt") },
                       { "Clips", String ((int) t->source->clips.size()) } });
        else
            section ("Inspecteur", { { TR ("Aucune piste sélectionnée"), "" } });

        const int ci = getClip();
        if (t != nullptr && e.owns (t) && ci >= 0 && ci < (int) t->source->clips.size())
        {
            auto& c = t->source->clips[(size_t) ci];
            section ("Clip : " + c.name.substring (0, 18),
                     { { TR ("Début"), fmtBars (e, c.start) },
                       { TR ("Durée"), fmtTime (e, c.len) } });
        }
        section ("Locateurs",
                 { { "Gauche", fmtBars (e, e.transport.loopStart.load()) },
                   { "Droit", fmtBars (e, e.transport.loopEnd.load()) } });
        section ("Projet",
                 { { "Tempo", String (e.transport.bpm.load(), 1) + " BPM" },
                   { TR ("Fréquence"), String (juce::roundToInt (e.sr())) + " Hz" },
                   { "Pistes", String ((int) e.tracks.size()) } });
    }
private:
    UICtx& ctx;
    std::function<AlphaEngine::Track*()> getTrack;
    std::function<int()> getClip;
};

//==============================================================================
// Tranche de mixeur (piste ou master si t == nullptr).
class MixStrip : public Component
{
public:
    MixStrip (UICtx& c, AlphaEngine::Track* t) : ctx (c), track (t)
    {
        addAndMakeVisible (name);
        name.setText (t ? t->name : String ("Master"), dontSendNotification);
        name.setJustificationType (Justification::centred);
        name.setFont (Font (FontOptions (13.0f, Font::bold)));

        addAndMakeVisible (fader);
        fader.setSliderStyle (Slider::LinearVertical);
        fader.setTextBoxStyle (Slider::TextBoxBelow, false, 64, 18);
        fader.setRange (-60.0, 6.0, 0.1);
        fader.setTextValueSuffix (" dB");
        fader.setDoubleClickReturnValue (true, t ? -6.0 : 0.0);
        fader.setValue (t ? (double) t->volDb : (double) c.engine->masterDb, dontSendNotification);
        fader.onValueChange = [this]
        {
            if (track) track->volDb = (float) fader.getValue(); else ctx.engine->masterDb = (float) fader.getValue();
            ctx.engine->refreshMix();
        };
        if (t == nullptr) return;

        addAndMakeVisible (pan);
        pan.setSliderStyle (Slider::LinearHorizontal);
        pan.setTextBoxStyle (Slider::NoTextBox, false, 0, 0);
        pan.setRange (-1.0, 1.0, 0.01);
        pan.setValue (t->pan, dontSendNotification);
        pan.setDoubleClickReturnValue (true, 0.0);
        pan.onValueChange = [this] { track->pan = (float) pan.getValue(); ctx.engine->refreshMix(); };

        mute.setButtonText ("M"); solo.setButtonText ("S"); arm.setButtonText ("R");
        mute.setColour (TextButton::buttonOnColourId, Colour (0xfff5c24a));
        solo.setColour (TextButton::buttonOnColourId, Colour (0xff4cc968));
        arm.setColour (TextButton::buttonOnColourId, Colour (0xffd63a2f));
        for (auto* b : { &mute, &solo, &arm }) { addAndMakeVisible (b); b->setClickingTogglesState (true); b->setMouseClickGrabsKeyboardFocus (false); }
        mute.onClick = [this] { track->mute = mute.getToggleState(); ctx.engine->refreshMix(); };
        solo.onClick = [this] { track->solo = solo.getToggleState(); ctx.engine->refreshMix(); };
        arm.onClick  = [this] { track->arm = arm.getToggleState(); };

        for (size_t i = 0; i < t->inserts.size() && i < 6; ++i)
        {
            auto* b = inserts.add (new TextButton (t->inserts[i].name));
            addAndMakeVisible (b);
            b->setColour (TextButton::buttonColourId, Colour (0xff2f7fd1));
            b->setColour (TextButton::textColourOffId, Colours::white);
            b->setMouseClickGrabsKeyboardFocus (false);
            auto node = t->inserts[i].node;
            b->onClick = [this, node] { ctx.openEditor (node); };
        }
        sync();
    }

    void sync()
    {
        if (track == nullptr)
        {
            if (! fader.isMouseButtonDown()) fader.setValue (ctx.engine->masterDb, dontSendNotification);
            repaint(); return;
        }
        if (! fader.isMouseButtonDown()) fader.setValue (track->volDb, dontSendNotification);
        if (! pan.isMouseButtonDown()) pan.setValue (track->pan, dontSendNotification);
        mute.setToggleState (track->mute, dontSendNotification);
        solo.setToggleState (track->solo, dontSendNotification);
        arm.setToggleState (track->arm, dontSendNotification);
        if (name.getText() != track->name) name.setText (track->name, dontSendNotification);
        repaint();
    }

    void paint (Graphics& g) override
    {
        g.setGradientFill (ColourGradient (Colour (track ? 0xff3f4349 : 0xff4a463c), 0, 0, Colour (track ? 0xff33363b : 0xff3a372f), 0, (float) getHeight(), false));
        g.fillAll();
        g.setColour (Colour (0xff1d1f23)); g.drawRect (getLocalBounds());
        if (track) { g.setColour (track->colour); g.fillRect (0, 0, getWidth(), 4); }
        auto* fp = track ? track->fader : ctx.engine->master;
        const float lv[2] = { fp->levelL.load(), fp->levelR.load() };
        for (int c = 0; c < 2; ++c)
        {
            const float db = Decibels::gainToDecibels (lv[c], -60.0f);
            const float f = jlimit (0.0f, 1.0f, (db + 60.0f) / 66.0f);
            auto m = meter.withWidth (meter.getWidth() / 2 - 1).translated (c * (meter.getWidth() / 2 + 1), 0);
            g.setColour (Colour (0xff10141a)); g.fillRect (m);
            g.setColour (db > 0 ? Colours::red : db > -9 ? Colours::yellow : Colour (0xff2fd05b));
            g.fillRect (m.getX(), m.getY() + (int) ((1.0f - f) * (float) m.getHeight()), m.getWidth(), (int) (f * (float) m.getHeight()));
        }
    }
    void resized() override
    {
        auto r = getLocalBounds().reduced (4);
        r.removeFromTop (4);
        name.setBounds (r.removeFromTop (22));
        if (track)
        {
            auto ins = r.removeFromTop (6 * 20);
            for (auto* b : inserts) b->setBounds (ins.removeFromTop (19));
            pan.setBounds (r.removeFromTop (22));
            auto b = r.removeFromTop (24);
            const int w = b.getWidth() / 3;
            mute.setBounds (b.removeFromLeft (w).reduced (1)); solo.setBounds (b.removeFromLeft (w).reduced (1)); arm.setBounds (b.reduced (1));
            r.removeFromTop (4);
        }
        meter = r.removeFromRight (16).withTrimmedBottom (22).withTrimmedTop (6);
        fader.setBounds (r);
    }
private:
    UICtx& ctx;
    AlphaEngine::Track* track;
    Label name;
    Slider fader, pan;
    TextButton mute, solo, arm;
    OwnedArray<TextButton> inserts;
    Rectangle<int> meter;
};

class MixerComponent : public Component
{
public:
    MixerComponent (UICtx& c) : ctx (c)
    {
        addAndMakeVisible (vp);
        vp.setViewedComponent (&holder, false);
        vp.setScrollBarsShown (false, true);
        addAndMakeVisible (master);
        rebuild();
    }
    void rebuild()
    {
        strips.clear();
        for (auto& t : ctx.engine->tracks) { auto* s = strips.add (new MixStrip (ctx, t.get())); holder.addAndMakeVisible (s); }
        resized();
    }
    void refresh() { for (auto* s : strips) s->sync(); master.sync(); }
    void paint (Graphics& g) override { g.fillAll (Colour (0xff2b2e33)); }
    void resized() override
    {
        auto r = getLocalBounds();
        master.setBounds (r.removeFromRight (104));
        vp.setBounds (r);
        const int h = vp.getMaximumVisibleHeight();
        holder.setSize (jmax (r.getWidth(), (int) strips.size() * 92), h);
        for (int i = 0; i < strips.size(); ++i) strips[i]->setBounds (i * 92, 0, 92, h);
    }
private:
    UICtx& ctx;
    Viewport vp;
    Component holder;
    OwnedArray<MixStrip> strips;
    MixStrip master { ctx, nullptr };
};

class MixerWindow : public DocumentWindow
{
public:
    MixerWindow (UICtx& c, std::function<void()> onClose)
        : DocumentWindow ("Mixeur", Colour (0xff2b2e33), DocumentWindow::closeButton | DocumentWindow::minimiseButton), closeFn (std::move (onClose))
    {
        mixer = new MixerComponent (c);
        setContentOwned (mixer, false);
        setUsingNativeTitleBar (true);
        setResizable (true, false);
        setResizeLimits (420, 380, 4000, 900);
        centreWithSize (jlimit (520, 1180, ((int) c.engine->tracks.size() + 1) * 92 + 20), 460);
        setVisible (true);
    }
    void closeButtonPressed() override { closeFn(); }
    MixerComponent* mixer = nullptr;
private:
    std::function<void()> closeFn;
};

//==============================================================================
class MainComponent : public Component, public MenuBarModel, private Timer, private ScrollBar::Listener
{
public:
    MainComponent (bool shotMode = false)
    {
        ctx.engine = &engine;
        ctx.view = &view;
        ctx.openEditor = [this] (AudioProcessorGraph::Node::Ptr n) { openEditor (n); };
        ctx.selectTrack = [this] (AlphaEngine::Track* t) { selTrack = t; panel.selClip = -1; repaintAll(); };
        ctx.isSelected = [this] (AlphaEngine::Track* t) { return t == selTrack; };
        ctx.toast = [this] (const String& m) { showMessage (m); };
        Component::SafePointer<MainComponent> safeThis (this);
        engine.onChanged = [safeThis]
        {
            MessageManager::callAsync ([safeThis]
            {
                if (safeThis == nullptr) return;
                safeThis->panel.refreshSlots();
                if (safeThis->mixerWindow) safeThis->mixerWindow->mixer->rebuild();
            });
        };
        engine.onInsertRemoved = [this] (AudioProcessorGraph::NodeID id) { windows.erase (id.uid); };

        addAndMakeVisible (menuBar);
        addAndMakeVisible (info);
        addAndMakeVisible (ruler);
        addAndMakeVisible (viewport);
        viewport.setViewedComponent (&panel, false);
        viewport.setScrollBarsShown (true, false);
        panel.onViewChanged = [this] { zoomSlider.setValue (view.pps, dontSendNotification); updateScroll(); repaintAll(); };
        addAndMakeVisible (hbar);
        hbar.addListener (this);
        hbar.setAutoHide (false);

        auto mk = [this] (TextButton& b, const String& text, std::function<void()> fn)
        {
            addAndMakeVisible (b); b.setButtonText (text); b.onClick = std::move (fn); b.setMouseClickGrabsKeyboardFocus (false);
        };
        // outils (groupe radio)
        mk (bObj,   "Objet",   [this] { view.tool = 0; });
        mk (bSplit, "Scinder", [this] { view.tool = 1; });
        mk (bErase, "Gomme",   [this] { view.tool = 2; });
        for (auto* b : { &bObj, &bSplit, &bErase }) { b->setClickingTogglesState (true); b->setRadioGroupId (101); }
        bObj.setToggleState (true, dontSendNotification);
        mk (bSnap, "Grille", [this] { view.snap = bSnap.getToggleState(); });
        bSnap.setClickingTogglesState (true); bSnap.setToggleState (true, dontSendNotification);
        addAndMakeVisible (gridBox);
        gridBox.addItem ("Mesure", 1); gridBox.addItem ("1/2", 2); gridBox.addItem ("1/4", 3); gridBox.addItem ("1/8", 4); gridBox.addItem ("1/16", 5);
        gridBox.setSelectedId (3, dontSendNotification);
        gridBox.onChange = [this] { static const int g[] = { 1, 2, 4, 8, 16 }; view.grid = g[jlimit (0, 4, gridBox.getSelectedId() - 1)]; };
        // fenetres / fichiers / pistes
        mk (bMixer, "Mixeur  F3",       [this] { toggleMixer(); });
        mk (bAudio, "Carte son  F4",    [this] { audioSettings(); });
        mk (bVst,   "Effets VST  F11",  [this] { scanPlugins(); });
        mk (bImp,   "Importer",         [this] { importAudio(); });
        mk (bExp,   "Exporter",         [this] { exportWav(); });
        mk (bAdd,   "+ Audio",          [this] { selTrack = engine.addTrack(); trackListChanged(); });
        mk (bDel,   "- Piste",          [this] { removeSelectedTrack(); });
        addAndMakeVisible (zoomSlider);
        zoomSlider.setSliderStyle (Slider::LinearHorizontal);
        zoomSlider.setTextBoxStyle (Slider::NoTextBox, false, 0, 0);
        zoomSlider.setRange (10.0, 400.0, 1.0);
        zoomSlider.setSkewFactorFromMidPoint (70.0);
        zoomSlider.setValue (view.pps, dontSendNotification);
        zoomSlider.onValueChange = [this] { view.pps = zoomSlider.getValue(); updateScroll(); repaintAll(); };

        // transport
        for (auto* b : { &tHome, &tBack, &tFwd, &tStop, &tPlay, &tRec, &tLoop }) addAndMakeVisible (b);
        tHome.onClick = [this] { engine.rewind(); };
        tBack.onClick = [this] { engine.seek (engine.transport.pos.load() - (int64) (beatSamples (engine) * 4)); };
        tFwd.onClick  = [this] { engine.seek (engine.transport.pos.load() + (int64) (beatSamples (engine) * 4)); };
        tStop.onClick = [this] { if (engine.isRecording()) finishRecording(); else engine.stopTransport(); };
        tPlay.onClick = [this] { if (! engine.isRecording()) { engine.transport.playing.load() ? engine.stopTransport() : engine.play(); } };
        tRec.onClick  = [this] { toggleRecord(); };
        tLoop.onClick = [this] { engine.transport.looping.store (! engine.transport.looping.load()); };
        tPlay.onColour = Colour (0xff2fa84f);
        tRec.onColour  = Colour (0xffd63a2f);
        mk (bClick, TR ("Métronome"), [this] { engine.transport.metronome.store (! engine.transport.metronome.load()); });

        for (auto* l : { &lcdMain, &lcdSub, &locL, &locR, &sigLabel })
        { addAndMakeVisible (l); l->setJustificationType (Justification::centred); l->setColour (Label::backgroundColourId, Colour (0xff0b1510)); l->setColour (Label::textColourId, Colour (0xff7dffa8)); }
        lcdMain.setFont (Font (FontOptions (Font::getDefaultMonospacedFontName(), 30.0f, Font::bold)));
        lcdSub.setFont (Font (FontOptions (Font::getDefaultMonospacedFontName(), 13.0f, Font::plain)));
        for (auto* l : { &locL, &locR, &sigLabel }) l->setFont (Font (FontOptions (Font::getDefaultMonospacedFontName(), 14.0f, Font::plain)));
        sigLabel.setText ("4/4", dontSendNotification);
        addAndMakeVisible (bpmSlider);
        bpmSlider.setSliderStyle (Slider::LinearBar);
        bpmSlider.setRange (40.0, 240.0, 0.1);
        bpmSlider.setValue (120.0, dontSendNotification);
        bpmSlider.setDoubleClickReturnValue (true, 120.0);
        bpmSlider.setColour (Slider::trackColourId, Colour (0xff1b3a2a));
        bpmSlider.setColour (Slider::textBoxTextColourId, Colour (0xff7dffa8));
        bpmSlider.setColour (Slider::backgroundColourId, Colour (0xff0b1510));
        bpmSlider.onValueChange = [this] { engine.transport.bpm.store (bpmSlider.getValue()); repaintAll(); };

        addAndMakeVisible (statusLabel); addAndMakeVisible (cpuLabel);
        statusLabel.setFont (11.0f); cpuLabel.setFont (11.0f);
        cpuLabel.setJustificationType (Justification::centredRight);
        statusLabel.setColour (Label::textColourId, Colour (0xff8f959d)); cpuLabel.setColour (Label::textColourId, Colour (0xff8f959d));

        setWantsKeyboardFocus (true);
        setSize (1280, 760);
        selTrack = engine.addTrack();
        trackListChanged();
        if (shotMode)
        {
            engine.loadDemo();
            selTrack = engine.tracks.front().get();
            panel.selClip = 0;
            engine.transport.pos.store ((int64) (5.4 * engine.sr()));
            engine.transport.loopStart.store (0);
            engine.transport.loopEnd.store ((int64) (16.0 * engine.sr()));
            trackListChanged();
        }
        else if (engine.audioError.isNotEmpty()) showMessage (TR ("Carte son : ") + engine.audioError);
        startTimerHz (30);
    }

    // Mode capture (CI) : enregistre des images de l'interface puis appelle done().
    void saveSnapshots (const File& dir, std::function<void()> done)
    {
        dir.createDirectory();
        auto save = [dir] (Component& c, const String& name)
        {
            auto img = c.createComponentSnapshot (c.getLocalBounds(), true, 1.0f);
            auto f = dir.getChildFile (name);
            f.deleteFile();
            PNGImageFormat png;
            if (std::unique_ptr<FileOutputStream> os { f.createOutputStream() }) png.writeImageToStream (img, *os);
        };
        save (*this, "principal.png");
        toggleMixer();
        Timer::callAfterDelay (1500, [this, dir, save, done]
        {
            if (mixerWindow) save (*mixerWindow->mixer, "mixeur.png");
            done();
        });
    }

    ~MainComponent() override { stopTimer(); menuBar.setModel (nullptr); mixerWindow.reset(); windows.clear(); }

    //---------------------------------------------------------------- menus
    StringArray getMenuBarNames() override
    {
        StringArray n;
        n.add ("Fichier"); n.add (TR ("Édition")); n.add ("Projet"); n.add ("Audio"); n.add ("Aide");
        return n;
    }
    PopupMenu getMenuForIndex (int idx, const String&) override
    {
        PopupMenu m;
        if (idx == 0)
        {
            m.addItem (1, "Nouveau projet"); m.addItem (7, TR ("Charger le projet démo")); m.addItem (2, "Ouvrir un projet..."); m.addItem (3, "Enregistrer le projet...");
            m.addSeparator(); m.addItem (4, "Importer de l'audio..."); m.addItem (5, "Exporter le mixage (WAV)...");
            m.addSeparator(); m.addItem (6, "Quitter");
        }
        else if (idx == 1)
        {
            m.addItem (10, "Scinder au curseur   S"); m.addItem (11, "Dupliquer le clip"); m.addItem (12, "Supprimer le clip   Suppr");
        }
        else if (idx == 2)
        {
            m.addItem (20, "Ajouter une piste audio"); m.addItem (21, "Supprimer la piste"); m.addSeparator();
            m.addItem (22, "Boucle = clip selectionne"); m.addItem (23, "Boucle activee   C");
        }
        else if (idx == 3)
        {
            m.addItem (30, "Reglages de la carte son   F4"); m.addItem (31, "Scanner les plugins VST3   F11"); m.addItem (32, "Mixeur   F3");
        }
        else
            m.addItem (40, "Raccourcis clavier");
        return m;
    }
    void menuItemSelected (int id, int) override
    {
        switch (id)
        {
            case 1:  windows.clear(); engine.newProject(); selTrack = engine.addTrack(); trackListChanged(); break;
            case 2:  openProject(); break;
            case 7:  windows.clear(); engine.loadDemo(); selTrack = engine.tracks.front().get(); trackListChanged(); bpmSlider.setValue (120.0, dontSendNotification); break;
            case 3:  saveProject(); break;
            case 4:  importAudio(); break;
            case 5:  exportWav(); break;
            case 6:  JUCEApplication::getInstance()->systemRequestedQuit(); break;
            case 10: splitSelected(); break;
            case 11: if (selTrack && panel.selClip >= 0) { engine.duplicateClip (selTrack, panel.selClip); repaintAll(); } break;
            case 12: deleteSelected(); break;
            case 20: selTrack = engine.addTrack(); trackListChanged(); break;
            case 21: removeSelectedTrack(); break;
            case 22: if (auto* c = selectedClip()) { engine.transport.loopStart.store (c->start); engine.transport.loopEnd.store (c->start + c->len); engine.transport.looping.store (true); } break;
            case 23: tLoop.onClick(); break;
            case 30: audioSettings(); break;
            case 31: scanPlugins(); break;
            case 32: toggleMixer(); break;
            case 40: showMessage (TR ("Espace : lecture / stop\nDébut : retour au début\nS : scinder le clip au curseur\nSuppr : supprimer le clip\nC : boucle\nF3 : mixeur   F4 : carte son   F11 : scanner les plugins\nCtrl + molette : zoom   Maj + molette : défilement\nMaj en déplaçant : sans magnétisme")); break;
            default: break;
        }
    }

    //---------------------------------------------------------------- dessin / mise en page
    void paint (Graphics& g) override
    {
        g.fillAll (Colour (0xff2b2e33));
        g.setGradientFill (ColourGradient (Colour (0xff41454b), 0, 24, Colour (0xff33363c), 0, 64, false));
        g.fillRect (0, 24, getWidth(), 40);
        g.setColour (Colour (0xff1c1e22)); g.drawHorizontalLine (63, 0.0f, (float) getWidth());
        for (int x : seps) g.drawVerticalLine (x, 28.0f, 60.0f);
        const int ty = getHeight() - 96;
        g.setGradientFill (ColourGradient (Colour (0xff41454b), 0, (float) ty, Colour (0xff2f3237), 0, (float) (ty + 76), false));
        g.fillRect (0, ty, getWidth(), 76);
        g.setColour (Colour (0xff1c1e22)); g.drawHorizontalLine (ty, 0.0f, (float) getWidth());
        g.setColour (Colour (0xff9aa0a8)); g.setFont (10.0f);
        for (auto& c : captions) g.drawText (c.first, c.second.getX(), c.second.getY() - 13, c.second.getWidth(), 12, Justification::centredLeft);
        // vumetre master
        g.setColour (Colour (0xff0b0e12)); g.fillRect (meterR);
        const float lv = jmax (engine.master->levelL.load(), engine.master->levelR.load());
        const float f = jlimit (0.0f, 1.0f, (Decibels::gainToDecibels (lv, -60.0f) + 60.0f) / 66.0f);
        const int w = (int) (f * (float) meterR.getWidth());
        g.setGradientFill (ColourGradient (Colour (0xff2fd05b), (float) meterR.getX(), 0, Colour (0xffe83a2a), (float) meterR.getRight(), 0, false));
        g.fillRect (meterR.getX(), meterR.getY(), w, meterR.getHeight());
        g.setColour (Colour (0xff1c1e22)); g.drawRect (meterR);
        g.setColour (Colour (0xff2f3237)); g.fillRect (0, getHeight() - 20, getWidth(), 20);
    }

    void resized() override
    {
        auto r = getLocalBounds();
        menuBar.setBounds (r.removeFromTop (24));
        seps.clear();
        // ---- barre d'outils
        {
            auto bar = r.removeFromTop (40).reduced (8, 8);
            int x = bar.getX();
            auto put = [&] (Component& c, int w) { c.setBounds (x, bar.getY(), w, 24); x += w + 3; };
            auto sep = [&] { x += 5; seps.push_back (x); x += 8; };
            put (bObj, 54); put (bSplit, 62); put (bErase, 58); sep();
            put (bSnap, 56); put (gridBox, 70); sep();
            put (bMixer, 108); put (bAudio, 116); put (bVst, 122); sep();
            put (bImp, 70); put (bExp, 70); sep();
            put (bAdd, 70); put (bDel, 70);
            zoomSlider.setBounds (bar.getRight() - 120, bar.getY(), 120, 24);
        }
        // ---- statut
        auto status = r.removeFromBottom (20);
        statusLabel.setBounds (status.removeFromLeft (getWidth() - 120).reduced (8, 0));
        cpuLabel.setBounds (status.reduced (8, 0));
        // ---- transport
        auto tr = r.removeFromBottom (76).reduced (12, 10);
        captions.clear();
        {
            int x = tr.getX();
            for (auto* b : { &tHome, &tBack, &tFwd, &tStop, &tPlay, &tRec, &tLoop }) { b->setBounds (x, tr.getY() + 8, 40, 34); x += 44; }
            x += 14;
            lcdMain.setBounds (x, tr.getY(), 200, 36); lcdSub.setBounds (x, tr.getY() + 36, 200, 18); x += 218;
            locL.setBounds (x, tr.getY() + 22, 82, 22); captions.push_back ({ "Locateur G", locL.getBounds() }); x += 90;
            locR.setBounds (x, tr.getY() + 22, 82, 22); captions.push_back ({ "Locateur D", locR.getBounds() }); x += 90;
            bpmSlider.setBounds (x, tr.getY() + 22, 82, 22); captions.push_back ({ "Tempo", bpmSlider.getBounds() }); x += 90;
            sigLabel.setBounds (x, tr.getY() + 22, 52, 22); captions.push_back ({ "Signature", sigLabel.getBounds() }); x += 62;
            bClick.setBounds (x, tr.getY() + 21, 90, 24);
            meterR = Rectangle<int> (tr.getRight() - 150, tr.getY() + 24, 150, 12);
            captions.push_back ({ "Sortie principale", meterR });
        }
        // ---- zone centrale
        info.setBounds (r.removeFromLeft (230));
        ruler.setBounds (r.removeFromTop (32).withTrimmedLeft (0));
        hbar.setBounds (r.removeFromBottom (14).withTrimmedLeft (view.headerW));
        viewport.setBounds (r);
        panel.setSize (viewport.getMaximumVisibleWidth(), jmax (viewport.getMaximumVisibleHeight(), (int) engine.tracks.size() * view.rowH));
        updateScroll();
    }

    bool keyPressed (const KeyPress& k) override
    {
        if (k == KeyPress::spaceKey) { tPlay.onClick(); return true; }
        if (k == KeyPress::homeKey)  { engine.rewind(); return true; }
        if (k == KeyPress::deleteKey || k == KeyPress::backspaceKey) { deleteSelected(); return true; }
        if (k == KeyPress::F3Key)  { toggleMixer(); return true; }
        if (k == KeyPress::F4Key)  { audioSettings(); return true; }
        if (k == KeyPress::F11Key) { scanPlugins(); return true; }
        const auto ch = k.getTextCharacter();
        if (ch == 's' || ch == 'S') { splitSelected(); return true; }
        if (ch == 'c' || ch == 'C') { tLoop.onClick(); return true; }
        return false;
    }

private:
    AlphaEngine engine;          // premier membre : detruit en dernier
    UICtx ctx;
    ViewState view;
    AlphaEngine::Track* selTrack = nullptr;
    std::map<uint32, std::unique_ptr<PluginWindow>> windows;
    std::unique_ptr<MixerWindow> mixerWindow;
    MenuBarComponent menuBar { this };
    InfoPanel info { ctx, [this] { return selTrack; }, [this] { return panel.selClip; } };
    Ruler ruler { ctx };
    TracksPanel panel { ctx };
    Viewport viewport;
    ScrollBar hbar { false };
    TextButton bObj, bSplit, bErase, bSnap, bMixer, bAudio, bVst, bImp, bExp, bAdd, bDel, bClick;
    ComboBox gridBox;
    Slider zoomSlider, bpmSlider;
    IconButton tHome { IconButton::Home }, tBack { IconButton::Back }, tFwd { IconButton::Fwd }, tStop { IconButton::Stop },
               tPlay { IconButton::Play }, tRec { IconButton::Rec }, tLoop { IconButton::Loop };
    Label lcdMain, lcdSub, locL, locR, sigLabel, statusLabel, cpuLabel;
    std::vector<int> seps;
    std::vector<std::pair<String, Rectangle<int>>> captions;
    Rectangle<int> meterR;
    std::unique_ptr<FileChooser> chooser;
    int statusTick = 0;

    AlphaEngine::Track* validTrack() { return (selTrack && engine.owns (selTrack)) ? selTrack : nullptr; }
    Clip* selectedClip()
    {
        auto* t = validTrack();
        if (t == nullptr || panel.selClip < 0 || panel.selClip >= (int) t->source->clips.size()) return nullptr;
        return &t->source->clips[(size_t) panel.selClip];
    }
    void splitSelected()
    {
        if (auto* t = validTrack())
        {
            const int64 at = engine.transport.pos.load();
            int idx = panel.selClip;
            if (idx < 0)
                for (int i = 0; i < (int) t->source->clips.size(); ++i)
                    if (at > t->source->clips[(size_t) i].start && at < t->source->clips[(size_t) i].start + t->source->clips[(size_t) i].len) { idx = i; break; }
            if (idx >= 0) engine.splitClip (t, idx, at);
        }
        repaintAll();
    }
    void deleteSelected()
    {
        if (auto* t = validTrack()) if (panel.selClip >= 0) { engine.removeClip (t, panel.selClip); panel.selClip = -1; }
        repaintAll();
    }
    void removeSelectedTrack()
    {
        if (auto* t = validTrack()) { engine.removeTrack (t); selTrack = nullptr; trackListChanged(); }
    }

    void repaintAll() { ruler.repaint(); panel.repaint(); info.repaint(); }
    void trackListChanged()
    {
        panel.rebuild();
        panel.setSize (viewport.getMaximumVisibleWidth(), jmax (viewport.getMaximumVisibleHeight(), (int) engine.tracks.size() * view.rowH));
        if (mixerWindow) mixerWindow->mixer->rebuild();
        repaintAll();
    }
    void showMessage (const String& m)
    {
        AlertWindow::showMessageBoxAsync (MessageBoxIconType::InfoIcon, "ALPHA Studio", m);
    }
    void updateScroll()
    {
        const double vis = (double) jmax (100, panel.getWidth() - view.headerW);
        const double total = jmax (vis, (double) engine.projectLength() / engine.sr() * view.pps + vis * 0.5);
        hbar.setRangeLimits (0.0, total);
        hbar.setCurrentRange (view.xOffset, vis);
    }
    void scrollBarMoved (ScrollBar*, double newStart) override { view.xOffset = newStart; repaintAll(); }

    void timerCallback() override
    {
        auto& e = engine;
        const int64 p = e.transport.pos.load();
        const double sr = e.sr(), sec = (double) p / sr, beat = sec * e.transport.bpm.load() / 60.0;
        lcdMain.setText (String::formatted ("%03d.%d.%02d", (int) (beat / 4) + 1, (int) std::fmod (beat, 4.0) + 1, (int) (std::fmod (beat, 1.0) * 100)), dontSendNotification);
        lcdSub.setText (String::formatted ("%02d:%02d.%03d", (int) (sec / 60), (int) std::fmod (sec, 60.0), (int) (std::fmod (sec, 1.0) * 1000)), dontSendNotification);
        locL.setText (InfoPanel::fmtBars (e, e.transport.loopStart.load()), dontSendNotification);
        locR.setText (InfoPanel::fmtBars (e, e.transport.loopEnd.load()), dontSendNotification);
        tPlay.setToggleState (e.transport.playing.load() && ! e.isRecording(), dontSendNotification);
        tRec.setToggleState (e.isRecording(), dontSendNotification);
        tLoop.setToggleState (e.transport.looping.load(), dontSendNotification);
        bClick.setToggleState (e.transport.metronome.load(), dontSendNotification);
        bMixer.setToggleState (mixerWindow != nullptr, dontSendNotification);
        if (e.transport.playing.load())
        {
            const double x = sec * view.pps - view.xOffset, vis = (double) (panel.getWidth() - view.headerW);
            if (x > vis - 30 || x < 0) { view.xOffset = jmax (0.0, sec * view.pps - 20.0); updateScroll(); }
        }
        panel.syncHeaders();
        if (mixerWindow) mixerWindow->mixer->refresh();
        repaintAll();
        repaint (meterR.expanded (2));
        if (++statusTick % 15 == 0)
        {
            statusLabel.setText (e.isRecording() ? TR ("Enregistrement en cours…") : e.deviceInfo(), dontSendNotification);
            cpuLabel.setText ("CPU " + String (juce::roundToInt (e.deviceManager.getCpuUsage() * 100.0)) + " %", dontSendNotification);
        }
    }

    void toggleMixer()
    {
        if (mixerWindow) { mixerWindow.reset(); return; }
        Component::SafePointer<MainComponent> sp (this);
        mixerWindow = std::make_unique<MixerWindow> (ctx, [sp] { MessageManager::callAsync ([sp] { if (sp != nullptr) sp->mixerWindow.reset(); }); });
    }

    void openEditor (AudioProcessorGraph::Node::Ptr n)
    {
        const auto id = n->nodeID.uid;
        auto it = windows.find (id);
        if (it != windows.end()) { it->second->toFront (true); return; }
        Component::SafePointer<MainComponent> safeThis (this);
        windows[id] = std::make_unique<PluginWindow> (n, [safeThis, id]
        {
            MessageManager::callAsync ([safeThis, id] { if (safeThis) safeThis->windows.erase (id); });
        });
    }

    void toggleRecord()
    {
        if (engine.isRecording()) { finishRecording(); return; }

        // Le bouton REC du transport utilise d'abord la piste armée (R).
        // Cette version du moteur enregistre une piste à la fois.
        AlphaEngine::Track* target = nullptr;
        int armedCount = 0;
        for (auto& candidate : engine.tracks)
            if (candidate->arm) { target = candidate.get(); ++armedCount; }

        if (armedCount > 1)
        {
            showMessage (TR ("L'enregistrement multipiste simultané n'est pas encore disponible. Désarmez les autres pistes."));
            return;
        }

        if (target == nullptr) target = validTrack();
        if (target == nullptr)
        {
            showMessage (TR ("Armez une piste avec R ou sélectionnez une piste avant d'enregistrer."));
            return;
        }

        selTrack = target;
        panel.selClip = -1;
        repaintAll();
        auto error = engine.startRecording (target);
        if (error.isNotEmpty()) showMessage (error);
    }
    void finishRecording()
    {
        auto e = engine.stopRecording();
        if (e.isNotEmpty()) showMessage (e);
        repaintAll();
    }

    void importAudio()
    {
        chooser = std::make_unique<FileChooser> (TR ("Importer des fichiers audio"), File::getSpecialLocation (File::userMusicDirectory), "*.wav;*.mp3;*.flac;*.ogg;*.aif;*.aiff");
        chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles | FileBrowserComponent::canSelectMultipleItems,
            [this] (const FileChooser& fc)
            {
                String errs;
                for (auto& f : fc.getResults())
                {
                    auto* t = engine.addTrack (f.getFileNameWithoutExtension().substring (0, 24));
                    String err;
                    if (! engine.importAudio (t, f, engine.transport.pos.load(), err)) { errs += err + "\n"; engine.removeTrack (t); }
                    else selTrack = t;
                }
                trackListChanged();
                if (errs.isNotEmpty()) showMessage (errs);
            });
    }

    void scanPlugins()
    {
        ScanJob job (engine);
        job.runThread();
        engine.saveKnownPlugins();
        showMessage (String (engine.knownPlugins.getNumTypes()) + TR (" plugin(s) VST3 trouvé(s)."));
    }

    void audioSettings()
    {
        auto* sel = new AudioDeviceSelectorComponent (engine.deviceManager, 0, 2, 0, 2, false, false, true, false);
        sel->setSize (560, 460);
        DialogWindow::LaunchOptions o;
        o.content.setOwned (sel);
        o.dialogTitle = TR ("Réglages de la carte son");
        o.componentToCentreAround = this;
        o.dialogBackgroundColour = Colour (0xff2b2e33);
        o.escapeKeyTriggersCloseButton = true;
        o.useNativeTitleBar = true;
        o.resizable = false;
        o.launchAsync();
    }

    void exportWav()
    {
        if (engine.projectLength() == 0) { showMessage (TR ("Rien à exporter : aucun clip.")); return; }
        chooser = std::make_unique<FileChooser> (TR ("Exporter le mixage"), File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("Mixage.wav"), "*.wav");
        chooser->launchAsync (FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting, [this] (const FileChooser& fc)
        {
            auto f = fc.getResult();
            if (f == File()) return;
            engine.beginOffline();
            ExportJob job (engine, f);
            job.runThread();
            const bool ok = job.ok;
            engine.endOffline();
            showMessage (ok ? TR ("Mixage exporté : ") + f.getFullPathName() : TR ("Export annulé ou échoué."));
        });
    }

    void openProject()
    {
        chooser = std::make_unique<FileChooser> ("Ouvrir un projet", File::getSpecialLocation (File::userDocumentsDirectory), "*.alpha");
        chooser->launchAsync (FileBrowserComponent::openMode | FileBrowserComponent::canSelectFiles, [this] (const FileChooser& fc)
        {
            auto f = fc.getResult();
            if (f == File()) return;
            windows.clear();
            selTrack = nullptr;
            auto err = engine.loadProject (f);
            bpmSlider.setValue (engine.transport.bpm.load(), dontSendNotification);
            trackListChanged();
            if (err.isNotEmpty()) showMessage (err);
        });
    }
    void saveProject()
    {
        chooser = std::make_unique<FileChooser> ("Enregistrer le projet", File::getSpecialLocation (File::userDocumentsDirectory).getChildFile ("Projet.alpha"), "*.alpha");
        chooser->launchAsync (FileBrowserComponent::saveMode | FileBrowserComponent::warnAboutOverwriting, [this] (const FileChooser& fc)
        {
            auto f = fc.getResult();
            if (f == File()) return;
            if (! engine.saveProject (f.withFileExtension ("alpha"))) showMessage (TR ("Enregistrement impossible."));
        });
    }
};

//==============================================================================
class AlphaApp : public JUCEApplication
{
public:
    const String getApplicationName() override { return "ALPHA Studio"; }
    const String getApplicationVersion() override { return "0.2.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void initialise (const String& commandLine) override
    {
        LookAndFeel::setDefaultLookAndFeel (&look);
        auto args = StringArray::fromTokens (commandLine, true);
        const int i = args.indexOf ("--screenshot");
        if (i >= 0 && i + 1 < args.size())
        {
            const File dir (args[i + 1].unquoted());
            shotComp = std::make_unique<MainComponent> (true);
            Timer::callAfterDelay (2000, [this, dir] { shotComp->saveSnapshots (dir, [this] { quit(); }); });
            return;
        }
        window = std::make_unique<MainWindow>();
    }
    void shutdown() override
    {
        window.reset();
        shotComp.reset();
        LookAndFeel::setDefaultLookAndFeel (nullptr);
    }
    void systemRequestedQuit() override { quit(); }

    class MainWindow : public DocumentWindow
    {
    public:
        MainWindow() : DocumentWindow ("ALPHA Studio", Colour (0xff2b2e33), DocumentWindow::allButtons)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (new MainComponent(), true);
            setResizable (true, true);
            setResizeLimits (1100, 600, 4000, 3000);
            centreWithSize (getWidth(), getHeight());
            setVisible (true);
        }
        void closeButtonPressed() override { JUCEApplication::getInstance()->systemRequestedQuit(); }
    };
private:
    AlphaLook look;
    std::unique_ptr<MainWindow> window;
    std::unique_ptr<MainComponent> shotComp;
};

START_JUCE_APPLICATION (AlphaApp)
