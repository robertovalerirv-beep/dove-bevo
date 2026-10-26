import { it } from "../app/i18n/it";
import {
  MOBILE_API_PREFIX,
  MOBILE_CALLBACK_URL,
  MOBILE_CLIENT_ID,
  MOBILE_PROTOCOL_VERSION,
} from "../shared/mobile";
import { challengeParameters, completionUrl } from "./protocol";
import { requestJson } from "./request";
import "../app/styles/tokens.css";
import "../app/styles/base.css";
import "./page.css";

interface ChallengeWidget {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      cData: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ): string;
}

const title = document.getElementById("mobile-title");
const intro = document.getElementById("mobile-intro");
const status = document.getElementById("mobile-status");
const container = document.getElementById("mobile-challenge");
const copy = it.mobileAuth;
if (title) title.textContent = copy.title;
if (intro) intro.textContent = copy.intro;

const parameters = challengeParameters(location.search);
// The verifier stays in the native app; even the public challenge/state leave browser history now.
history.replaceState(null, "", location.pathname);

async function start(): Promise<void> {
  if (!status || !container) return;
  if (!parameters || location.protocol !== "https:") {
    status.textContent = copy.invalid;
    return;
  }
  status.textContent = copy.waiting;
  const config = await requestJson(`${MOBILE_API_PREFIX}/config`);
  if (
    !config ||
    typeof config !== "object" ||
    !("version" in config) ||
    config.version !== MOBILE_PROTOCOL_VERSION ||
    !("clientId" in config) ||
    config.clientId !== MOBILE_CLIENT_ID ||
    !("callbackUrl" in config) ||
    config.callbackUrl !== MOBILE_CALLBACK_URL
  )
    throw new Error("invalid");
  const site = await requestJson("/api/session");
  if (
    !site ||
    typeof site !== "object" ||
    !("siteKey" in site) ||
    typeof site.siteKey !== "string" ||
    !("action" in site) ||
    site.action !== "contribute"
  ) {
    throw new Error("invalid");
  }
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      script.remove();
      reject(new Error("unavailable"));
    }, 20_000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("unavailable"));
    };
    document.head.append(script);
  });
  const widget = (globalThis as unknown as { turnstile?: ChallengeWidget }).turnstile;
  if (!widget) throw new Error("unavailable");
  let submitted = false;
  const fail = () => {
    status.textContent = copy.failed;
  };
  widget.render(container, {
    sitekey: site.siteKey,
    action: "contribute",
    cData: parameters.codeChallenge,
    callback: (token) => {
      if (submitted || !token) return;
      submitted = true;
      void (async () => {
        const response = await requestJson(`${MOBILE_API_PREFIX}/authorize`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ...parameters, token }),
        });
        const target = completionUrl(response, parameters.nonce);
        status.textContent = copy.returning;
        location.assign(target);
      })().catch(fail);
    },
    "error-callback": fail,
    "expired-callback": fail,
  });
}

void start().catch(() => {
  if (status) status.textContent = copy.failed;
});
