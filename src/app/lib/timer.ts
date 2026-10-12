export interface HoldableTimer {
  /** Stops the countdown, keeping the time left (WCAG 2.2.1: the user can take longer). */
  hold: () => void;
  release: () => void;
  clear: () => void;
}

/** setTimeout that can be paused while the user is reading or about to act. */
export function holdableTimeout(run: () => void, ms: number): HoldableTimer {
  let left = ms;
  let started = Date.now();
  let id: ReturnType<typeof setTimeout> | undefined = setTimeout(run, ms);
  return {
    hold() {
      if (id === undefined) return;
      clearTimeout(id);
      id = undefined;
      left = Math.max(0, left - (Date.now() - started));
    },
    release() {
      if (id !== undefined) return;
      started = Date.now();
      id = setTimeout(run, left);
    },
    clear() {
      clearTimeout(id);
      id = undefined;
      left = 0;
    },
  };
}
