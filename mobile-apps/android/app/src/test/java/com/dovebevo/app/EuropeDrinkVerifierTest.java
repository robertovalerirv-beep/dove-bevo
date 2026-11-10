package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class EuropeDrinkVerifierTest {
    private static final String URL=EuropeDrinkSaveCommandTest.VALID;
    private static final String VENUE=EuropeDrinkSaveCommandTest.VENUE;
    @Test public void verifiesActiveExactVenueRowAndUsesCatalogueName()throws Exception {
        EuropeDrinkSaveCommand request=EuropeDrinkSaveCommand.parse(URL,VENUE);
        EuropePrices.Catalog catalog=EuropePricesTest.catalog();
        EuropePrices.Cell live=EuropePrices.parse(EuropePricesTest.bytes(EuropePricesTest.body(EuropePricesTest.beer(250,600,0)+","+EuropePricesTest.beer(500,800,0),"","")),catalog,"gcpvj","n91",EuropePricesTest.TODAY);
        EuropeDrinkVerifier.Verified value=EuropeDrinkVerifier.verify(request,catalog,live);
        assertNotNull(value);assertEquals("Owned London fixture",value.entry.venue.label);assertEquals(800,value.price.amountMinor);
        assertEquals("GBP",value.entry.currency);assertEquals("ml:500",value.entry.serving.key());
        assertNull(EuropeDrinkVerifier.verify(request,catalog,EuropePrices.parse(EuropePricesTest.bytes(EuropePricesTest.body(EuropePricesTest.beer(250,600,0),"","")),catalog,"gcpvj","n91",EuropePricesTest.TODAY)));
        assertNull(EuropeDrinkVerifier.verify(request,catalog,EuropePrices.parse(EuropePricesTest.bytes(EuropePricesTest.body(EuropePricesTest.beer(500,800,0),"\"n91\"","")),catalog,"gcpvj","n91",EuropePricesTest.TODAY)));
        assertThrows(IOException.class,()->EuropeDrinkVerifier.verify(request,catalog,EuropePrices.parse(EuropePricesTest.bytes(EuropePricesTest.body("","","")),catalog,"u09tv","n92",EuropePricesTest.TODAY)));
    }
    @Test public void verifiesThroughPublicGetWithoutPostingOrUsingCookies()throws Exception {
        AtomicReference<String> paths=new AtomicReference<>("");
        EuropePricesClient client=new EuropePricesClient((url,max,call)->{
            paths.set(paths.get()+"\n"+url);
            return EuropePricesTest.bytes(url.endsWith("catalog.json")?EuropePricesTest.CATALOG:EuropePricesTest.body(EuropePricesTest.beer(500,800,0),"",""));
        },()->EuropePricesTest.TODAY);
        EuropeDrinkVerifier verifier=new EuropeDrinkVerifier(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<EuropeDrinkVerifier.Verified> value=new AtomicReference<>();
        try{verifier.load(EuropeDrinkSaveCommand.parse(URL,VENUE),result->{value.set(result);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));
            assertNotNull(value.get());assertEquals(800,value.get().price.amountMinor);assertTrue(paths.get().contains("/mobile-data/catalog.json"));
            assertTrue(paths.get().contains("/api/mobile/prices/venues/n91?cell=gcpvj"));}
        finally{verifier.close();}
    }
}
