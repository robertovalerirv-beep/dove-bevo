package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

/** Java-side capture must keep the focused favourite URL bound to the selected venue. */
public final class VenueHeadingReaderTest {
    private static final String FOCUSED = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&drink=spritz&hh=1";

    @Test public void focusedDrinkRouteKeepsTheRealVenueNameAndCanonicalBookmark() {
        SavedVenueCapture capture = new SavedVenueCapture(FOCUSED, 4);
        SavedVenueCapture.Venue venue = VenueHeadingReader.decode(result(FOCUSED, "Bar San Marco", "n123"), capture, FOCUSED, 4);
        assertNotNull(venue);
        assertEquals("Bar San Marco", venue.name);
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9", venue.url);
        assertNull(VenueHeadingReader.decode(result(FOCUSED, "Bar San Marco", "w9"), capture, FOCUSED, 4));
        assertNull(VenueHeadingReader.decode(result(FOCUSED, "Bar San Marco", "n123"), capture, FOCUSED, 5));
        assertNull(VenueHeadingReader.decode(result(FOCUSED, "Bar San Marco", "n123"), capture,
                "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fw9&c=u0nd9&drink=spritz&hh=1", 4));
    }

    private static String result(String url, String name, String key) {
        return "[\"" + url + "\",\"" + name + "\",\"" + key + "\"]";
    }
}
