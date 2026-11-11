package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Actual native widgets, owned response bodies and bundled welcome. No accepted rules or public network. */
public final class DiscoveryRuntimeTest {
    private static final String STATIC="{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Locale uno\",1,45.4642,9.19,\"Via A\",0],[\"w9\",\"Locale due\",1,45.4643,9.1901,\"Via B\",0]]}";
    private static final String PRICES="{\"p\":[[\"n123\",\"spritz\",0,800,\"2026-10-28\",2,0],[\"n123\",\"spritz\",1,500,\"2026-10-27\",1,0],[\"w9\",\"spritz\",0,600,\"2026-06-01\",0,0]],\"u\":[],\"pend\":[],\"h\":[],\"g\":[]}";
    private static final String MENU_EMPTY="{\"schema_version\":2,\"coverage\":{\"complete\":false,\"basis\":\"verified_source_items_only\"},\"price_scope\":\"menu_item_only\",\"cell\":\"CELL\",\"category\":null,\"categories\":[\"beer_draft\",\"spritz\",\"negroni\",\"sbagliato\",\"gin_tonic\",\"gin_lemon\",\"wine_glass\",\"alcohol_free\",\"water\"],\"venues\":[],\"next_after\":null,\"unresolved_venues\":0}";
    private static final String MENU_ONE=MENU_EMPTY.replace("\"venues\":[]", "\"venues\":[{\"key\":\"n123\",\"cell\":\"u0nd9\",\"name\":\"Locale uno\",\"kind\":1,\"lat\":45.4642,\"lon\":9.19,\"address\":\"Via A\",\"city\":\"Milano\",\"country\":\"IT\",\"identity_url\":\"https://www.openstreetmap.org/node/123\",\"identity_kind\":\"osm\",\"matching_offer_count\":1,\"fee_coverage\":{\"status\":\"unknown\",\"source\":null},\"sample_offers\":[{\"id\":\"spritz-owner-1\",\"name\":\"Spritz\",\"category\":\"spritz\",\"serving\":{\"label\":\"Calice\",\"ml\":200},\"amount_minor\":550,\"currency\":\"GBP\",\"currency_exponent\":2,\"context\":{\"kind\":\"regular\",\"condition\":null},\"source\":{\"id\":\"s1\",\"url\":\"https://source.example/menu\",\"text_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"checked_on\":\"2026-11-03\"}}]}]");
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private final AtomicBoolean active=new AtomicBoolean(true);private final AtomicInteger requests=new AtomicInteger();private final AtomicReference<String> opened=new AtomicReference<>();
    private MainActivity activity;private DiscoveryScreen screen;private SharedPreferences rules;private String previous;private boolean hadPrevious;private boolean partialOne,menuOne;
    @Before public void setUp(){
        rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadPrevious=rules.contains("accepted_rules_version");previous=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
        onMain(()->{assertNotNull(activity.findViewById(R.id.accept_rules));assertNull(activity.findViewById(R.id.website));});
    }
    @After public void tearDown(){onMain(()->{if(screen!=null)screen.close();activity.finish();});SharedPreferences.Editor edit=rules.edit();if(hadPrevious)edit.putString("accepted_rules_version",previous);else edit.remove("accepted_rules_version");assertTrue(edit.commit());}
    @Test public void actualPricesSortAndFiltersKeepDateContextWithoutAnyBookmarkFile()throws Exception {
        show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();assertEquals(29,requests.get());ReferenceCapture.save("discovery-owned-fixture.png");
        onMain(()->{assertEquals(2,rows().getChildCount());View panel=rows().getChildAt(0).findViewWithTag("discovery.details");assertEquals(View.GONE,panel.getVisibility());rows().getChildAt(0).findViewById(R.id.discovery_details).performClick();assertEquals(View.VISIBLE,panel.getVisibility());assertTrue(text(rows().getChildAt(0)).contains("Locale due"));assertTrue(text(rows().getChildAt(0)).contains("6,00"));assertTrue(text(rows().getChildAt(0)).contains("oltre 90"));assertTrue(text(rows().getChildAt(0)).contains("dal centro della Mappa"));assertTrue(text(rows().getChildAt(1)).contains("2 conferme"));assertFalse(text(rows()).contains("Affare"));
            ((Spinner)activity.findViewById(R.id.discovery_band)).setSelection(1);});
        onMain(()->{assertEquals(1,rows().getChildCount());assertTrue(text(rows().getChildAt(0)).contains("5,00"));assertTrue(text(rows().getChildAt(0)).contains("27/10/2026"));rows().getChildAt(0).findViewById(R.id.discovery_open).performClick();});
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",opened.get());assertEquals(29,requests.get());
        onMain(()->{((Spinner)activity.findViewById(R.id.discovery_drink)).setSelection(RecommendationDrink.NEGRONI.ordinal());});
        onMain(()->{assertEquals(0,rows().getChildCount());assertTrue(status().contains("Nessun prezzo"));assertFalse(status().contains("0,00"));});
    }
    @Test public void unreadyAndUnavailableAreExplicitAndBackgroundCannotRefresh()throws Exception {
        show(true,null);onMain(()->{assertTrue(status().contains("Apri una città"));assertFalse(screen.canRefresh());assertNull(activity.findViewById(R.id.discovery_refresh));assertNull(activity.findViewById(R.id.discovery_choose_area));});assertEquals(0,requests.get());
        onMain(()->{try{screen.show(new DiscoveryArea(45.4642,9.19,14));}catch(IOException impossible){throw new AssertionError(impossible);}});awaitLoaded();
        onMain(()->{assertTrue(status().contains("non verificabili"));assertEquals(0,rows().getChildCount());active.set(false);screen.pause();screen.refresh();});
        int count=requests.get();onMain(()->screen.refresh());assertEquals(count,requests.get());
    }
    @Test public void drinkDropdownExposesNineCategoriesAndKeepsBandWithoutNewRequests()throws Exception {
        partialOne=true;show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();int before=requests.get();
        onMain(()->{assertNotNull(activity.findViewById(R.id.discovery_drink));assertTrue(rows().getChildAt(0).getHeight()>0);assertTrue(rows().getChildAt(0).getHeight()<=Math.round(120*activity.getResources().getDisplayMetrics().density));
            assertNull(activity.findViewById(android.R.id.content).findViewWithTag("discovery.categoryCarousel"));
            Spinner dropdown=activity.findViewById(R.id.discovery_drink);
            dropdown.setSelection(RecommendationDrink.BEER_DRAFT.ordinal());});
        onMain(()->{assertEquals("beer_draft",screen.selectedDrink());assertEquals(0,rows().getChildCount());
            ((Spinner)activity.findViewById(R.id.discovery_drink)).setSelection(RecommendationDrink.SPRITZ.ordinal());});
        onMain(()->{assertEquals("spritz",screen.selectedDrink());assertEquals(2,rows().getChildCount());});
        onMain(()->{
            Spinner drinks=activity.findViewById(R.id.discovery_drink);
            assertEquals(9,drinks.getCount());assertEquals("Scegli cosa bere",drinks.getContentDescription());
            assertEquals(RecommendationDrink.SPRITZ.ordinal(),drinks.getSelectedItemPosition());
            assertEquals(NativePricePresentation.category(RecommendationDrink.NEGRONI),drinks.getItemAtPosition(RecommendationDrink.NEGRONI.ordinal()));
            ((Spinner)activity.findViewById(R.id.discovery_band)).setSelection(1);
            drinks.setSelection(RecommendationDrink.NEGRONI.ordinal());
        });
        onMain(()->{assertEquals("negroni",screen.selectedDrink());assertEquals(1,screen.selectedBand());assertEquals(0,rows().getChildCount());assertFalse(text(rows()).contains("0,00"));});
        assertEquals(before,requests.get());
    }
    @Test public void verifiedMenuSampleAppearsBesideExistingCustomerPriceWithOriginalCurrencyAndSource()throws Exception {
        menuOne=true;show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();assertEquals(29,requests.get());
        onMain(()->{
            assertEquals(3,rows().getChildCount());
            assertEquals("EUR · €",((TextView)rows().getChildAt(0).findViewWithTag("discovery.currencyHeading")).getText().toString());
            assertEquals("GBP · £",((TextView)rows().getChildAt(2).findViewWithTag("discovery.currencyHeading")).getText().toString());
            assertEquals("1",((TextView)rows().getChildAt(0).findViewWithTag("discovery.rank")).getText().toString());
            assertEquals("2",((TextView)rows().getChildAt(1).findViewWithTag("discovery.rank")).getText().toString());
            assertEquals("1",((TextView)rows().getChildAt(2).findViewWithTag("discovery.rank")).getText().toString());
            View sourced=null;
            for(int i=0;i<rows().getChildCount();i++)if(text(rows().getChildAt(i)).contains("5,50 £"))sourced=rows().getChildAt(i);
            assertNotNull(sourced);assertTrue(text(sourced).contains("GBP · Calice · 200 ml"));
            assertTrue(text(sourced).contains("Menu verificato"));
            sourced.findViewById(R.id.discovery_details).performClick();
            assertTrue(text(sourced).contains("https://source.example/menu"));
            assertTrue(text(rows()).contains("8,00"));
        });
    }
    @Test public void featuredCardsPreviewRealRowsAndOpenTheirActualVenueAtCompactWidths()throws Exception {
        menuOne=true;show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();
        onMain(()->{
            LinearLayout featured=featured();assertEquals(2,featured.getChildCount());assertEquals(3,rows().getChildCount());
            for(int i=0;i<2;i++)assertEquals("Preview must preserve the first row for each venue",rows().getChildAt(i).getTag(),featured.getChildAt(i).getTag());
            String preview=text(featured);assertTrue(preview.contains("6,00"));assertTrue(preview.contains("8,00"));
            assertFalse("The third row belongs to an already featured venue",preview.contains("5,50 £"));
            assertTrue("The complete list retains the distinct GBP menu row",text(rows()).contains("5,50 £"));assertTrue(preview.contains("Spritz"));assertFalse(preview.contains("Affare"));
            for(int width:new int[]{320,393,411}){
                float density=activity.getResources().getDisplayMetrics().density;int pixels=Math.round(width*density);
                View root=screen.view();root.measure(View.MeasureSpec.makeMeasureSpec(pixels,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(Math.round(700*density),View.MeasureSpec.EXACTLY));root.layout(0,0,pixels,Math.round(700*density));
                View scroller=root.findViewWithTag("discovery.featuredScroll");assertTrue(scroller.getWidth()<=pixels);assertEquals(2,featured.getChildCount());
                for(int i=0;i<featured.getChildCount();i++){
                    View card=featured.getChildAt(i);assertTrue(card.getWidth()<=scroller.getWidth());assertTrue(card.getHeight()>=Math.round(48*density));
                    assertTrue(card.getContentDescription().toString().contains("Apri Spritz da "));assertTrue(card.getContentDescription().toString().contains("€")||card.getContentDescription().toString().contains("£"));
                }
            }
            View chosen=featured.getChildAt(1);String target=(String)chosen.getTag();chosen.performClick();assertEquals(target,opened.get());
            ((Spinner)activity.findViewById(R.id.discovery_drink)).setSelection(RecommendationDrink.NEGRONI.ordinal());
        });
        onMain(()->{assertEquals(0,featured().getChildCount());assertEquals(0,rows().getChildCount());assertEquals(View.GONE,screen.view().findViewWithTag("discovery.featuredScroll").getVisibility());});
    }
    @Test public void compactDiscoverShowsRealPricesBeforeLongCaveatsAndPreservesAccessibleFilters()throws Exception {
        menuOne=true;show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();
        onMain(()->{
            LinearLayout body=(LinearLayout)((android.view.ViewGroup)screen.view()).getChildAt(0);
            Button city=screen.view().findViewWithTag("discovery.citySelector");
            Spinner drink=activity.findViewById(R.id.discovery_drink);
            Spinner band=activity.findViewById(R.id.discovery_band);
            View preview=screen.view().findViewWithTag("discovery.featuredScroll");
            TextView caveats=screen.view().findViewWithTag("discovery.disclosure");
            assertEquals("Scegli cosa bere",drink.getContentDescription());
            assertTrue(city.getContentDescription().toString().contains("Scegli una città"));
            assertEquals(activity.getString(R.string.favorites_band),band.getContentDescription());
            assertEquals(View.VISIBLE,caveats.getVisibility());
            assertTrue(caveats.getText().toString().contains(activity.getString(R.string.discovery_menu_samples)));
            assertTrue(caveats.getText().toString().contains("Immagini illustrative"));
            assertFalse("The long menu caveat must not delay featured prices",status().contains("Prezzi da menu"));
            assertEquals("Altre spese non verificate",DiscoveryScreen.priceCaveat(new MenuV2Prices.Price(
                    "fixture","Bar","Spritz","spritz",0,550,"GBP",2,"Calice",200,false,"2026-11-03",
                    "Altre spese del locale non verificate; controlla la scheda del locale.",null,null,null)));
            assertTrue("Ranked prices must show the same fee scope before expansion",text(rows()).contains("Altre spese non verificate"));
            assertTrue("The ranked rows should precede the longer caveats",body.indexOfChild(rows())<body.indexOfChild(caveats));
            float density=activity.getResources().getDisplayMetrics().density;
            int width=Math.round(393*density);
            screen.view().measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(Math.round(850*density),View.MeasureSpec.EXACTLY));
            screen.view().layout(0,0,width,Math.round(850*density));
            assertTrue("Featured prices should start near the selected filters",preview.getTop()<Math.round(300*density));
            for(View control:new View[]{city,drink,band})assertTrue(control.getHeight()>=Math.round(48*density));
        });
    }
    @Test public void priceCaveatKeepsConditionalAndKnownFeeScopeVisibleWithoutAddingFeeToDrinkAmount() {
        MenuV2Prices.Price conditional=new MenuV2Prices.Price("fixture","Bar","Spritz","spritz",0,550,"EUR",2,
                "Calice",200,false,"2026-11-01",
                "Spese separate: Coperto 2,50 € / persona (solo se dopo le 20). Altre spese non verificate.",null,"Dopo le 20",null);
        assertEquals("Condizioni: Dopo le 20 · Spese separate indicate dal menu · Altre spese non verificate",
                DiscoveryScreen.priceCaveat(conditional));
        assertEquals("5,50 €",conditional.amount());
        assertTrue(conditional.feeNotice.contains("2,50 €"));
    }
    @Test public void mixedSourcePricesRiseWithinEachCurrencyAcrossServingsWithStableTies()throws Exception {
        DiscoveryArea area=new DiscoveryArea(45.4642,9.19,14);
        DiscoveryData.Venue venue=new DiscoveryData.Venue("n123","Bar","u0nd9","Via A","Milano",45.4642,9.19);
        MenuV2Prices.Price menu=new MenuV2Prices.Price("a","Bar","Spritz","spritz",0,600,"EUR",2,
                "Calice",200,false,"2026-11-01","Altre spese non verificate.");
        EuropePrices.Price europe=new EuropePrices.Price("n123","u0nd9","spritz","EUR",0,650,
                new EuropePrices.Serving("glass",200),"2026-11-01",null,0,"r1","user",
                null,null,null,null,"v1",false);
        EuropePrices.Price cheaperEuro=new EuropePrices.Price("n123","u0nd9","spritz","EUR",0,550,
                new EuropePrices.Serving("ml",250),"2026-11-01",null,0,"r3","user",
                null,null,null,null,"v1",false);
        EuropePrices.Price pounds=new EuropePrices.Price("n123","u0nd9","spritz","GBP",0,450,
                new EuropePrices.Serving("glass",200),"2026-11-01",null,0,"r2","user",
                null,null,null,null,"v1",false);
        DiscoveryData.Row sixFifty=new DiscoveryData.Row(venue,null,europe,area);
        DiscoveryData.Row six=new DiscoveryData.Row(venue,menu,area);
        DiscoveryData.Row eight=new DiscoveryData.Row(venue,new FavoriteComparison.Price(800,"2026-11-01",0,false),area);
        DiscoveryData.Row fiveFiftyEuro=new DiscoveryData.Row(venue,null,cheaperEuro,area);
        DiscoveryData.Row fourFiftyPounds=new DiscoveryData.Row(venue,null,pounds,area);
        java.util.List<DiscoveryData.Row> sorted=DiscoveryData.rankRows(new java.util.ArrayList<>(
                java.util.Arrays.asList(sixFifty,six,eight,fiveFiftyEuro,fourFiftyPounds)));
        assertEquals(six.group(),sixFifty.group());
        assertNotEquals(fiveFiftyEuro.group(),six.group());
        assertEquals(550,sorted.get(0).amount());assertEquals(600,sorted.get(1).amount());
        assertEquals(650,sorted.get(2).amount());assertEquals(800,sorted.get(3).amount());
        assertEquals(450,sorted.get(4).amount());
        assertTrue(sorted.get(0).amountLabel().contains("5,50"));assertEquals("6,00 €",sorted.get(1).amountLabel());
        assertTrue(sorted.get(4).amountLabel().contains("£"));assertNotEquals(sorted.get(0).currency(),sorted.get(4).currency());
        MenuV2Prices.Price later=new MenuV2Prices.Price("b","Bar","Spritz","spritz",0,600,"EUR",2,
                "Calice",200,false,"2026-11-01","Altre spese non verificate.");
        java.util.List<DiscoveryData.Row> ties=DiscoveryData.rankRows(new java.util.ArrayList<>(
                java.util.Arrays.asList(new DiscoveryData.Row(venue,later,area),six)));
        assertEquals("a",ties.get(0).menuPrice.id);assertEquals("b",ties.get(1).menuPrice.id);
    }
    @Test public void compactFeaturedCardsExpandToFitRealPriceAndSourceAtLargeText()throws Exception {
        android.content.res.Resources resources=activity.getResources();
        android.content.res.Configuration saved=new android.content.res.Configuration(resources.getConfiguration());
        try{
            onMain(()->{
                android.content.res.Configuration large=new android.content.res.Configuration(saved);
                large.fontScale=1.5f;
                resources.updateConfiguration(large,resources.getDisplayMetrics());
            });
            menuOne=true;show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();
            onMain(()->{
                float density=resources.getDisplayMetrics().density;
                int width=Math.round(320*density);View root=screen.view();
                root.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(Math.round(700*density),View.MeasureSpec.EXACTLY));
                root.layout(0,0,width,Math.round(700*density));
                for(int index=0;index<featured().getChildCount();index++){
                    LinearLayout card=(LinearLayout)featured().getChildAt(index);
                    String words=text(card);
                    assertTrue(words.contains("€")||words.contains("£"));
                    assertTrue(words.contains("Menu verificato")||words.contains("Segnalato"));
                    assertTrue(words.contains("EUR")||words.contains("GBP"));
                    int requiredHeight=card.getPaddingTop()+card.getPaddingBottom();
                    for(int child=0;child<card.getChildCount();child++){
                        View content=card.getChildAt(child);requiredHeight+=content.getMeasuredHeight();
                        if(content instanceof TextView){
                            android.text.Layout layout=((TextView)content).getLayout();assertNotNull(layout);
                            for(int line=0;line<layout.getLineCount();line++)assertEquals(0,layout.getEllipsisCount(line));
                        }
                    }
                    assertTrue("Large text must expand the card instead of clipping the source",card.getHeight()>=requiredHeight);
                }
            });
        }finally{onMain(()->resources.updateConfiguration(saved,resources.getDisplayMetrics()));}
    }
    @Test public void bandLabelsNeverEllipsizeOrOverflowAt320393And411Dp() {
        android.content.res.Resources resources=activity.getResources();android.content.res.Configuration saved=new android.content.res.Configuration(resources.getConfiguration());
        try{
            show(true,null);
            for(int width:new int[]{320,393,411})for(int selected:new int[]{0,1})onMain(()->{
                android.content.res.Configuration configuration=new android.content.res.Configuration(saved);configuration.screenWidthDp=width;resources.updateConfiguration(configuration,resources.getDisplayMetrics());
                Spinner band=activity.findViewById(R.id.discovery_band);band.setSelection(selected,false);float density=resources.getDisplayMetrics().density;View root=screen.view();root.measure(View.MeasureSpec.makeMeasureSpec(Math.round(width*density),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(Math.round(600*density),View.MeasureSpec.EXACTLY));root.layout(0,0,Math.round(width*density),Math.round(600*density));
                LinearLayout header=root.findViewWithTag("discovery.header");assertEquals(LinearLayout.VERTICAL,header.getOrientation());View control=header.getChildAt(1);assertSame(band,control);assertTrue(control.getLeft()>=0);assertTrue(control.getRight()<=header.getWidth());assertTrue(control.getWidth()>=Math.round(44*density));assertTrue(control.getHeight()>=Math.round(44*density));
                TextView label=(TextView)band.getSelectedView();assertNotNull(label);assertEquals(activity.getString(selected==0?R.string.favorites_normal:R.string.favorites_happy_hour),label.getText().toString());android.text.Layout layout=label.getLayout();assertNotNull(layout);assertTrue(layout.getLineCount()>0);for(int line=0;line<layout.getLineCount();line++){assertEquals("Band label ellipsis at "+width+"dp",0,layout.getEllipsisCount(line));assertTrue("Band label overflow at "+width+"dp",layout.getLineWidth(line)<=label.getWidth()-label.getPaddingLeft()-label.getPaddingRight()+1);}
            });
        }finally{onMain(()->resources.updateConfiguration(saved,resources.getDisplayMetrics()));}
    }
    @Test public void compactOverflowKeepsFullWidthBandAndNoDuplicateMapAction() {
        show(true,null);
        for(int width:new int[]{348,430,768})onMain(()->{
            float density=activity.getResources().getDisplayMetrics().density;
            int pixels=Math.round(width*density);View root=screen.view();
            root.measure(View.MeasureSpec.makeMeasureSpec(pixels,View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(Math.round(700*density),View.MeasureSpec.EXACTLY));
            root.layout(0,0,pixels,Math.round(700*density));
            LinearLayout header=root.findViewWithTag("discovery.header");
            View title=header.getChildAt(0),band=header.getChildAt(1);
            assertEquals(LinearLayout.VERTICAL,header.getOrientation());
            assertTrue("First row reserves the 56dp native overflow",title.getPaddingRight()>=Math.round(56*density));
            assertTrue("Drink band starts below the 48dp native overflow",band.getTop()>=Math.round(48*density));
            assertEquals("Drink band fills the header",header.getWidth(),band.getWidth());
            assertNull("Mappa is only in bottom navigation",activity.findViewById(R.id.discovery_choose_area));
            assertNull("Ricarica is only in overflow",activity.findViewById(R.id.discovery_refresh));
        });
    }
    @Test public void cityPickerLoadsActualAreaWithoutMapAndKeepsDrinkSelection()throws Exception {
        show(false,null);awaitCities();
        onMain(()->{
            Button cities=screen.view().findViewWithTag("discovery.citySelector");
            assertTrue(cities.getText().toString().contains("Area della mappa"));
            assertTrue(cities.getContentDescription().toString().contains("Scegli una città per Scopri"));
            cities.performClick();assertNotNull(screen.cityDialog());
            ListView list=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.cityList");
            assertEquals(3,list.getCount());assertEquals("Area della mappa",list.getItemAtPosition(0));
            assertEquals("Milano, Italia",list.getItemAtPosition(1));assertEquals("Roma, Italia",list.getItemAtPosition(2));
            EditText search=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.citySearch");
            search.setText("ro");assertEquals(1,list.getCount());assertEquals("Roma, Italia",list.getItemAtPosition(0));
            search.setText("not-a-city");assertEquals(0,list.getCount());
            search.setText("mIl");assertEquals(1,list.getCount());assertEquals("Milano, Italia",list.getItemAtPosition(0));
            list.performItemClick(null,0,0);
        });
        awaitLoaded();
        onMain(()->{
            assertNotNull(screen.area());assertEquals(45.4642,screen.area().lat,0.00001);
            assertTrue(((Button)screen.view().findViewWithTag("discovery.citySelector")).getText().toString().contains("Milano"));
            assertEquals("spritz",screen.selectedDrink());assertEquals(2,rows().getChildCount());
            ((Button)screen.view().findViewWithTag("discovery.citySelector")).performClick();
            EditText search=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.citySearch");
            search.setText("Roma");ListView list=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.cityList");
            assertEquals(1,list.getCount());list.performItemClick(null,0,0);
        });
        awaitLoaded();
        onMain(()->{
            assertEquals(41.9028,screen.area().lat,0.00001);
            assertEquals(0,rows().getChildCount());assertTrue(status().contains("Nessun prezzo"));
            ((Button)screen.view().findViewWithTag("discovery.citySelector")).performClick();
            ListView list=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.cityList");
            list.performItemClick(null,0,0);
        });
        onMain(()->{assertNull(screen.area());assertTrue(status().contains("Apri una città"));});
    }
    @Test public void retryDropsStaleSelectedCityAndItsPricesWhenCityDisappears()throws Exception {
        AtomicInteger placeReads=new AtomicInteger(),catalogReads=new AtomicInteger();
        DiscoveryCities.Source changingSource=(url,maximum)->{
            String body;
            if(url.endsWith("/api/health"))body="{\"status\":\"ok\",\"data_version\":\"20261030\"}";
            else if(url.endsWith("/data/20261030/places.json"))body=placeReads.incrementAndGet()==1?
                    "[[1,\"Milano\",45.4642,9.19,200],[2,\"Roma\",41.9028,12.4964,100]]":
                    "[[2,\"Roma\",41.9028,12.4964,100]]";
            else if(url.endsWith("/mobile-data/catalog.json")){
                if(catalogReads.incrementAndGet()==1)throw new IOException("Owned partial city catalogue");
                body="{\"schema_version\":1,\"version\":\"v1\",\"venues\":[]}";
            }else throw new IOException("Unexpected city URL");
            return body.getBytes(StandardCharsets.UTF_8);
        };
        show(false,new DiscoveryArea(41.9028,12.4964,14),changingSource);awaitCities();
        onMain(()->{
            Button cities=screen.view().findViewWithTag("discovery.citySelector");
            assertEquals(View.VISIBLE,screen.view().findViewWithTag("discovery.cityRetry").getVisibility());
            cities.performClick();ListView list=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.cityList");
            assertEquals("Milano, Italia",list.getItemAtPosition(1));list.performItemClick(null,1,1);
        });
        awaitLoaded();onMain(()->{assertEquals(45.4642,screen.area().lat,0.00001);assertEquals(2,rows().getChildCount());
            screen.view().findViewWithTag("discovery.cityRetry").performClick();});
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean refreshed=new AtomicBoolean();
        while(System.nanoTime()<deadline){onMain(()->{
            Button cities=screen.view().findViewWithTag("discovery.citySelector");
            refreshed.set(placeReads.get()>=2&&screen.cityCount()==1&&cities.getText().toString().contains("Area della mappa"));
        });if(refreshed.get())break;Thread.sleep(10);}
        assertTrue("Owned city retry did not finish",refreshed.get());awaitLoaded();
        onMain(()->{
            assertTrue(((Button)screen.view().findViewWithTag("discovery.citySelector")).getText().toString().contains("Area della mappa"));
            assertEquals(41.9028,screen.area().lat,0.00001);
            assertEquals(0,rows().getChildCount());assertTrue(status().contains("Nessun prezzo"));
            assertTrue(text(screen.view().findViewWithTag("discovery.cityStatus")).contains("non è nell'elenco aggiornato"));
            ((Button)screen.view().findViewWithTag("discovery.citySelector")).performClick();
            EditText search=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.citySearch");
            ListView list=screen.cityDialog().getWindow().getDecorView().findViewWithTag("discovery.cityList");
            search.setText("Milano");assertEquals(0,list.getCount());
            search.setText("Roma");assertEquals(1,list.getCount());list.performItemClick(null,0,0);
        });
        onMain(()->{assertEquals(41.9028,screen.area().lat,0.00001);
            assertFalse(text(screen.view().findViewWithTag("discovery.cityStatus")).contains("non è nell'elenco aggiornato"));});
    }
    private void awaitCities()throws Exception{long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean loaded=new AtomicBoolean();while(System.nanoTime()<deadline){onMain(()->loaded.set(screen.cityCount()>=2));if(loaded.get())return;Thread.sleep(10);}fail("Owned city choices did not load");}
    private void show(boolean unavailable,DiscoveryArea area){show(unavailable,area,(url,maximum)->{
        String body;
        if(url.endsWith("/api/health"))body="{\"status\":\"ok\",\"data_version\":\"20261030\"}";
        else if(url.endsWith("/data/20261030/places.json"))body="[[2,\"Roma\",41.9028,12.4964,100],[1,\"Milano\",45.4642,9.19,200]]";
        else if(url.endsWith("/mobile-data/catalog.json"))body="{\"schema_version\":1,\"version\":\"v1\",\"venues\":[]}";
        else throw new IOException("Unexpected city URL");
        return body.getBytes(StandardCharsets.UTF_8);
    });}
    private void show(boolean unavailable,DiscoveryArea area,DiscoveryCities.Source citySource){onMain(()->{
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{requests.incrementAndGet();if(unavailable||partialOne&&url.contains("/api/prices/")&&!url.contains("u0nd9"))throw new IOException("Owned offline response");String body;if(url.contains("/api/mobile/v2/menu/cells/")){String cell=url.split("/menu/cells/")[1].substring(0,5);body=(menuOne&&cell.equals("u0nd9")?MENU_ONE:MENU_EMPTY).replace("CELL",cell);}else body=url.endsWith("health")?"{\"status\":\"ok\",\"data_version\":\"20261030\"}":url.contains("u0nd9")?(url.endsWith(".json")?STATIC:PRICES):url.endsWith(".json")?"{\"c\":[],\"v\":[]}":"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[]}";return body.getBytes(StandardCharsets.UTF_8);},()->"2026-11-01");
        screen=new DiscoveryScreen(activity,opened::set,active::get,new DiscoveryLoader(client,task->activity.runOnUiThread(task)),citySource);assertEquals("beer_draft",screen.selectedDrink());screen.restoreSelection("spritz",0);activity.setContentView(screen.view());screen.show(area);
    });}
    private void awaitLoaded()throws Exception{long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean loaded=new AtomicBoolean();while(System.nanoTime()<deadline){onMain(()->loaded.set(!status().contains("Caricamento")&&(rows().getChildCount()==0||rows().getChildAt(0).getHeight()>0)));if(loaded.get())return;Thread.sleep(10);}fail("Owned discovery did not complete");}
    private LinearLayout rows(){return activity.findViewById(R.id.discovery_rows);}private LinearLayout featured(){return screen.view().findViewWithTag("discovery.featured");}private String status(){return((TextView)activity.findViewById(R.id.discovery_status)).getText().toString();}
    private String text(View view){StringBuilder s=new StringBuilder();if(view instanceof TextView)s.append(((TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)s.append(' ').append(text(g.getChildAt(i)));}return s.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
