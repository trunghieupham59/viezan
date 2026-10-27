# Review 05 — session continuity

User acceptance: pending. This is an isolated design prototype increment, not a native runtime implementation.

## Current-run findings and changes

1. Before: `16-review05-history-before.png`. Chat history was a modal mixing Chat, translation and interpretation. Entries only navigated to a feature. Creating a new chat replaced the one demo state.
2. After: `17-review05-history.png`. Chat history is a contextual panel with search and current-session indication. At desktop widths it occupies its own column; compact preview uses a dismissible overlay. Header actions remain visible when the column narrows. Primary navigation stays independent.
3. Open work now has individual Chat identities and close controls. Closing a Chat tab removes it only from open work; it can be reopened from history with its draft, model and messages. Home's launch-plan entry and Activity's Chat entry target the launch session instead of the current arbitrary chat.
4. Empty chats contain starter actions that append to, rather than overwrite, an existing draft. Review controls and history support Escape. Screenshot `18-review05-windows640.png` records compact dark appearance.

## Browser verification

- Created sessions A/B, typed different drafts, switched back to A: A retained its draft.
- Closed B, searched Chat history, reopened B: B retained its draft.
- Selected gemma3 for B then switched to A: A still used qwen3.
- Stopped the launch Chat task: task count changed from 2 to 1 while Product brief remained running.
- Escape from history: panel closed and focus returned to History.
- macOS desktop panel and Windows 640 dark overlay captured and inspected. Actual OS execution NOT RUN.
- JS syntax, Atomic and design checks passed. Production checks do not certify prototype interactions.

## Limits

Session data lives only in browser memory and resets on reload. Translate remains one document fixture; this is not a general multi-document editor. Actual AI streaming, persistence, native materials, screen-reader/IME coverage and all EN/JA variants remain NOT RUN. Other feature pages retain prior design coverage. Product source and shipped behavior are unchanged; no application build needed for isolated prototype changes.
