cmake_minimum_required(VERSION 3.22)
project(ALPHAStudioMixte VERSION 0.3.0 LANGUAGES CXX)
if(NOT WIN32)
    message(FATAL_ERROR "ALPHA Studio Mixte utilise WebView2 et cible Windows.")
endif()
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

include(FetchContent)
FetchContent_Declare(JUCE
    GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
    GIT_TAG 8.0.4
    GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/UI/AlphaStudio/src/app.js")
    message(FATAL_ERROR "Sources UI manquantes : transférer le dossier src/ de l'archive ALPHA-Studio dans UI/AlphaStudio.")
endif()
find_package(Python3 COMPONENTS Interpreter REQUIRED)

juce_add_gui_app(AlphaStudio
    PRODUCT_NAME "ALPHA Studio"
    COMPANY_NAME "ALPHA"
    VERSION 0.3.0
    NEEDS_WEBVIEW2 TRUE)
juce_generate_juce_header(AlphaStudio)

add_custom_command(TARGET AlphaStudio PRE_BUILD
    COMMAND "${Python3_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/UI/AlphaStudio/build.py"
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/UI/AlphaStudio"
    COMMENT "Building original ALPHA Studio UI and injecting native bridge")

target_sources(AlphaStudio PRIVATE
    Source/Main.cpp
    Source/AlphaWebMain.h
    Engines/ALPHA-Studio/Source/Engine.h)
target_include_directories(AlphaStudio PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/Engines/ALPHA-Studio/Source")

target_compile_definitions(AlphaStudio PRIVATE
    JUCE_WEB_BROWSER=1
    JUCE_USE_WIN_WEBVIEW2=1
    JUCE_USE_CURL=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_PLUGINHOST_VST3=1
    JUCE_PLUGINHOST_VST=0
    JUCE_PLUGINHOST_AU=0
    JUCE_USE_WIN_WASAPI=1
    JUCE_DIRECTSOUND=1
    JUCE_APPLICATION_NAME_STRING="ALPHA Studio"
    JUCE_APPLICATION_VERSION_STRING="0.3.0")

target_link_libraries(AlphaStudio PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_audio_formats
    juce::juce_audio_devices
    juce::juce_gui_extra
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags)

add_custom_command(TARGET AlphaStudio POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_CURRENT_SOURCE_DIR}/UI/AlphaStudio"
        "$<TARGET_FILE_DIR:AlphaStudio>/UI/AlphaStudio"
    COMMENT "Copying ALPHA Studio web interface")

if(MSVC)
    target_compile_options(AlphaStudio PRIVATE /utf-8 /W4)
endif()
