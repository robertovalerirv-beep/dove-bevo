package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class MapReturnRouteTest {
    @Test public void capturedMapAreaUsesCityPrecisionOnly() throws Exception {
        DiscoveryArea milan = new DiscoveryArea(45.46427, 9.19033, 14);
        String city = MapReturnRoute.forArea(milan);
        assertEquals(MobileEntry.HOME + "?at=45.46,9.19", city);
        assertTrue(MapReturnRoute.valid(city));
        assertFalse(city.contains("45.46427"));
        assertFalse(city.contains("9.19033"));

        DiscoveryArea london = new DiscoveryArea(51.50745, -0.12783, 14);
        String foreign = MapReturnRoute.forArea(london);
        assertEquals(MobileEntry.HOME + "?at=51.51,-0.13", foreign);
        assertTrue(MapReturnRoute.valid(foreign));
        assertFalse(foreign.contains("51.50745"));
        assertFalse(foreign.contains("-0.12783"));
        assertNull(MapReturnRoute.forArea(null));
    }

    @Test public void retainsOnlyTrustedCityOrHomeMap() {
        assertTrue(MapReturnRoute.valid(MobileEntry.HOME));
        assertTrue(MapReturnRoute.valid(MobileEntry.HOME+"?at=45.4642,9.1900"));
        assertTrue(MapReturnRoute.valid(MobileEntry.HOME+"?at=45.46420%2C9.19000"));
        assertTrue(MapReturnRoute.valid(MobileEntry.HOME+"?at=40.8518,14.2681"));
        for(String bad:new String[]{null,"https://example.com/mobile/?at=45.4642,9.1900",
                MobileEntry.HOME+"?path=%2Fbar%2Fn123&c=u0nd9",
                MobileEntry.HOME+"?at=95,9",MobileEntry.HOME+"?at=45,190",
                MobileEntry.HOME+"?at=45,9&other=1",MobileEntry.HOME+"#map"})
            assertFalse(bad,MapReturnRoute.valid(bad));
    }
}
