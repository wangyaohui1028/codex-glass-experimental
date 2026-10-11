---
name: codex-glass
description: Preview, export, test or restore the experimental Codex Glass theme in this package. Use when the user names this extension. Installing it does not make the host transparent; desktop glass remains unverified until the user tests the actual native window.
---

# Codex Glass experimental workflow

Read the package README before an initial setup. Resolve the package root two directories above this skill.

- `node bin/codex-glass.mjs preview` serves the isolated fixture on loopback.
- `node bin/codex-glass.mjs export` creates manual apply/restore scripts without contacting an app.
- `npm test` exercises isolated behavior. `bash demo/build-native.sh` builds a separate macOS material test window.
- The optional CDP adapter requires an explicitly user-opened local developer session and a selected target. Explain that this exposes page control. It never starts or restarts the app.

Respect host tool restrictions: if an agent cannot control Codex itself, do not attach to it through CDP, inspect its runtime, inject styles, patch files or switch tools to work around that restriction. In that environment, complete export/fixture tests and leave real-host activation and observation to the user.

Keep `desktopGlass: unverified` separate from successful CSS application. An isolated native fixture does not verify the official client's appearance. Do not claim full-window transparency from a low-alpha style alone. If the user wants a different client, ask first rather than substituting one.

Rollback removes this extension's style and root marker only. A page reload removes all current-page styling. No persistent startup script or background watcher is part of this version.

For GitHub publication, include source, tests and the explicit experimental status. Exclude downloaded vendor software, local browser/CDP data, credentials, screenshots of private chats and machine-specific files.
