#!/bin/zsh
# usage: macnav.sh <button-index> <outfile>
PID=$(pgrep -f 'Viezan.app/Contents/MacOS/ViezanNative' | head -1)
osascript <<OSA
tell application "System Events" to tell (first process whose unix id is $PID)
  set els to entire contents of window 1
  set bs to {}
  repeat with e in els
    try
      set r to role of e
      if r is "AXButton" then set end of bs to contents of e
    end try
  end repeat
  perform action "AXPress" of (item $1 of bs)
end tell
OSA
sleep 1.2
WID=$(swift $(dirname $0)/winid.swift Viezan | awk '$3!=1200{print $1; exit}')
screencapture -x -o -l $WID $2
