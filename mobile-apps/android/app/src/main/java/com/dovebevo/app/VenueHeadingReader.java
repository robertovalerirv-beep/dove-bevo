package com.dovebevo.app;

/** Fixed read-only query of the existing public venue sheet; no general JS bridge. */
final class VenueHeadingReader {
    private VenueHeadingReader() {}

    static final String SCRIPT = """
            (() => {
              if (document.visibilityState !== 'visible') return null;
              const route = new URL(location.href);
              const match = /^\\/bar\\/([nwru][1-9][0-9]{0,14})$/.exec(route.pathname);
              const maps = document.querySelectorAll('section.map[data-selected]');
              if (!match || maps.length !== 1 || maps[0].getAttribute('data-selected') !== match[1]) return null;
              const dialogs = document.querySelectorAll('dialog.sheet[open]');
              if (dialogs.length !== 1) return null;
              const dialog = dialogs[0];
              if (!dialog.matches('dialog.sheet.sheet--bare[open]')) return null;
              const headings = dialog.querySelectorAll(':scope > .sheet__body > .scontrino > .scontrino__paper > h2.scontrino__name');
              if (headings.length !== 1) return null;
              const heading = headings[0];
              for (let node = heading; node; node = node.parentElement) {
                const style = getComputedStyle(node);
                if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                    style.display === 'none' || style.visibility !== 'visible' ||
                    style.contentVisibility === 'hidden' || Number(style.opacity) <= 0) return null;
              }
              for (const node of [dialog, heading]) {
                const box = node.getBoundingClientRect();
                if (!node.getClientRects().length ||
                    ![box.x, box.y, box.left, box.top, box.right, box.bottom, box.width, box.height].every(Number.isFinite) ||
                    box.width <= 0 || box.height <= 0) return null;
              }
              const dialogBox = dialog.getBoundingClientRect();
              if (![innerWidth, innerHeight].every(Number.isFinite) || innerWidth <= 0 || innerHeight <= 0 ||
                  dialogBox.right <= 0 || dialogBox.bottom <= 0 ||
                  dialogBox.left >= innerWidth || dialogBox.top >= innerHeight) return null;
              const name = heading.textContent;
              if (typeof name !== 'string' || name.length > 120 || !name.trim() ||
                  name !== dialog.getAttribute('aria-label')) return null;
              return [location.href, name, match[1]];
            })()
            """;

    static SavedVenueCapture.Venue decode(String result, SavedVenueCapture capture,
                                           String currentEligibleUrl, long currentEpoch) {
        if (capture == null || result == null || result.length() > 4096) return null;
        try {
            // Only the fixed reader's three JSON strings are accepted. Android's
            // general JSONTokener also accepts non-JSON strings/comments.
            JsonStrings input = new JsonStrings(result);
            input.take('[');
            String href = input.string(); input.take(',');
            String name = input.string(); input.take(',');
            String key = input.string(); input.take(']');
            input.space();
            if (input.offset != result.length()) return null;
            return capture.complete(href, name, key, currentEligibleUrl, currentEpoch);
        } catch (IllegalArgumentException malformed) { return null; }
    }

    private static final class JsonStrings {
        private final String value;
        private int offset;
        JsonStrings(String value) { this.value = value; }
        void space() {
            while (offset < value.length() && " \t\r\n".indexOf(value.charAt(offset)) >= 0) offset++;
        }
        void take(char expected) {
            space();
            if (offset >= value.length() || value.charAt(offset++) != expected) throw new IllegalArgumentException();
        }
        String string() {
            take('"');
            StringBuilder result = new StringBuilder();
            while (offset < value.length()) {
                char next = value.charAt(offset++);
                if (next == '"') return result.toString();
                if (next < 0x20) throw new IllegalArgumentException();
                if (next == '\\') {
                    if (offset >= value.length()) throw new IllegalArgumentException();
                    next = value.charAt(offset++);
                    switch (next) {
                        case '"': case '\\': case '/': break;
                        case 'b': next = '\b'; break;
                        case 'f': next = '\f'; break;
                        case 'n': next = '\n'; break;
                        case 'r': next = '\r'; break;
                        case 't': next = '\t'; break;
                        case 'u':
                            int code = 0;
                            for (int i = 0; i < 4; i++) {
                                if (offset >= value.length()) throw new IllegalArgumentException();
                                char digit = value.charAt(offset++);
                                int hex = "0123456789abcdef".indexOf(Character.toLowerCase(digit));
                                if (hex < 0) throw new IllegalArgumentException();
                                code = code * 16 + hex;
                            }
                            next = (char) code;
                            break;
                        default: throw new IllegalArgumentException();
                    }
                }
                result.append(next);
            }
            throw new IllegalArgumentException();
        }
    }
}
