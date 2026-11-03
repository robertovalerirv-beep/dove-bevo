package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.Test;

public final class MenuV2PricesTest {
    private static final String VENUE="https://www.dovebevo.com/bar/n123?c=u0nd9";
    private static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}
    private static String source(){return "{\"id\":\"s1\",\"url\":\"https://bar.example/menu\",\"text_sha256\":\""+"a".repeat(64)+"\",\"checked_on\":\"2026-11-02\"}";}
    private static String offer(String id,String kind,int amount){return "{\"id\":\""+id+"\",\"name\":\"Spritz della casa\",\"category\":\"spritz\",\"serving\":{\"label\":\"Calice\",\"ml\":200},\"amount_minor\":"+amount+",\"currency\":\"GBP\",\"currency_exponent\":2,\"context\":{\"kind\":\""+kind+"\",\"condition\":null},\"source\":"+source()+"}";}
    private static String menu(String offers,int count,String next){return "{\"schema_version\":2,\"coverage\":{\"complete\":false,\"basis\":\"verified_source_items_only\"},\"price_scope\":\"menu_item_only\",\"venue\":{\"key\":\"n123\",\"cell\":\"u0nd9\",\"name\":\"Current venue\"},\"stored_offer_count\":"+count+",\"offers\":["+offers+"],\"next_after\":"+(next==null?"null":"\""+next+"\"")+",\"fees\":[],\"fee_coverage\":{\"status\":\"unknown\",\"source\":null}}";}
    private static String customer(int ml){return "{\"schema_version\":1,\"price_scope\":\"customer_reported_drink_item\",\"venue\":{\"key\":\"n123\",\"cell\":\"u0nd9\",\"name\":\"Current venue\",\"country\":\"GB\"},\"rows\":[{\"revision\":4,\"item_key\":\"c"+"b".repeat(64)+"\",\"kind\":\"menu_offer\",\"offer_id\":\"a2\",\"name\":\"Spritz della casa\",\"category\":\"spritz\",\"serving\":{\"label\":\"Calice\",\"ml\":"+ml+"},\"amount_minor\":650,\"currency\":\"GBP\",\"currency_exponent\":2,\"observed_on\":\"2026-11-03\",\"source_kind\":\"customer\",\"observation_kind\":\"customer_reported_price\",\"price_scope\":\"drink_item\"}],\"next_after\":null}";}
    private static FavoritePricesClient.Call call(){return new FavoritePricesClient.Call(System.nanoTime()+TimeUnit.SECONDS.toNanos(5));}
    @Test public void paginatedOwnerMenuAndCustomerReportsStayDistinctInOneSavedDrink()throws Exception {
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Saved actual name");
        MenuV2Prices client=new MenuV2Prices((url,max,call)->{
            if(url.contains("customer-prices"))return bytes(customer(200));
            if(url.contains("&after=a1"))return bytes(menu(offer("a2","regular",550),2,null));
            return bytes(menu(offer("a1","conditional",450).replace("\"condition\":null","\"condition\":\"Solo dopo le 18\""),2,"a1"));
        });
        MenuV2Prices.Venue loaded=client.load(venue,call());assertEquals(3,loaded.prices.size());
        assertEquals(2,loaded.selected(RecommendationDrink.SPRITZ,0).size());
        assertEquals("5,50 \u00a3",loaded.prices.get(1).amount());
        assertEquals("Calice · 200 ml",loaded.prices.get(1).serving());
        assertFalse(loaded.prices.get(1).customer);assertTrue(loaded.prices.get(2).customer);
        assertEquals("Solo dopo le 18",loaded.prices.get(0).condition);
        assertEquals(1,loaded.linkedReports.size());assertEquals("a2",loaded.linkedReports.get(0).linkedOfferId);
        assertTrue(loaded.prices.get(1).evidence().contains("menu online"));assertTrue(loaded.prices.get(2).evidence().contains("cliente"));
        assertTrue(loaded.feeNotice.contains("spese non verificate"));
        SavedDrinkTest.Memory disk=new SavedDrinkTest.Memory();SavedDrinkStore saved=new SavedDrinkStore(disk);
        assertEquals(SavedDrinkStore.Result.SAVED,saved.save(VENUE,"Saved actual name",RecommendationDrink.SPRITZ,0));byte[] before=disk.bytes.clone();
        List<SavedDrinkComparison.Row> rows=SavedDrinkComparison.rows(saved.load(),Collections.emptyMap(),Map.of(VENUE,loaded));
        assertEquals(2,rows.size());assertEquals(550,rows.get(0).menuPrice.amountMinor);assertEquals(650,rows.get(1).menuPrice.amountMinor);
        assertArrayEquals(before,disk.bytes);
    }
    @Test public void lastOfferAfter149RowsCanBeVerifiedForExactFavourite()throws Exception {
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Saved actual name");
        StringBuilder first=new StringBuilder(),last=new StringBuilder();
        for(int i=1;i<=149;i++){
            StringBuilder page=i<=100?first:last;if(page.length()>0)page.append(',');
            page.append(offer("a"+i,"regular",i==149?650:550));
        }
        MenuV2Prices client=new MenuV2Prices((url,max,call)->{
            if(url.contains("customer-prices"))throw new IOException("Owned customer fixture absent");
            return bytes(url.contains("&after=a100")?menu(last.toString(),149,null):menu(first.toString(),149,"a100"));
        });
        MenuV2Prices.Venue result=client.load(venue,call());assertEquals(149,result.prices.size());
        MenuV2Prices.Price exact=result.prices.stream().filter(price->price.id.equals("a149")).findFirst().orElseThrow();
        assertEquals(650,exact.amountMinor);
        assertEquals("a149",SavedMenuOfferStore.verified(venue,exact).id);
    }
    @Test public void mismatchedServingCannotBorrowSourceBandAndCursorMustMatchActualLastOffer()throws Exception {
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Saved actual name");
        MenuV2Prices client=new MenuV2Prices((url,max,call)->url.contains("customer-prices")?bytes(customer(300)):bytes(menu(offer("a2","regular",550),1,null)));
        MenuV2Prices.Venue differentServing=client.load(venue,call());
        assertEquals(1,differentServing.prices.size());
        assertEquals(1,differentServing.linkedReports.size());
        assertEquals(Integer.valueOf(300),differentServing.linkedReports.get(0).servingML);
        String incomplete=customer(200).replace("\"next_after\":null", "\"next_after\":\"c"+"b".repeat(64)+"\"");
        MenuV2Prices interrupted=new MenuV2Prices((url,max,call)->{
            if(url.contains("customer-prices")&&url.contains("&after="))throw new IOException("Owned second page unavailable");
            return bytes(url.contains("customer-prices")?incomplete:menu(offer("a2","regular",550),1,null));
        });
        assertEquals("A partial customer page must never become a claimed complete comparison",1,interrupted.load(venue,call()).prices.size());
        MenuV2Prices broken=new MenuV2Prices((url,max,call)->bytes(menu(offer("a1","regular",550),2,"wrong")));
        assertThrows(IOException.class,()->broken.load(venue,call()));
    }
    @Test public void conditionalFeeIsSeparateFromDrinkAmountAndRetainsItsCondition()throws Exception {
        String fee="{\"id\":\"f1\",\"label\":\"Coperto\",\"kind\":\"fixed\",\"basis\":\"person\",\"amount_minor\":250,\"currency\":\"GBP\",\"currency_exponent\":2,\"rate_bps\":null,\"applicability\":\"conditional\",\"condition\":\"Dopo le 20:00\",\"source\":"+source()+"}";
        String page=menu(offer("a2","regular",550),1,null).replace("\"fees\":[]","\"fees\":["+fee+"]")
                .replace("\"status\":\"unknown\",\"source\":null","\"status\":\"documented_partial\",\"source\":"+source());
        SavedVenueStore.Venue venue=SavedVenueStore.reference(VENUE,"Saved actual name");
        MenuV2Prices client=new MenuV2Prices((url,max,call)->bytes(url.contains("customer-prices")?customer(200):page));
        MenuV2Prices.Venue loaded=client.load(venue,call());assertEquals("5,50 \u00a3",loaded.prices.get(0).amount());
        assertTrue(loaded.feeNotice.contains("Spese separate"));assertTrue(loaded.feeNotice.contains("solo se Dopo le 20:00"));
        assertTrue(loaded.feeNotice.contains("Copertura delle spese parziale"));
        String invalid=page.replace("\"condition\":\"Dopo le 20:00\"","\"condition\":null");
        MenuV2Prices broken=new MenuV2Prices((url,max,call)->bytes(invalid));assertThrows(IOException.class,()->broken.load(venue,call()));
    }
    @Test public void v2TransportOnlyAllowsExactPinnedPublicGetRoutes()throws Exception {
        String valid=MenuV2Prices.endpoint(true,"m"+"0".repeat(24),"u0nd9",null);
        assertTrue(MenuV2Prices.allowed(valid));assertTrue(FavoritePricesClient.allowed(valid));
        for(String invalid:new String[]{valid.replace("https://","http://"),valid.replace("m"+"0".repeat(24),"m"+"A".repeat(24)),
                valid.replace("limit=100","limit=1000"),valid+"&x=1",valid.replace("www.dovebevo.com","www.dovebevo.com.evil.example")})
            assertFalse(invalid,MenuV2Prices.allowed(invalid));
        assertThrows(IOException.class,()->MenuV2Prices.endpoint(false,"n123","u0nd9","not-a-customer-cursor"));
    }
}
