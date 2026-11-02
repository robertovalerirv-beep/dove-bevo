package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.LinearLayout;
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
    private MainActivity activity;private DiscoveryScreen screen;private SharedPreferences rules;private String previous;private boolean hadPrevious;
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
        onMain(()->{activity.findViewById(R.id.discovery_screen).findViewWithTag("discovery.category.negroni").performClick();});
        onMain(()->{assertEquals(0,rows().getChildCount());assertTrue(status().contains("Nessun prezzo"));assertFalse(status().contains("0,00"));});
    }
    @Test public void unreadyAndUnavailableAreExplicitAndBackgroundCannotRefresh()throws Exception {
        show(true,null);onMain(()->{assertTrue(status().contains("Apri una città"));assertFalse(activity.findViewById(R.id.discovery_refresh).isEnabled());});assertEquals(0,requests.get());
        onMain(()->{try{screen.show(new DiscoveryArea(45.4642,9.19,14));}catch(IOException impossible){throw new AssertionError(impossible);}});awaitLoaded();
        onMain(()->{assertTrue(status().contains("non verificabili"));assertEquals(0,rows().getChildCount());active.set(false);screen.pause();screen.refresh();});
        int count=requests.get();onMain(()->screen.refresh());assertEquals(count,requests.get());
    }
    @Test public void nineIllustratedCategoriesUseActualCountsAndKeepBandWithoutNewRequests()throws Exception {
        show(false,new DiscoveryArea(45.4642,9.19,14));awaitLoaded();int before=requests.get();
        onMain(()->{assertNull(activity.findViewById(R.id.discovery_drink));assertTrue(rows().getChildAt(0).getHeight()>0);assertTrue(rows().getChildAt(0).getHeight()<=Math.round(120*activity.getResources().getDisplayMetrics().density));});
        onMain(()->{
            LinearLayout tiles=activity.findViewById(R.id.discovery_screen).findViewWithTag("discovery_categories");
            assertEquals(9,tiles.getChildCount());assertTrue(text(tiles.getChildAt(RecommendationDrink.SPRITZ.ordinal())).contains("2 prezzi"));
            assertTrue(tiles.getChildAt(RecommendationDrink.SPRITZ.ordinal()).isSelected());
            ((Spinner)activity.findViewById(R.id.discovery_band)).setSelection(1);
            tiles.getChildAt(RecommendationDrink.NEGRONI.ordinal()).performClick();
        });
        onMain(()->{assertEquals("negroni",screen.selectedDrink());assertEquals(1,screen.selectedBand());assertEquals(0,rows().getChildCount());assertFalse(text(rows()).contains("0,00"));});
        assertEquals(before,requests.get());
    }
    private void show(boolean unavailable,DiscoveryArea area){onMain(()->{
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{requests.incrementAndGet();if(unavailable)throw new IOException("Owned offline response");String body=url.endsWith("health")?"{\"status\":\"ok\",\"data_version\":\"20261030\"}":url.contains("u0nd9")?(url.endsWith(".json")?STATIC:PRICES):url.endsWith(".json")?"{\"c\":[],\"v\":[]}":"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[]}";return body.getBytes(StandardCharsets.UTF_8);},()->"2026-11-01");
        screen=new DiscoveryScreen(activity,opened::set,()->{},active::get,new DiscoveryLoader(client,task->activity.runOnUiThread(task)));activity.setContentView(screen.view());screen.show(area);
    });}
    private void awaitLoaded()throws Exception{long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean loaded=new AtomicBoolean();while(System.nanoTime()<deadline){onMain(()->loaded.set(!status().contains("Caricamento")&&(rows().getChildCount()==0||rows().getChildAt(0).getHeight()>0)));if(loaded.get())return;Thread.sleep(10);}fail("Owned discovery did not complete");}
    private LinearLayout rows(){return activity.findViewById(R.id.discovery_rows);}private String status(){return((TextView)activity.findViewById(R.id.discovery_status)).getText().toString();}
    private String text(View view){StringBuilder s=new StringBuilder();if(view instanceof TextView)s.append(((TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)s.append(' ').append(text(g.getChildAt(i)));}return s.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
