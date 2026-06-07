import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const parser = fs.readFileSync("src/parser.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

const assertions = [
  [manifest.id === "log-viewer", "manifest id is log-viewer"],
  [manifest.version === "0.1.0", "manifest version is 0.1.0"],
  [main.includes("registerExtensions(LOG_EXTENSIONS"), "extensions are registered"],
  [main.includes("const LOG_EXTENSIONS = [\"log\"]"), "log extension is registered"],
  [main.includes("type ViewMode = \"log\" | \"source\""), "log/source mode exists"],
  [main.includes("severityFilter"), "severity filter exists"],
  [main.includes("timestampFilter"), "timestamp filter exists"],
  [main.includes("renderLog(container, parsed"), "structured log view code path exists"],
  [main.includes("renderSource(container, parsed.renderedLines)"), "raw source view code path exists"],
  [parser.includes("RENDER_LINE_LIMIT = 10000"), "render cap exists"],
  [parser.includes("parseLogLine"), "line parser exists"],
  [parser.includes("TIMESTAMP_PATTERNS"), "timestamp detection exists"],
  [!main.includes("navigator.clipboard") && !parser.includes("navigator.clipboard"), "no clipboard access"],
  [!main.includes("fetch(") && !parser.includes("fetch("), "no fetch usage"],
  [!styles.includes("!important"), "styles do not use important overrides"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("Log Viewer smoke checks passed.");
