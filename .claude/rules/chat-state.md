---
paths:
  - "apps/macos/Sources/**/*.swift"
  - "apps/desktop-qt/**"
---

# Chat State

- Keep the global sidebar and AI Chat conversation sidebar as separate
  organisms with separate state and layout tokens.
- Empty and active chats use the same single composer surface.
- Never wrap the active composer in an extra border, panel, or darker frame.
- Do not add Clear/Delete to the active conversation canvas.
- Composer controls use the shared medium control size and expose accessible
  names/states.
- Bind provider/model changes to the owning session. Guard async model fetches
  against stale session/provider responses.
- Preserve raw model IDs, retry/loading/error states, and localized labels.
