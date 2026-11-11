package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class NativeSavedDrinkKeysTest {
    private static final String VENUE="https://www.dovebevo.com/bar/n123?c=u0nd9";

    @Test public void exactPrivateKeysKeepDrinkBandAndServingDistinct() {
        assertEquals("n123|u0nd9|",NativeSavedDrinkKeys.venuePrefix(
                "https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9"));
        assertEquals("n123|u0nd9|offer|source:123",
                NativeSavedDrinkKeys.key(VENUE,"offer","source:123",null,null,null));
        assertEquals("n123|u0nd9|legacy|spritz|0",
                NativeSavedDrinkKeys.key(VENUE,"legacy","spritz","0",null,null));
        assertEquals("n123|u0nd9|customer|o"+"a".repeat(64),
                NativeSavedDrinkKeys.key(VENUE,"customer","o"+"a".repeat(64),null,null,null));
        assertEquals("n123|u0nd9|europe|beer_draft|0|GBP|ml:568",
                NativeSavedDrinkKeys.key(VENUE,"europe","beer_draft","0","GBP","ml:568"));
        assertNotEquals(NativeSavedDrinkKeys.key(VENUE,"legacy","spritz","0",null,null),
                NativeSavedDrinkKeys.key(VENUE,"legacy","spritz","1",null,null));
        assertNotEquals(NativeSavedDrinkKeys.key(VENUE,"europe","beer_draft","0","GBP","ml:400"),
                NativeSavedDrinkKeys.key(VENUE,"europe","beer_draft","0","GBP","ml:568"));
    }

    @Test public void invalidVenueOrIdentityIsNeverExposed() {
        assertNull(NativeSavedDrinkKeys.venuePrefix("https://www.dovebevo.com/mobile/"));
        assertNull(NativeSavedDrinkKeys.key("https://example.com/bar/n123?c=u0nd9","offer","source:123",null,null,null));
        assertNull(NativeSavedDrinkKeys.key(VENUE,"offer","bad|item",null,null,null));
        assertNull(NativeSavedDrinkKeys.key(VENUE,"legacy","spritz","2",null,null));
        assertNull(NativeSavedDrinkKeys.key(VENUE,"europe","beer_draft","0","USD","ml:568"));
    }
}
