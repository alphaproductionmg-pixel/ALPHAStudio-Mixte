#pragma once
#include <JuceHeader.h>
#include "../Engines/ALPHA-Studio/Source/Engine.h"
#include <atomic>
#include <memory>

class AlphaWebMainComponent final : public juce::Component, private juce::Timer
{
public:
    AlphaWebMainComponent();
    ~AlphaWebMainComponent() override;
    void resized() override;

private:
    class Browser final : public juce::WebBrowserComponent
    {
    public:
        using juce::WebBrowserComponent::WebBrowserComponent;
        std::function<void()> onPageReady;
        void pageFinishedLoading (const juce::String&) override
        {
            if (onPageReady) onPageReady();
        }
    };

    juce::var buildState();
    void addDisplayMetrics (juce::var& state) const;
    void publishState();
    void handleCommand (const juce::Array<juce::var>&,
                        juce::WebBrowserComponent::NativeFunctionCompletion);
    void openDialog (const juce::String& kind, const juce::var& payload);
    void exportWav (bool stems, int singleTrack = -1);
    void showAudioSettings();
    void showAsioPanel();
    void fitWindowToScreen();
    void timerCallback() override;

    double uiScaleOverride = 1.0;
    double fontScaleOverride = 1.0;
    // L'export asynchrone conserve une propriété partagée du moteur : le
    // composant ne peut pas être détruit avant la fin réelle du worker (A2).
    std::shared_ptr<AlphaEngine> engineOwner;
    AlphaEngine& engine;
    std::unique_ptr<Browser> browser;
    std::unique_ptr<juce::FileChooser> chooser;
    std::shared_ptr<std::atomic<bool>> alive = std::make_shared<std::atomic<bool>> (true);
    std::atomic<bool> exporting { false };
    std::shared_ptr<juce::WaitableEvent> exportDone = std::make_shared<juce::WaitableEvent>();
    bool pageReady = false;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AlphaWebMainComponent)
};
