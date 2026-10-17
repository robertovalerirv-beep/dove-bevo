// Invitation to install the app, after the second price (SPEC 7.7, M4-09). Chrome and Android
// give a prompt (`beforeinstallprompt`); iOS has none, so a written hint is shown instead.
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

let deferred: InstallPrompt | null = null;

/** Listens from the start: the browser may offer the prompt long before the second price. */
export function listenForInstall(): void {
  addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPrompt;
  });
}

const installed = () =>
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** How to invite: the browser's own prompt, a hint for iOS, or nothing (already installed). */
export function installMode(): "prompt" | "ios" | null {
  if (installed()) return null;
  if (deferred) return "prompt";
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? "ios" : null;
}

export async function promptInstall(): Promise<void> {
  const event = deferred;
  deferred = null;
  await event?.prompt();
}
