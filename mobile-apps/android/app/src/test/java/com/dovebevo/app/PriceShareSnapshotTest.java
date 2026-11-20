package com.dovebevo.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class PriceShareSnapshotTest {
    static final String URL="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    static String json(){return """
        {"href":"https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9","version":"1","venue":"n123","venueName":"Locale reale","drink":"spritz","drinkName":"Spritz","hh":"0","amountMinor":"1300","currency":"GBP","serving":"drink","provenance":"Dal menu online · verificato il 02/11/2026 · Aperol Spritz","confirmations":"0","tier":"neutro","location":"London"}
        """;}
    private PriceShareSnapshot read(String raw){return PriceShareSnapshot.decode(raw,URL,URL,4,4);}
    @Test public void focusedCategoryAndBandMustAgreeWithActualFeaturedMarker(){
        for(RecommendationDrink drink:new RecommendationDrink[]{RecommendationDrink.SPRITZ,RecommendationDrink.NEGRONI})for(int band=0;band<2;band++){
            String route=MobileEntry.drinkDocument(URL,drink,band);
            String matching=json().replace(URL,route).replace("\"drink\":\"spritz\"","\"drink\":\""+drink.code+"\"").replace("\"hh\":\"0\"","\"hh\":\""+band+"\"");
            assertNotNull(PriceShareSnapshot.decode(matching,route,route,4,4));
            assertNull(PriceShareSnapshot.decode(matching.replace("\"hh\":\""+band+"\"","\"hh\":\""+(1-band)+"\""),route,route,4,4));
            String other=drink==RecommendationDrink.SPRITZ?"negroni":"spritz";
            assertNull(PriceShareSnapshot.decode(matching.replace("\"drink\":\""+drink.code+"\"","\"drink\":\""+other+"\""),route,route,4,4));
        }
        assertNotNull(read(json()));
    }
    @Test public void originalPoundsAndMenuProvenanceArePreserved(){PriceShareSnapshot p=read(json());assertNotNull(p);assertEquals("£13.00",p.amountLabel());assertTrue(p.provenance.startsWith("Dal menu online"));assertEquals(0,p.confirmations);assertEquals(URL,p.url);assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",p.identityUrl);}
    @Test public void foreignVenueShareRetainsAppsOnlyMobileRoute(){String url=URL.replace("n123","n6044678286");PriceShareSnapshot p=PriceShareSnapshot.decode(json().replace("n123","n6044678286"),url,url,4,4);assertNotNull(p);assertEquals(url,p.url);assertTrue(p.url.contains("/mobile/?path=%2Fbar%2F"));assertEquals("GBP",p.currency);}
    @Test public void accessiblePosterIncludesServingBandAndConfirmations(){PriceShareSnapshot p=read(json().replace("\"serving\":\"drink\"","\"serving\":\"500 ml\"").replace("\"hh\":\"0\"","\"hh\":\"1\""));assertNotNull(p);String description=p.accessibilityDescription();assertTrue(description.contains("500 ml"));assertTrue(description.contains("Happy hour"));assertTrue(description.contains("0 conferme"));assertTrue(description.contains("London"));assertTrue(description.contains("non foto del locale"));}
    @Test public void genericDrinkShareOmitsRedundantLabelButRetainsOriginalMarker(){PriceShareSnapshot p=read(json());assertNotNull(p);assertEquals("drink",p.serving);assertEquals("",p.servingLabel());assertFalse(p.accessibilityDescription().contains("drink ·"));assertTrue(p.accessibilityDescription().contains("Prezzo normale"));}
    @Test public void legacyUnknownServingStaysExplicit(){PriceShareSnapshot p=read(json().replace("\"serving\":\"drink\"","\"serving\":\"\""));assertNotNull(p);assertEquals("",p.serving);assertTrue(p.servingLabel().contains("Formato non indicato"));}
    @Test public void staleWrongVenueAndForeignDocumentAreRejected(){assertNull(PriceShareSnapshot.decode(json(),URL,URL,4,5));assertNull(read(json().replace("\"venue\":\"n123\"","\"venue\":\"n456\"")));assertNull(PriceShareSnapshot.decode(json(),URL,"https://evil.example/mobile/?path=%2Fbar%2Fn123&c=u0nd9",4,4));assertNull(PriceShareSnapshot.decode(json(),"https://www.dovebevo.com/bar/n123?c=u0nd9",URL,4,4));}
    @Test public void unsupportedCurrencyAndAmountsFailClosed(){assertNull(read(json().replace("GBP","USD")));assertNull(read(json().replace("\"1300\"","\"0\"")));assertNull(read(json().replace("\"1300\"","\"5001\"")));assertNull(read(json().replace("\"1300\"","\"1e3\"")));}
    @Test public void bandConfirmationAndTierMustBeExact(){assertNull(read(json().replace("\"hh\":\"0\"","\"hh\":\"2\"")));assertNull(read(json().replace("\"confirmations\":\"0\"","\"confirmations\":\"1000001\"")));assertNull(read(json().replace("neutro","inventato")));}
    @Test public void oversizedOrControlTextIsRejected(){assertNull(read(json().replace("Locale reale","Locale\\nreale")));assertNull(read(json().replace("London","x".repeat(121))));assertNull(read(json().replace("Dal menu online · verificato il 02/11/2026 · Aperol Spritz","x".repeat(1025))));}
    @Test public void duplicateExtraOrMissingFieldsAreRejected(){assertNull(read(json().replace("\"version\":\"1\"","\"version\":\"1\",\"version\":\"1\"")));assertNull(read(json().replace("\"version\":\"1\"","\"version\":\"1\",\"private\":\"value\"")));assertNull(read(json().replace("\"location\":\"London\"","\"other\":\"London\"")));}
    private static final String OFFER_URL=URL+"&offer=offer:1";
    private static String offerJson(){return """
        {"kind":"offer","href":"https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9&offer=offer:1","venue":"n123","venueName":"Locale reale","offer":"offer:1","drinkName":"Spritz della casa","amountLabel":"5,50 €","serving":"Drink singolo","provenance":"Prezzo del drink da menu, non totale pagato. Supplementi separati. Menu verificato il 2026-11-02","location":"Milano"}
        """;}
    private static MenuV2Prices.Venue menu(int amount,String day){
        MenuV2Prices.Price price=new MenuV2Prices.Price("offer:1","Locale reale","Spritz della casa","spritz",0,amount,"EUR",2,
            "Drink singolo",null,false,day,"Altre spese del locale non verificate; controlla la scheda del locale.",null,null,
            "https://example.org/menu","");
        return new MenuV2Prices.Venue("n123","u0nd9","Locale reale","Altre spese del locale non verificate; controlla la scheda del locale.",java.util.List.of(price));
    }
    @Test public void selectedOwnerMenuOfferRequiresFreshMatchingPriceAndKeepsFeeNotice(){
        MenuShareOffer captured=MenuShareOffer.decode(offerJson(),OFFER_URL,OFFER_URL,4,4);assertNotNull(captured);
        PriceShareSnapshot result=PriceShareSnapshot.fromMenu(captured,OFFER_URL,menu(550,"2026-11-02"));assertNotNull(result);
        assertTrue(result.menuPrice);assertEquals("5,50 €",result.amountLabel());assertTrue(result.provenance.contains("Altre spese del locale non verificate"));
        assertFalse(result.accessibilityDescription().contains("conferme"));assertFalse(result.accessibilityDescription().contains("Affare"));
        assertNull(PriceShareSnapshot.fromMenu(captured,OFFER_URL,menu(650,"2026-11-02")));
        assertNull(PriceShareSnapshot.fromMenu(captured,OFFER_URL,menu(550,"2026-11-03")));
    }
    @Test public void selectedOwnerMenuOfferRejectsWrongRouteAndDomClaims(){
        assertNull(MenuShareOffer.decode(offerJson(),OFFER_URL,OFFER_URL,4,5));
        assertNull(MenuShareOffer.decode(offerJson(),OFFER_URL,URL,4,4));
        assertNull(MenuShareOffer.decode(offerJson().replace("\"offer\":\"offer:1\"","\"offer\":\"other\""),OFFER_URL,OFFER_URL,4,4));
        MenuShareOffer wrongCurrency=MenuShareOffer.decode(offerJson().replace("5,50 €","5,50 £"),OFFER_URL,OFFER_URL,4,4);
        assertNotNull(wrongCurrency);assertNull(PriceShareSnapshot.fromMenu(wrongCurrency,OFFER_URL,menu(550,"2026-11-02")));
        assertNull(MenuShareOffer.decode(offerJson().replace("Menu verificato il 2026-11-02","Menu verificato il ieri"),OFFER_URL,OFFER_URL,4,4));
        assertNull(MenuShareOffer.decode(offerJson(),URL,URL,4,4));
    }
    @Test public void liveHappyHourAndRegularConditionsMustMatchVisibleOffer(){
        String happy=offerJson().replace("\"serving\":\"Drink singolo\"","\"serving\":\"Drink singolo · Happy hour · 17:00–19:00\"");
        MenuShareOffer capturedHappy=MenuShareOffer.decode(happy,OFFER_URL,OFFER_URL,4,4);assertNotNull(capturedHappy);
        MenuV2Prices.Price liveHappy=new MenuV2Prices.Price("offer:1","Locale reale","Spritz della casa","spritz",1,550,"EUR",2,
            "Drink singolo",null,false,"2026-11-02","Spese non verificate",null,"17:00–19:00",null,"");
        MenuV2Prices.Venue happyVenue=new MenuV2Prices.Venue("n123","u0nd9","Locale reale","Spese non verificate",java.util.List.of(liveHappy));
        assertNotNull(PriceShareSnapshot.fromMenu(capturedHappy,OFFER_URL,happyVenue));
        assertNull(PriceShareSnapshot.fromMenu(MenuShareOffer.decode(happy.replace("17:00–19:00","18:00–19:00"),OFFER_URL,OFFER_URL,4,4),OFFER_URL,happyVenue));
        String regular=offerJson().replace("\"serving\":\"Drink singolo\"","\"serving\":\"Drink singolo · Solo al banco\"");
        MenuShareOffer capturedRegular=MenuShareOffer.decode(regular,OFFER_URL,OFFER_URL,4,4);assertNotNull(capturedRegular);
        MenuV2Prices.Price liveRegular=new MenuV2Prices.Price("offer:1","Locale reale","Spritz della casa","spritz",0,550,"EUR",2,
            "Drink singolo",null,false,"2026-11-02","Spese non verificate",null,"Solo al banco",null,"");
        assertNotNull(PriceShareSnapshot.fromMenu(capturedRegular,OFFER_URL,new MenuV2Prices.Venue("n123","u0nd9","Locale reale","Spese non verificate",java.util.List.of(liveRegular))));
    }
}
