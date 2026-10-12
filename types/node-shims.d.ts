// The only Node API used by typed config files (no @types/node, SPEC 4.1).
declare module "node:fs/promises" {
  export function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
}
