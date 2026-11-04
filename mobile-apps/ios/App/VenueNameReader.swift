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
        const mobile = /^\/mobile\/(?:index\.html)?$/.test(url.pathname);
        const pairs = [...url.searchParams];
        const rawKeys = url.search.slice(1).split("&").map(pair => pair.split("=")[0]);
        const focused = pairs.length === 4 && rawKeys.every(key => ["path","c","drink","hh"].includes(key)) &&
            new Set(rawKeys).size === 4 && url.searchParams.getAll("drink").length === 1 &&
            /^(beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)$/.test(url.searchParams.get("drink") || "") &&
            url.searchParams.getAll("hh").length === 1 && /^[01]$/.test(url.searchParams.get("hh") || "") &&
            /(?:^|&)drink=(?:beer_draft|spritz|negroni|sbagliato|gin_tonic|gin_lemon|wine_glass|alcohol_free|water)(?:&|$)/.test(url.search.slice(1)) &&
            /(?:^|&)hh=[01](?:&|$)/.test(url.search.slice(1));
        if (mobile && (document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1" ||
            (!(pairs.length === 2 && rawKeys.every(key => ["path","c"].includes(key))) && !focused) || url.searchParams.getAll("path").length !== 1 ||
            url.searchParams.getAll("c").length !== 1 || !/^[0-9b-hjkmnp-z]{5}$/.test(url.searchParams.get("c") || ""))) return null;
        const key = /^\/bar\/((?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24}))$/.exec(mobile ? url.searchParams.get("path") || "" : url.pathname)?.[1];
        if (url.protocol !== "https:" || !["www.dovebevo.com", "dovebevo.com"].includes(url.hostname) ||
            url.username || url.password || (url.port && url.port !== "443") ||
            !key || (!mobile && !/^\?c=[0-9b-hjkmnp-z]{5}$/.test(url.search)) || url.hash) return null;
        const maps = document.querySelectorAll("section.map[data-selected]");
        if (maps.length !== 1 || maps[0].getAttribute("data-selected") !== key) return null;
        const sheets = document.querySelectorAll("dialog.sheet[open]");
        if (sheets.length !== 1) return null;
        const dialog = sheets[0];
        if (!dialog.matches("dialog.sheet.sheet--bare[open]") || !dialog.matches(":modal")) return null;
        // The Italian receipt now groups its title in the identity header;
        // older receipts and European venues keep the direct h2. Both remain
        // scoped to the single current modal's single receipt paper.
        const papers = dialog.querySelectorAll(":scope > .sheet__body > .scontrino > .scontrino__paper");
        if (papers.length !== 1) return null;
        const headings = papers[0].querySelectorAll(":scope > h2.scontrino__name, :scope > header.mobile-venue__identity > h2.scontrino__name");
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

    /// Failure telemetry is a fixed, content-free stage code. It is evaluated
    /// only after a user-initiated read fails; no venue name, key or URL leaves
    /// the page. The authoritative reader above remains the acceptance gate.
    static let diagnosticScript = #"""
    (() => {
        "use strict";
        try {
            if (document.documentElement.getAttribute("data-dovebevo-mobile-shell") !== "1") return "document";
            if (!/^\/mobile\/(?:index\.html)?$/.test(location.pathname) ||
                !new URL(location.href).searchParams.has("path")) return "route";
            const maps = document.querySelectorAll("section.map[data-selected]");
            if (maps.length !== 1) return "map";
            const sheets = document.querySelectorAll("dialog.sheet[open]");
            if (sheets.length !== 1) return "sheet";
            const dialog = sheets[0];
            if (!dialog.matches("dialog.sheet.sheet--bare[open]") || !dialog.matches(":modal")) return "modal";
            const papers = dialog.querySelectorAll(":scope > .sheet__body > .scontrino > .scontrino__paper");
            if (papers.length !== 1) return "paper";
            const headings = papers[0].querySelectorAll(":scope > h2.scontrino__name, :scope > header.mobile-venue__identity > h2.scontrino__name");
            if (headings.length !== 1) return "heading";
            if (headings[0].textContent !== dialog.getAttribute("aria-label")) return "name";
            return "route_or_visibility";
        } catch (_) { return "diagnostic_error"; }
    })()
    """#

    static let diagnosticCodes: Set<String> = [
        "document", "route", "map", "sheet", "modal", "paper", "heading",
        "name", "route_or_visibility", "diagnostic_error"
    ]
}
