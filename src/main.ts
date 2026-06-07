import {
  Notice,
  Plugin,
  TFile,
  TextFileView,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { ParsedLog, ParsedLogLine, Severity, WarningItem, parseLog } from "./parser";

const VIEW_TYPE_LOG_VIEWER = "log-viewer";
const LOG_EXTENSIONS = ["log"];
const SEVERITY_OPTIONS: Array<Severity | "all"> = [
  "all",
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "unknown",
];

type ViewMode = "log" | "source";
type TimestampFilter = "all" | "with-timestamp" | "without-timestamp";

export default class LogViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE_LOG_VIEWER, (leaf) => new LogViewerView(leaf));
    this.registerExtensions(LOG_EXTENSIONS, VIEW_TYPE_LOG_VIEWER);

    this.addCommand({
      id: "open-current-log-in-viewer",
      name: "Open current log file in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isLogFile(file)) return false;

        if (!checking) {
          void this.openLogFile(file);
        }
        return true;
      },
    });
  }

  async openLogFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_LOG_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class LogViewerView extends TextFileView {
  private mode: ViewMode = "log";
  private filterValue = "";
  private severityFilter: Severity | "all" = "all";
  private timestampFilter: TimestampFilter = "all";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LOG_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Log viewer";
  }

  getIcon(): string {
    return "scroll-text";
  }

  setViewData(data: string): void {
    this.data = data;
    this.render();
  }

  getViewData(): string {
    return this.data;
  }

  clear(): void {
    this.data = "";
    this.contentEl.empty();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("log-viewer");

    const header = container.createDiv({ cls: "log-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No log file is attached to this viewer.");
      return;
    }

    if (!isLogFile(this.file)) {
      renderMessage(container, "This viewer only supports .log files.");
      return;
    }

    const parsed = parseLog(this.data);
    renderSummary(container, parsed);
    renderWarnings(container, parsed.warnings);

    if (!this.data.trim()) {
      renderMessage(container, "This log file is empty.");
      return;
    }

    if (this.mode === "source") {
      renderSource(container, parsed.renderedLines);
      return;
    }

    renderLog(container, parsed, {
      query: this.filterValue,
      severity: this.severityFilter,
      timestamp: this.timestampFilter,
    });
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "log-viewer__title" });
    title.createDiv({
      cls: "log-viewer__filename",
      text: this.file?.name ?? "Log file",
    });
    title.createDiv({
      cls: "log-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "log-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "log-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "log-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Filter log lines",
        placeholder: "Filter",
        spellcheck: "false",
        type: "search",
        value: this.filterValue,
      },
    });
    searchInput.addEventListener("input", () => {
      this.filterValue = searchInput.value;
      this.render();
    });

    const severitySelect = toolbar.createEl("select", {
      cls: "log-viewer__select",
      attr: { "aria-label": "Severity filter" },
    });
    SEVERITY_OPTIONS.forEach((severity) => {
      severitySelect.createEl("option", {
        text: severity === "all" ? "All levels" : severity.toUpperCase(),
        value: severity,
      });
    });
    severitySelect.value = this.severityFilter;
    severitySelect.addEventListener("change", () => {
      this.severityFilter = severitySelect.value as Severity | "all";
      this.render();
    });

    const timestampSelect = toolbar.createEl("select", {
      cls: "log-viewer__select",
      attr: { "aria-label": "Timestamp filter" },
    });
    [
      ["all", "All timestamps"],
      ["with-timestamp", "Has timestamp"],
      ["without-timestamp", "No timestamp"],
    ].forEach(([value, label]) => {
      timestampSelect.createEl("option", { text: label, value });
    });
    timestampSelect.value = this.timestampFilter;
    timestampSelect.addEventListener("change", () => {
      this.timestampFilter = timestampSelect.value as TimestampFilter;
      this.render();
    });

    const modeGroup = toolbar.createDiv({
      cls: "log-viewer__segmented",
      attr: { "aria-label": "View mode" },
    });
    const logButton = createTextButton(modeGroup, "Log");
    const sourceButton = createTextButton(modeGroup, "Raw");
    logButton.toggleClass("is-active", this.mode === "log");
    sourceButton.toggleClass("is-active", this.mode === "source");

    logButton.addEventListener("click", () => {
      this.mode = "log";
      this.render();
    });
    sourceButton.addEventListener("click", () => {
      this.mode = "source";
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh file");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No log file to refresh");
      return;
    }

    try {
      this.data = await this.app.vault.read(this.file);
      this.render();
    } catch (error) {
      this.contentEl.empty();
      this.contentEl.addClass("log-viewer");
      renderMessage(this.contentEl, `Unable to read log file: ${getErrorMessage(error)}`);
    }
  }
}

function renderSummary(parent: HTMLElement, parsed: ParsedLog): void {
  const summary = parent.createDiv({ cls: "log-viewer__summary" });
  summary.createSpan({ cls: "log-viewer__pill", text: `${parsed.lineCount} lines` });
  summary.createSpan({ cls: "log-viewer__pill", text: `${parsed.timestampCount} timestamped` });
  summary.createSpan({ cls: "log-viewer__pill", text: `${parsed.structuredCount} structured` });
  renderSeverityPill(summary, "fatal", parsed.severityCounts.fatal);
  renderSeverityPill(summary, "error", parsed.severityCounts.error);
  renderSeverityPill(summary, "warn", parsed.severityCounts.warn);
  if (parsed.skippedLines > 0) {
    summary.createSpan({
      cls: "log-viewer__note",
      text: `${parsed.renderedLines.length} lines rendered`,
    });
  }
}

function renderSeverityPill(parent: HTMLElement, severity: Severity, count: number): void {
  if (count === 0) return;
  parent.createSpan({
    cls: `log-viewer__pill log-viewer__pill--${severity}`,
    text: `${count} ${severity}`,
  });
}

function renderWarnings(parent: HTMLElement, warnings: WarningItem[]): void {
  if (warnings.length === 0) return;

  const box = parent.createDiv({ cls: "log-viewer__warnings" });
  box.createDiv({ cls: "log-viewer__warnings-title", text: "Log warnings" });
  warnings.slice(0, 12).forEach((warning) => {
    box.createDiv({
      cls: "log-viewer__warning",
      text: `${warning.label}: ${warning.message}`,
    });
  });
  if (warnings.length > 12) {
    box.createDiv({
      cls: "log-viewer__warning-more",
      text: `${warnings.length - 12} additional warnings hidden`,
    });
  }
}

function renderLog(
  parent: HTMLElement,
  parsed: ParsedLog,
  filters: { query: string; severity: Severity | "all"; timestamp: TimestampFilter },
): void {
  const lines = filterLines(parsed.renderedLines, filters);

  if (lines.length === 0) {
    renderMessage(parent, "No log lines match the current filters.");
    return;
  }

  const wrap = parent.createDiv({ cls: "log-viewer__table-wrap" });
  const table = wrap.createEl("table", { cls: "log-viewer__table" });
  const head = table.createEl("thead");
  const headRow = head.createEl("tr");
  headRow.createEl("th", { cls: "log-viewer__line-heading", text: "#" });
  headRow.createEl("th", { text: "Timestamp" });
  headRow.createEl("th", { text: "Level" });
  headRow.createEl("th", { text: "Message" });

  const body = table.createEl("tbody");
  lines.forEach((line) => {
    const tr = body.createEl("tr");
    tr.toggleClass("is-continuation", line.continuation);
    tr.toggleClass("is-unstructured", !line.structured);
    tr.createEl("th", {
      cls: "log-viewer__line-number",
      text: String(line.lineNumber),
    });
    tr.createEl("td", {
      cls: "log-viewer__timestamp",
      text: line.timestamp ?? "",
    });
    const levelCell = tr.createEl("td", { cls: "log-viewer__level" });
    levelCell.createSpan({
      cls: `log-viewer__severity log-viewer__severity--${line.severity}`,
      text: line.continuation ? "cont" : line.severity,
    });
    tr.createEl("td", {
      cls: "log-viewer__message-cell",
      text: line.message || line.raw,
    });
  });
}

function filterLines(
  lines: ParsedLogLine[],
  filters: { query: string; severity: Severity | "all"; timestamp: TimestampFilter },
): ParsedLogLine[] {
  const query = filters.query.trim().toLowerCase();
  return lines.filter((line) => {
    if (filters.severity !== "all" && line.severity !== filters.severity) return false;
    if (filters.timestamp === "with-timestamp" && line.timestamp === null) return false;
    if (filters.timestamp === "without-timestamp" && line.timestamp !== null) return false;
    if (!query) return true;
    return line.raw.toLowerCase().includes(query);
  });
}

function renderSource(parent: HTMLElement, lines: ParsedLogLine[]): void {
  const source = parent.createDiv({ cls: "log-viewer__source" });
  const pre = source.createEl("pre");
  lines.forEach((line) => {
    const lineEl = pre.createDiv({ cls: "log-viewer__source-line" });
    lineEl.createSpan({ cls: "log-viewer__line-number", text: String(line.lineNumber) });
    const code = lineEl.createSpan({ cls: "log-viewer__source-code" });
    highlightLogLine(code, line);
  });
}

function highlightLogLine(parent: HTMLElement, line: ParsedLogLine): void {
  if (!line.raw) return;

  let cursor = 0;
  if (line.timestamp) {
    const start = line.raw.indexOf(line.timestamp);
    appendText(parent, line.raw.slice(cursor, start));
    parent.createSpan({ cls: "log-viewer__tok-timestamp", text: line.timestamp });
    cursor = start + line.timestamp.length;
  }

  const severityMatch = line.severity !== "unknown"
    ? new RegExp(`\\b(${severityPattern(line.severity)})\\b`, "i").exec(line.raw.slice(cursor))
    : null;

  if (severityMatch) {
    const start = cursor + severityMatch.index;
    appendText(parent, line.raw.slice(cursor, start));
    parent.createSpan({
      cls: `log-viewer__tok-severity log-viewer__tok-severity--${line.severity}`,
      text: severityMatch[1],
    });
    cursor = start + severityMatch[1].length;
  }

  highlightPaths(parent, line.raw.slice(cursor));
}

function severityPattern(severity: Severity): string {
  if (severity === "error") return "ERROR|ERR";
  if (severity === "warn") return "WARN|WARNING";
  return severity.toUpperCase();
}

function highlightPaths(parent: HTMLElement, text: string): void {
  const pathPattern = /((?:\/|\.\/|\.\.\/)[^\s:]+|\b[\w.-]+\.(?:log|jsonl?|ya?ml|py|ts|js|md)\b)/g;
  let cursor = 0;
  for (const match of text.matchAll(pathPattern)) {
    const index = match.index ?? 0;
    appendText(parent, text.slice(cursor, index));
    parent.createSpan({ cls: "log-viewer__tok-path", text: match[0] });
    cursor = index + match[0].length;
  }
  appendText(parent, text.slice(cursor));
}

function appendText(parent: HTMLElement, text: string): void {
  if (text) parent.appendText(text);
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon log-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function createTextButton(parent: HTMLElement, label: string): HTMLButtonElement {
  return parent.createEl("button", {
    cls: "log-viewer__text-button",
    text: label,
    attr: { type: "button" },
  });
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "log-viewer__message", text: message });
}

function isLogFile(file: TFile | null): file is TFile {
  return Boolean(file && LOG_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
