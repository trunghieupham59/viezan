@../AGENTS.md

## Claude Code

- Treat `AGENTS.md` as the canonical shared project contract.
- Keep `.claude/settings.local.json` private and untouched unless the user asks
  for a machine-local change.
- After changing these rules, use `/memory` to verify loaded instructions and
  `/status` to verify active settings sources.

## Coding guidelines

These guidelines supplement `AGENTS.md`; project-specific instructions take
precedence. They favor caution over speed, but use judgment for trivial tasks.

### 1. Think before coding

- State assumptions and tradeoffs explicitly. If the request is unclear or has
  multiple interpretations, explain the ambiguity and ask before implementing.
- Point out simpler approaches and push back when warranted.

### 2. Simplicity first

- Write the minimum code that solves the requested problem. Do not add speculative
  features, single-use abstractions, or unrequested flexibility/configurability.
- Avoid error handling for impossible scenarios. Simplify code when the same
  behavior can be expressed clearly with less complexity.

### 3. Surgical changes

- Make every changed line traceable to the request. Match existing style and leave
  unrelated code, comments, formatting, and working implementations alone.
- Remove imports, variables, and functions made unused by your changes. Mention
  pre-existing dead code rather than deleting it unless asked.

### 4. Goal-driven execution

- Define verifiable success criteria before editing. For multi-step work, give a
  brief plan pairing each step with its verification check.
- For validation changes, test invalid inputs and make those tests pass.
- For bug fixes, add a reproducing test and make it pass.
- For refactors, verify tests pass before and after.
- Continue until the success criteria are verified; report checks that could not
  run and why.
