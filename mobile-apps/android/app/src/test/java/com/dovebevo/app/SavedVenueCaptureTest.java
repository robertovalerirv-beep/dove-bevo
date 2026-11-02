package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class SavedVenueCaptureTest {
    private static final String ONE = "https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static final String TWO = "https://www.dovebevo.com/bar/w9?c=sr2y7";

    @Test public void preservesTheExistingNameIncludingInternalSpacesAndOneCharacterNames() {
        SavedVenueCapture capture = new SavedVenueCapture(ONE, 4);
        SavedVenueCapture.Venue venue = capture.complete(ONE, "  Caffè  d’Èra 🍷  ", "n123", ONE, 4);
        assertNotNull(venue);
        assertEquals("Caffè  d’Èra 🍷", venue.name);
        assertEquals(ONE, venue.url);
        assertEquals("A", capture.complete(ONE, "A", "n123", ONE, 4).name);
    }

    @Test public void rejectsMissingUnsafeAndOversizedNamesWithoutAnIdFallback() {
        SavedVenueCapture capture = new SavedVenueCapture(ONE, 1);
        for (String name : new String[]{null, "", " \u2003 ", "x".repeat(121), "🍷".repeat(61),
                "Cafe\n", "Cafe\t", "Cafe\u0085", "Cafe\ud800", "Cafe\udfff"})
            assertNull(String.valueOf(name), capture.complete(ONE, name, "n123", ONE, 1));
        assertEquals("x".repeat(120), capture.complete(ONE, "x".repeat(120), "n123", ONE, 1).name);
        assertEquals("🍷".repeat(60), capture.complete(ONE, "🍷".repeat(60), "n123", ONE, 1).name);
    }

    @Test public void bindsReportedAndCurrentCanonicalUrlsAndExistingSelectedVenueMarker() {
        SavedVenueCapture capture = new SavedVenueCapture(ONE, 3);
        assertNotNull(capture.complete("https://dovebevo.com/bar/n123?c=u0nd9", "Actual name", "n123", ONE, 3));
        assertNull(capture.complete(TWO, "Actual name", "n123", ONE, 3));
        assertNull(capture.complete(ONE, "Actual name", "n123", TWO, 3));
        assertNull(capture.complete(ONE, "Actual name", "w9", ONE, 3));
        assertNull(capture.complete(ONE, "Actual name", null, ONE, 3));
        assertNull(capture.complete(ONE, "Actual name", "n123", null, 3));
        assertNull(new SavedVenueCapture(BrowserPolicy.HOME, 3).complete(ONE, "Actual name", "n123", ONE, 3));
        assertNull(capture.complete(ONE + "&token=private", "Actual name", "n123", ONE, 3));
    }

    @Test public void navigationAwayAndBackOrStopInvalidatesAnEarlierCaptureEvenAtTheSameUrl() {
        SavedVenueCapture capture = new SavedVenueCapture(ONE, 5);
        assertNull(capture.complete(ONE, "Actual name", "n123", ONE, 6));
        assertNull(capture.complete(ONE, "Actual name", "n123", ONE, 7));
        assertNotNull(new SavedVenueCapture(ONE, 7).complete(ONE, "Actual name", "n123", ONE, 7));
    }

    @Test public void decoderAcceptsOnlyTheFixedThreeStringResultAndJsonEscaping() {
        SavedVenueCapture capture = new SavedVenueCapture(ONE, 1);
        SavedVenueCapture.Venue venue = VenueHeadingReader.decode(
                "[\"https:\\/\\/www.dovebevo.com\\/bar\\/n123?c=u0nd9\",\"Caff\\u00e8 \\\"A\\\"\",\"n123\"]", capture, ONE, 1);
        assertNotNull(venue);
        assertEquals("Caffè \"A\"", venue.name);
        for (String bad : new String[]{null, "", "null", "{}", "[]", "[\"" + ONE + "\",\"Name\"]",
                "[\"" + ONE + "\",\"Name\",\"n123\",\"extra\"]", "['" + ONE + "','Name','n123']",
                "[\"" + ONE + "\",Name,\"n123\"]", "[\"" + ONE + "\",null,\"n123\"]",
                "[\"" + ONE + "\",3,\"n123\"]", "[\"" + ONE + "\",\"Name\",\"n123\"] true",
                "/*comment*/[\"" + ONE + "\",\"Name\",\"n123\"]", "[\"" + ONE + "\",\"Name\\q\",\"n123\"]",
                "[\"" + ONE + "\",\"Name\\uZZZZ\",\"n123\"]", "x".repeat(4097)})
            assertNull(String.valueOf(bad), VenueHeadingReader.decode(bad, capture, ONE, 1));
        assertNull(VenueHeadingReader.decode("[\"" + ONE + "\",\"Name\\n\",\"n123\"]", capture, ONE, 1));
        assertNull(VenueHeadingReader.decode("[\"" + ONE + "\",\"Name\",\"w9\"]", capture, ONE, 1));
    }
}
