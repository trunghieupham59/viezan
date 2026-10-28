#!/bin/zsh
# usage: mac-capture-all.sh <app-path> <outdir> [prefix]
S=$(dirname $0)
osascript -e 'tell application id "com.viezan.native.preview" to quit' 2>/dev/null; sleep 2
open "$1"; sleep 4
PID=$(pgrep -f 'Viezan.app/Contents/MacOS/ViezanNative' | head -1)
osascript -e "tell application \"System Events\" to tell (first process whose unix id is $PID) to set size of window 1 to {1400, 860}"
mkdir -p $2; i=3
for p in home chat translate interpret dictionary everywhere apps thermal utilities settings; do $S/macnav.sh $i $2/${3:-mac}-$p.png >/dev/null; i=$((i+1)); done
