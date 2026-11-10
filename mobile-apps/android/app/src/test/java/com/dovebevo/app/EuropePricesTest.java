package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class EuropePricesTest {
    static final String TODAY="2026-11-02",REVISION="719576dd-2184-49e9-831d-bc2de0c5f542";
    static final String CATALOG="{\"schema_version\":1,\"version\":\"owned-v1\",\"venues\":["+venue("n91","London",51.5074,-0.1278,"gcpvj","GB","GBP")+","+venue("n92","Paris",48.8566,2.3522,"u09tv","FR","EUR")+"]}";
    static String venue(String key,String city,double lat,double lon,String cell,String country,String currency){return "{\"key\":\""+key+"\",\"name\":\"Owned "+city+" fixture\",\"kind\":1,\"lat\":"+lat+",\"lon\":"+lon+",\"cell\":\""+cell+"\",\"city\":\""+city+"\",\"country\":\""+country+"\",\"currency\":\""+currency+"\",\"google\":{\"url\":\"https://www.google.com/maps?cid=123\",\"review_count\":101,\"checked_on\":\"2026-11-01\"}}";}
    static String row(String key,String cell,String currency,String drink,int band,int amount,String serving){return "{\"venue\":\""+key+"\",\"cell\":\""+cell+"\",\"drink\":\""+drink+"\",\"hh\":"+band+",\"currency\":\""+currency+"\",\"amount_minor\":"+amount+",\"serving\":"+serving+",\"observed_on\":null,\"confirmed_on\":null,\"confirmations\":0,\"status\":\"active\",\"revision\":\""+REVISION+"\",\"provenance\":{\"kind\":\"online_menu\",\"source_url\":\"https://official.example/menu\",\"source_checked_on\":\"2026-11-01\",\"source_sha256\":\""+"a".repeat(64)+"\",\"menu_item\":\"Owned menu item\"}}";}
    static String body(String rows,String hidden,String legacy){return "{\"schema_version\":1,\"catalog_version\":\"owned-v1\",\"rows\":["+rows+"],\"hidden\":["+hidden+"],\"legacy_venues\":["+legacy+"]}";}
    static byte[] bytes(String s){return s.getBytes(StandardCharsets.UTF_8);}
    static EuropePrices.Catalog catalog()throws IOException{return EuropePrices.catalog(bytes(CATALOG),TODAY);}
    static EuropePrices.Cell cell(String rows)throws IOException{return EuropePrices.parse(bytes(body(rows,"","")),catalog(),"gcpvj",null,TODAY);}
    static String wine(int ml,int amount){return row("n91","gcpvj","GBP","wine_glass",0,amount,"{\"unit\":\"glass\",\"ml\":"+ml+"}");}
    static String beer(int ml,int amount,int band){return row("n91","gcpvj","GBP","beer_draft",band,amount,"{\"unit\":\"ml\",\"ml\":"+ml+"}");}
    static List<SavedVenueStore.Venue> saved()throws IOException{SavedVenueStore store=new SavedVenueStore(new SavedVenueStore.Storage(){byte[] data;public byte[] read(){return data;}public void write(byte[] value){data=value;}});assertEquals(SavedVenueStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n91?c=gcpvj","Private saved label"));return store.load();}

    @Test public void poundServingAndMenuDateAreNotLegacyEuroPaidEvidence()throws Exception {
        EuropePrices.Price p=cell(wine(175,720)).prices.get(0);
        assertEquals("GBP",p.currency);assertEquals("glass:175",p.serving.key());assertEquals("owned-v1",p.catalogVersion);
        assertNull(p.observedOn);assertNull(p.confirmedOn);assertEquals("2026-11-01",p.sourceCheckedOn);assertEquals("Owned menu item",p.menuItem);
        assertEquals("£7.20",NativePricePresentation.amount(null,p));assertTrue(NativePricePresentation.context(p).contains("Dal menu online"));assertFalse(NativePricePresentation.context(p).contains("Segnalato il"));assertFalse(p.old);
        assertThrows(IOException.class,()->FavoriteComparison.parse(null,bytes(body(wine(175,720),"","")),"gcpvj",TODAY));
    }
    @Test public void favouritesRetainAllWineVariantsAndDoNotSortDifferentVolumesByCheapest()throws Exception {
        EuropePrices.Cell mobile=cell(wine(250,400)+","+wine(175,720));FavoriteComparison.Cell cell=FavoriteComparison.withEurope(null,mobile);
        List<FavoriteComparison.Row> rows=FavoriteComparison.rows(saved(),Collections.singletonMap("gcpvj",cell),RecommendationDrink.WINE_GLASS,0);
        assertEquals(2,rows.size());assertNull(rows.get(0).price);assertEquals(175,rows.get(0).mobilePrice.serving.ml.intValue());assertEquals(720,rows.get(0).amount());assertEquals(250,rows.get(1).mobilePrice.serving.ml.intValue());assertEquals("Owned London fixture",rows.get(0).name);
        assertTrue(FavoriteComparison.rows(saved(),Collections.singletonMap("gcpvj",cell),RecommendationDrink.SPRITZ,0).get(0).state==FavoriteComparison.State.MISSING);
    }
    @Test public void discoveryRetainsBeer250500AndHappyHourAndActualGeography()throws Exception {
        EuropePrices.Cell mobile=cell(beer(250,600,0)+","+beer(500,800,0)+","+beer(500,500,1));DiscoveryData.Cell cell=DiscoveryData.withEurope(null,mobile);DiscoveryArea area=new DiscoveryArea(51.5074,-0.1278,14);
        List<DiscoveryData.Row> normal=DiscoveryData.rows(Collections.singletonMap("gcpvj",cell),area,RecommendationDrink.BEER_DRAFT,0);
        assertEquals(2,normal.size());assertEquals(250,normal.get(0).mobilePrice.serving.ml.intValue());assertEquals(500,normal.get(1).mobilePrice.serving.ml.intValue());assertNull(normal.get(0).price);assertEquals("London",normal.get(0).venue.city);assertEquals(0,normal.get(0).metres,0.01);
        List<DiscoveryData.Row> hh=DiscoveryData.rows(Collections.singletonMap("gcpvj",cell),area,RecommendationDrink.BEER_DRAFT,1);assertEquals(1,hh.size());assertEquals(500,hh.get(0).amount());
    }
    @Test public void hiddenAndLegacyArraysOverrideEvenActiveRows()throws Exception {
        for(String field:new String[]{"hidden","legacy"}){
            EuropePrices.Cell mobile=EuropePrices.parse(bytes(body(wine(175,720),field.equals("hidden")?"\"n91\"":"",field.equals("legacy")?"\"n91\"":"")),catalog(),"gcpvj",null,TODAY);
            assertTrue(mobile.prices.isEmpty());assertTrue(mobile.venues.isEmpty());FavoriteComparison.Row row=FavoriteComparison.rows(saved(),Collections.singletonMap("gcpvj",FavoriteComparison.withEurope(null,mobile)),RecommendationDrink.WINE_GLASS,0).get(0);assertFalse(row.available());assertEquals(FavoriteComparison.State.UNAVAILABLE,row.state);
        }
    }
    @Test public void crossCurrencyAndLegacyUnknownServingRemainSeparateGroups()throws Exception {
        FavoriteComparison.Price legacy=new FavoriteComparison.Price(500,"2026-11-01",2,false);EuropePrices.Price pound=cell(wine(175,720)).prices.get(0);
        assertNotEquals(NativePricePresentation.group(legacy,null),pound.group());assertTrue(NativePricePresentation.groupLabel(legacy,null).contains("formato non indicato"));
        EuropePrices.Cell euros=EuropePrices.parse(bytes(body(row("n92","u09tv","EUR","wine_glass",0,700,"{\"unit\":\"glass\",\"ml\":175}"),"","")),catalog(),"u09tv",null,TODAY);assertNotEquals(pound.group(),euros.prices.get(0).group());assertTrue(NativePricePresentation.amount(null,euros.prices.get(0)).contains("€"));
    }
    @Test public void versionIdentityCurrencyAmountsAndServingAreStrict()throws Exception {
        String valid=body(wine(175,720),"","");
        for(String invalid:new String[]{valid.replace("owned-v1","other-v1"),valid.replace("gcpvj","u09tv"),valid.replace("GBP","EUR"),valid.replace("\"ml\":175","\"ml\":0"),valid.replace("\"amount_minor\":720","\"amount_minor\":true"),valid.replace("\"observed_on\":null","\"observed_on\":\"2026-11-01\""),valid.replace("2026-11-01","2099-11-01"),valid.replace("\"status\":\"active\"","\"status\":\"review\"")})assertThrows(IOException.class,()->EuropePrices.parse(bytes(invalid),catalog(),"gcpvj",null,TODAY));
        assertThrows(IOException.class,()->cell(wine(175,720)+","+wine(175,800)));
        assertThrows(IOException.class,()->cell(row("n91","gcpvj","GBP","water",0,100,"{\"unit\":\"drink\"}")));
        assertThrows(IOException.class,()->cell(row("n91","gcpvj","GBP","spritz",0,1300,"{\"unit\":\"drink\",\"ml\":100}")));
    }
    @Test public void catalogueSchemaCountryCellAndPrimaryReviewMetadataAreStrict()throws Exception {
        for(String valid:new String[]{CATALOG.replace("\"review_count\":101","\"review_count\":100"),CATALOG.replace("\"review_count\":101","\"review_count\":0"),CATALOG.replace("\"review_count\":101","\"review_count\":null"),CATALOG.replace("\"review_count\":101,","")})assertEquals(2,EuropePrices.catalog(bytes(valid),TODAY).venues.size());
        for(String invalid:new String[]{CATALOG.replace("\"review_count\":101","\"review_count\":-1"),CATALOG.replace("\"review_count\":101","\"review_count\":true"),CATALOG.replace("\"currency\":\"GBP\"","\"currency\":\"EUR\""),CATALOG.replace("51.5074","10.0"),CATALOG.replace("gcpvj","u09tv"),CATALOG.replace("www.google.com","example.com"),CATALOG.replace("2026-11-01","2099-11-01"),CATALOG.replace("\"schema_version\":1","\"schema_version\":true")})assertThrows(IOException.class,()->EuropePrices.catalog(bytes(invalid),TODAY));
        assertThrows(IOException.class,()->EuropePrices.catalog(bytes("<html>SPA fallback</html>"),TODAY));
    }
    @Test public void clientAllowsOnlyBoundedExactPublicReadPathsAndRejectsVersionDrift()throws Exception {
        EuropePricesClient client=new EuropePricesClient((url,max,call)->bytes(url.endsWith("catalog.json")?CATALOG:body(wine(175,720),"","")),()->TODAY);FavoritePricesClient.Call call=new FavoritePricesClient.Call(System.nanoTime()+TimeUnit.SECONDS.toNanos(5));
        EuropePrices.Catalog catalog=client.catalog(call);assertEquals(1,client.venue("n91","gcpvj",catalog,call).prices.size());
        for(String path:new String[]{"http://www.dovebevo.com/mobile-data/catalog.json","https://www.dovebevo.com/api/mobile/prices/cells/gcpvj?x=1","https://www.dovebevo.com/api/mobile/prices/venues/u1?cell=gcpvj","https://www.dovebevo.com/api/mobile/prices/venues/n91?cell=gcpvj&x=1","https://www.dovebevo.com.evil.example/mobile-data/catalog.json"})assertFalse(EuropePricesClient.allowed(path));
        call.cancel();assertThrows(IOException.class,()->client.catalog(call));
    }
    @Test public void actualEuropeanDiscoveryBoundsDoNotWeakenLegacyItalyParser()throws Exception {
        for(double[] coordinate:new double[][]{{51.5,-0.1},{48.85,2.35},{40.4,-3.7},{52.5,13.4}})assertEquals(9,new DiscoveryArea(coordinate[0],coordinate[1],14).cells().size());
        assertThrows(IOException.class,()->new DiscoveryArea(40.7,-74,14));assertThrows(IOException.class,()->new DiscoveryArea(Double.NaN,2,14));
        FavoriteComparison.Cell legacy=FavoriteComparison.parse(bytes(DiscoveryTest.STATIC.replace("45.4642","51.5074")),bytes(DiscoveryTest.PRICES),"u0nd9",TODAY);assertFalse(legacy.staticVerified);assertFalse(legacy.names.containsKey("n123"));
    }
    @Test public void loaderSharesOneCatalogAndReturnsAllForeignVariantsWithoutLegacyRequests()throws Exception {
        List<String> urls=new java.util.concurrent.CopyOnWriteArrayList<>();FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{urls.add(url);if(url.endsWith("health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261030\"}");if(url.endsWith("catalog.json"))return bytes(CATALOG);if(url.endsWith("gcpvj"))return bytes(body(wine(175,720)+","+wine(250,920),"",""));throw new IOException("Unexpected owned URL");},()->TODAY);
        FavoritesLoader loader=new FavoritesLoader(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<Map<String,FavoriteComparison.Cell>> result=new AtomicReference<>();
        try{loader.load(saved(),value->{result.set(value);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));assertEquals(3,urls.size());assertTrue(urls.get(2).contains("/api/mobile/prices/cells/"));assertEquals(2,FavoriteComparison.rows(saved(),result.get(),RecommendationDrink.WINE_GLASS,0).size());}finally{loader.close();}
    }
    @Test public void exactSavedItalianDrinkRefreshesWithoutLegacyFeed()throws Exception {
        String catalog="{\"schema_version\":1,\"version\":\"owned-v1\",\"venues\":["+venue("n94","Milano",45.4642,9.19,"u0nd9","IT","EUR")+"]}";
        String price=row("n94","u0nd9","EUR","spritz",0,550,"{\"unit\":\"drink\"}");
        List<String> urls=new java.util.concurrent.CopyOnWriteArrayList<>();
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            urls.add(url);if(url.endsWith("catalog.json"))return bytes(catalog);
            if(url.endsWith("/api/mobile/prices/cells/u0nd9"))return bytes(body(price,"",""));
            throw new IOException("Legacy feed unavailable");
        },()->TODAY);
        FavoritesLoader loader=new FavoritesLoader(client,Runnable::run,true);CountDownLatch done=new CountDownLatch(1);AtomicReference<Map<String,FavoriteComparison.Cell>> result=new AtomicReference<>();
        try{loader.load(List.of(SavedVenueStore.reference("https://www.dovebevo.com/bar/n94?c=u0nd9","Milano")),value->{result.set(value);done.countDown();});
            assertTrue(done.await(3,TimeUnit.SECONDS));assertEquals(2,urls.size());assertFalse(urls.stream().anyMatch(url->url.contains("/api/prices/")||url.endsWith("/api/health")));
            EuropePrices.Price exact=result.get().get("u0nd9").europe.prices.get(0);assertEquals(550,exact.amountMinor);assertEquals("EUR",exact.currency);
        }finally{loader.close();}
    }
    @Test public void discoverySharesCatalogAndRecognizesEmptyNeighbourScopeWithoutLegacyReads()throws Exception {
        List<String> urls=new java.util.concurrent.CopyOnWriteArrayList<>();FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{urls.add(url);if(url.endsWith("health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261030\"}");if(url.endsWith("catalog.json"))return bytes(CATALOG);if(url.endsWith("gcpvj"))return bytes(body(wine(175,720)+","+wine(250,920),"",""));throw new IOException("Unexpected owned URL");},()->TODAY);
        DiscoveryLoader loader=new DiscoveryLoader(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<DiscoveryLoader.Result> result=new AtomicReference<>();DiscoveryArea area=new DiscoveryArea(51.5074,-0.1278,14);
        try{loader.load(area,value->{result.set(value);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));assertEquals(3,urls.size());assertFalse(result.get().partial);assertEquals(9,result.get().cells.size());assertEquals(2,DiscoveryData.rows(result.get().cells,area,RecommendationDrink.WINE_GLASS,0).size());}finally{loader.close();}
    }
    @Test public void versionDriftCannotFallBackToOldEuroOrLeaveAForeignPriceVisible()throws Exception {
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{if(url.endsWith("health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261030\"}");if(url.endsWith("catalog.json"))return bytes(CATALOG);return bytes(body(wine(175,720),"","").replace("owned-v1","other-v2"));},()->TODAY);
        FavoritesLoader loader=new FavoritesLoader(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<Map<String,FavoriteComparison.Cell>> result=new AtomicReference<>();
        try{loader.load(saved(),value->{result.set(value);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));assertTrue(result.get().isEmpty());assertEquals(FavoriteComparison.State.UNAVAILABLE,FavoriteComparison.rows(saved(),result.get(),RecommendationDrink.WINE_GLASS,0).get(0).state);}finally{loader.close();}
    }
    @Test public void realCustomerObservationAndQuarantineStayDistinctFromMenuEvidence()throws Exception {
        String original=wine(175,720);String customer=original.substring(0,original.indexOf("\"provenance\""))+"\"provenance\":{\"kind\":\"customer\",\"source_url\":null,\"source_checked_on\":null,\"source_sha256\":null,\"menu_item\":null}}";
        customer=customer.replace("\"observed_on\":null","\"observed_on\":\"2026-06-01\"");EuropePrices.Price p=cell(customer).prices.get(0);assertTrue(p.old);assertEquals("2026-06-01",p.observedOn);assertNull(p.sourceCheckedOn);assertTrue(NativePricePresentation.context(p).contains("Segnalato il 01/06/2026"));assertFalse(NativePricePresentation.context(p).contains("menu online"));
        assertTrue(cell(original.replace("\"status\":\"active\"","\"status\":\"quarantined\"")).prices.isEmpty());
    }
    @Test public void oldMenuUsesSourceCheckAgeWithoutInventingAnObservation()throws Exception {
        EuropePrices.Price fresh=cell(wine(175,720)).prices.get(0),old=cell(wine(175,720).replace("2026-11-01","2026-06-01")).prices.get(0);
        assertFalse(fresh.old);assertTrue(old.old);assertNull(old.observedOn);assertEquals("2026-06-01",old.sourceCheckedOn);assertTrue(NativePricePresentation.context(old).contains("verificato il 01/06/2026"));assertFalse(NativePricePresentation.context(old).contains("Segnalato"));assertTrue(NativePricePresentation.menuWarning().contains("Menu da ricontrollare"));
    }
    @Test public void venueEndpointCannotAssertThatUnrequestedNeighbourPricesAreMissing()throws Exception {
        EuropePrices.Catalog catalog=EuropePrices.catalog(bytes(CATALOG.replace("\"venues\":[","\"venues\":["+venue("n93","London",51.5074,-0.1278,"gcpvj","GB","GBP")+",")),TODAY);
        EuropePrices.Cell value=EuropePrices.parse(bytes(body(wine(175,720),"","")),catalog,"gcpvj","n91",TODAY);assertEquals(1,value.scoped.size());assertFalse(value.owns("n93"));assertFalse(value.venues.containsKey("n93"));
    }
}
