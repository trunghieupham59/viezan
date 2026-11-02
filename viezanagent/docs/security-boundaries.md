# Runtime Security Boundaries

This note documents the runtime checks that protect the Electron main process from renderer-controlled input.

## External URL Policy

All renderer-triggered external navigation must go through `isAllowedExternalUrl()` in `electron/ipc/externalUrl.ts`.

Current policy:
- Only HTTPS URLs are allowed for browser navigation.
- Provider/account links are limited to the explicit host allowlist in `ALLOWED_HTTPS_HOSTS`.
- GitHub is limited to the Viezan releases path: `/trunghieupham59/viezan/releases` and its child paths.
- The macOS `x-apple.systempreferences:` scheme is limited to the Screen Recording privacy deep-link used by Live Translate.

Do not call `shell.openExternal()` directly from a new IPC handler or window-open path. Add a named URL to the allowlist only when the product has a concrete navigation requirement.

## IPC Payload Validation

Renderer-controlled IPC payloads should be validated before destructuring, provider routing, file access, or SDK calls.

Shared validation helpers live in `electron/ipc/ipcValidation.ts`. Larger handlers should keep domain-specific parsing in a sibling validation module, for example:
- `electron/ipc/chatValidation.ts`
- `electron/ipc/translateValidation.ts`

Expected behavior for invalid input:
- Return `{ success: false, errorCode: 'INVALID_INPUT', error: string }` for malformed payloads.
- Return provider-specific unknown-provider errors only after the provider field has been parsed as a non-empty string.
- Keep length, MIME type, language-code, and enum checks close to the handler that owns the domain.

## Local-First Key Boundary

API keys stay in the Electron main process and OS keychain. Renderer-facing key status APIs should return masked values or status metadata only; raw stored keys must not be sent back to the renderer.

## Test Checklist

When changing these boundaries, add or update focused tests for:
- Allowed and blocked external URLs.
- Representative invalid IPC payloads.
- Any new enum, MIME type, language-code, or length checks.
- Any handler that introduces a new `shell.openExternal()` path.
