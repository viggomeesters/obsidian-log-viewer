import assert from "node:assert/strict";
import fs from "node:fs";
import esbuild from "esbuild";

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const { parseLog, parseLogLine } = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));

function readFixture(name) {
  return fs.readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8");
}

const mixed = parseLog(readFixture("mixed.log"));
assert.equal(mixed.lineCount, 8);
assert.equal(mixed.timestampCount, 5);
assert.equal(mixed.structuredCount, 5);
assert.equal(mixed.severityCounts.error, 1);
assert.equal(mixed.severityCounts.warn, 1);
assert.equal(mixed.severityCounts.trace, 1);
assert.equal(mixed.lines[0].timestampKind, "iso");
assert.equal(mixed.lines[1].timestampKind, "datetime");
assert.equal(mixed.lines[2].timestampKind, "life-os");
assert.equal(mixed.lines[5].timestampKind, "epoch");
assert.equal(mixed.lines[6].timestampKind, "iso");
assert.equal(mixed.lines[3].continuation, true);
assert.equal(mixed.lines[7].structured, false);

const plain = parseLog(readFixture("plain.log"));
assert.equal(plain.lineCount, 4);
assert.equal(plain.structuredCount, 0);
assert.ok(plain.warnings.some((warning) => warning.label === "Plain text"));

const stacktrace = parseLog(readFixture("stacktrace.log"));
assert.equal(stacktrace.severityCounts.error, 1);
assert.equal(stacktrace.severityCounts.info, 1);
assert.equal(stacktrace.lines[1].continuation, true);
assert.equal(stacktrace.lines[2].continuation, true);
assert.equal(stacktrace.lines[5].severity, "info");

const epoch = parseLogLine("1717785451123 fatal disk full", 1);
assert.equal(epoch.timestampKind, "epoch");
assert.equal(epoch.severity, "fatal");
assert.equal(epoch.message, "disk full");

const largeLog = Array.from({ length: 10005 }, (_, index) => `2026-06-07T20:57:${String(index % 60).padStart(2, "0")}Z INFO line ${index}`).join("\n");
const large = parseLog(largeLog);
assert.equal(large.renderedLines.length, 10000);
assert.equal(large.skippedLines, 5);
assert.ok(large.warnings.some((warning) => warning.label === "Render cap"));

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("Log parser fixture tests passed.");
