package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class DrinkActionCommandTest {
    private static final String VENUE="https://www.dovebevo.com/bar/m000000000000000000000007?c=u0nd9";
    private static final String BASE="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&";

    @Test public void exactDrinkAndHappyHourRemainSeparateActions(){
        DrinkActionCommand regular=DrinkActionCommand.parse(BASE+"save_drink=spritz&band=normal",VENUE);
        assertNotNull(regular);assertEquals(DrinkActionCommand.Kind.SAVE_LEGACY,regular.kind);
        assertEquals(RecommendationDrink.SPRITZ,regular.drink);assertEquals(0,regular.band);
        DrinkActionCommand happy=DrinkActionCommand.parse(BASE+"save_drink=spritz&band=happy_hour",VENUE);
        assertNotNull(happy);assertEquals(1,happy.band);
        assertNull(SavedVenueUrl.canonicalize(BASE+"save_drink=spritz&band=normal"));
    }

    @Test public void customerItemKeepsItsExactOpaqueKey(){
        String id="c"+"a".repeat(64);
        DrinkActionCommand command=DrinkActionCommand.parse(BASE+"save_customer="+id,VENUE);
        assertNotNull(command);assertEquals(DrinkActionCommand.Kind.SAVE_CUSTOMER,command.kind);
        assertEquals(id,command.itemKey);assertNull(command.drink);
    }

    @Test public void forgedOrAmbiguousCommandsAreRejected(){
        String id="c"+"a".repeat(64);
        for(String raw:new String[]{BASE+"save_drink=spritz&band=other",BASE+"save_drink=%73pritz&band=normal",
                BASE+"save_drink=spritz&band=normal&extra=x",BASE+"save_drink=spritz&band=normal#frag",
                BASE+"save_customer="+id+"&recommend_drink=spritz",BASE+"save_customer="+id.toUpperCase(),
                BASE+"recommend_drink=unknown",BASE+"recommend_drink=spritz&recommend_drink=water",
                BASE.replace("%2Fbar%2F","%252Fbar%252F")+"save_drink=spritz&band=normal",
                "https://evil.test/mobile/?path=%2Fbar%2Fm000000000000000000000007&c=u0nd9&save_drink=spritz&band=normal"})
            assertNull(raw,DrinkActionCommand.parse(raw,VENUE));
        assertNull(DrinkActionCommand.parse(BASE+"save_drink=spritz&band=normal","https://www.dovebevo.com/bar/n123?c=u0nd9"));
    }
}
