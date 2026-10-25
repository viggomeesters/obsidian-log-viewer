const RENDER_LINE_LIMIT = 10000;

export type Severity = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "unknown";
export type TimestampKind = "iso" | "datetime" | "life-os" | "epoch";

export interface WarningItem {
  label: string;
  message: string;
}

export interface ParsedLogLine {
  lineNumber: number;
  raw: string;
  timestamp: string | null;
  timestampKind: TimestampKind | null;
  severity: Severity;
  message: string;
  structured: boolean;
  continuation: boolean;
}

export interface ParsedLog {
  lines: ParsedLogLine[];
  renderedLines: ParsedLogLine[];
  lineCount: number;
  skippedLines: number;
  structuredCount: number;
  timestampCount: number;
  severityCounts: Record<Severity, number>;
  warnings: WarningItem[];
}

interface TimestampMatch {
  value: string;
  kind: TimestampKind;
  start: number;
  end: number;
}

interface SeverityMatch {
  value: Severity;
  raw: string;
  start: number;
  end: number;
}

const SEVERITIES: Severity[] = ["fatal", "error", "warn", "info", "debug", "trace", "unknown"];

const TIMESTAMP_PATTERNS: Array<{ kind: TimestampKind; pattern: RegExp }> = [
  {
    kind: "iso",
    pattern: /^\s*(?:\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?))/,
  },
  {
    kind: "datetime",
    pattern: /^\s*(?:\[(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)\]|(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?))/,
  },
  {
    kind: "life-os",
    pattern: /^\s*(?:\[(\d{8}-\d{4})\]|(\d{8}-\d{4}))/,
  },
  {
    kind: "epoch",
    pattern: /^\s*(?:\[(\d{10}(?:\.\d{1,6})?|\d{13})\]|(\d{10}(?:\.\d{1,6})?|\d{13}))(?=\D|$)/,
  },
];

export function parseLog(data: string): ParsedLog {
  const rawLines = splitLogLines(data);
  const lines: ParsedLogLine[] = [];
  let previousStructured = false;

  rawLines.forEach((raw, index) => {
    const line = parseLogLine(raw, index + 1, previousStructured);
    lines.push(line);
    previousStructured = line.structured || line.continuation;
  });

  const renderedLines = lines.slice(0, RENDER_LINE_LIMIT);
  const skippedLines = Math.max(0, lines.length - renderedLines.length);
  const severityCounts = createSeverityCounts(lines);
  const structuredCount = lines.filter((line) => line.structured).length;
  const timestampCount = lines.filter((line) => line.timestamp !== null).length;
  const warnings = warningsFor(lines, skippedLines);

  return {
    lines,
    renderedLines,
    lineCount: lines.length,
    skippedLines,
    structuredCount,
    timestampCount,
    severityCounts,
    warnings,
  };
}

export function parseLogLine(
  raw: string,
  lineNumber: number,
  previousStructured = false,
): ParsedLogLine {
  const timestamp = detectTimestamp(raw);
  const afterTimestamp = timestamp ? raw.slice(timestamp.end) : raw;
  const severity = detectSeverity(afterTimestamp, timestamp ? timestamp.end : 0);
  const message = extractMessage(raw, timestamp, severity);
  const structured = timestamp !== null || severity !== null;
  const continuation = !structured && previousStructured && isContinuationLine(raw);

  return {
    lineNumber,
    raw,
    timestamp: timestamp?.value ?? null,
    timestampKind: timestamp?.kind ?? null,
    severity: severity?.value ?? "unknown",
    message,
    structured,
    continuation,
  };
}

function splitLogLines(data: string): string[] {
  if (data.length === 0) return [];
  const lines = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "" && data.endsWith("\n")) {
    lines.pop();
  }
  return lines;
}

function detectTimestamp(raw: string): TimestampMatch | null {
  for (const { kind, pattern } of TIMESTAMP_PATTERNS) {
    const match = pattern.exec(raw);
    const value = match?.[1] ?? match?.[2];
    if (!match || !value) continue;

    const start = match[0].indexOf(value);
    return {
      value,
      kind,
      start,
      end: start + value.length + closingWrapperLength(match[0], start + value.length),
    };
  }
  return null;
}

function closingWrapperLength(matchText: string, valueEnd: number): number {
  return matchText[valueEnd] === "]" ? 1 : 0;
}

function detectSeverity(text: string, offset: number): SeverityMatch | null {
  const match = /(?:^|[\s:[({<-])((?:FATAL|ERROR|ERR|WARNING|WARN|INFO|DEBUG|TRACE))(?:[\])}:>\s-]|$)/i.exec(text);
  if (!match || match.index > 16) return null;

  const raw = match[1];
  const normalized = normalizeSeverity(raw);
  const start = offset + match.index + match[0].indexOf(raw);
  return {
    value: normalized,
    raw,
    start,
    end: start + raw.length,
  };
}

function normalizeSeverity(value: string): Severity {
  const normalized = value.toLowerCase();
  if (normalized === "err") return "error";
  if (normalized === "warning") return "warn";
  if (SEVERITIES.includes(normalized as Severity)) return normalized as Severity;
  return "unknown";
}

function extractMessage(
  raw: string,
  timestamp: TimestampMatch | null,
  severity: SeverityMatch | null,
): string {
  let start = 0;
  if (timestamp) start = Math.max(start, timestamp.end);
  if (severity) start = Math.max(start, severity.end);
  return raw.slice(start).replace(/^[\s:[\](){},;|<-]+/, "").trimEnd();
}

function isContinuationLine(raw: string): boolean {
  if (raw.trim() === "") return true;
  if (/^\s+/.test(raw)) return true;
  if (/^(at\s+|File\s+"|Traceback\b|\.\.\.|Caused by:|During handling of)/.test(raw)) return true;
  return false;
}

function createSeverityCounts(lines: ParsedLogLine[]): Record<Severity, number> {
  return SEVERITIES.reduce(
    (counts, severity) => {
      counts[severity] = lines.filter((line) => line.severity === severity).length;
      return counts;
    },
    {} as Record<Severity, number>,
  );
}

function warningsFor(lines: ParsedLogLine[], skippedLines: number): WarningItem[] {
  const warnings: WarningItem[] = [];
  const unstructured = lines.filter((line) => !line.structured && !line.continuation).length;

  if (skippedLines > 0) {
    warnings.push({
      label: "Render cap",
      message: `${skippedLines} lines are not rendered to keep the view responsive.`,
    });
  }

  if (lines.length > 0 && unstructured / lines.length > 0.75) {
    warnings.push({
      label: "Plain text",
      message: "Most lines do not contain a recognizable timestamp or severity. Raw view remains available.",
    });
  }

  return warnings;
}
