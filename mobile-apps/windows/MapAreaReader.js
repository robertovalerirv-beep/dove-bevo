/* global URL, location, window, document, getComputedStyle, innerWidth, innerHeight */
(() => {
  "use strict";
  const url = new URL(location.href);
  const mobile = /^\/mobile\/(?:index\.html)?$/.test(url.pathname);
  if (
    window.top !== window ||
    url.protocol !== "https:" ||
    !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    (!mobile && !/^(?:\/|\/bar\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname)) ||
    (mobile && document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1")
  )
    return null;
  const maps = document.querySelectorAll("#app > .app section.map");
  if (maps.length !== 1 || maps[0].getAttribute("data-ready") !== "true") return null;
  const map = maps[0],
    box = map.getBoundingClientRect();
  for (let node = map; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0)
      return null;
  }
  if (
    !map.isConnected ||
    map.closest("[hidden], [inert], [aria-hidden='true']") ||
    !(box.width > 0 && box.height > 0) ||
    box.right <= 0 ||
    box.bottom <= 0 ||
    box.left >= innerWidth ||
    box.top >= innerHeight
  )
    return null;
  const centre = map.getAttribute("data-center") || "",
    zoom = map.getAttribute("data-zoom") || "";
  if (!/^-?\d{1,3}\.\d{5},-?\d{1,3}\.\d{5}$/.test(centre) || !/^\d{1,2}\.\d$/.test(zoom))
    return null;
  const [latitude, longitude] = centre.split(",").map(Number);
  return { href: url.href, latitude, longitude, zoom: Number(zoom) };
})();
