package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class MapReturnRouteTest {
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
