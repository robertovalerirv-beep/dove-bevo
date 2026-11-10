package com.dovebevo.app;

import static org.junit.Assert.*;
import org.junit.Test;

public final class EuropeDrinkSaveCommandTest {
    static final String VENUE="https://www.dovebevo.com/bar/n91?c=gcpvj";
    static final String VALID="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn91&c=gcpvj&save_europe=beer_draft&band=normal&currency=GBP&serving=ml%3A500";

    @Test public void exactBridgeIdentityMatchesOnlyItsLivePrice()throws Exception{
        EuropeDrinkSaveCommand command=EuropeDrinkSaveCommand.parse(VALID,VENUE);
        assertNotNull(command);assertEquals("GBP",command.currency);assertEquals("ml:500",command.serving.key());assertEquals(0,command.band);
        EuropePrices.Cell rows=EuropePricesTest.cell(EuropePricesTest.beer(250,600,0)+","+EuropePricesTest.beer(500,800,0)+","+EuropePricesTest.beer(500,500,1));
        assertFalse(command.matches(rows.prices.get(0)));assertTrue(command.matches(rows.prices.get(1)));assertFalse(command.matches(rows.prices.get(2)));
        assertTrue(EuropeDrinkSaveCommand.requested(VALID));
    }

    @Test public void onlySameOriginOrderedCanonicalCommandsAreAccepted(){
        for(String invalid:new String[]{
                VALID.replace("https://www.dovebevo.com","http://www.dovebevo.com"),
                VALID.replace("www.dovebevo.com","www.dovebevo.com.evil.example"),
                VALID.replace("%2Fbar%2F","/bar/"),
                VALID.replace("&c=gcpvj&save_europe","&save_europe=beer_draft&c=gcpvj&save_europe"),
                VALID+"&extra=1",VALID+"#fragment",
                VALID.replace("c=gcpvj","c=u09tv"),
                VALID.replace("save_europe=beer_draft","save_europe=negroni"),
                VALID.replace("currency=GBP","currency=USD"),
                VALID.replace("serving=ml%3A500","serving=ml%3A0500"),
                VALID.replace("serving=ml%3A500","serving=ml%3A"),
                VALID.replace("serving=ml%3A500","serving=drink%3A"),
                VALID.replace("path=%2Fbar%2Fn91","path=%2Fbar%2Fn92")
        })assertNull(invalid,EuropeDrinkSaveCommand.parse(invalid,VENUE));
        assertNull(EuropeDrinkSaveCommand.parse(VALID,"https://www.dovebevo.com/bar/n92?c=gcpvj"));
        assertNotNull(EuropeDrinkSaveCommand.parse(VALID.replace("band=normal","band=happy_hour"),VENUE));
        assertNotNull(EuropeDrinkSaveCommand.parse(VALID.replace("save_europe=beer_draft","save_europe=wine_glass").replace("serving=ml%3A500","serving=glass%3A"),VENUE));
        assertFalse(EuropeDrinkSaveCommand.requested("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn91"));
    }
}
