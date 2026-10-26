import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Geolocation } from "@capacitor/geolocation";
import { Share } from "@capacitor/share";
import { createMobileClient, nativeVenuePath } from "./native-client";
import { foregroundLocation } from "./native-location";
import { installNativePlatform, NATIVE_BACKGROUND, NATIVE_LINK, NATIVE_BACK } from "./platform";
import { it } from "../i18n/it";
import { CONTACT_EMAIL } from "../../shared/config";

interface IsolatedHttp {
  request: (options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    data?: string;
  }) => Promise<{ status: number; headers: Record<string, string>; body: string }>;
}
// The platform plugin must use cookie-disabled ephemeral HTTPS sessions and reject redirects.
// CapacitorHttp shares WebView cookies and cannot satisfy this privacy boundary.
const http = registerPlugin<IsolatedHttp>("DoveBevoHttp");
let initialization: Promise<string> | null = null;
let readyVersion: string | null = null;
/** Native entry only: no bridge module is imported by the ordinary web entry. */
export function initializeNative(): Promise<string> {
  if (readyVersion !== null) return Promise.resolve(readyVersion);
  initialization ??= initialize()
    .then((version) => {
      readyVersion = version;
      return version;
    })
    .finally(() => {
      initialization = null;
    });
  return initialization;
}

async function initialize(): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new Error(it.native.unavailable);
  const client = createMobileClient({
    origin: import.meta.env.VITE_NATIVE_API_ORIGIN ?? "",
    allowFixture: import.meta.env.VITE_DATA_VERSION === "fixture",
    request: async (url, init) => {
      if (init.body !== undefined && typeof init.body !== "string")
        throw new Error(it.native.unavailable);
      const headers: Record<string, string> = {};
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const response = await http.request({
        url,
        method: init.method ?? "GET",
        headers,
        ...(init.body ? { data: init.body } : {}),
      });
      return new Response(response.body || null, {
        status: response.status,
        headers: response.headers,
      });
    },
    open: (url) => Browser.open({ url }),
    close: () => Browser.close(),
  });
  const config = await client.initialize();
  const open = async (raw: string) => {
    const url = new URL(raw);
    const hosts = new Set([
      "maps.apple.com",
      "www.openstreetmap.org",
      "openfreemap.org",
      "www.openmaptiles.org",
      "www.dovebevo.com",
    ]);
    if (
      url.protocol !== "https:" ||
      !hosts.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw new Error(it.native.externalFailed);
    await Browser.open({ url: url.href });
  };
  const listeners: PluginListenerHandle[] = [];
  try {
    const receive = async (url: string) => {
      if (url.startsWith("dovebevopreview:")) {
        await client.receiveCallback(url);
        return;
      }
      const path = nativeVenuePath(url);
      if (path) dispatchEvent(new CustomEvent(NATIVE_LINK, { detail: path }));
    };
    listeners.push(
      await App.addListener("appUrlOpen", ({ url }) => {
        void receive(url);
      }),
    );
    listeners.push(
      await Browser.addListener("browserFinished", () => {
        client.cancel();
      }),
    );
    listeners.push(
      await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) client.resume();
        else dispatchEvent(new Event(NATIVE_BACKGROUND));
      }),
    );
    listeners.push(
      await App.addListener("backButton", () => {
        const dialogs = document.querySelectorAll<HTMLDialogElement>("dialog.sheet[open]");
        const top = dialogs[dialogs.length - 1];
        if (top) {
          top.dispatchEvent(new Event("cancel", { cancelable: true }));
          return;
        }
        if (!dispatchEvent(new Event(NATIVE_BACK, { cancelable: true }))) return;
        if (location.pathname !== "/") history.back();
        else void App.exitApp();
      }),
    );
    const launch = await App.getLaunchUrl();
    if (launch) {
      const path = nativeVenuePath(launch.url);
      if (path) history.replaceState(null, "", path);
      else await receive(launch.url);
    }
    document.addEventListener("click", (event) => {
      const link =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || link.origin === location.origin || event.defaultPrevented) return;
      // Capacitor's navigation delegate hands this fixed support address to the OS mail app.
      if (link.href === `mailto:${CONTACT_EMAIL}`) return;
      event.preventDefault();
      void open(link.href).catch(() => {
        const message = document.createElement("p");
        message.setAttribute("role", "status");
        message.textContent = it.native.externalFailed;
        link.after(message);
      });
    });
    // Publish only after every awaited setup step succeeded. Callback closures and the
    // installed platform now own the same client; failed attempts are fully retried.
    installNativePlatform({
      client,
      ...foregroundLocation(Geolocation),
      open,
      share: async (title, url) => {
        if (!nativeVenuePath(url)) throw new Error(it.native.externalFailed);
        await Share.share({ title, url, dialogTitle: it.native.share });
      },
    });
    return config.dataVersion;
  } catch (error) {
    await Promise.allSettled(listeners.map((listener) => listener.remove()));
    client.forget();
    throw error;
  }
}
