package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/** Real v2 cell shape: sampled named drinks remain separate from customer observations. */
public final class DiscoveryMenuV2Test {
    static String empty(String cell){return """
            {"schema_version":2,"coverage":{"complete":false,"basis":"verified_source_items_only"},
             "price_scope":"menu_item_only","cell":"CELL","category":null,
             "categories":["beer_draft","spritz","negroni","sbagliato","gin_tonic","gin_lemon","wine_glass","alcohol_free","water"],
             "venues":[],"next_after":null,"unresolved_venues":0}
            """.replace("CELL",cell);}
    static String one(){return empty("u0nd9").replace("\"venues\":[]", """
            "venues":[{"key":"n123","cell":"u0nd9","name":"Uno","kind":1,
            "lat":45.4642,"lon":9.19,"address":"Via A","city":"Milano","country":"IT",
            "identity_url":"https://www.openstreetmap.org/node/123","identity_kind":"osm",
            "matching_offer_count":1,"fee_coverage":{"status":"unknown","source":null},
            "sample_offers":[{"id":"owner-spritz-1","name":"Spritz della casa","category":"spritz",
            "serving":{"label":"Calice","ml":200},"amount_minor":550,"currency":"GBP","currency_exponent":2,
            "context":{"kind":"regular","condition":null},
            "source":{"id":"s1","url":"https://source.example/menu","text_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","checked_on":"2026-11-03"}}]}]
            """);}
    private static MenuV2Prices.Cell load(String payload)throws IOException{
        MenuV2Prices client=new MenuV2Prices((url,max,call)->DiscoveryTest.bytes(payload));
        return client.loadCell("u0nd9",new FavoritePricesClient.Call(System.nanoTime()+5_000_000_000L));
    }
    @Test public void strictPublicRouteAndOwnerSamplePreserveCurrencyServingSourceAndLegacyPrice()throws Exception {
        assertTrue(MenuV2Prices.allowed(MenuV2Prices.cellEndpoint("u0nd9",null)));
        assertFalse(MenuV2Prices.allowed("https://other.example/api/mobile/v2/menu/cells/u0nd9?categories="+MenuV2Prices.DISCOVERY_CATEGORIES));
        assertThrows(IOException.class,()->MenuV2Prices.cellEndpoint("../admin",null));
        MenuV2Prices.Cell menu=load(one());assertEquals(1,menu.venues.size());assertFalse(menu.partial);
        DiscoveryData.Cell legacy=DiscoveryData.parse(DiscoveryTest.bytes(DiscoveryTest.STATIC),DiscoveryTest.bytes(DiscoveryTest.PRICES),"u0nd9","2026-11-03");
        DiscoveryData.Cell combined=DiscoveryData.withMenu(legacy,menu);
        List<DiscoveryData.Row> rows=DiscoveryData.rows(Collections.singletonMap("u0nd9",combined),new DiscoveryArea(45.4642,9.19,14),RecommendationDrink.SPRITZ,0);
        assertEquals(4,rows.size());
        DiscoveryData.Row sourced=rows.stream().filter(r->r.menuPrice!=null).findFirst().orElseThrow();
        assertEquals("5,50 £",sourced.amountLabel());assertEquals("GBP · Calice · 200 ml",sourced.groupLabel());
        assertEquals("https://source.example/menu",sourced.menuPrice.sourceUrl);
        assertTrue(sourced.context().contains("Fonte verificata il 2026-11-03"));
        assertTrue(rows.stream().anyMatch(r->r.menuPrice==null&&r.venue.key.equals("n123")&&r.price.cents==800));
    }
    @Test public void wrongIdentityOrSourceIsExcludedWhileLegacyCanRemain()throws Exception {
        assertThrows(IOException.class,()->load(one().replace("\"country\":\"IT\"","\"country\":\"FR\"")));
        assertThrows(IOException.class,()->load(one().replace("https://source.example/menu","http://source.example/menu")));
        assertThrows(IOException.class,()->load(one().replace("\"cell\":\"u0nd9\"","\"cell\":\"u0nd8\"")));
        DiscoveryData.Cell legacy=DiscoveryData.parse(DiscoveryTest.bytes(DiscoveryTest.STATIC),DiscoveryTest.bytes(DiscoveryTest.PRICES),"u0nd9","2026-11-03");
        DiscoveryData.Cell fallback=DiscoveryData.withoutMenu(legacy);
        assertFalse(fallback.menuAvailable);
        assertEquals(3,DiscoveryData.rows(Collections.singletonMap("u0nd9",fallback),new DiscoveryArea(45.4642,9.19,14),RecommendationDrink.SPRITZ,0).size());
    }
    @Test public void independentlyVerifiedOwnerVenueCanAppearWithoutLegacyAndConditionalOfferIsNotARegularPrice()throws Exception {
        String ownerKey="m2a1f742f29d145ded49440d9";
        String owner=one().replace("n123",ownerKey).replace("\"identity_kind\":\"osm\"","\"identity_kind\":\"owner_verified\"")
                .replace("https://www.openstreetmap.org/node/123","https://owner.example/venue");
        MenuV2Prices.Cell menu=load(owner);
        DiscoveryData.Cell combined=DiscoveryData.withMenu(null,menu);
        assertTrue(new DiscoveryLoader.Result(Collections.singletonMap("u0nd9",combined),1).partial);
        assertEquals(ownerKey,combined.venues.get(ownerKey).key);
        assertEquals(1,DiscoveryData.rows(Collections.singletonMap("u0nd9",combined),new DiscoveryArea(45.4642,9.19,14),RecommendationDrink.SPRITZ,0).size());
        assertEquals("https://www.dovebevo.com/bar/"+ownerKey+"?c=u0nd9",combined.venues.get(ownerKey).url());
        String conditional=owner.replace("\"kind\":\"regular\",\"condition\":null","\"kind\":\"conditional\",\"condition\":\"Solo con cena\"");
        DiscoveryData.Cell conditionCell=DiscoveryData.withMenu(null,load(conditional));
        assertTrue(DiscoveryData.rows(Collections.singletonMap("u0nd9",conditionCell),new DiscoveryArea(45.4642,9.19,14),RecommendationDrink.SPRITZ,0).isEmpty());
    }
}
