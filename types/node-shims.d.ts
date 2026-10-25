// The only Node API used by typed config files and tests (no @types/node, SPEC 4.1).
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8" | "latin1"): string;
  export function cpSync(source: string, destination: string, options: { recursive: true }): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options: { recursive: true }): void;
  export function writeFileSync(path: string, data: string): void;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): { isFile(): boolean };
}
declare module "node:path" {
  export function join(...parts: string[]): string;
}

declare const process: { env: Record<string, string | undefined> };
declare module "node:zlib" {
  export function gzipSync(data: string): { length: number };
}
declare module "node:crypto" {
  export function createHash(algorithm: "sha256"): {
    update(data: string): { digest(encoding: "hex"): string };
  };
}
declare module "node:child_process" {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options?: {
      encoding?: "utf8";
      stdio?: "ignore" | "pipe";
      env?: Record<string, string | undefined>;
    },
  ): string;
}
