import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { it as texts } from "../../src/app/i18n/it";

/** Execute the actual save/send declarations with a deferred acknowledgment and local UI mocks.
 * No copy of their state machine is kept in the test, so this catches stale retained callbacks. */
function nativeSaveHarness() {
  const source = ts.createSourceFile(
    "app.tsx",
    readFileSync("src/app/app.tsx", "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = new Map<string, string>();
  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name && ["save", "send"].includes(node.name.text))
      declarations.set(node.name.text, node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (declarations.size !== 2) throw new Error("save/send declarations missing");
  const timer = { clear: vi.fn(), hold: vi.fn(), release: vi.fn() };
  const pendingSave: { current: { sent: boolean } | null } = { current: null };
  const notices: { text: string; undo?: () => void; more?: { run: () => void } }[] = [];
  let acknowledge: (response: Response) => void = () => {
    throw new Error("POST not started");
  };
  const post = vi.fn().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const scope = {
    pendingSave,
    isNative: true,
    setAdding: vi.fn(),
    holdableTimeout: () => timer,
    UNDO_MS: 5000,
    host: vi.fn(),
    postWithSession: post,
    reopen: vi.fn(),
    it: texts,
    showToast: (
      text: string,
      undo?: () => void,
      _duration?: number,
      more?: { run: () => void },
    ) => {
      notices.push({ text, undo, more });
    },
    openAdd: vi.fn(),
    addPrices: () => 1,
    todayRome: () => "2026-10-26",
    formatStampDay: () => "26 ottobre",
    track: vi.fn(),
    invalidateCell: vi.fn(),
    setAttempt: vi.fn(),
    setBarVersion: vi.fn(),
  };
  const output = ts.transpileModule([...declarations.values()].join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- Executes only parsed reviewed local save/send declarations with explicit UI/network mocks.
  const execute = new Function(
    "scope",
    `const { ${Object.keys(scope).join(",")} } = scope; ${output}; return { save, send };`,
  ) as (scope: Record<string, unknown>) => {
    save: (draft: object) => void;
    send: (entry: object) => Promise<void>;
  };
  return {
    ...execute(scope),
    pendingSave,
    notices,
    timer,
    post,
    acknowledge: (response: Response) => {
      acknowledge(response);
    },
  };
}

describe("native save undo acknowledgment boundary", () => {
  it("ends held undo on background send and ignores its stale callback until delayed acknowledgment", async () => {
    const harness = nativeSaveHarness();
    harness.save({ venue: { key: "n1", cell: "u0nd9" }, drink: "spritz", cents: 600, hh: 0 });
    const pending = harness.notices.at(-1);
    pending?.more?.run(); // WCAG held toast: background must still send intentionally.
    expect(harness.timer.hold).toHaveBeenCalledOnce();
    const entry = harness.pendingSave.current;
    if (!entry || !pending?.undo) throw new Error("pending undo missing");
    const sent = harness.send(entry);
    expect(harness.post).toHaveBeenCalledOnce();
    expect(harness.notices.at(-1)?.undo).toBeUndefined();
    pending.undo(); // A callback retained by the old DOM must also be harmless.
    expect(harness.notices.some((notice) => notice.text === texts.add.undone)).toBe(false);
    expect(harness.notices.some((notice) => notice.text === texts.add.saved)).toBe(false);
    harness.acknowledge(Response.json({ results: [{ status: "added" }] }));
    await sent;
    expect(harness.notices.at(-1)?.text).toBe(texts.add.saved);
    expect(harness.notices.some((notice) => notice.text === texts.add.undone)).toBe(false);
  });
});
