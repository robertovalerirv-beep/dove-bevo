package com.dovebevo.app;

/** One explicit bookmark request, bound to the document that supplied its name. */
public final class SavedVenueCapture {
    public static final int MAX_NAME_CODE_UNITS = 120;
    private final String url;
    private final long epoch;

    public SavedVenueCapture(String eligibleUrl, long epoch) {
        this.url = SavedVenueUrl.canonicalize(eligibleUrl);
        this.epoch = epoch;
    }

    public static final class Venue {
        public final String url;
        public final String name;
        private Venue(String url, String name) { this.url = url; this.name = name; }
    }

    public Venue complete(String reportedUrl, String name, String selectedKey,
                          String currentEligibleUrl, long currentEpoch) {
        if (url == null || epoch != currentEpoch
                || !url.equals(SavedVenueUrl.canonicalize(reportedUrl))
                || !url.equals(SavedVenueUrl.canonicalize(currentEligibleUrl))
                || !url.substring(url.indexOf("/bar/") + 5, url.indexOf('?')).equals(selectedKey)) return null;
        String valid = actualName(name);
        return valid == null ? null : new Venue(url, valid);
    }

    static String actualName(String value) {
        if (value == null || value.length() > MAX_NAME_CODE_UNITS) return null;
        for (int i = 0; i < value.length();) {
            int cp = value.codePointAt(i);
            if (Character.isISOControl(cp) || (cp >= 0xd800 && cp <= 0xdfff)) return null;
            i += Character.charCount(cp);
        }
        int first = 0, last = value.length();
        while (first < last && isSpace(value.codePointAt(first))) first += Character.charCount(value.codePointAt(first));
        while (last > first && isSpace(value.codePointBefore(last))) last -= Character.charCount(value.codePointBefore(last));
        return first == last ? null : value.substring(first, last);
    }

    private static boolean isSpace(int cp) { return Character.isWhitespace(cp) || Character.isSpaceChar(cp); }
}
