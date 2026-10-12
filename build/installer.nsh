; Custom NSIS hooks for the Viezan Windows installer.
; electron-builder picks this file up automatically from the build resources
; directory (build/). The stock template already: stops a running Viezan (also
; when it is parked in the tray), silently runs the previous version's
; uninstaller, reuses the previous install directory and keeps user data.
; The hooks below close the remaining gaps around that flow.

; Keep every upgrade in the scope of the existing installation.
;
; Without this the wizard shows a "who is this for" page on every run, so a user
; who installed per-user can pick "all users" (or the reverse) on the next
; version. The stock uninstall-old-version step only follows the chosen scope,
; so the old copy survives and Viezan ends up installed twice.
;
; - An all-users install exists  -> stay all-users (that path also removes a
;   stray per-user copy).
; - Otherwise                    -> per-user, which needs no elevation and keeps
;   silent auto-updates free of UAC prompts.
; An explicit /allusers or /currentuser command-line switch still wins.
!macro customInstallMode
  ${if} $hasPerMachineInstallation == "1"
    StrCpy $isForceMachineInstall "1"
  ${else}
    StrCpy $isForceCurrentInstall "1"
  ${endif}
!macroend

; Never let a broken previous install block the new one.
;
; By default a non-zero exit code from the old uninstaller aborts the whole
; installation with "Failed to uninstall old application files". A stale
; registry entry, a half-removed install or an antivirus hiccup would then make
; it impossible to ever upgrade. Install over the existing files instead; the
; installer overwrites the app files and rewrites the registry entries itself.
!macro customUnInstallCheck
  ${if} ${Errors}
    DetailPrint "The previous Viezan uninstaller could not be started; installing over the existing files."
  ${elseIf} $R0 != 0
    DetailPrint "The previous Viezan uninstaller exited with code $R0; installing over the existing files."
  ${endIf}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

; Ask a running Viezan to quit by itself before the stock stop-the-app logic.
;
; Viezan hides in the tray when its window is closed, so the stock graceful
; `taskkill` never ends it and it is force-killed a second later, skipping the
; app's own shutdown cleanup. `Viezan.exe --quit` reaches the running instance
; through its single-instance lock and makes it exit normally. Whatever is still
; running afterwards (older builds that do not know the flag, other users'
; sessions) is handled by the stock logic, so this can only make things better.
; Skipped for in-app updates: the app is already quitting itself there.
;
; Defining customCheckAppRunning replaces the whole stock check, so the pieces
; the stock macro relies on ($pid, GetProcessInfo) are provided here and the
; stock check is re-inserted at the end.
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE

  ${ifNot} ${isUpdated}
  ${andIf} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      DetailPrint "Asking ${PRODUCT_NAME} to quit..."
      nsExec::Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --quit'
      Pop $R0
      StrCpy $R1 0
      ${do}
        Sleep 500
        IntOp $R1 $R1 + 1
        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 != 0
          ${break}
        ${endIf}
      ${loopWhile} $R1 < 12
    ${endIf}
  ${endIf}

  !insertmacro _CHECK_APP_RUNNING
!macroend
