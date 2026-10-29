package com.dovebevo.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

/** A saved venue is a public venue link, never a generic browser bookmark. */
public final class SavedVenueUrl {
    private static final Pattern AUTHORITY = Pattern.compile("(?:www\\.)?dovebevo\\.com(?::443)?", Pattern.CASE_INSENSITIVE);
    private static final Pattern PATH = Pattern.compile("/bar/[nwru][1-9][0-9]{0,14}");
    private static final Pattern QUERY = Pattern.compile("c=[0-9b-hjkmnp-z]{5}");

    private SavedVenueUrl() {}

    public static String canonicalize(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > 256 || raw.indexOf('\\') >= 0) return null;
        for (int i = 0; i < raw.length(); i++) if (Character.isISOControl(raw.charAt(i))) return null;
        try {
            URI uri = new URI(raw);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null
                    || uri.getRawAuthority() == null || !AUTHORITY.matcher(uri.getRawAuthority()).matches()
                    || uri.getRawPath() == null || !PATH.matcher(uri.getRawPath()).matches()
                    || uri.getRawQuery() == null || !QUERY.matcher(uri.getRawQuery()).matches()
                    || uri.getRawFragment() != null) return null;
            return "https://www.dovebevo.com" + uri.getRawPath() + "?" + uri.getRawQuery();
        } catch (URISyntaxException error) { return null; }
    }

}
