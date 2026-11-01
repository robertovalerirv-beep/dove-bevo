package com.dovebevo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class MobileEntryTest {
    @Test public void realDocumentKeepsCanonicalVenueIdentity() {
        String canonical = "https://www.dovebevo.com/bar/n123?c=u0nd9";
        String document = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
        assertEquals(canonical, MobileEntry.publicVenue(document));
        assertEquals(document, MobileEntry.venueDocument(canonical));
        assertEquals(canonical, MobileEntry.publicVenue("https://www.dovebevo.com/mobile/?c=u0nd9&path=%2Fbar%2Fn123"));
        assertNull(MobileEntry.publicVenue(canonical));
        assertNull(MobileEntry.venueDocument("https://evil.test/bar/n123?c=u0nd9"));
    }
    @Test public void documentRoutesRejectMalformedAndAmbiguousIdentity() {
        for (String raw : new String[]{
            "https://evil.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9",
            "https://www.dovebevo.com@evil.test/mobile/?path=%2Fbar%2Fn123&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9#bad",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&c=u0nd8",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&extra=1",
            "https://www.dovebevo.com/mobile/?path=%252Fbar%252Fn123&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn0&c=u0nd9",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=wrong",
            "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9%0a",
            "https://www.dovebevo.com/mobile/"
        }) assertNull(raw, MobileEntry.publicVenue(raw));
    }
}
