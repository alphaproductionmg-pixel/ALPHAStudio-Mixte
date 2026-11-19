@echo off
REM Necessite : Visual Studio 2022 (charge de travail "Developpement Desktop en C++") et CMake.
cmake -B build -A x64 || goto :err
cmake --build build --config Release --parallel || goto :err
echo.
echo Programme compile : build\AlphaStudio_artefacts\Release\ALPHA Studio.exe
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\installer.iss
  echo Installeur : dist\ALPHA-Studio-Setup.exe
) else (
  echo Inno Setup absent : installez-le pour creer l'installeur, ou lancez directement le .exe ci-dessus.
)
pause
exit /b 0
:err
echo ECHEC de la compilation. Copiez le message d'erreur ci-dessus et envoyez-le moi.
pause
exit /b 1
