/* Bundled, presentation-only enhancement for the genuine Dove Bevo visitor app.
 * No bridge, network, storage, event handler, form or application-data changes.
 * The response nonce stays in this document and is never returned to native code.
 */
(() => {
  'use strict';
  const id = 'dovebevo-native-theme-v1';
  const marker = 'data-dovebevo-app-theme';
  const css = String.raw`
:root[data-dovebevo-app-theme="1"] {
  color-scheme: light;
  --dovebevo-app-theme: 1;
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-2: #f3f5f7;
  --ink: #101820;
  --ink-muted: #5d6670;
  --line-soft: #e7eaee;
  --spritz: #101820;
  --on-spritz: #ffffff;
  --spritz-text: #315c72;
  --affare: #e1f3e3;
  --on-affare: #226332;
  --giusto: #fff0cb;
  --on-giusto: #715014;
  --salato: #fbe5e7;
  --on-salato: #9b2938;
  --map-pill-bg: #ffffff;
  --map-pill-text: #101820;
  --map-pill-border: #d9dfe5;
  --focus: #2459b7;
  --map-focus: #2459b7;
  --error: #a12332;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --weight-regular: 400;
  --weight-semibold: 600;
  --weight-bold: 700;
  --type-display: 750 40px/1.08 var(--font-sans);
  --type-title: 700 26px/1.15 var(--font-sans);
  --type-subtitle: 650 19px/1.3 var(--font-sans);
  --type-body: 400 17px/1.45 var(--font-sans);
  --type-label: 600 16px/1.3 var(--font-sans);
  --type-caption: 400 14px/1.4 var(--font-sans);
  --type-price-xl: 750 44px/1.1 var(--font-sans);
  --type-price: 700 17px/1.15 var(--font-sans);
  --type-meta: 400 13px/1.4 var(--font-sans);
  --tracking-meta: normal;
  --border-strong: 1px;
  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 24px;
  --shadow-stampa: none;
  --shadow-premuto: none;
  --shadow-sheet: 0 -4px 24px rgb(16 24 32 / 0.12);
  --color-backdrop: rgb(16 24 32 / 0.36);
  --press: 0px;
}
html[data-dovebevo-app-theme="1"] .top {
  background: #fff;
  padding: 10px 16px 12px;
}
html[data-dovebevo-app-theme="1"] .btn,
html[data-dovebevo-app-theme="1"] .chip,
html[data-dovebevo-app-theme="1"] .drink {
  border-color: var(--line-soft);
  box-shadow: none;
}
html[data-dovebevo-app-theme="1"] .btn--primary {
  border-color: var(--ink);
  font-size: 17px;
}
html[data-dovebevo-app-theme="1"] .btn--ghost { border-color: transparent; }
html[data-dovebevo-app-theme="1"] .search-field,
html[data-dovebevo-app-theme="1"] .drink-menu__button {
  background: var(--surface-2);
  border-color: transparent;
  border-radius: 14px;
}
html[data-dovebevo-app-theme="1"] .drink-menu__button { min-height: 54px; }
html[data-dovebevo-app-theme="1"] .drink-menu__list,
html[data-dovebevo-app-theme="1"] .lang-menu__list {
  border-color: var(--line-soft);
  box-shadow: 0 8px 24px rgb(16 24 32 / 0.10);
}
html[data-dovebevo-app-theme="1"] .drink-option {
  background: var(--surface-2);
  border-color: transparent;
}
html[data-dovebevo-app-theme="1"] .drink-option:has(input:checked) {
  border-color: var(--ink);
}
html[data-dovebevo-app-theme="1"] .bottom {
  background: var(--surface);
  gap: 10px;
  padding: 10px 16px;
  border-color: var(--line-soft);
}
html[data-dovebevo-app-theme="1"] .bottom__primary { font-size: 15px; }
html[data-dovebevo-app-theme="1"] .legend {
  border-color: var(--line-soft);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgb(16 24 32 / 0.06);
}
html[data-dovebevo-app-theme="1"] .legend__item {
  font: var(--type-caption);
  text-transform: none;
  letter-spacing: normal;
}
html[data-dovebevo-app-theme="1"] .sheet {
  border-top: 0;
  max-height: 92dvh;
}
html[data-dovebevo-app-theme="1"] .sheet__head {
  padding: 14px 16px 10px;
}
html[data-dovebevo-app-theme="1"] .sheet__body {
  padding: 16px 16px max(24px, env(safe-area-inset-bottom));
}
html[data-dovebevo-app-theme="1"] .sheet--bare .sheet__body { padding-top: 0; }
html[data-dovebevo-app-theme="1"] .sheet__grip > span {
  width: 36px;
  height: 5px;
  background: #cbd1d7;
}
html[data-dovebevo-app-theme="1"] .scontrino__paper {
  padding: 8px 0 16px;
  border: 0;
  border-radius: 0;
  background: var(--surface);
  -webkit-mask: none;
  mask: none;
}
html[data-dovebevo-app-theme="1"] .scontrino__name {
  font-size: 27px;
  line-height: 1.15;
}
html[data-dovebevo-app-theme="1"] .scontrino .bar__kind,
html[data-dovebevo-app-theme="1"] .scontrino__foot,
html[data-dovebevo-app-theme="1"] .price__meta {
  text-transform: none;
  letter-spacing: normal;
}
html[data-dovebevo-app-theme="1"] .scontrino .section-title {
  border-top: 1px solid var(--line-soft);
  padding-top: 20px;
  margin-top: 20px;
  font: var(--type-label);
  text-transform: none;
  letter-spacing: normal;
  color: var(--ink);
}
html[data-dovebevo-app-theme="1"] .scontrino .price {
  padding: 16px 0;
  row-gap: 6px;
}
html[data-dovebevo-app-theme="1"] .scontrino .price__value {
  padding: 7px 10px;
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  font-size: 19px;
  font-variant-numeric: tabular-nums;
}
html[data-dovebevo-app-theme="1"] .scontrino .price__value--stale {
  border-style: dashed;
}
html[data-dovebevo-app-theme="1"] .scontrino .price__actions {
  flex-wrap: wrap;
  gap: 8px;
}
html[data-dovebevo-app-theme="1"] .scontrino .price__actions .btn {
  border-radius: 10px;
  background: var(--surface-2);
  padding: 8px 12px;
  text-decoration: none;
}
html[data-dovebevo-app-theme="1"] .scontrino .price__actions .btn:disabled,
html[data-dovebevo-app-theme="1"] .scontrino .price__actions .btn[aria-disabled="true"] {
  opacity: 0.55;
}
html[data-dovebevo-app-theme="1"] .field {
  border-color: #c9d0d7;
  background: var(--surface);
  border-radius: 12px;
}
html[data-dovebevo-app-theme="1"] .price-input .field {
  min-height: 68px;
  font-size: 36px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
html[data-dovebevo-app-theme="1"] .drink[aria-pressed="true"],
html[data-dovebevo-app-theme="1"] .chip[aria-pressed="true"],
html[data-dovebevo-app-theme="1"] .chip:has(input:checked) {
  border-color: var(--ink);
}
html[data-dovebevo-app-theme="1"] .row { padding-block: 14px; }
html[data-dovebevo-app-theme="1"] .hint { line-height: 1.45; }
html[data-dovebevo-app-theme="1"] .price__stale { color: #9b2938; }
@media (max-width: 359px) {
  html[data-dovebevo-app-theme="1"] .scontrino .price {
    grid-template-columns: 22px minmax(0, 1fr);
  }
  html[data-dovebevo-app-theme="1"] .scontrino .price__value {
    grid-column: 2;
    justify-self: start;
  }
  html[data-dovebevo-app-theme="1"] .scontrino > .bar__actions {
    grid-template-columns: 1fr;
  }
}
`;
  let style;
  let root;
  let previous;
  try {
    const url = new URL(window.location.href);
    if (window.top !== window || url.protocol !== 'https:' ||
        !['dovebevo.com', 'www.dovebevo.com'].includes(url.hostname) ||
        url.username || url.password || (url.port && url.port !== '443') ||
        !/^(?:\/|\/bar\/[nwru][1-9][0-9]{0,14})$/.test(url.pathname)) return false;
    if (!document.querySelector('#app > .app .top') ||
        !document.querySelector('#app > .app .main')) return false;
    root = document.documentElement;
    const existing = document.getElementById(id);
    if (existing && (existing.tagName !== 'STYLE' ||
        existing.getAttribute('data-dovebevo-style') !== '1')) return false;
    if (existing && root.getAttribute(marker) === '1' &&
        getComputedStyle(root).getPropertyValue('--dovebevo-app-theme').trim() === '1') return true;
    const source = [...document.querySelectorAll('style[nonce], script[nonce]')]
      .find(node => /^[A-Za-z0-9+/_=-]{16,128}$/.test(node.nonce));
    if (!source || !document.head) return false;
    previous = root.getAttribute(marker);
    style = existing || document.createElement('style');
    style.id = id;
    style.setAttribute('data-dovebevo-style', '1');
    style.nonce = source.nonce;
    style.textContent = css;
    if (!existing) document.head.appendChild(style);
    root.setAttribute(marker, '1');
    if (getComputedStyle(root).getPropertyValue('--dovebevo-app-theme').trim() === '1') return true;
  } catch (_) {
    // A failed enhancement leaves the original working website in place.
  }
  if (style) style.remove();
  if (root && previous !== undefined) {
    if (previous === null) root.removeAttribute(marker);
    else root.setAttribute(marker, previous);
  }
  return false;
})();
