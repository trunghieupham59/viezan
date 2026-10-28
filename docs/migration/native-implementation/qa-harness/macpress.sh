#!/bin/zsh
# usage: macpress.sh <attribute> <value>   (AXHelp | AXTitle | AXIdentifier)
PID=$(pgrep -f 'Viezan.app/Contents/MacOS/ViezanNative' | head -1)
osascript <<OSA
tell application "System Events" to tell (first process whose unix id is $PID)
  set els to entire contents of window 1
  repeat with e in els
    try
      if (role of e) is in {"AXButton", "AXRadioButton", "AXCheckBox"} then
        if ((value of attribute "$1" of e) as text) is "$2" then
          perform action "AXPress" of e
          return "pressed"
        end if
      end if
    end try
  end repeat
  return "not found"
end tell
OSA
