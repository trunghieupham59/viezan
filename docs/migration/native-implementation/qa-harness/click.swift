import CoreGraphics
import Foundation
let x = Double(CommandLine.arguments[1])!, y = Double(CommandLine.arguments[2])!
let p = CGPoint(x: x, y: y)
for type in [CGEventType.mouseMoved, .leftMouseDown, .leftMouseUp] {
  CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left)?.post(tap: .cghidEventTap)
  usleep(80000)
}
