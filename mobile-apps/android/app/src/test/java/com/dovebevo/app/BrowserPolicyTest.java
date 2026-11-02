package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public class BrowserPolicyTest {
    @Test public void onlyCanonicalHttpsWebsiteStaysInside() {
        assertEquals(BrowserPolicy.Target.INTERNAL, BrowserPolicy.target(BrowserPolicy.HOME));
        assertEquals(BrowserPolicy.Target.INTERNAL, BrowserPolicy.target("https://www.dovebevo.com/bar/n123?c=u0nd9"));
        assertEquals(BrowserPolicy.Target.EXTERNAL, BrowserPolicy.target("https://maps.apple.com/?ll=41.9,12.5"));
        assertEquals(BrowserPolicy.Target.EXTERNAL, BrowserPolicy.target("https://www.openstreetmap.org/copyright"));
        assertEquals(BrowserPolicy.Target.EXTERNAL, BrowserPolicy.target("https://www.dovebevo.com.example.org/"));
    }

    @Test public void ambiguousOrPrivilegedUrlsNeverLaunchAnIntentOrLoad() {
        for (String value : new String[]{null, "", "//www.dovebevo.com/", "http://www.dovebevo.com/",
                "https://user@www.dovebevo.com/", "https://www.dovebevo.com:444/", "https://www.dovebevo.com\\@evil.test/",
                "https://www.dovebevo.com/%0a", "javascript:alert(1)", "file:///tmp/test", "content://private/a",
                "intent://example/#Intent;end", "data:text/html,test", "https://[::1]/", "https://exa mple.org/"}) {
            assertEquals(value, BrowserPolicy.Target.BLOCKED, BrowserPolicy.target(value));
        }
    }

    @Test public void onlyExistingSupportEmailMayUseMailClient() {
        assertEquals(BrowserPolicy.Target.EMAIL, BrowserPolicy.target("mailto:dovebevo@gmail.com"));
        assertEquals(BrowserPolicy.Target.EMAIL, BrowserPolicy.target("mailto:dovebevo@gmail.com?subject=Dove%20bevo"));
        for (String value : new String[]{"mailto:other@example.org", "mailto:dovebevo@gmail.com,other@example.org",
                "mailto:dovebevo@gmail.com?cc=other@example.org", "mailto:dovebevo@gmail.com?subject=x%0aBcc:other@example.org"}) {
            assertEquals(BrowserPolicy.Target.BLOCKED, BrowserPolicy.target(value));
        }
    }

    @Test public void existingWebsiteDirectionsUseExactBoundedGeoCoordinates() {
        assertEquals(BrowserPolicy.Target.MAP, BrowserPolicy.target("geo:41.90278,12.49636?q=41.90278,12.49636"));
        assertEquals(BrowserPolicy.Target.MAP, BrowserPolicy.target("geo:-90,-180?q=-90,-180"));
        for (String value : new String[]{"geo:91,12?q=91,12", "geo:41,181?q=41,181", "geo:NaN,12?q=NaN,12",
                "geo:41,12?q=other", "geo:41,12?q=42,12", "geo:41,12?q=41,12&intent=evil", "geo:41,12#fragment"}) {
            assertEquals(BrowserPolicy.Target.BLOCKED, BrowserPolicy.target(value));
        }
    }

    @Test public void sharingNeverLeaksArbitraryQueryOrPrivateRoutes() {
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9", BrowserPolicy.shareUrl("https://www.dovebevo.com/bar/n123?c=u0nd9"));
        assertEquals("https://www.dovebevo.com/privacy", BrowserPolicy.shareUrl("https://www.dovebevo.com/privacy"));
        for (String value : new String[]{"https://evil.test/", "https://www.dovebevo.com/admin", "https://www.dovebevo.com/?token=private",
                "https://www.dovebevo.com/bar/n123?c=u0nd9&lat=41", "https://www.dovebevo.com/bar/n123#private"}) {
            assertEquals(BrowserPolicy.HOME, BrowserPolicy.shareUrl(value));
        }
    }

    @Test public void geolocationNeedsExactOriginVisibleTrustedPageAndOsGrant() {
        assertTrue(BrowserPolicy.canGrantLocation("https://www.dovebevo.com", BrowserPolicy.HOME, true, true, false));
        assertTrue(BrowserPolicy.canGrantLocation("https://www.dovebevo.com/", BrowserPolicy.HOME, true, false, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://evil.test", BrowserPolicy.HOME, true, true, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://www.dovebevo.com/path", BrowserPolicy.HOME, true, true, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://www.dovebevo.com?x=1", BrowserPolicy.HOME, true, true, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://www.dovebevo.com", "https://evil.test/", true, true, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://www.dovebevo.com", BrowserPolicy.HOME, false, true, true));
        assertFalse(BrowserPolicy.canGrantLocation("https://www.dovebevo.com", BrowserPolicy.HOME, true, false, false));
    }
}
