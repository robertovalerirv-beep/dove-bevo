package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class ExactVoteAreaTest {
    private static final String SCOPE="[\"sr2y7\",\"u0nd9\"]";
    private static final String OFFER="{\"venue\":{\"key\":\"n123\",\"cell\":\"u0nd9\",\"name\":\"Bar Uno\",\"city\":\"Milano\"},\"target\":{\"kind\":\"offer\",\"id\":\"spritz.7\"},\"drink\":{\"name\":\"Spritz della casa\",\"category\":null,\"serving_label\":\"Calice\"},\"count\":12}";
    private static final String LEGACY="{\"venue\":{\"key\":\"n456\",\"cell\":\"sr2y7\",\"name\":\"Bar Due\",\"city\":\"Roma\"},\"target\":{\"kind\":\"legacy\",\"drink\":\"beer_draft\",\"band\":\"happy_hour\"},\"drink\":{\"name\":\"Birra media\",\"category\":\"beer_draft\",\"serving_label\":null},\"count\":2}";
    private static final String EUROPE="{\"venue\":{\"key\":\"n789\",\"cell\":\"u0nd9\",\"name\":\"Bar Tre\",\"city\":\"Milano\"},\"target\":{\"kind\":\"europe\",\"drink\":\"wine_glass\",\"band\":\"normal\",\"currency\":\"EUR\",\"serving\":{\"unit\":\"glass\",\"ml\":175}},\"drink\":{\"name\":\"Calice di vino\",\"category\":\"wine_glass\",\"serving_label\":\"Calice · 175 ml\"},\"count\":3}";
    private static byte[] page(String scope,String items,String next){return ("{\"schema_version\":1,\"scope\":{\"cells\":"+scope+"},\"items\":["+items+"],\"next_after\":"+next+"}").getBytes(StandardCharsets.UTF_8);}
    private static FavoritePricesClient.Call call(){return new FavoritePricesClient.Call(System.nanoTime()+TimeUnit.SECONDS.toNanos(5));}

    @Test public void scopedGetReturnsExactNamedDrinksAndSharedCountsWithoutVoteMethod()throws Exception {
        List<String> cells=List.of("u0nd9","sr2y7");String expected=ExactVoteArea.ROOT+"?cells=sr2y7,u0nd9&limit=50&include_europe=1";
        assertEquals(expected,ExactVoteArea.endpoint(cells,null));assertTrue(FavoritePricesClient.allowed(expected));
        AtomicReference<String> requested=new AtomicReference<>();
        ExactVoteAreaClient client=new ExactVoteAreaClient((url,max,call)->{requested.set(url);return page(SCOPE,OFFER+","+LEGACY,"null");});
        ExactVoteArea.Page result=client.load(cells,null,call());
        assertEquals(expected,requested.get());assertEquals(List.of("sr2y7","u0nd9"),result.cells);
        assertEquals(2,result.rows.size());assertEquals("Spritz della casa",result.rows.get(0).drinkName);
        assertEquals(12,result.rows.get(0).count);assertEquals("offer/spritz.7",result.rows.get(0).targetKey);
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",result.rows.get(0).venueUrl);
        assertEquals("legacy/beer_draft/happy_hour",result.rows.get(1).targetKey);
    }

    @Test public void europeanRecommendationsStayScopedAndKeepExactServingCurrencyAndCount()throws Exception {
        ExactVoteArea.Page result=ExactVoteArea.parse(page(SCOPE,EUROPE,"null"),List.of("u0nd9","sr2y7"));
        assertEquals(1,result.rows.size());assertEquals("europe/wine_glass/normal/EUR/glass:175",result.rows.get(0).targetKey);
        assertEquals(3,result.rows.get(0).count);assertEquals("Calice · 175 ml",result.rows.get(0).serving);
        String spritz=EUROPE.replace("\"wine_glass\"","\"spritz\"").replace("\"unit\":\"glass\",\"ml\":175","\"unit\":\"drink\"").replace("Calice · 175 ml","Drink singolo");
        ExactVoteArea.Row drink=ExactVoteArea.parse(page(SCOPE,spritz,"null"),List.of("u0nd9","sr2y7")).rows.get(0);
        assertEquals("europe/spritz/normal/EUR/drink:",drink.targetKey);
        assertNull(drink.serving);
        for(String invalid:new String[]{EUROPE.replace("\"EUR\"","\"USD\""),EUROPE.replace("\"ml\":175","\"ml\":0"),EUROPE.replace("\"wine_glass\"","\"spritz\""),EUROPE.replace("\"glass\"","\"ml\"")})
            assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,invalid,"null"),List.of("u0nd9","sr2y7")));
        assertFalse(ExactVoteArea.allowed(ExactVoteArea.ROOT+"?cells=u0nd9&limit=50"));
    }

    @Test public void cursorAndScopeAreBoundedAndValidated()throws Exception {
        String base=ExactVoteArea.endpoint(List.of("u0nd9"),"abc_-09");
        assertTrue(ExactVoteArea.allowed(base));assertFalse(ExactVoteArea.allowed(base+"&target=x"));
        assertThrows(IOException.class,()->ExactVoteArea.endpoint(List.of("u0nd9"),"bad%2Fcursor"));
        assertThrows(IOException.class,()->ExactVoteArea.endpoint(List.of("u0nd9","u0nd9"),null));
        assertThrows(IOException.class,()->ExactVoteArea.endpoint(List.of("not-a-cell"),null));
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,OFFER,"null"),List.of("u0nd9")));
        ExactVoteArea.Page empty=ExactVoteArea.parse(page("[\"u0nd9\"]","","\"abc_-09\""),List.of("u0nd9"));
        assertEquals("abc_-09",empty.next);assertTrue(empty.rows.isEmpty());
    }

    @Test public void rejectsInventedCountsCrossAreaVenuesAndDuplicateTargets()throws Exception {
        List<String> cells=List.of("sr2y7","u0nd9");
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,OFFER.replace("\"count\":12","\"count\":0"),"null"),cells));
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,OFFER.replace("\"cell\":\"u0nd9\"","\"cell\":\"gcpvj\""),"null"),cells));
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,OFFER+","+OFFER,"null"),cells));
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,OFFER.replace("\"id\":\"spritz.7\"","\"id\":\"bad/id\""),"null"),cells));
        assertThrows(IOException.class,()->ExactVoteArea.parse(page(SCOPE,LEGACY.replace("\"band\":\"happy_hour\"","\"band\":\"unknown\""),"null"),cells));
    }
}
