package com.dovebevo.app;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/** Pure translation between the app document and canonical public venue links. */
final class MobileEntry {
    static final String HOME = "https://www.dovebevo.com/mobile/";
    static final String MARKER = "document.documentElement.getAttribute('data-dovebevo-mobile-shell') === '1'";
    private MobileEntry() {}

    static String publicVenue(String raw) {
        if (raw == null || raw.length() > 512 || raw.indexOf('\\') >= 0) return null;
        try {
            URI uri = new URI(raw);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getRawUserInfo() != null
                    || uri.getRawAuthority() == null || !uri.getRawAuthority().matches("(?i)(?:www\\.)?dovebevo\\.com(?::443)?")
                    || uri.getRawFragment() != null || !isEntryPath(uri.getRawPath()) || uri.getRawQuery() == null) return null;
            Map<String,String> query = new HashMap<>();
            for (String part : uri.getRawQuery().split("&", -1)) {
                String[] pair = part.split("=", -1);
                if (pair.length != 2 || !(pair[0].equals("path") || pair[0].equals("c") || pair[0].equals("drink") || pair[0].equals("hh") || pair[0].equals("offer"))
                        || query.put(pair[0], pair[1]) != null) return null;
            }
            boolean offerFocus = query.size() == 3 && uri.getRawQuery().matches("path=%2Fbar%2F(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})&c=[0-9b-hjkmnp-z]{5}&offer=[A-Za-z0-9._:-]{1,128}");
            if (!offerFocus && !(query.size() == 2 && query.containsKey("path") && query.containsKey("c")) &&
                    !(query.size() == 4 && query.containsKey("path") && query.containsKey("c") &&
                    RecommendationDrink.from(query.get("drink")) != null && ("0".equals(query.get("hh")) || "1".equals(query.get("hh"))))) return null;
            String path = URLDecoder.decode(query.get("path"), StandardCharsets.UTF_8.name());
            String cell = query.get("c");
            if (!path.matches("/bar/(?:[nwru][1-9][0-9]{0,14}|m[0-9a-f]{24})") || !cell.matches("[0-9b-hjkmnp-z]{5}")) return null;
            return "https://www.dovebevo.com" + path + "?c=" + cell;
        } catch (Exception invalid) { return null; }
    }

    static boolean isEntryPath(String path) {
        return "/mobile/".equals(path) || "/mobile/index.html".equals(path);
    }

    static boolean isDocument(String raw) {
        if (BrowserPolicy.target(raw) != BrowserPolicy.Target.INTERNAL) return false;
        try { return isEntryPath(new URI(raw).getRawPath()); }
        catch (Exception invalid) { return false; }
    }

    static String documentURL(String raw) {
        String venue = venueDocument(raw);
        if (venue != null) return venue;
        if (BrowserPolicy.target(raw) != BrowserPolicy.Target.INTERNAL) return raw;
        try {
            URI url = new URI(raw);
            if (!"/".equals(url.getRawPath()) || url.getRawFragment() != null) return raw;
            if (url.getRawQuery() == null) return HOME;
            if (url.getRawQuery().matches("at=-?[0-9]{1,2}(?:\\.[0-9]{1,5})?,-?[0-9]{1,3}(?:\\.[0-9]{1,5})?"))
                return HOME + "?" + url.getRawQuery();
        } catch (Exception invalid) { return raw; }
        return raw;
    }

    static String venueDocument(String canonical) {
        String valid = SavedVenueUrl.canonicalize(canonical);
        if (valid == null) return null;
        URI uri = URI.create(valid);
        String result = HOME + "?path=%2Fbar%2F" + uri.getPath().substring(5) + "&" + uri.getRawQuery();
        if (publicVenue(canonical) != null) {
            String query = URI.create(canonical).getRawQuery();
            String drink = null, band = null;
            for (String part : query.split("&")) {
                if (part.startsWith("drink=")) drink = part.substring(6);
                if (part.startsWith("hh=")) band = part.substring(3);
            }
            if (drink != null && band != null) result += "&drink=" + drink + "&hh=" + band;
            String offer = query.substring(query.lastIndexOf("offer=") + 6);
            if (query.contains("&offer=") && offer.matches("[A-Za-z0-9._:-]{1,128}")) result += "&offer=" + offer;
        }
        return result;
    }

    static String offerDocument(String venueUrl,String offerId) {
        String identity=SavedVenueUrl.canonicalize(venueUrl);
        if(identity==null||offerId==null||!offerId.matches("[A-Za-z0-9._:-]{1,128}"))return null;
        return venueDocument(identity)+"&offer="+offerId;
    }

    static String drinkDocument(String venueUrl, RecommendationDrink drink, int band) {
        String identity = SavedVenueUrl.canonicalize(venueUrl);
        if (identity == null || drink == null || (band != 0 && band != 1)) return null;
        return venueDocument(identity) + "&drink=" + drink.code + "&hh=" + band;
    }

    static boolean matchesDrink(String raw, RecommendationDrink drink, int band) {
        if (publicVenue(raw) == null || drink == null || (band != 0 && band != 1)) return false;
        String selected = null, selectedBand = null;
        for (String part : URI.create(raw).getRawQuery().split("&")) {
            if (part.startsWith("drink=")) selected = part.substring(6);
            if (part.startsWith("hh=")) selectedBand = part.substring(3);
        }
        return selected == null || (selected.equals(drink.code) && selectedBand.equals(Integer.toString(band)));
    }
}
