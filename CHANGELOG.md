# Changelog

All notable changes to Log Viewer are documented here.

## 0.1.0 - 2026-06-07

- Initial public release.
- Add read-only `.log` file view.
- Add structured log table with line numbers, timestamp column, severity badges, message column, and raw fallback.
- Add filters for text, severity, and timestamp presence.
- Add raw source view with line numbers and lightweight timestamp, severity, and path highlighting.
- Add timestamp detection for ISO 8601, `YYYY-MM-DD HH:mm:ss`, `YYYYMMDD-HHmm`, and epoch values.
- Add stack trace and multiline continuation handling.
- Add warnings for mostly unstructured text and large-file render caps.
