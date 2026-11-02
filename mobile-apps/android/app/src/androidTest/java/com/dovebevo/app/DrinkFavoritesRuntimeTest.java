package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Owned DOM and GET fixtures only; no public contributions, real browser requests or chooser. */
public final class DrinkFavoritesRuntimeTest {
    private static final String URL="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    private static final String HTML="""
      <!doctype html><html data-dovebevo-mobile-shell="1"><meta name="viewport" content="width=device-width,initial-scale=1"><body>
      <section class="map" data-selected="n123"></section><dialog class="sheet sheet--bare" aria-label="Locale verificato" style="position:fixed;top:20px;left:10px;margin:0;width:280px"><div class="sheet__body"><article class="scontrino"><div class="scontrino__paper"><h2 class="scontrino__name">Locale verificato</h2>
      <section data-dovebevo-share="1" data-version="1" data-venue="n123" data-venue-name="Locale verificato" data-drink="spritz" data-drink-name="Spritz" data-hh="1" data-amount-minor="700" data-currency="EUR" data-serving="" data-provenance="Segnalato il 02/11/2026" data-confirmations="0" data-tier="neutro" data-location="Milano">7,00 €</section></div></article></div></dialog><script>document.querySelector('dialog').showModal()</script></body></html>
      """;
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;private HeldWeb web;private SavedDrinkUi chooser;private SavedDrinkScreen screen;private FavoritesScreen favorites;
    private SharedPreferences rules;private boolean hadRule;private String oldRule;private File directory;
    private SavedDrinkStore drinks;private SavedVenueStore venues;private SavedVenueFile oldFile;private boolean failDrinkWrites;
    @Before public void setUp()throws Exception {
        rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadRule=rules.contains("accepted_rules_version");oldRule=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
        directory=new File(activity.getFilesDir(),"owned-drinks-"+UUID.randomUUID());assertTrue(directory.mkdir());
        oldFile=new SavedVenueFile(directory);venues=new SavedVenueStore(oldFile);SavedVenueFile drinkFile=new SavedVenueFile(directory,"saved-drinks-v1");drinks=new SavedDrinkStore(new SavedVenueStore.Storage(){public byte[] read()throws IOException{return drinkFile.read();}public void write(byte[] bytes)throws IOException{if(failDrinkWrites)throw new IOException("Owned atomic write failure");drinkFile.write(bytes);}});
    }
    @After public void tearDown(){
        onMain(()->{if(chooser!=null)chooser.dismiss();if(favorites!=null)favorites.close();else if(screen!=null)screen.close();field("website",null);if(web!=null)web.destroy();activity.finish();});
        SharedPreferences.Editor edit=rules.edit();if(hadRule)edit.putString("accepted_rules_version",oldRule);else edit.remove("accepted_rules_version");assertTrue(edit.commit());
        for(String name:new String[]{"saved-venues-v1.bin","saved-venues-v1.tmp","saved-drinks-v1.bin","saved-drinks-v1.tmp"}){File f=new File(directory,name);if(f.exists())assertTrue(f.delete());}assertTrue(directory.delete());
    }
    @Test public void actualFeaturedHappyHourSaveIsExplicitAndPreservesVenueBytes()throws Exception {
        load(MobileEntry.drinkDocument(URL,RecommendationDrink.SPRITZ,1));venues.save(URL,"Old venue favourite");byte[] before=oldFile.read();
        onMain(()->chooser.show());awaitDrink();
        onMain(()->{Button button=drinkButton();assertTrue(button.getText().toString().contains("Spritz"));assertTrue(button.getText().toString().contains("Happy hour"));assertTrue(button.getText().toString().contains("Locale verificato"));});
        ReferenceCapture.save("drink-save-owned-fixture.png");onMain(()->drinkButton().performClick());
        assertEquals(1,drinks.load().size());assertEquals("n123/spritz/1",drinks.load().get(0).key());assertArrayEquals(before,oldFile.read());
    }
    @Test public void noValidFeaturedPriceStillAllowsIndependentVenueSave()throws Exception {
        load();evaluate("document.querySelector('[data-dovebevo-share]').remove()");onMain(()->chooser.show());Thread.sleep(300);instrumentation.waitForIdleSync();
        onMain(()->{assertFalse(drinkButton().isEnabled());assertTrue(venueButton().performClick());});
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(venues.load().isEmpty()&&System.nanoTime()<end)Thread.sleep(40);
        assertEquals(1,venues.load().size());assertTrue(drinks.load().isEmpty());
    }
    @Test public void heldCallbacksCannotSaveAfterReloadAwayBackBackgroundOrNewerChoice()throws Exception {
        load();String valid=evaluate(PriceShareSnapshot.SCRIPT);assertNotNull(PriceShareSnapshot.decode(valid,URL,URL,1,1));
        for(String cause:new String[]{"reload","away-back","background","newer-save"}){
            onMain(()->{web.hold=true;chooser.show();assertNotNull(web.pending.get());
                android.webkit.ValueCallback<String> callback=web.pending.getAndSet(null);
                if(cause.equals("background")){instrumentation.callActivityOnPause(activity);instrumentation.callActivityOnResume(activity);}
                else if(cause.equals("newer-save")){chooser.show();}
                else field("venueCaptureEpoch",(Long)get("venueCaptureEpoch")+(cause.equals("away-back")?2:1));
                callback.onReceiveValue(valid);Button button=drinkButton();if(button!=null){assertFalse(button.isEnabled());button.performClick();}chooser.dismiss();
            });assertTrue(cause,drinks.load().isEmpty());
        }
        Thread.sleep(5300);assertTrue(drinks.load().isEmpty());
    }
    @Test public void drinkRowsUseOwnBandAndReopenFocusedRouteFromFreshOwnedGets()throws Exception {
        drinks.save(URL,"Saved offline name",RecommendationDrink.SPRITZ,1);AtomicReference<String> opened=new AtomicReference<>();
        showScreen(opened,false);awaitRows("7,00");
        onMain(()->{String text=allText(screen.view());assertTrue(text.contains("Happy hour"));assertTrue(text.contains("Locale attuale"));assertFalse(text.contains("4,00"));screen.view().findViewWithTag("drink_favourite_open").performClick();});
        assertEquals(URL+"&drink=spritz&hh=1",opened.get());ReferenceCapture.save("drink-list-owned-fixture.png");
    }
    @Test public void hiddenReadIsUnavailableAndRemovalDoesNotTouchVenueFavourite()throws Exception {
        drinks.save(URL,"Saved offline name",RecommendationDrink.SPRITZ,1);venues.save(URL,"Old venue favourite");byte[] before=oldFile.read();
        showScreen(new AtomicReference<>(),true);awaitRows("Prezzo non disponibile");
        onMain(()->{try{java.lang.reflect.Field f=SavedDrinkScreen.class.getDeclaredField("cells");f.setAccessible(true);assertTrue("Hidden fixture must be a successfully parsed current cell",((java.util.Map<?,?>)f.get(screen)).containsKey("u0nd9"));}catch(ReflectiveOperationException error){throw new AssertionError(error);}assertFalse(allText(screen.view()).contains("7,00"));failDrinkWrites=true;screen.refresh();screen.view().findViewWithTag("drink_favourite_remove").performClick();assertTrue(screen.view().findViewWithTag("drink_favourites_refresh").isEnabled());assertFalse(allText(screen.view()).contains("Aggiornamento prezzi…"));assertTrue(allText(screen.view()).contains("Nessun dato modificato"));});
        assertEquals(1,drinks.load().size());assertArrayEquals(before,oldFile.read());
        onMain(()->{failDrinkWrites=false;screen.view().findViewWithTag("drink_favourite_remove").performClick();});
        assertTrue(drinks.load().isEmpty());assertArrayEquals(before,oldFile.read());
    }
    private void showScreen(AtomicReference<String> opened,boolean hidden){
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            if(url.endsWith("health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261031\"}");
            if(url.endsWith("catalog.json"))throw new IOException("No foreign fixture");
            if(url.contains("/data/"))return bytes("{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Locale attuale\",1,45.4642,9.19,\"\",0]]}");
            if(url.endsWith("/api/prices/u0nd9"))return bytes(hidden?"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[\"n123\"]}":"{\"p\":[[\"n123\",\"spritz\",0,400,\"2026-11-02\",0,0],[\"n123\",\"spritz\",1,700,\"2026-11-02\",0,0]],\"u\":[],\"pend\":[],\"h\":[]}");
            throw new IOException("Unexpected owned URL");
        },()->"2026-11-02");
        onMain(()->{favorites=new FavoritesScreen(activity,venues,opened::set,()->true,new FavoritesLoader(client,task->activity.runOnUiThread(task)),drinks,new FavoritesLoader(client,task->activity.runOnUiThread(task)));activity.setContentView(favorites.view());favorites.show();favorites.view().findViewWithTag("favourites_drink_tab").performClick();try{java.lang.reflect.Field f=FavoritesScreen.class.getDeclaredField("drinkPane");f.setAccessible(true);screen=(SavedDrinkScreen)f.get(favorites);}catch(ReflectiveOperationException error){throw new AssertionError(error);}});
    }
    private void load()throws Exception {load(URL);}
    private void load(String route)throws Exception {
        CountDownLatch loaded=new CountDownLatch(1);
        onMain(()->{web=new HeldWeb(activity);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setBlockNetworkLoads(true);web.setWebViewClient(new WebViewClient(){@Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view,android.webkit.WebResourceRequest request){return new android.webkit.WebResourceResponse("text/html","UTF-8",new java.io.ByteArrayInputStream(bytes(route.equals(request.getUrl().toString())?HTML:"")));}@Override public void onPageFinished(WebView view,String url){if(route.equals(url))loaded.countDown();}});activity.setContentView(web);web.loadUrl(route);});assertTrue(loaded.await(5,TimeUnit.SECONDS));
        onMain(()->{field("website",web);field("hasUsablePage",true);field("failed",false);field("loading",false);field("awaitingDocumentStart",false);field("documentHasHttpError",false);field("stoppedUrl",null);
            chooser=new SavedDrinkUi(activity,drinks,()->(String)invoke("eligibleSavedVenue"),completion->invokeRead(completion),()->{SavedVenueCapture capture=new SavedVenueCapture(URL,(Long)get("venueCaptureEpoch"));try{web.evaluateJavascript(VenueHeadingReader.SCRIPT,result->{SavedVenueCapture.Venue venue=VenueHeadingReader.decode(result,capture,URL,(Long)get("venueCaptureEpoch"));if(venue!=null)venues.save(venue.url,venue.name);});}catch(RuntimeException error){throw error;}},()->(Long)get("venueCaptureEpoch"));field("savedDrinks",chooser);});
    }
    private void awaitDrink()throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(System.nanoTime()<end){AtomicReference<Boolean> yes=new AtomicReference<>(false);onMain(()->yes.set(drinkButton()!=null&&drinkButton().isEnabled()));if(yes.get())return;Thread.sleep(40);}fail("Actual guarded featured drink was not offered");}
    private void awaitRows(String expected)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(System.nanoTime()<end){AtomicReference<String> text=new AtomicReference<>("");onMain(()->text.set(allText(screen.view())));if(text.get().contains(expected))return;Thread.sleep(40);}fail("Fresh owned price row missing: "+expected);}
    private Button drinkButton(){android.app.AlertDialog d=(android.app.AlertDialog)readChooser("dialog");return d==null?null:d.getWindow().getDecorView().findViewWithTag("save_choice_drink");}
    private Button venueButton(){android.app.AlertDialog d=(android.app.AlertDialog)readChooser("dialog");return d.getWindow().getDecorView().findViewWithTag("save_choice_venue");}
    private Object readChooser(String name){try{java.lang.reflect.Field f=SavedDrinkUi.class.getDeclaredField(name);f.setAccessible(true);return f.get(chooser);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private Object get(String name){try{java.lang.reflect.Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private void field(String name,Object value){try{java.lang.reflect.Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private Object invoke(String name){try{java.lang.reflect.Method method=MainActivity.class.getDeclaredMethod(name);method.setAccessible(true);return method.invoke(activity);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private void invokeRead(Consumer<PriceShareSnapshot> completion){try{java.lang.reflect.Method method=MainActivity.class.getDeclaredMethod("readFeaturedDrink",Consumer.class);method.setAccessible(true);method.invoke(activity,completion);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private String evaluate(String script)throws Exception {CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();onMain(()->web.evaluateJavascript(script,s->{value.set(s);done.countDown();}));assertTrue(done.await(5,TimeUnit.SECONDS));return value.get();}
    private static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}
    private String allText(View view){StringBuilder text=new StringBuilder();if(view instanceof android.widget.TextView)text.append(((android.widget.TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup g=(android.view.ViewGroup)view;for(int i=0;i<g.getChildCount();i++)text.append(' ').append(allText(g.getChildAt(i)));}return text.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
    private static final class HeldWeb extends WebView {boolean hold;final AtomicReference<android.webkit.ValueCallback<String>> pending=new AtomicReference<>();HeldWeb(android.content.Context c){super(c);}@Override public void evaluateJavascript(String script,android.webkit.ValueCallback<String> callback){if(hold&&script.equals(PriceShareSnapshot.SCRIPT)){pending.set(callback);return;}super.evaluateJavascript(script,callback);}}
}
