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

    @Test public void navigationUsesTheMobileDocumentButBookmarksAndSharesStayPublic() {
        String canonical = "https://www.dovebevo.com/bar/n123?c=u0nd9";
        String document = "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
        assertEquals("https://www.dovebevo.com/mobile/", MobileEntry.documentURL(BrowserPolicy.HOME));
        assertEquals(document, MobileEntry.documentURL(canonical));
        assertEquals(document, MobileEntry.documentURL(document));
        assertEquals(canonical, SavedVenueUrl.canonicalize(document));
        assertEquals(canonical, BrowserPolicy.shareUrl(document));
        assertEquals(BrowserPolicy.HOME, BrowserPolicy.shareUrl("https://www.dovebevo.com/mobile/"));
        assertTrue(MobileEntry.isDocument(document));
        assertFalse(MobileEntry.isDocument(canonical));
    }

    @Test public void translatingAnEntryDoesNotRewriteLegalPagesOrDiscardTheMapPosition() {
        assertEquals("https://www.dovebevo.com/mobile/?at=45.4642,9.19",
                MobileEntry.documentURL("https://www.dovebevo.com/?at=45.4642,9.19"));
        assertEquals("https://www.dovebevo.com/privacy", MobileEntry.documentURL("https://www.dovebevo.com/privacy"));
        assertEquals("https://www.dovebevo.com/regole", MobileEntry.documentURL("https://www.dovebevo.com/regole"));
        assertEquals("https://evil.test/", MobileEntry.documentURL("https://evil.test/"));
        assertNull(MobileEntry.publicVenue("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&path=%2Fbar%2Fn123&c=u0nd9"));
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",
                MobileEntry.publicVenue("https://www.dovebevo.com/mobile/index.html?c=u0nd9&path=%2Fbar%2Fn123"));
    }
}
