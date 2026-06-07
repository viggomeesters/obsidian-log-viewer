# Security Policy

## Supported versions

Only the latest release is actively supported.

## Reporting a vulnerability

Please report security issues privately by emailing the maintainer or opening a minimal GitHub security advisory if available.

Do not include sensitive vault content in public issues. If a reproduction requires log content, reduce it to a minimal synthetic example first.

## Security posture

Log Viewer is read-only. It reads `.log` files through the vault API and renders a local view. It does not send vault content to external services, does not use runtime network APIs, does not read or write the system clipboard, and does not write log files back to disk.

The log parser is local TypeScript code bundled into `main.js` at build time. It does not execute log contents.
