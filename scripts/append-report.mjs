// Applies one daily content-check bookkeeping update to UPDATE-LOG.md and
// content-check-state.json.
//
// Usage: node scripts/append-report.mjs <payload.json>
//
// payload = {
//   "table_row": "| 2026-11-14 | १५० | ... | ८५ |",   // inserted after the last dated table row
//   "report_md": "## १४ नोव्हेंबर २०२६ — ...",          // appended to UPDATE-LOG.md
//   "header_total": "१,१३४",                            // optional: new article count in the log header
//   "state": { ...scalars to set on content-check-state.json...,
//              "run": { ...one entry pushed into state.runs... } }
// }
import fs from "node:fs";

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("usage: node scripts/append-report.mjs <payload.json>");
  process.exit(1);
}
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

// ---- UPDATE-LOG.md -------------------------------------------------------
const logPath = "UPDATE-LOG.md";
let log = fs.readFileSync(logPath, "utf8");

if (payload.header_total) {
  log = log.replace(/एकूण लेख: \*\*[^*]+\*\*/, `एकूण लेख: **${payload.header_total}**`);
}

if (payload.table_row) {
  const lines = log.split("\n");
  let lastRow = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\| 20\d\d-\d\d-\d\d \|/.test(lines[i])) lastRow = i;
  }
  if (lastRow === -1) {
    console.error("could not find the daily summary table");
    process.exit(1);
  }
  if (!lines.includes(payload.table_row.trim())) {
    lines.splice(lastRow + 1, 0, payload.table_row.trim());
  }
  log = lines.join("\n");
}

if (payload.report_md) {
  log = log.replace(/\s*$/, "\n") + "\n" + payload.report_md.trim() + "\n";
}

fs.writeFileSync(logPath, log);

// ---- content-check-state.json -------------------------------------------
const statePath = "content-check-state.json";
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const patch = payload.state || {};
const run = patch.run;
const scalars = { ...patch };
delete scalars.run;

for (const [k, v] of Object.entries(scalars)) state[k] = v;

if (run) {
  state.runs = Array.isArray(state.runs) ? state.runs : [];
  const already = state.runs.some(
    (r) => r.date === run.date && r.next_index === run.next_index && (r.checked === run.checked || r.reviewed_files),
  );
  if (!already) state.runs.push(run);
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log(
  JSON.stringify({
    log_bytes: fs.statSync(logPath).size,
    runs: state.runs.length,
    next_index: state.next_index,
    next_file: state.next_file,
    cycle: state.cycle,
  }),
);
