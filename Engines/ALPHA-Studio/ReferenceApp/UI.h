// ALPHA Studio - interface (fenetre projet, pistes, regle, transport).
#pragma once
#include "Engine.h"

struct ViewState { double pps = 60.0; double xOffset = 0.0; int rowH = 104; int headerW = 252; int tool = 0; bool snap = true; int grid = 4; };

struct UICtx
{
    AlphaEngine* engine = nullptr;
    ViewState* view = nullptr;
    std::function<void (AudioProcessorGraph::Node::Ptr)> openEditor;
    std::function<void (AlphaEngine::Track*)> selectTrack;
    std::function<bool (AlphaEngine::Track*)> isSelected;
    std::function<void (const String&)> toast;
    std::function<void()> trackListChanged;
};

//==============================================================================
class TrackHeader : public Component
{
public:
    TrackHeader (UICtx& c, AlphaEngine::Track* t) : ctx (c), track (t)
    {
        addAndMakeVisible (name);
        name.setText (t->name, dontSendNotification);
        name.setEditable (false, true, false);
        name.setFont (Font (FontOptions (15.0f, Font::bold)));
        name.onTextChange = [this] { track->name = name.getText(); };

        for (auto* b : { &mute, &solo, &arm })
        {
            addAndMakeVisible (b);
            b->setClickingTogglesState (true);
            b->setMouseClickGrabsKeyboardFocus (false);
        }
        mute.setButtonText ("M"); solo.setButtonText ("S"); arm.setButtonText ("R");
        mute.setColour (TextButton::buttonOnColourId, Colour (0xfff5c24a));
        solo.setColour (TextButton::buttonOnColourId, Colour (0xff4cc968));
        arm.setColour (TextButton::buttonOnColourId, Colour (0xffd63a2f));
        mute.setToggleState (t->mute, dontSendNotification);
        solo.setToggleState (t->solo, dontSendNotification);
        arm.setToggleState (t->arm, dontSendNotification);
        mute.onClick = [this] { track->mute = mute.getToggleState(); ctx.engine->refreshMix(); };
        solo.onClick = [this] { track->solo = solo.getToggleState(); ctx.engine->refreshMix(); };
        arm.onClick  = [this] { track->arm = arm.getToggleState(); };

        addAndMakeVisible (vol);
        vol.setSliderStyle (Slider::LinearHorizontal);
        vol.setTextBoxStyle (Slider::TextBoxRight, false, 62, 18);
        vol.setRange (-60.0, 6.0, 0.1);
        vol.setValue (t->volDb, dontSendNotification);
        vol.setDoubleClickReturnValue (true, -6.0);
        vol.setTextValueSuffix (" dB");
        vol.onValueChange = [this] { track->volDb = (float) vol.getValue(); ctx.engine->refreshMix(); };

        addAndMakeVisible (pan);
        pan.setSliderStyle (Slider::LinearHorizontal);
        pan.setTextBoxStyle (Slider::NoTextBox, false, 0, 0);
        pan.setRange (-1.0, 1.0, 0.01);
        pan.setValue (t->pan, dontSendNotification);
        pan.setDoubleClickReturnValue (true, 0.0);
        pan.onValueChange = [this] { track->pan = (float) pan.getValue(); ctx.engine->refreshMix(); };

        for (int i = 0; i < 6; ++i)
        {
            addAndMakeVisible (slot[i]);
            slot[i].setMouseClickGrabKeyboardFocusFix();
            slot[i].onClick = [this, i] { slotClicked (i); };
        }
        updateSlots();
    }

    void updateSlots()
    {
        for (int i = 0; i < 6; ++i)
        {
            const bool filled = i < (int) track->inserts.size();
            slot[i].setButtonText (filled ? track->inserts[(size_t) i].name : "+");
            slot[i].setColour (TextButton::buttonColourId, filled ? Colour (0xff2f7fd1) : Colour (0xff4a4f57));
            slot[i].setColour (TextButton::textColourOffId, filled ? Colours::white : Colour (0xffb6bbc2));
            slot[i].setTooltip (filled ? track->inserts[(size_t) i].name : TR ("Ajouter un effet VST3"));
        }
    }

    void paint (Graphics& g) override
    {
        const bool sel = ctx.isSelected && ctx.isSelected (track);
        g.setGradientFill (ColourGradient (sel ? Colour (0xff4d5662) : Colour (0xff3f4349), 0, 0,
                                           sel ? Colour (0xff3f4752) : Colour (0xff383b41), (float) getWidth(), 0, false));
        g.fillAll();
        g.setColour (track->colour);
        g.fillRect (0, 0, 6, getHeight());
        g.setColour (Colour (0xff1d1f23));
        g.drawRect (getLocalBounds());
        const int mx = getWidth() - 14;
        const float lv[2] = { track->fader->levelL.load(), track->fader->levelR.load() };
        for (int c = 0; c < 2; ++c)
        {
            const float db = Decibels::gainToDecibels (lv[c], -60.0f);
            const float f = jlimit (0.0f, 1.0f, (db + 60.0f) / 66.0f);
            const int x = mx + c * 6, h = getHeight() - 8;
            g.setColour (Colour (0xff10141a)); g.fillRect (x, 4, 5, h);
            g.setColour (db > 0 ? Colours::red : db > -9 ? Colours::yellow : Colour (0xff2fd05b));
            g.fillRect (x, 4 + (int) ((1.0f - f) * (float) h), 5, (int) (f * (float) h));
        }
    }

    void resized() override
    {
        name.setBounds (12, 4, getWidth() - 12 - 110, 22);
        mute.setBounds (getWidth() - 102, 5, 26, 22);
        solo.setBounds (getWidth() - 74, 5, 26, 22);
        arm.setBounds (getWidth() - 46, 5, 26, 22);
        vol.setBounds (10, 32, getWidth() - 30 - 60, 20);
        pan.setBounds (getWidth() - 30 - 56, 32, 56, 20);
        const int sw = (getWidth() - 20 - 4) / 3;
        for (int i = 0; i < 6; ++i)
            slot[i].setBounds (10 + (i % 3) * (sw + 2), 58 + (i / 3) * 22, sw, 20);
    }

    void syncFromTrack()
    {
        if (! vol.isMouseButtonDown()) vol.setValue (track->volDb, dontSendNotification);
        if (! pan.isMouseButtonDown()) pan.setValue (track->pan, dontSendNotification);
        mute.setToggleState (track->mute, dontSendNotification);
        solo.setToggleState (track->solo, dontSendNotification);
        arm.setToggleState (track->arm, dontSendNotification);
        if (! name.isBeingEdited() && name.getText() != track->name) name.setText (track->name, dontSendNotification);
    }

    void mouseDown (const MouseEvent&) override { if (ctx.selectTrack) ctx.selectTrack (track); }

private:
    struct SlotButton : TextButton { void setMouseClickGrabKeyboardFocusFix() { setMouseClickGrabsKeyboardFocus (false); } };

    void slotClicked (int i)
    {
        if (ctx.selectTrack) ctx.selectTrack (track);
        Component::SafePointer<TrackHeader> sp (this);
        PopupMenu m;
        if (i < (int) track->inserts.size())
        {
            m.addItem (1, TR ("Ouvrir l'éditeur du plugin"));
            m.addItem (2, "Retirer");
            m.showMenuAsync (PopupMenu::Options(), [sp, i] (int r)
            {
                if (sp == nullptr) return;
                if (r == 1) sp->ctx.openEditor (sp->track->inserts[(size_t) i].node);
                if (r == 2) { sp->ctx.engine->removeInsert (sp->track, i); sp->updateSlots(); }
            });
            return;
        }
        auto types = ctx.engine->knownPlugins.getTypes();
        if (types.isEmpty()) m.addItem (-1, TR ("Aucun plugin : utilisez « Scanner VST3 »"), false);
        for (int k = 0; k < types.size(); ++k)
            m.addItem (k + 1, types[k].name + "  (" + types[k].manufacturerName + ")");
        m.showMenuAsync (PopupMenu::Options(), [sp, types] (int r)
        {
            if (sp == nullptr || r <= 0) return;
            auto* self = sp.getComponent();
            self->ctx.engine->addInsert (self->track, types[r - 1], [sp] (const String& err)
            {
                if (sp == nullptr) return;
                if (err.isNotEmpty()) sp->ctx.toast (err);
                sp->updateSlots();
            });
        });
    }

    UICtx& ctx;
public:
    AlphaEngine::Track* track;
private:
    Label name;
    TextButton mute, solo, arm;
    Slider vol, pan;
    SlotButton slot[6];
};

//==============================================================================
inline double beatSamples (AlphaEngine& e) { return e.sr() * 60.0 / e.transport.bpm.load(); }
inline double gridSamples (AlphaEngine& e, const ViewState& v) { return beatSamples (e) * 4.0 / (double) v.grid; }

class Ruler : public Component
{
public:
    Ruler (UICtx& c) : ctx (c) {}
    void paint (Graphics& g) override
    {
        auto& v = *ctx.view; auto& e = *ctx.engine;
        g.setGradientFill (ColourGradient (Colour (0xff4a4e55), 0, 0, Colour (0xff3a3d43), 0, (float) getHeight(), false));
        g.fillAll();
        const double barSec = 240.0 / e.transport.bpm.load();
        g.setFont (11.0f);
        if (e.transport.loopEnd.load() > e.transport.loopStart.load())
        {
            const float x1 = xOf (e.transport.loopStart.load()), x2 = xOf (e.transport.loopEnd.load());
            g.setColour (Colour (e.transport.looping.load() ? 0x992f7fd1 : 0x442f7fd1));
            g.fillRect (x1, 0.0f, x2 - x1, 14.0f);
        }
        for (int b = 0; b < 4000; ++b)
        {
            const float x = (float) (v.headerW + b * barSec * v.pps - v.xOffset);
            if (x > (float) getWidth()) break;
            if (x < (float) v.headerW - 1) continue;
            g.setColour (Colour (0xff4a505a));
            g.drawVerticalLine ((int) x, 14.0f, (float) getHeight());
            if (barSec * v.pps > 28 || b % 4 == 0) { g.setColour (Colour (0xffc8ccd2)); g.drawText (String (b + 1), (int) x + 3, 16, 40, 14, Justification::left); }
            if (barSec * v.pps > 120)
                for (int k = 1; k < 4; ++k)
                { g.setColour (Colour (0xff7b828c)); g.drawVerticalLine ((int) (x + k * barSec * v.pps / 4), 26.0f, (float) getHeight()); }
        }
        g.setColour (Colour (0xff3a3d43));
        g.fillRect (0, 0, v.headerW, getHeight());
        g.setColour (Colour (0xff9aa0a8));
        g.setFont (11.0f);
        g.drawText (TR ("PISTES   (règle : haut = boucle, bas = curseur)"), 6, 0, v.headerW - 6, getHeight(), Justification::centredLeft);
        const float px = xOf (e.transport.pos.load());
        g.setColour (Colours::white);
        g.fillRect (px, 0.0f, 1.0f, (float) getHeight());
        g.setColour (Colour (0xff2f7fd1)); g.fillRect (px - 1.0f, 0.0f, 3.0f, 6.0f);
    }
    float xOf (int64 s) const { return (float) (ctx.view->headerW + (double) s / ctx.engine->sr() * ctx.view->pps - ctx.view->xOffset); }
    int64 sOf (float x) const { return (int64) jmax (0.0, ((double) x - ctx.view->headerW + ctx.view->xOffset) / ctx.view->pps * ctx.engine->sr()); }
    int64 snap (int64 s, bool on) const { if (! on || ! ctx.view->snap) return s; const double g = gridSamples (*ctx.engine, *ctx.view); return (int64) (std::round ((double) s / g) * g); }

    void mouseDown (const MouseEvent& e) override
    {
        if (e.x < ctx.view->headerW) return;
        top = e.y < 14; anchor = snap (sOf ((float) e.x), ! e.mods.isShiftDown());
        if (! top) ctx.engine->seek (sOf ((float) e.x));
    }
    void mouseDrag (const MouseEvent& e) override
    {
        if (e.x < ctx.view->headerW) return;
        if (top)
        {
            const int64 b = snap (sOf ((float) e.x), ! e.mods.isShiftDown());
            const int64 lo = jmin (anchor, b), hi = jmax (anchor, b);
            if (hi - lo > 100) { ctx.engine->transport.loopStart.store (lo); ctx.engine->transport.loopEnd.store (hi); ctx.engine->transport.looping.store (true); }
        }
        else ctx.engine->seek (sOf ((float) e.x));
    }
private:
    UICtx& ctx; bool top = false; int64 anchor = 0;
};

//==============================================================================
class TracksPanel : public Component
{
public:
    int selClip = -1;
    TracksPanel (UICtx& c) : ctx (c) {}

    void rebuild()
    {
        headers.clear();
        for (auto& t : ctx.engine->tracks)
        {
            auto* h = new TrackHeader (ctx, t.get());
            headers.add (h);
            addAndMakeVisible (h);
        }
        resized(); repaint();
    }
    void refreshSlots() { for (auto* h : headers) h->updateSlots(); }
    void syncHeaders() { for (auto* h : headers) h->syncFromTrack(); }

    void resized() override
    {
        for (int i = 0; i < headers.size(); ++i)
            headers[i]->setBounds (0, i * ctx.view->rowH, ctx.view->headerW, ctx.view->rowH);
    }

    float xOf (int64 s) const { return (float) (ctx.view->headerW + (double) s / ctx.engine->sr() * ctx.view->pps - ctx.view->xOffset); }
    int64 sOf (float x) const { return (int64) jmax (0.0, ((double) x - ctx.view->headerW + ctx.view->xOffset) / ctx.view->pps * ctx.engine->sr()); }

    void paint (Graphics& g) override
    {
        auto& v = *ctx.view; auto& e = *ctx.engine;
        g.fillAll (Colour (0xff343940));
        const double barSec = 240.0 / e.transport.bpm.load();
        const int rows = (int) e.tracks.size();
        const Rectangle<int> lane (v.headerW, 0, getWidth() - v.headerW, getHeight());
        g.saveState();
        g.reduceClipRegion (lane);
        for (int r = 0; r < jmax (rows, getHeight() / v.rowH + 1); ++r)
        {
            g.setColour (r % 2 ? Colour (0xff3b4048) : Colour (0xff373c43));
            g.fillRect (v.headerW, r * v.rowH, getWidth(), v.rowH);
            g.setColour (Colour (0xff22262b));
            g.drawHorizontalLine ((r + 1) * v.rowH - 1, (float) v.headerW, (float) getWidth());
        }
        for (int b = 0; b < 4000; ++b)
        {
            const float x = (float) (v.headerW + b * barSec * v.pps - v.xOffset);
            if (x > (float) getWidth()) break;
            if (x < (float) v.headerW) continue;
            g.setColour (Colour (0x33ffffff)); g.drawVerticalLine ((int) x, 0.0f, (float) getHeight());
        }
        for (int r = 0; r < rows; ++r)
        {
            auto* t = e.tracks[(size_t) r].get();
            const int y = r * v.rowH + 3, h = v.rowH - 7;
            for (int ci = 0; ci < (int) t->source->clips.size(); ++ci)
            {
                auto& c = t->source->clips[(size_t) ci];
                const float x1 = xOf (c.start), x2 = xOf (c.start + c.len);
                if (x2 < (float) v.headerW || x1 > (float) getWidth()) continue;
                const bool sel = ctx.isSelected (t) && ci == selClip;
                g.setColour (Colour (0xf0ffffff)); g.fillRect (x1, (float) y, x2 - x1, (float) h);
                g.setColour (t->colour.withAlpha (0.28f)); g.fillRect (x1, (float) y, x2 - x1, (float) h);
                g.setColour (Colour (0xff1c2026));
                const double sr = e.sr();
                const float mid = (float) y + (float) h * 0.5f;
                if (c.peaks != nullptr)
                    for (int px = (int) jmax (x1, (float) v.headerW); px < (int) jmin (x2, (float) getWidth()); ++px)
                    {
                        const double s0 = c.offset + ((double) px - x1) / v.pps * sr;
                        const int i0 = (int) (s0 / kPeakBlock), i1 = jmax (i0 + 1, (int) ((s0 + sr / v.pps) / kPeakBlock) + 1);
                        float mn = 0, mx = 0;
                        for (int i = i0; i < i1 && (size_t) (2 * i + 1) < c.peaks->size(); ++i)
                        { mn = jmin (mn, (*c.peaks)[(size_t) (2 * i)]); mx = jmax (mx, (*c.peaks)[(size_t) (2 * i + 1)]); }
                        const float hh = (float) h * 0.46f;
                        g.fillRect ((float) px, mid - mx * hh, 1.0f, jmax (1.0f, (mx - mn) * hh));
                    }
                g.setColour (sel ? Colours::white : Colour (0xff000000));
                g.drawRect (x1, (float) y, x2 - x1, (float) h, sel ? 2.0f : 1.0f);
                g.setColour (Colours::black);
                g.setFont (Font (FontOptions (11.0f, Font::bold)));
                g.drawText (c.name, (int) jmax (x1, (float) v.headerW) + 4, y + 1, 160, 14, Justification::left);
            }
        }
        const float px = xOf (e.transport.pos.load());
        g.setColour (Colours::white);
        g.fillRect (px, 0.0f, 1.0f, (float) getHeight());
        g.restoreState();
    }

    void mouseDown (const MouseEvent& e) override
    {
        auto& v = *ctx.view;
        if (e.x < v.headerW) return;
        const int row = e.y / v.rowH;
        if (row >= (int) ctx.engine->tracks.size()) { ctx.selectTrack (nullptr); selClip = -1; seekTo (e); return; }
        auto* t = ctx.engine->tracks[(size_t) row].get();
        ctx.selectTrack (t);
        const int64 at = sOf ((float) e.x);
        selClip = -1;
        for (int i = (int) t->source->clips.size() - 1; i >= 0; --i)
        {
            auto& c = t->source->clips[(size_t) i];
            if (at >= c.start && at < c.start + c.len) { selClip = i; dragTrack = t; dragOrig = c.start; dragX0 = e.x; break; }
        }
        if (selClip >= 0 && v.tool == 1)
        {
            int64 s = at;
            if (v.snap && ! e.mods.isShiftDown()) { const double g = gridSamples (*ctx.engine, v); s = (int64) (std::round ((double) s / g) * g); }
            ctx.engine->splitClip (t, selClip, s);
            dragTrack = nullptr; repaint(); return;
        }
        if (selClip >= 0 && v.tool == 2)
        {
            ctx.engine->removeClip (t, selClip);
            selClip = -1; dragTrack = nullptr; repaint(); return;
        }
        if (selClip < 0) { dragTrack = nullptr; seekTo (e); }
        repaint();
    }
    void mouseDrag (const MouseEvent& e) override
    {
        if (dragTrack == nullptr || selClip < 0) { if (e.x >= ctx.view->headerW) seekTo (e); return; }
        int64 ns = dragOrig + (int64) ((double) (e.x - dragX0) / ctx.view->pps * ctx.engine->sr());
        if (ctx.view->snap && ! e.mods.isShiftDown()) { const double g = gridSamples (*ctx.engine, *ctx.view); ns = (int64) (std::round ((double) ns / g) * g); }
        ctx.engine->setClipStart (dragTrack, selClip, ns);
        repaint();
    }
    void mouseWheelMove (const MouseEvent& e, const MouseWheelDetails& w) override
    {
        if (e.mods.isCtrlDown())
        {
            ctx.view->pps = jlimit (4.0, 600.0, ctx.view->pps * (w.deltaY > 0 ? 1.15 : 1.0 / 1.15));
            if (onViewChanged) onViewChanged();
        }
        else if (e.mods.isShiftDown() || std::abs (w.deltaX) > std::abs (w.deltaY))
        {
            ctx.view->xOffset = jmax (0.0, ctx.view->xOffset - (double) (w.deltaX != 0 ? w.deltaX : w.deltaY) * 400.0);
            if (onViewChanged) onViewChanged();
        }
        else Component::mouseWheelMove (e, w);
    }
    std::function<void()> onViewChanged;
private:
    void seekTo (const MouseEvent& e) { ctx.engine->seek (sOf ((float) e.x)); }
    UICtx& ctx;
    OwnedArray<TrackHeader> headers;
    AlphaEngine::Track* dragTrack = nullptr; int64 dragOrig = 0; int dragX0 = 0;
};
