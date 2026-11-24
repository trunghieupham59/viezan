Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
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

; The retired Electron app (2.4.x and earlier) was installed by electron-builder
; under this id. The default is the real id; packaging tests pass a throwaway one.
!ifndef LEGACY_ID
  !define LEGACY_ID "75f5824f-4aea-551f-aaf6-5dc07643b7bb"
!endif

; Remove the Electron app before installing, otherwise its shortcuts keep opening
; the old version, which offers this update again. Only an Electron layout with its
; own uninstaller is touched; that uninstaller keeps the user's data.
!macro RemoveLegacyElectron ROOT SCOPE
  ReadRegStr $0 ${ROOT} "Software\${LEGACY_ID}" "InstallLocation"
  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\resources\app.asar"
  ${AndIf} ${FileExists} "$0\Uninstall Viezan.exe"
    DetailPrint "Removing the previous Viezan version..."
    InitPluginsDir
    CopyFiles /SILENT "$0\Uninstall Viezan.exe" "$PLUGINSDIR\legacy-uninstall.exe"
    ; _?= keeps the uninstaller in the foreground so this installer can wait for it.
    !if "${SCOPE}" == "allusers"
      ; A per-machine install can only be removed with administrator approval.
      ExecShellWait "runas" "$PLUGINSDIR\legacy-uninstall.exe" "/allusers /S /KEEP_APP_DATA _?=$0" SW_HIDE
    !else
      ExecWait '"$PLUGINSDIR\legacy-uninstall.exe" /currentuser /S /KEEP_APP_DATA _?=$0'
    !endif
    ${If} ${FileExists} "$0\resources\app.asar"
      MessageBox MB_OK|MB_ICONEXCLAMATION "The previous Viezan version could not be removed. Remove it in Windows Settings > Apps, then run this installer again." /SD IDOK
      Abort
    ${EndIf}
  ${EndIf}
!macroend

; Windows locks the files of a running app, so extracting over it fails file by
; file. A running executable cannot be opened for writing; wait until it can.
!macro RequireAppClosed
  ${If} ${FileExists} "$INSTDIR\ViezanNativeQt.exe"
    StrCpy $1 120
    ${Do}
      ClearErrors
      FileOpen $0 "$INSTDIR\ViezanNativeQt.exe" a
      ${IfNot} ${Errors}
        FileClose $0
        ${ExitDo}
      ${EndIf}
      ${If} ${Silent}
        ${If} $1 == 0
          Abort
        ${EndIf}
        Sleep 500
        IntOp $1 $1 - 1
      ${ElseIf} ${Cmd} `MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Viezan is still running. Close it, then choose Retry." /SD IDCANCEL IDCANCEL`
        Abort
      ${EndIf}
    ${Loop}
  ${EndIf}
!macroend

Section "Viezan"
  !insertmacro RequireAppClosed
  SetRegView 64
  !insertmacro RemoveLegacyElectron HKCU currentuser
  !insertmacro RemoveLegacyElectron HKLM allusers
  SetRegView lastused
  SetOutPath "$INSTDIR"
  File /r "${APPDIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortcut "$SMPROGRAMS\Viezan.lnk" "$INSTDIR\ViezanNativeQt.exe"
  ; A desktop shortcut left by the Electron app points at a removed file; keep it working.
  ${If} ${FileExists} "$DESKTOP\Viezan.lnk"
    CreateShortcut "$DESKTOP\Viezan.lnk" "$INSTDIR\ViezanNativeQt.exe"
  ${EndIf}
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "DisplayName" "Viezan"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  ; The Electron in-app updater runs this installer silently with --force-run and
  ; expects the app to open again afterwards.
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--force-run" $1
  ${IfNot} ${Errors}
    Exec '"$INSTDIR\ViezanNativeQt.exe"'
  ${EndIf}
SectionEnd
Section "Uninstall"
  Delete "$SMPROGRAMS\Viezan.lnk"
  Delete "$DESKTOP\Viezan.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ViezanNative"
  ; Only the application-owned installation directory. AppLocalData and credentials survive.
  !include "${UNINSTALL_FILES}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
