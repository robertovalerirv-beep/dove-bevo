// Compares two cell files as JSON, independent of formatting. Usage: compare-cell.mjs <actual> <expected>
import { deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

const [actual, expected] = process.argv
  .slice(2)
  .map((path) => JSON.parse(readFileSync(path, "utf8")));
deepStrictEqual(actual, expected);
console.log("cell matches the expected output");
