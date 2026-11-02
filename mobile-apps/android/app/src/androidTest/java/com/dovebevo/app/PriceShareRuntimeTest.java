package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.content.FileProvider;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Before;
import org.junit.After;
import org.junit.Test;

/** Owned, network-blocked DOM and private-cache fixtures. Never opens a chooser or writes public data. */
public class PriceShareRuntimeTest {
    private static final String URL="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;private WebView web;private SharedPreferences rules;private String previous;private boolean hadPrevious;
    private static final String HTML="""
      <!doctype html><html data-dovebevo-mobile-shell="1"><meta name="viewport" content="width=device-width, initial-scale=1"><body>
      <section class="map" data-selected="n123"></section>
      <dialog class="sheet sheet--bare" aria-label="Locale reale" style="position:fixed;top:20px;left:10px;margin:0;width:280px"><div class="sheet__body"><article class="scontrino"><div class="scontrino__paper"><h2 class="scontrino__name">Locale reale</h2>
      <section data-dovebevo-share="1" data-version="1" data-venue="n123" data-venue-name="Locale reale" data-drink="spritz" data-drink-name="Spritz" data-hh="0" data-amount-minor="1300" data-currency="GBP" data-serving="drink" data-provenance="Dal menu online · verificato il 02/11/2026 · Aperol Spritz" data-confirmations="0" data-tier="neutro" data-location="London">£13.00</section></div></article></div></dialog><script>document.querySelector('dialog').showModal()</script></body></html>
      """;
    @Before public void setUp(){rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadPrevious=rules.contains("accepted_rules_version");previous=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));}
    @After public void tearDown(){onMain(()->{if(web!=null)web.destroy();activity.finish();});SharedPreferences.Editor edit=rules.edit();if(hadPrevious)edit.putString("accepted_rules_version",previous);else edit.remove("accepted_rules_version");assertTrue(edit.commit());}
    @Test public void actualVisibleDomBindsVenueAndHiddenOrWrongHeadingFallsBack()throws Exception {
        load();String raw=evaluate(PriceShareSnapshot.SCRIPT);PriceShareSnapshot snapshot=PriceShareSnapshot.decode(raw,URL,URL,1,1);assertNotNull(raw,snapshot);assertEquals("£13.00",snapshot.amountLabel());
        evaluate("document.querySelector('h2').textContent='Other venue'");assertEquals("null",evaluate(PriceShareSnapshot.SCRIPT));
        evaluate("document.querySelector('h2').textContent='Locale reale';document.querySelector('[data-dovebevo-share]').hidden=true");assertEquals("null",evaluate(PriceShareSnapshot.SCRIPT));
    }
    @Test public void nonmodalOrCoveredVenueSheetCannotSupplyShareData()throws Exception {
        load();assertNotNull(PriceShareSnapshot.decode(evaluate(PriceShareSnapshot.SCRIPT),URL,URL,1,1));
        evaluate("document.querySelector('dialog').close();document.querySelector('dialog').setAttribute('open','')");assertEquals("null",evaluate(PriceShareSnapshot.SCRIPT));
        evaluate("document.querySelector('dialog').removeAttribute('open');document.querySelector('dialog').showModal()");assertNotNull(PriceShareSnapshot.decode(evaluate(PriceShareSnapshot.SCRIPT),URL,URL,1,1));
        evaluate("const other=document.createElement('dialog');other.textContent='Another modal';document.body.append(other);other.showModal()");assertEquals("null",evaluate(PriceShareSnapshot.SCRIPT));
    }
    @Test public void posterUsesAllBundledPhotosAndPrivateProviderHasNarrowScope()throws Exception {
        load();PriceShareSnapshot snapshot=PriceShareSnapshot.decode(evaluate(PriceShareSnapshot.SCRIPT),URL,URL,1,1);assertNotNull(snapshot);
        onMain(()->{for(RecommendationDrink drink:RecommendationDrink.values())try(InputStream input=activity.getAssets().open("reference-drinks/"+DrinkArtwork.filename(drink))){Bitmap photo=BitmapFactory.decodeStream(input);assertNotNull(photo);assertEquals(1536,photo.getWidth());assertEquals(1024,photo.getHeight());}catch(java.io.IOException error){throw new AssertionError(error);}
            Bitmap poster=PriceShareUi.poster(activity,snapshot);assertEquals(900,poster.getWidth());assertTrue(poster.getHeight()>1000);
            File privateFile=new File(new File(activity.getCacheDir(),"price-share"),"owned-fixture.png");Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".price-share",privateFile);assertEquals("content",uri.getScheme());
            Intent intent=PriceShareUi.intent(snapshot,uri);assertEquals("image/png",intent.getType());assertTrue((intent.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)!=0);assertEquals(uri,intent.getClipData().getItemAt(0).getUri());assertTrue(intent.getStringExtra(Intent.EXTRA_TEXT).contains("https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9"));
            try{FileProvider.getUriForFile(activity,activity.getPackageName()+".price-share",new File(activity.getFilesDir(),"private-bookmarks.json"));fail("Provider exposed unrelated private storage");}catch(IllegalArgumentException expected){assertNotNull(expected);}
        });
    }
    @Test public void stalePreviewCannotCreateAnImageOrStartSharing()throws Exception {
        load();PriceShareSnapshot snapshot=PriceShareSnapshot.decode(evaluate(PriceShareSnapshot.SCRIPT),URL,URL,1,1);AtomicBoolean current=new AtomicBoolean(true);
        onMain(()->{File directory=new File(activity.getCacheDir(),"price-share");String[] before=directory.list();int count=before==null?0:before.length;AlertDialog dialog=PriceShareUi.show(activity,snapshot,current::get);assertNotNull(dialog);current.set(false);dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();String[] after=directory.list();assertEquals(count,after==null?0:after.length);assertFalse(dialog.isShowing());});
    }
    @Test public void overflowInformationOpensRealLocalActionsAndCommunityArt() {
        AtomicReference<AlertDialog> shown=new AtomicReference<>();
        onMain(()->{try{
            java.lang.reflect.Method method=MainActivity.class.getDeclaredMethod("createBrowserMenu",android.view.View.class);method.setAccessible(true);
            android.widget.PopupMenu menu=(android.widget.PopupMenu)method.invoke(activity,new android.view.View(activity));
            assertNotNull(menu.getMenu().findItem(R.id.share));assertNotNull(menu.getMenu().findItem(R.id.refresh));assertTrue(menu.getMenu().performIdentifierAction(R.id.information,0));
            java.lang.reflect.Field field=MainActivity.class.getDeclaredField("informationDialog");field.setAccessible(true);AlertDialog dialog=(AlertDialog)field.get(activity);assertNotNull(dialog);assertTrue(dialog.isShowing());
            String contents=allText(dialog.getWindow().getDecorView());assertTrue(contents.contains("Cambia città / zona"));assertTrue(contents.contains("Linee guida della community"));assertTrue(contents.contains("Privacy"));assertTrue(contents.contains("Contatti"));assertTrue(contents.contains("Stessi posti. Più trasparenza."));shown.set(dialog);
        }catch(ReflectiveOperationException error){throw new AssertionError(error);}});
        ReferenceCapture.save("information-owned-fixture.png");onMain(()->{try{
            android.widget.Button how=findButton(shown.get().getWindow().getDecorView(),"Come funziona");assertNotNull(how);how.performClick();
            java.lang.reflect.Field field=MainActivity.class.getDeclaredField("informationDialog");field.setAccessible(true);AlertDialog details=(AlertDialog)field.get(activity);assertNotSame(shown.get(),details);assertTrue(details.isShowing());instrumentation.callActivityOnPause(activity);assertFalse(details.isShowing());instrumentation.callActivityOnResume(activity);
        }catch(ReflectiveOperationException error){throw new AssertionError(error);}});
    }
    @Test public void actualPosterPreviewAndSystemIntentRetainPoundsAndMobileVenueLink()throws Exception {
        load();evaluate("const price=document.querySelector('[data-dovebevo-share]');price.dataset.drink='beer_draft';price.dataset.drinkName='Birra alla spina';price.dataset.hh='1';price.dataset.serving='500 ml';price.dataset.amountMinor='650';price.textContent='£6.50'");PriceShareSnapshot snapshot=PriceShareSnapshot.decode(evaluate(PriceShareSnapshot.SCRIPT),URL,URL,1,1);assertNotNull(snapshot);AtomicReference<AlertDialog> shown=new AtomicReference<>();AtomicReference<Intent> chooser=new AtomicReference<>();
        Instrumentation.ActivityMonitor monitor=new Instrumentation.ActivityMonitor(){@Override public Instrumentation.ActivityResult onStartActivity(Intent intent){if(!Intent.ACTION_CHOOSER.equals(intent.getAction()))return null;chooser.set(new Intent(intent));return new Instrumentation.ActivityResult(android.app.Activity.RESULT_CANCELED,null);}};
        instrumentation.addMonitor(monitor);
        try{
            onMain(()->{shown.set(PriceShareUi.show(activity,snapshot,()->true));assertTrue(shown.get().isShowing());android.view.View poster=shown.get().getWindow().getDecorView().findViewWithTag("price_share_poster");assertNotNull(poster);String spoken=poster.getContentDescription().toString();assertTrue(spoken.contains("500 ml"));assertTrue(spoken.contains("Happy hour"));assertTrue(spoken.contains("0 conferme"));assertEquals("Condividi immagine",shown.get().getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());});
            ReferenceCapture.save("share-owned-fixture.png");onMain(()->shown.get().getButton(AlertDialog.BUTTON_POSITIVE).performClick());assertNotNull("Actual chooser intent intercepted without launching another app",chooser.get());
            @SuppressWarnings("deprecation") Intent send=chooser.get().getParcelableExtra(Intent.EXTRA_INTENT);assertNotNull(send);assertEquals("image/png",send.getType());assertTrue(send.getStringExtra(Intent.EXTRA_TEXT).contains(URL));assertFalse(send.getStringExtra(Intent.EXTRA_TEXT).contains("https://www.dovebevo.com/bar/"));
            @SuppressWarnings("deprecation") Uri uri=send.getParcelableExtra(Intent.EXTRA_STREAM);assertNotNull(uri);try(InputStream input=activity.getContentResolver().openInputStream(uri)){assertNotNull(input);Bitmap image=BitmapFactory.decodeStream(input);assertNotNull(image);assertEquals(900,image.getWidth());}
            File created=new File(new File(activity.getCacheDir(),"price-share"),uri.getLastPathSegment());assertTrue(created.getName().matches("price-[a-f0-9-]{36}\\.png"));assertTrue(created.delete());
        }finally{instrumentation.removeMonitor(monitor);onMain(()->{if(shown.get()!=null)shown.get().dismiss();});}
    }
    private android.widget.Button findButton(android.view.View view,String label){if(view instanceof android.widget.Button&&((android.widget.Button)view).getText().toString().startsWith(label))return (android.widget.Button)view;if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++){android.widget.Button found=findButton(group.getChildAt(i),label);if(found!=null)return found;}}return null;}
    private String allText(android.view.View view){StringBuilder text=new StringBuilder();if(view instanceof android.widget.TextView)text.append(((android.widget.TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)text.append(' ').append(allText(group.getChildAt(i)));}return text.toString();}
    private void load()throws Exception{CountDownLatch loaded=new CountDownLatch(1);onMain(()->{web=new WebView(activity);web.getSettings().setJavaScriptEnabled(true);web.getSettings().setBlockNetworkLoads(true);web.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView view,String url){loaded.countDown();}});activity.setContentView(web);web.loadDataWithBaseURL(URL,HTML,"text/html","UTF-8",null);});assertTrue("Owned DOM load deadline",loaded.await(5,TimeUnit.SECONDS));}
    private String evaluate(String script)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> result=new AtomicReference<>();onMain(()->web.evaluateJavascript(script,value->{result.set(value);done.countDown();}));assertTrue("Owned DOM callback deadline",done.await(5,TimeUnit.SECONDS));return result.get();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
