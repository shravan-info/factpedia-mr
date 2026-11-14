// Refreshes the footer line "*शेवटचे संपादन: <date>*" on a slice of content/*.md.
// Usage: node scripts/refresh-footer.mjs <start_index> <count> "<marathi date>"
// The slice walks the alphabetically sorted content/*.md list and wraps around
// the end, so a 150-article daily batch can straddle two cycles.
import fs from "node:fs";
import path from "node:path";

const [startArg, countArg, ...dateParts] = process.argv.slice(2);
const start = Number.parseInt(startArg, 10);
const count = Number.parseInt(countArg, 10);
const dateStr = dateParts.join(" ").trim();

if (!Number.isInteger(start) || !Number.isInteger(count) || count <= 0 || !dateStr) {
  console.error('usage: node scripts/refresh-footer.mjs <start_index> <count> "<marathi date>"');
  process.exit(1);
}

const dir = "content";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
const line = `*शेवटचे संपादन: ${dateStr}*`;
const re = /^\*शेवटचे संपादन:.*\*[ \t]*$/m;

let updated = 0;
let unchanged = 0;
let missing = 0;
const touched = [];

for (let i = 0; i < count; i++) {
  const name = files[(start + i) % files.length];
  const p = path.join(dir, name);
  const text = fs.readFileSync(p, "utf8");
  if (!re.test(text)) {
    missing++;
    console.log(`MISSING-FOOTER ${name}`);
    continue;
  }
  const next = text.replace(re, line);
  if (next === text) {
    unchanged++;
    continue;
  }
  fs.writeFileSync(p, next);
  updated++;
  touched.push(name);
}

console.log(
  JSON.stringify({
    start,
    count,
    date: dateStr,
    total_files: files.length,
    updated,
    unchanged,
    missing,
    first_touched: touched[0] || null,
    last_touched: touched[touched.length - 1] || null,
  }),
);
