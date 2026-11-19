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

    juce::var buildState() const;
    void publishState();
    void handleCommand (const juce::Array<juce::var>&,
                        juce::WebBrowserComponent::NativeFunctionCompletion);
    void openDialog (const juce::String& kind, const juce::var& payload);
    void exportWav (bool stems);
    void timerCallback() override;

    AlphaEngine engine;
    std::unique_ptr<Browser> browser;
    std::unique_ptr<juce::FileChooser> chooser;
    std::shared_ptr<std::atomic<bool>> alive = std::make_shared<std::atomic<bool>> (true);
    std::atomic<bool> exporting { false };
    std::shared_ptr<juce::WaitableEvent> exportDone = std::make_shared<juce::WaitableEvent>();
    bool pageReady = false;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AlphaWebMainComponent)
};
