// The only Node API used by typed config files (no @types/node, SPEC 4.1).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function cpSync(source: string, destination: string, options: { recursive: true }): void;
}
