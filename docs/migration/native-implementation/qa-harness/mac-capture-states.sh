#!/bin/zsh
# usage: mac-capture-states.sh <outdir> [prefix]
# Captures the running preview build (com.viezan.native.preview) in its current
# appearance: five feature routes (each shows its active session) at 1400, 820 and
# 640 pt, plus the History, Activity and command-palette layers at 1400 and 640.
# It changes no data or settings; set the appearance in the app first and restore
# it afterwards. Each shot activates the app: inactive windows draw gray controls.
S=$(dirname $0); OUT=$1; P=${2:-mac}; mkdir -p $OUT
PID=$(pgrep -f 'Viezan.app/Contents/MacOS/ViezanNative' | head -1)
size() { osascript -e "tell application \"System Events\" to tell (first process whose unix id is $PID) to set size of window 1 to {$1, 860}"; sleep 1; }
shot() {
  osascript -e 'tell application id "com.viezan.native.preview" to activate'; sleep 1.2
  WID=$(swift $S/winid.swift Viezan | awk '$3!=1200{print $1; exit}')
  screencapture -x -o -l $WID $OUT/$P-$1.png
}
esc() { osascript -e 'tell application "System Events" to key code 53'; sleep 0.5; }
for w in 1400 820 640; do
  size $w
  for r in home chat translate interpret dictionary; do $S/macpress.sh AXIdentifier nav-$r >/dev/null; sleep 1.5; shot $w-$r; done
  [[ $w == 820 ]] && continue
  $S/macpress.sh AXIdentifier nav-translate >/dev/null; sleep 1
  $S/macpress.sh AXIdentifier history-toggle >/dev/null; sleep 1.2; shot $w-overlay-history; esc
  $S/macpress.sh AXIdentifier activity-toggle >/dev/null; sleep 1.2; shot $w-overlay-activity; esc
  osascript -e 'tell application id "com.viezan.native.preview" to activate' -e 'tell application "System Events" to keystroke "k" using command down'
  sleep 1.2; shot $w-overlay-palette; esc
done
size 1400
