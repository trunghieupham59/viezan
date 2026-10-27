# Review 04 — revision after user rejection

Status: Review 03 rejected by the user. Review 04 is a new proposal, not accepted.
Production app remains unchanged. Source coverage still references develop 5f2c2a6.

## Current-run evidence and changes

1. Home before: `09-rejected-home.png`. Large feature tiles repeat primary navigation, pushing unfinished work down. After: `11-review04-home.png`. Running work and a filterable recent list precede compact start actions; one Create action opens the chooser. Model information is secondary. At shorter heights lower content scrolls inside the workspace.
2. Chat before: `10-rejected-chat.png`. The review toolbar consumes vertical room; no visible new-chat action at this width. After: `13-review04-chat.png`. Review tools collapse into a menu, New Chat and History stay in the feature header, the composer remains a single surface. Open-work navigation is independent of primary navigation.
3. Translation after: `12-review04-translate.png`. One two-column editing region, clear source/result distinction, a document title instead of a promotional headline. Chat → translation → Chat was exercised and the typed draft remained.
4. Platform checks: `14-review04-windows-dark.png`, `15-review04-linux640.png`. Browser styling only; no claim of native OS verification. A compact-layout regression hid the work-strip text through a generic nav selector; fixed and recaptured with labels visible.

## Verification

- Home All/Chat filtering: observed correct reduced list and restored list.
- Work-strip navigation and Chat draft preservation: observed.
- Create chooser: opened and targets inspected.
- macOS light, Windows dark, Linux 640-wide shell: screenshots inspected.
- JS syntax, check:atomic, check:design, check:docs: passed. Those scripts do not certify prototype behavior.
- New CSS references existing token values; no new color, spacing or type literals.
- Runtime/native materials, OS controls, persistence, complete keyboard/IME/screen-reader coverage, EN/JA and every feature at every width: NOT RUN.
- No product build: only isolated HTML/CSS/JS review artifacts changed. Product README remains accurate; no shipped feature changed.

## Review scope and limitations

This revision concentrates on shell, Home, Chat and Translation. Other feature screens inherit the shell and surface changes but have not received a full redesign in this revision. Work-strip entries are fixed demo sessions, not a general tab manager. The completion/reset and application-removal fixtures remain under Tools → New on develop. Do not interpret placeholder AI progress or browser materials as runtime proof. Accessibility risks include unverified focus restoration in older dialogs and inherited multi-session fixtures; full screen-reader acceptance remains pending.
