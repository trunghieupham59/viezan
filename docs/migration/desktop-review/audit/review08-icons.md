# Review 08 — feature icons

Design: consistent Lucide outline family, round caps/joins and distinct feature
silhouettes. Labels and selected backgrounds remain the primary state cues;
SVGs are decorative aria-hidden with unfocusable nodes. Collapsed navigation
retains existing accessible names and title tooltips.

Prototype: local SVG assets plus feature-icons.js; semantic mappings applied
through feature-icons-review.js. No production changes. Settings and home reuse
the same symbol family. macOS chrome material remains unchanged.

Checks: node --check on both scripts; check:atomic and check:design PASS.
Visual evidence: 29-feature-icons-macos.png, 30-feature-icons-rail.png,
31-feature-icons-settings-dark.png, 32-feature-icons-windows.png,
33-feature-icons-linux.png. Fixed an initial overbroad selector that replaced
trailing arrows in interpretation recent rows; final selector only targets
feature symbols.

Native runtime: NOT RUN. User acceptance: PENDING.
