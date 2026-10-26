package com.dovebevo.app;

import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

/** Pure browser-boundary policy. No HTTP requests, cookie access or JavaScript bridge. */
public final class BrowserPolicy {
    public static final String HOME = "https://www.dovebevo.com/";
    private static final String HOST = "www.dovebevo.com";
    private static final Pattern ENCODED_CONTROL = Pattern.compile("%(?:0[0-9a-f]|1[0-9a-f]|7f)", Pattern.CASE_INSENSITIVE);
    private static final Pattern GEO = Pattern.compile("(-?(?:0|[1-9][0-9]{0,2})(?:\\.[0-9]{1,12})?),(-?(?:0|[1-9][0-9]{0,2})(?:\\.[0-9]{1,12})?)\\?q=\\1,\\2");
    public enum Target { INTERNAL, EXTERNAL, EMAIL, MAP, BLOCKED }

    private BrowserPolicy() {}

    private static URI parse(String raw) {
        if (raw == null || raw.isEmpty() || raw.length() > 4096 || raw.indexOf('\\') >= 0 || controls(raw)
                || ENCODED_CONTROL.matcher(raw).find()) return null;
        try { return new URI(raw); }
        catch (URISyntaxException error) { return null; }
    }

    private static boolean controls(String value) {
        for (int i = 0; i < value.length(); i++) if (value.charAt(i) < 32 || value.charAt(i) == 127) return true;
        return false;
    }

    public static Target target(String raw) {
        URI uri = parse(raw);
        if (uri == null || !uri.isAbsolute()) return Target.BLOCKED;
        if ("geo".equalsIgnoreCase(uri.getScheme())) return validGeo(uri) ? Target.MAP : Target.BLOCKED;
        if ("mailto".equalsIgnoreCase(uri.getScheme())) return validEmail(uri) ? Target.EMAIL : Target.BLOCKED;
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getHost() == null) return Target.BLOCKED;
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        if (!host.matches("[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?") || host.contains("..")
                || host.indexOf('.') < 0 || host.matches("[0-9.]+")) return Target.BLOCKED;
        for (String label : host.split("\\.")) if (label.length() > 63 || label.startsWith("-") || label.endsWith("-")) return Target.BLOCKED;
        return HOST.equals(host) ? Target.INTERNAL : Target.EXTERNAL;
    }

    private static boolean validGeo(URI uri) {
        if (uri.getRawFragment() != null) return false;
        Matcher match = GEO.matcher(uri.getRawSchemeSpecificPart());
        return match.matches() && Math.abs(Double.parseDouble(match.group(1))) <= 90
                && Math.abs(Double.parseDouble(match.group(2))) <= 180;
    }

    private static boolean validEmail(URI uri) {
        if (uri.getRawFragment() != null) return false;
        String[] parts = uri.getRawSchemeSpecificPart().split("\\?", -1);
        if (parts.length > 2 || !parts[0].equals("dovebevo@gmail.com")) return false;
        if (parts.length == 1) return true;
        Set<String> seen = new HashSet<>();
        for (String item : parts[1].split("&", -1)) {
            String[] pair = item.split("=", 2);
            if (pair.length != 2 || !(pair[0].equals("subject") || pair[0].equals("body")) || !seen.add(pair[0])) return false;
            try {
                String value = URLDecoder.decode(pair[1], StandardCharsets.UTF_8.name());
                if (value.length() > 1024 || controls(value) || value.indexOf('%') >= 0) return false;
            } catch (Exception error) { return false; }
        }
        return true;
    }

    public static String shareUrl(String raw) {
        if (target(raw) != Target.INTERNAL) return HOME;
        URI uri = parse(raw);
        if (uri == null || uri.getRawFragment() != null) return HOME;
        String path = uri.getRawPath();
        if (path == null || path.isEmpty()) path = "/";
        String query = uri.getRawQuery();
        if (path.matches("/bar/[nwru][1-9][0-9]{0,14}") && query != null && query.matches("c=[0-9b-hjkmnp-z]{5}"))
            return "https://" + HOST + path + "?" + query;
        if (query == null && (path.equals("/") || path.matches("/(?:privacy|regole|copertura|roma|milano|torino|napoli)/?")))
            return "https://" + HOST + path;
        return HOME;
    }

    public static boolean isLocationOrigin(String origin) {
        if (target(origin) != Target.INTERNAL) return false;
        URI uri = parse(origin);
        return uri != null && (uri.getRawPath() == null || uri.getRawPath().isEmpty() || uri.getRawPath().equals("/"))
                && uri.getRawQuery() == null && uri.getRawFragment() == null;
    }

    public static boolean canGrantLocation(String origin, String visiblePage, boolean foreground, boolean coarse, boolean fine) {
        return foreground && isLocationOrigin(origin) && target(visiblePage) == Target.INTERNAL && (coarse || fine);
    }
}
