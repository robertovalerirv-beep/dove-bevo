package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.HorizontalScrollView;
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
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private final AtomicBoolean active=new AtomicBoolean(true);private final AtomicInteger requests=new AtomicInteger();private final AtomicReference<String> opened=new AtomicReference<>();
    private MainActivity activity;private DiscoveryScreen screen;private SharedPreferences rules;private String previous;private boolean hadPrevious;private boolean partialOne;
    @Before public void setUp(){
        rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadPrevious=rules.contains("accepted_rules_version");previous=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
        onMain(()->{assertNotNull(activity.findViewById(R.id.accept_rules));assertNull(activity.findViewById(R.id.website));});
    }
    @After public void tearDown(){onMain(()->{if(screen!=null)screen.close();activity.finish();});SharedPreferences.Editor edit=rules.edit();if(hadPrevious)edit.putString("accepted_rules_version",previous);else edit.remove("accepted_rules_version");assertTrue(edit.commit());}
    @Test public void actualPricesSortAndFiltersKeepDateContextWithoutAnyBookmarkFile()throws Exception {
        show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();assertEquals(20,requests.get());ReferenceCapture.save("discovery-owned-fixture.png");
        onMain(()->{assertEquals(2,rows().getChildCount());View panel=rows().getChildAt(0).findViewWithTag("discovery.details");assertEquals(View.GONE,panel.getVisibility());rows().getChildAt(0).findViewById(R.id.discovery_details).performClick();assertEquals(View.VISIBLE,panel.getVisibility());assertTrue(text(rows().getChildAt(0)).contains("Locale due"));assertTrue(text(rows().getChildAt(0)).contains("6,00"));assertTrue(text(rows().getChildAt(0)).contains("oltre 90"));assertTrue(text(rows().getChildAt(0)).contains("dal centro della Mappa"));assertTrue(text(rows().getChildAt(1)).contains("2 conferme"));assertFalse(text(rows()).contains("Affare"));
            ((Spinner)activity.findViewById(R.id.discovery_band)).setSelection(1);});
        onMain(()->{assertEquals(1,rows().getChildCount());assertTrue(text(rows().getChildAt(0)).contains("5,00"));assertTrue(text(rows().getChildAt(0)).contains("27/10/2026"));rows().getChildAt(0).findViewById(R.id.discovery_open).performClick();});
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",opened.get());assertEquals(20,requests.get());
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
            HorizontalScrollView carousel=activity.findViewById(android.R.id.content).findViewWithTag("discovery.categoryCarousel");
            assertNotNull(carousel);assertEquals(9,((LinearLayout)carousel.getChildAt(0)).getChildCount());
            View spritz=carousel.findViewWithTag("discovery.category.spritz");View beer=carousel.findViewWithTag("discovery.category.beer_draft");
            String spritzSummary=spritz.getContentDescription().toString();
            assertTrue("Actual category summary: "+spritzSummary,spritzSummary.contains("Da 6,00"));
            assertTrue("Original euro currency must remain visible",spritzSummary.contains("€"));
            assertTrue(spritzSummary.contains("Segnalato il 2026-06-01"));
            assertTrue(spritzSummary.contains("Da ricontrollare"));
            assertTrue(spritz.getContentDescription().toString().contains("Immagine illustrativa"));
            assertTrue(beer.getContentDescription().toString().contains("Nessun prezzo nei dati caricati"));
            assertTrue(spritzSummary.contains("Zona parziale"));
            beer.performClick();assertEquals("beer_draft",screen.selectedDrink());assertEquals(0,rows().getChildCount());
            activity.findViewById(android.R.id.content).findViewWithTag("discovery.category.spritz").performClick();
            assertEquals("spritz",screen.selectedDrink());assertEquals(2,rows().getChildCount());});
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
    private void show(boolean unavailable,DiscoveryArea area){onMain(()->{
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{requests.incrementAndGet();if(unavailable||partialOne&&url.contains("/api/prices/")&&!url.contains("u0nd9"))throw new IOException("Owned offline response");String body=url.endsWith("health")?"{\"status\":\"ok\",\"data_version\":\"20261030\"}":url.contains("u0nd9")?(url.endsWith(".json")?STATIC:PRICES):url.endsWith(".json")?"{\"c\":[],\"v\":[]}":"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[]}";return body.getBytes(StandardCharsets.UTF_8);},()->"2026-11-01");
        screen=new DiscoveryScreen(activity,opened::set,active::get,new DiscoveryLoader(client,task->activity.runOnUiThread(task)));assertEquals("beer_draft",screen.selectedDrink());screen.restoreSelection("spritz",0);activity.setContentView(screen.view());screen.show(area);
    });}
    private void awaitLoaded()throws Exception{long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean loaded=new AtomicBoolean();while(System.nanoTime()<deadline){onMain(()->loaded.set(!status().contains("Caricamento")&&(rows().getChildCount()==0||rows().getChildAt(0).getHeight()>0)));if(loaded.get())return;Thread.sleep(10);}fail("Owned discovery did not complete");}
    private LinearLayout rows(){return activity.findViewById(R.id.discovery_rows);}private String status(){return((TextView)activity.findViewById(R.id.discovery_status)).getText().toString();}
    private String text(View view){StringBuilder s=new StringBuilder();if(view instanceof TextView)s.append(((TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)s.append(' ').append(text(g.getChildAt(i)));}return s.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
