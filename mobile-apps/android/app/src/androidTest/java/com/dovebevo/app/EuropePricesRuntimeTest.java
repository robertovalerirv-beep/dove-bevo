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
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Owned JSON/transport and actual native widgets; no accepted rules, browser or public requests. */
public final class EuropePricesRuntimeTest {
    private static final String CATALOG="{\"schema_version\":1,\"version\":\"owned-eu-v1\",\"venues\":[{\"key\":\"n91\",\"name\":\"Owned London fixture\",\"kind\":1,\"lat\":51.5074,\"lon\":-0.1278,\"cell\":\"gcpvj\",\"city\":\"London\",\"country\":\"GB\",\"currency\":\"GBP\",\"google\":{\"url\":\"https://www.google.com/maps?cid=123\",\"review_count\":101,\"checked_on\":\"2026-11-01\"}}]}";
    private static String wine(int ml,int amount){return "{\"venue\":\"n91\",\"cell\":\"gcpvj\",\"drink\":\"wine_glass\",\"hh\":0,\"currency\":\"GBP\",\"amount_minor\":"+amount+",\"serving\":{\"unit\":\"glass\",\"ml\":"+ml+"},\"observed_on\":null,\"confirmed_on\":null,\"confirmations\":0,\"status\":\"active\",\"revision\":\"719576dd-2184-49e9-831d-bc2de0c5f542\",\"provenance\":{\"kind\":\"online_menu\",\"source_url\":\"https://official.example/menu\",\"source_checked_on\":\"2026-11-01\",\"source_sha256\":\""+"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"+"\",\"menu_item\":\"Owned white wine\"}}";}
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();private final AtomicBoolean hidden=new AtomicBoolean();private MainActivity activity;private FavoritesScreen favorites;private DiscoveryScreen discovery;private SharedPreferences rules;private boolean hadPrevious;private String previous;
    @Before public void setUp(){rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadPrevious=rules.contains("accepted_rules_version");previous=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));onMain(()->{assertNotNull(activity.findViewById(R.id.accept_rules));assertNull(activity.findViewById(R.id.website));});}
    @After public void tearDown(){onMain(()->{if(favorites!=null)favorites.close();if(discovery!=null)discovery.close();activity.finish();});SharedPreferences.Editor edit=rules.edit();if(hadPrevious)edit.putString("accepted_rules_version",previous);else edit.remove("accepted_rules_version");assertTrue(edit.commit());}
    private FavoritePricesClient client(){return new FavoritePricesClient((url,max,call)->{call.check();String body;if(url.endsWith("health"))body="{\"status\":\"ok\",\"data_version\":\"20261030\"}";else if(url.endsWith("catalog.json"))body=CATALOG;else if(url.equals(FavoritePricesClient.ORIGIN+"/api/mobile/prices/cells/gcpvj"))body="{\"schema_version\":1,\"catalog_version\":\"owned-eu-v1\",\"rows\":["+wine(175,720)+","+wine(250,920)+"],\"hidden\":["+(hidden.get()?"\"n91\"":"")+"],\"legacy_venues\":[]}";else throw new IOException("Unexpected owned fixture URL");return body.getBytes(StandardCharsets.UTF_8);},()->"2026-11-02");}
    @Test public void favoritesAndDiscoveryRenderPoundsDistinctWineServingsAndHonestMenuProvenance()throws Exception {
        SavedVenueStore store=new SavedVenueStore(new SavedVenueStore.Storage(){byte[] data;public byte[] read(){return data;}public void write(byte[] value){data=value;}});assertEquals(SavedVenueStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n91?c=gcpvj","Private fixture label"));
        onMain(()->{favorites=new FavoritesScreen(activity,store,url->{},()->true,new FavoritesLoader(client(),activity::runOnUiThread));activity.setContentView(favorites.view());favorites.restoreSelection("wine_glass",0);favorites.show();});awaitLoaded(R.id.favorites_status);
        onMain(()->{LinearLayout rows=activity.findViewById(R.id.favorites_rows);assertEquals(2,rows.getChildCount());String first=text(rows.getChildAt(0)),second=text(rows.getChildAt(1));assertTrue(first.contains("£7.20"));assertTrue(first.contains("175 ml"));assertTrue(second.contains("£9.20"));assertTrue(second.contains("250 ml"));assertTrue(first.contains("Dal menu online"));assertTrue(first.contains("01/11/2026"));assertFalse(first.contains("Segnalato il"));assertTrue(first.contains("Owned London fixture"));});
        assertEquals("Private fixture label",store.load().get(0).label);
        hidden.set(true);onMain(favorites::refresh);awaitLoaded(R.id.favorites_status);onMain(()->{LinearLayout rows=activity.findViewById(R.id.favorites_rows);assertEquals(1,rows.getChildCount());assertFalse(text(rows).contains("£"));favorites.hide();});hidden.set(false);
        onMain(()->{discovery=new DiscoveryScreen(activity,url->{},()->true,new DiscoveryLoader(client(),activity::runOnUiThread));activity.setContentView(discovery.view());discovery.restoreSelection("wine_glass",0);try{discovery.show(new DiscoveryArea(51.5074,-0.1278,14));}catch(IOException invalid){throw new AssertionError(invalid);}});awaitLoaded(R.id.discovery_status);
        onMain(()->{LinearLayout rows=activity.findViewById(R.id.discovery_rows);assertEquals(2,rows.getChildCount());assertTrue(text(rows.getChildAt(0)).contains("GBP"));assertTrue(text(rows.getChildAt(0)).contains("175 ml"));assertTrue(text(rows.getChildAt(1)).contains("250 ml"));assertTrue(text(rows).contains("London"));assertFalse(text(rows).contains("Segnalato il"));});
    }
    private void awaitLoaded(int id)throws Exception{long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean done=new AtomicBoolean();while(System.nanoTime()<end){onMain(()->done.set(!((TextView)activity.findViewById(id)).getText().toString().contains("Caricamento")));if(done.get())return;Thread.sleep(10);}fail("Owned European fixture did not finish");}
    private String text(View view){StringBuilder result=new StringBuilder();if(view instanceof TextView)result.append(((TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)result.append(' ').append(text(g.getChildAt(i)));}return result.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
