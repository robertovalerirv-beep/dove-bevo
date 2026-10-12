import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdableTimeout } from "../../src/app/lib/timer";

describe("holdableTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs after the delay", () => {
    const run = vi.fn();
    holdableTimeout(run, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not run while held and keeps the time left", () => {
    const run = vi.fn();
    const timer = holdableTimeout(run, 10_000);
    vi.advanceTimersByTime(4_000);
    timer.hold();
    timer.hold(); // idempotent
    vi.advanceTimersByTime(60_000);
    expect(run).not.toHaveBeenCalled();
    timer.release();
    timer.release(); // idempotent
    vi.advanceTimersByTime(5_999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });

  it("never runs once cleared, even if released", () => {
    const run = vi.fn();
    const timer = holdableTimeout(run, 1_000);
    timer.clear();
    vi.advanceTimersByTime(5_000);
    expect(run).not.toHaveBeenCalled();
  });
});
