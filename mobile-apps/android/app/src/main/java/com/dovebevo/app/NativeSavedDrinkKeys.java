package com.dovebevo.app;

import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/** Private exact saved identities for the trusted mobile document only. */
final class NativeSavedDrinkKeys {
    private NativeSavedDrinkKeys() {}

    static String venuePrefix(String raw) {
        String canonical = SavedVenueUrl.canonicalize(raw);
        if (canonical == null) return null;
        URI venue = URI.create(canonical);
        return venue.getPath().substring(5) + "|" + venue.getRawQuery().substring(2) + "|";
    }

    static String key(String venueUrl, String kind, String item, String band, String currency, String serving) {
        String canonical = SavedVenueUrl.canonicalize(venueUrl);
        if (canonical == null) return null;
        URI venue = URI.create(canonical);
        String key = venue.getPath().substring(5);
        String cell = venue.getRawQuery().substring(2);
        if (!kind.matches("offer|legacy|customer|europe") || item == null || item.indexOf('|') >= 0) return null;
        String result = key + "|" + cell + "|" + kind + "|" + item;
        if (kind.equals("legacy") || kind.equals("europe")) {
            if (!("0".equals(band) || "1".equals(band))) return null;
            result += "|" + band;
        }
        if (kind.equals("europe")) {
            if (!("EUR".equals(currency) || "GBP".equals(currency)) || serving == null ||
                    !serving.matches("(?:drink|glass|ml):[0-9]{0,4}")) return null;
            result += "|" + currency + "|" + serving;
        }
        return result;
    }

    static List<String> load(SavedDrinkStore drinks, SavedMenuOfferStore offers,
                             SavedMenuOfferStore customers, SavedEuropeDrinkStore europe) throws IOException {
        List<String> keys = new ArrayList<>();
        for (SavedDrinkStore.Entry item : drinks.load())
            add(keys, key(item.venue.url, "legacy", item.drink.code, Integer.toString(item.band), null, null));
        for (SavedMenuOfferStore.Entry item : offers.load())
            add(keys, key(item.venue.url, "offer", item.id, null, null, null));
        for (SavedMenuOfferStore.Entry item : customers.load())
            add(keys, key(item.venue.url, "customer", item.id, null, null, null));
        for (SavedEuropeDrinkStore.Entry item : europe.load())
            add(keys, key(item.venue.url, "europe", item.drink.code, Integer.toString(item.band),
                    item.currency, item.serving.key()));
        return keys;
    }

    private static void add(List<String> keys, String key) throws IOException {
        if (key == null) throw new IOException("Invalid saved drink identity");
        keys.add(key);
    }
}
