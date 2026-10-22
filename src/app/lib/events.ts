// Anonymous usage events (SPEC 12, D-06): collected during the visit and sent in one beacon when
// the page goes to the background. No identifier, no position, no cookie.
import { EVENTS_BODY_LIMIT, MAX_EVENTS, type AppEvent } from "../../shared/events";

const queue: AppEvent[] = [];
let listening = false;

function flush() {
  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_EVENTS);
    // text/plain keeps the beacon a "simple" request: no preflight, no JSON content type (D-06).
    const body = JSON.stringify({ events: batch });
    if (body.length > EVENTS_BODY_LIMIT) continue;
    try {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "text/plain" }));
    } catch {
      // statistics are never worth an error
    }
  }
}

export function track(e: AppEvent["e"], p?: AppEvent["p"]) {
  queue.push(p ? { e, p } : { e });
  // A price saved while the page is in the background (keepalive, D-15) is known only now.
  if (document.visibilityState === "hidden") flush();
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
