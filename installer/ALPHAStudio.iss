; ALPHA Studio 0.5.0 — installateur Windows x64, Inno Setup 6.
; Le dossier payload/ est créé par GitHub Actions après la compilation JUCE.
; Le runtime WebView2 Evergreen est amorcé uniquement s'il n'est pas déjà présent.

#define MyAppName "ALPHA Studio"
#define MyAppVersion "0.5.0"
#define MyAppPublisher "ALPHA"
#define MyAppExeName "ALPHA Studio.exe"
#define MySetupBase "ALPHAStudio-Setup-0.5.0-x64"

[Setup]
AppId={{B5D9F4A2-8B0B-4E5F-9A1B-6D6D1B8E7C42}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\ALPHA Studio
DefaultGroupName=ALPHA Studio
DisableProgramGroupPage=yes
DisableDirPage=auto
OutputDir=.
OutputBaseFilename={#MySetupBase}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
VersionInfoVersion=0.5.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion=0.5.0.0

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: WebView2BootstrapNeeded
Source: "THIRD_PARTY_NOTICES.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\ALPHA Studio"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Désinstaller ALPHA Studio"; Filename: "{uninstallexe}"
Name: "{autodesktop}\ALPHA Studio"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon; WorkingDir: "{app}"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installation du runtime Microsoft WebView2 Evergreen..."; Flags: waituntilterminated skipifsilent; Check: WebView2BootstrapNeeded
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,ALPHA Studio}"; Flags: nowait postinstall skipifsilent

[Code]
function IsWebView2Installed: Boolean;
var
  V: String;
  Client: String;
begin
  Client := 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := RegQueryStringValue(HKLM, Client, 'pv', V)
         or RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', V)
         or RegQueryStringValue(HKCU, Client, 'pv', V);
end;

function WebView2BootstrapNeeded: Boolean;
begin
  Result := not IsWebView2Installed;
end;
