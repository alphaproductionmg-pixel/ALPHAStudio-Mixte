cmake_minimum_required(VERSION 3.22)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")  # pas besoin de VC++ Redistributable
project(AlphaStudio VERSION 0.2.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 8.0.4
  GIT_SHALLOW ON)
FetchContent_MakeAvailable(JUCE)

juce_add_gui_app(AlphaStudio
  PRODUCT_NAME "ALPHA Studio"
  COMPANY_NAME "ALPHA"
  VERSION 0.2.0)
juce_generate_juce_header(AlphaStudio)

target_sources(AlphaStudio PRIVATE Source/Main.cpp)
target_compile_definitions(AlphaStudio PRIVATE
  JUCE_WEB_BROWSER=0
  JUCE_USE_CURL=0
  JUCE_MODAL_LOOPS_PERMITTED=1
  JUCE_PLUGINHOST_VST3=1
  JUCE_PLUGINHOST_VST=0
  JUCE_PLUGINHOST_AU=0
  JUCE_USE_WIN_WASAPI=1
  JUCE_DIRECTSOUND=1
  JUCE_APPLICATION_NAME_STRING="ALPHA Studio"
  JUCE_APPLICATION_VERSION_STRING="0.2.0")

# ASIO (facultatif) : cmake -B build -DASIO_SDK_DIR="C:/chemin/asiosdk"
set(ASIO_SDK_DIR "" CACHE PATH "Dossier du SDK ASIO de Steinberg (optionnel)")
# Detection automatique : placer le SDK dans ThirdParty/asiosdk (doit contenir common/asio.h)
if(NOT ASIO_SDK_DIR AND EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/ThirdParty/asiosdk/common/asio.h")
  set(ASIO_SDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/ThirdParty/asiosdk")
endif()
if(ASIO_SDK_DIR)
  message(STATUS "ASIO active : ${ASIO_SDK_DIR}")
  target_compile_definitions(AlphaStudio PRIVATE JUCE_ASIO=1)
  target_include_directories(AlphaStudio PRIVATE "${ASIO_SDK_DIR}/common" "${ASIO_SDK_DIR}/host" "${ASIO_SDK_DIR}/host/pc")
endif()

if(MSVC)
  target_compile_options(AlphaStudio PRIVATE /utf-8)
endif()

target_link_libraries(AlphaStudio PRIVATE
  juce::juce_audio_utils
  juce::juce_audio_processors
  juce::juce_audio_formats
  juce::juce_audio_devices
  juce::juce_gui_extra
  juce::juce_recommended_config_flags)
