#!/bin/zsh
# usage: qtnav.sh <button title> <outfile>
S=$(dirname $0)
PID=$(pgrep -f ViezanNativeQt.app/Contents/MacOS | tail -1)
osascript <<OSA >/dev/null
tell application "System Events" to tell (first process whose unix id is $PID)
  -- Qt stops repainting an occluded window, so bring it forward first.
  set frontmost to true
  set els to entire contents of window 1
  repeat with e in els
    try
      if ((role of e) is "AXButton" or (role of e) is "AXCheckBox") and ((title of e) as text) is "$1" then
        perform action "AXPress" of e
        exit repeat
      end if
    end try
  end repeat
end tell
OSA
sleep 1.5
WID=$(swift $S/winpid.swift $PID | awk '{print $1; exit}')
screencapture -x -o -l $WID $2
