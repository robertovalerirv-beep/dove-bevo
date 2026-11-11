package com.dovebevo.app;

import java.net.URI;
import java.util.Locale;

/** Retain only a trusted map city route when a native list opens a venue. */
final class MapReturnRoute {
    private MapReturnRoute() {}

    static String forArea(DiscoveryArea area) {
        if (area == null) return null;
        // Captured map/Locate position is only a city-level hint in a URL.
        String route = MobileEntry.HOME + "?at=" + String.format(Locale.ROOT, "%.2f,%.2f", area.lat, area.lon);
        return valid(route) ? route : null;
    }

    static boolean valid(String raw) {
        if (BrowserPolicy.target(raw) != BrowserPolicy.Target.INTERNAL) return false;
        try {
            URI url = URI.create(raw);
            if (!"/mobile/".equals(url.getRawPath()) || url.getRawFragment() != null) return false;
            String query = url.getRawQuery();
            if (query == null) return true;
            query = query.replace("%2C", ",").replace("%2c", ",");
            if (!query.matches("at=-?[0-9]{1,2}(?:\\.[0-9]{1,5})?,-?[0-9]{1,3}(?:\\.[0-9]{1,5})?"))
                return false;
            String[] pair = query.substring(3).split(",", -1);
            double lat = Double.parseDouble(pair[0]), lon = Double.parseDouble(pair[1]);
            return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
        } catch (RuntimeException invalid) { return false; }
    }
}
