#!/bin/zsh
# usage: qt-capture-states.sh <outdir> [prefix]
# Qt counterpart of mac-capture-states.sh for the running ViezanNativeQt: five
# feature routes at 1400/820/640 and History, Activity and command palette at 1400
# and 640. Vietnamese UI titles; changes no data or settings.
S=$(dirname $0); OUT=$1; P=${2:-qt}; mkdir -p $OUT
PID=$(pgrep -f ViezanNativeQt.app/Contents/MacOS | tail -1)
size() { osascript -e "tell application \"System Events\" to tell (first process whose unix id is $PID) to set size of window 1 to {$1, 860}"; sleep 1; }
esc() { osascript -e 'tell application "System Events" to key code 53'; sleep 0.5; }
for w in 1400 820 640; do
  size $w
  for r in "Trang chủ:home" "AI Chat:chat" "Dịch:translate" "Phiên dịch:interpret" "Từ điển:dictionary"; do
    $S/qtnav.sh "${r%%:*}" $OUT/$P-$w-${r##*:}.png
  done
  [[ $w == 820 ]] && continue
  $S/qtnav.sh "Dịch" /dev/null 2>/dev/null
  $S/qtnav.sh "Lịch sử" $OUT/$P-$w-overlay-history.png; esc
  $S/qtnav.sh "Hoạt động" $OUT/$P-$w-overlay-activity.png; esc
  $S/qtnav.sh "Tìm kiếm mọi thứ" $OUT/$P-$w-overlay-palette.png; esc
done
size 1400
