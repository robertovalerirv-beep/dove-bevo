/// A fixed read-only query of the public, currently displayed venue name.
/// No source text is interpolated, no page data is changed and no bridge is
/// installed. The map's existing public route marker closes the SPA interval
/// where location has changed but the previous venue's dialog is still drawn.
enum VenueNameReader {
    static let script = #"""
    (() => {
        "use strict";
        const href = location.href;
        const url = new URL(href);
        const key = /^\/bar\/([nwru][1-9][0-9]{0,14})$/.exec(url.pathname)?.[1];
        if (url.protocol !== "https:" || !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
            url.username || url.password || (url.port && url.port !== "443") ||
            !key || !/^\?c=[0-9b-hjkmnp-z]{5}$/.test(url.search) || url.hash) return null;
        const maps = document.querySelectorAll("section.map[data-selected]");
        if (maps.length !== 1 || maps[0].getAttribute("data-selected") !== key) return null;
        const sheets = document.querySelectorAll("dialog.sheet[open]");
        if (sheets.length !== 1) return null;
        const dialog = sheets[0];
        if (!dialog.matches("dialog.sheet.sheet--bare[open]") || !dialog.matches(":modal")) return null;
        const headings = dialog.querySelectorAll(":scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name");
        if (headings.length !== 1) return null;
        const heading = headings[0];
        const rendered = (element) => {
            if (!element.isConnected || element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
            for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor);
                if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0) return false;
            }
            const box = element.getBoundingClientRect();
            return element.getClientRects().length > 0 &&
                [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0;
        };
        if (!rendered(dialog) || !rendered(heading)) return null;
        const dialogBox = dialog.getBoundingClientRect();
        if (dialogBox.right <= 0 || dialogBox.bottom <= 0 ||
            dialogBox.left >= window.innerWidth || dialogBox.top >= window.innerHeight) return null;
        const name = heading.textContent;
        if (typeof name !== "string" || name.length > 120 || name !== dialog.getAttribute("aria-label") ||
            /[\u0000-\u001f\u007f-\u009f\ufffd]/.test(name)) return null;
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 120) return null;
        for (let index = 0; index < trimmed.length; index += 1) {
            const unit = trimmed.charCodeAt(index);
            if (unit >= 0xd800 && unit <= 0xdbff) {
                const next = trimmed.charCodeAt(index + 1);
                if (!(next >= 0xdc00 && next <= 0xdfff)) return null;
                index += 1;
            } else if (unit >= 0xdc00 && unit <= 0xdfff) return null;
        }
        return { href, name: trimmed, selectedKey: key };
    })()
    """#
}
