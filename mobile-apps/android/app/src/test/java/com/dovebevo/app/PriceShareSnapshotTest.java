package com.dovebevo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class PriceShareSnapshotTest {
    static final String URL="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    static String json(){return """
        {"href":"https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9","version":"1","venue":"n123","venueName":"Locale reale","drink":"spritz","drinkName":"Spritz","hh":"0","amountMinor":"1300","currency":"GBP","serving":"drink","provenance":"Dal menu online · verificato il 02/11/2026 · Aperol Spritz","confirmations":"0","tier":"neutro","location":"London"}
        """;}
    private PriceShareSnapshot read(String raw){return PriceShareSnapshot.decode(raw,URL,URL,4,4);}
    @Test public void originalPoundsAndMenuProvenanceArePreserved(){PriceShareSnapshot p=read(json());assertNotNull(p);assertEquals("£13.00",p.amountLabel());assertTrue(p.provenance.startsWith("Dal menu online"));assertEquals(0,p.confirmations);assertEquals(URL,p.url);assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",p.identityUrl);}
    @Test public void foreignVenueShareRetainsAppsOnlyMobileRoute(){String url=URL.replace("n123","n6044678286");PriceShareSnapshot p=PriceShareSnapshot.decode(json().replace("n123","n6044678286"),url,url,4,4);assertNotNull(p);assertEquals(url,p.url);assertTrue(p.url.contains("/mobile/?path=%2Fbar%2F"));assertEquals("GBP",p.currency);}
    @Test public void accessiblePosterIncludesServingBandAndConfirmations(){PriceShareSnapshot p=read(json().replace("\"serving\":\"drink\"","\"serving\":\"500 ml\"").replace("\"hh\":\"0\"","\"hh\":\"1\""));assertNotNull(p);String description=p.accessibilityDescription();assertTrue(description.contains("500 ml"));assertTrue(description.contains("Happy hour"));assertTrue(description.contains("0 conferme"));assertTrue(description.contains("London"));assertTrue(description.contains("non foto del locale"));}
    @Test public void legacyUnknownServingStaysEmpty(){assertEquals("",read(json().replace("\"serving\":\"drink\"","\"serving\":\"\"")).serving);}
    @Test public void staleWrongVenueAndForeignDocumentAreRejected(){assertNull(PriceShareSnapshot.decode(json(),URL,URL,4,5));assertNull(read(json().replace("\"venue\":\"n123\"","\"venue\":\"n456\"")));assertNull(PriceShareSnapshot.decode(json(),URL,"https://evil.example/mobile/?path=%2Fbar%2Fn123&c=u0nd9",4,4));assertNull(PriceShareSnapshot.decode(json(),"https://www.dovebevo.com/bar/n123?c=u0nd9",URL,4,4));}
    @Test public void unsupportedCurrencyAndAmountsFailClosed(){assertNull(read(json().replace("GBP","USD")));assertNull(read(json().replace("\"1300\"","\"0\"")));assertNull(read(json().replace("\"1300\"","\"5001\"")));assertNull(read(json().replace("\"1300\"","\"1e3\"")));}
    @Test public void bandConfirmationAndTierMustBeExact(){assertNull(read(json().replace("\"hh\":\"0\"","\"hh\":\"2\"")));assertNull(read(json().replace("\"confirmations\":\"0\"","\"confirmations\":\"1000001\"")));assertNull(read(json().replace("neutro","inventato")));}
    @Test public void oversizedOrControlTextIsRejected(){assertNull(read(json().replace("Locale reale","Locale\\nreale")));assertNull(read(json().replace("London","x".repeat(121))));assertNull(read(json().replace("Dal menu online · verificato il 02/11/2026 · Aperol Spritz","x".repeat(1025))));}
    @Test public void duplicateExtraOrMissingFieldsAreRejected(){assertNull(read(json().replace("\"version\":\"1\"","\"version\":\"1\",\"version\":\"1\"")));assertNull(read(json().replace("\"version\":\"1\"","\"version\":\"1\",\"private\":\"value\"")));assertNull(read(json().replace("\"location\":\"London\"","\"other\":\"London\"")));}
}
