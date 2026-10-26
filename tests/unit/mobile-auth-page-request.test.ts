import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "../../src/mobile-auth/request";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("hosted native authorization request deadline", () => {
  it("retains the credential, redirect and cache boundaries and clears a successful deadline", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ code: "test" }));
    vi.stubGlobal("fetch", fetcher);

    await expect(
      requestJson("/api/mobile/authorize", { method: "POST", body: "{}" }),
    ).resolves.toEqual({ code: "test" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/mobile/authorize",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }),
    );
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["fetch", "body"])(
    "aborts a stalled %s after the same 20 second deadline",
    async (phase) => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_path, init) => {
        signal = init?.signal ?? undefined;
        if (!signal) throw new Error("missing signal");
        const activeSignal = signal;
        const stalled = () =>
          new Promise<never>((_resolve, reject) => {
            activeSignal.addEventListener(
              "abort",
              () => {
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          });
        if (phase === "fetch") return stalled();
        const response = Response.json({});
        response.json = stalled;
        return Promise.resolve(response);
      });
      vi.stubGlobal("fetch", fetcher);

      const pending = requestJson("/api/mobile/config");
      const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(19_999);
      expect(signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["network", "status", "json"])(
    "clears the deadline after a %s failure",
    async (phase) => {
      vi.useFakeTimers();
      const fetcher = vi.fn<typeof fetch>();
      if (phase === "network") fetcher.mockRejectedValue(new Error("network"));
      else
        fetcher.mockResolvedValue(
          new Response("invalid-json", { status: phase === "status" ? 503 : 200 }),
        );
      vi.stubGlobal("fetch", fetcher);

      await expect(requestJson("/api/mobile/config")).rejects.toThrow();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
