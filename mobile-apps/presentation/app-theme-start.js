/* Native document-start visitor guard. No network, storage, or bridge. */
/* global window, document, URL, MutationObserver, Event */
(() => {
  "use strict";
  const key = "__dovebevoEarlyTheme";
  let url;
  try { url = new URL(window.location.href); } catch { return; }
  if (window.top !== window || url.protocol !== "https:" ||
      !["dovebevo.com", "www.dovebevo.com"].includes(url.hostname) ||
      url.username || url.password || (url.port && url.port !== "443") ||
      !/^(?:\/|\/bar\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname) || window[key]) return;

  let active = false;
  let stopped = false;
  let timer;
  const rootObserver = new MutationObserver(() => forceLight(true));
  const shellObserver = new MutationObserver(() => activate(true));
  function visitor() {
    // These are the actual visitor document's static shell and brand links.
    return !!document.querySelector('body > #app') &&
      !!document.querySelector('link[rel="manifest"][href="/manifest.webmanifest"]') &&
      !!document.querySelector('link[rel="icon"][href="/brand/favicon.svg"]');
  }
  function forceLight(notify) {
    const root = document.documentElement;
    if (!active || !root || root.getAttribute("data-theme") === "light") return;
    root.setAttribute("data-theme", "light");
    if (notify) window.dispatchEvent(new Event("themechange"));
  }
  function activate(notify) {
    if (stopped || active || !visitor()) return;
    active = true;
    shellObserver.disconnect();
    clearTimeout(timer);
    rootObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    forceLight(notify);
  }
  function onTheme() {
    // This handler is registered at document start, ahead of website listeners.
    // Correct the original event synchronously so later handlers see light.
    if (!active) activate(false);
    forceLight(false);
  }
  function cleanup(event) {
    if (event && event.persisted) return;
    stopped = true;
    shellObserver.disconnect();
    rootObserver.disconnect();
    clearTimeout(timer);
    window.removeEventListener("themechange", onTheme);
    window.removeEventListener("pagehide", cleanup);
    delete window[key];
  }
  window[key] = true;
  window.addEventListener("themechange", onTheme);
  window.addEventListener("pagehide", cleanup);
  shellObserver.observe(document, { childList: true, subtree: true });
  timer = setTimeout(() => { if (!active) cleanup(); }, 15000);
  activate(true);
})();
