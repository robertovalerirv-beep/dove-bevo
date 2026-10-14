// The only Node API used by typed config files and tests (no @types/node, SPEC 4.1).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function cpSync(source: string, destination: string, options: { recursive: true }): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isFile(): boolean };
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}
