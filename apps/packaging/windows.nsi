Unicode true
!include "MUI2.nsh"
Name "Viezan"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\Viezan"
RequestExecutionLevel user
!define MUI_ABORTWARNING
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Section "Viezan"
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Viezan.lnk" "$INSTDIR\ViezanNativeQt.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "DisplayName" "Viezan"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "UninstallString" '$"$INSTDIR\Uninstall.exe$"'
SectionEnd
Section "Uninstall"
  Delete "$SMPROGRAMS\Viezan.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative"
  ; Only the application-owned installation directory. AppLocalData and credentials survive.
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
