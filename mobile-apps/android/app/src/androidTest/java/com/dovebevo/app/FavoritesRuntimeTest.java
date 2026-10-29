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
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Native widgets and the real private store/loader, with all GET bodies owned locally and no browser created. */
public final class FavoritesRuntimeTest {
    private static final String ONE="https://www.dovebevo.com/bar/n123?c=u0nd9",TWO="https://www.dovebevo.com/bar/w9?c=u0nd9";
    private static final String STATIC="{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Locale reale\",1,45.4642,9.19,\"Via A\",0],[\"w9\",\"Altro locale\",1,45.4643,9.1901,\"\",0]]}";
    private static final String PRICES="{\"p\":[[\"n123\",\"beer_draft\",0,800,\"2026-10-28\",2,0],[\"n123\",\"beer_draft\",1,500,\"2026-10-27\",1,0],[\"w9\",\"beer_draft\",0,600,\"2026-06-01\",0,0]],\"u\":[],\"pend\":[],\"h\":[],\"g\":[]}";
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private final AtomicBoolean active=new AtomicBoolean(true),hold=new AtomicBoolean();
    private final AtomicInteger requests=new AtomicInteger();private final CountDownLatch held=new CountDownLatch(1),release=new CountDownLatch(1);
    private final AtomicReference<String> opened=new AtomicReference<>();
    private MainActivity activity;private FavoritesScreen screen;private SavedVenueStore store;private SavedVenueFile file;private File directory;private SharedPreferences rules;private String previous;private boolean hadPrevious;
    @Before public void setUp()throws Exception{
        rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadPrevious=rules.contains("accepted_rules_version");previous=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
        onMain(()->{assertNotNull(activity.findViewById(R.id.accept_rules));assertNull(activity.findViewById(R.id.website));assertNull(activity.findViewById(R.id.favorites_destination));});
        directory=new File(activity.getCacheDir(),"favorites-fixture-"+UUID.randomUUID());assertTrue(directory.mkdir());file=new SavedVenueFile(directory);store=new SavedVenueStore(file);
        assertEquals(SavedVenueStore.Result.SAVED,store.save(ONE,"Nom salvato uno"));assertEquals(SavedVenueStore.Result.SAVED,store.save(TWO,"Nome salvato due"));
    }
    @After public void tearDown(){
        release.countDown();onMain(()->{if(screen!=null)screen.close();if(activity!=null)activity.finish();});
        SharedPreferences.Editor edit=rules.edit();if(hadPrevious)edit.putString("accepted_rules_version",previous);else edit.remove("accepted_rules_version");assertTrue(edit.commit());
        if(directory!=null){File[] files=directory.listFiles();if(files!=null)for(File item:files)assertTrue(item.delete());assertTrue(directory.delete());}
    }
    @Test public void realNamePriceSortingSelectorsOpenAndRemoveDoNotRewriteSavedLabels()throws Exception{
        byte[] before=file.read();show();awaitLoaded();assertEquals(3,requests.get());
        onMain(()->{assertEquals(TWO,row(0).getTag());assertTrue(text(row(0)).contains("Altro locale"));assertTrue(text(row(0)).contains("6,00"));assertTrue(text(row(0)).contains("oltre 90"));assertTrue(text(row(1)).contains("28/10/2026"));((Spinner)activity.findViewById(R.id.favorites_band)).setSelection(1);});
        onMain(()->{assertEquals(ONE,row(0).getTag());assertTrue(text(row(0)).contains("5,00"));assertTrue(text(row(1)).contains("Nessun prezzo"));((Spinner)activity.findViewById(R.id.favorites_drink)).setSelection(RecommendationDrink.SPRITZ.ordinal());});
        onMain(()->{assertTrue(text(row(0)).contains("Nessun prezzo"));row(0).findViewById(R.id.favorite_open).performClick();});
        assertNotNull(opened.get());assertEquals(3,requests.get());assertArrayEquals(before,file.read());
        onMain(()->rows().findViewWithTag(ONE).findViewById(R.id.favorite_remove).performClick());awaitLoaded();assertEquals(1,store.load().size());assertEquals("Nome salvato due",store.load().get(0).label);
    }
    @Test public void removalAndBackgroundCannotBeUndoneByOlderPendingReads()throws Exception{
        hold.set(true);show();assertTrue(held.await(3,TimeUnit.SECONDS));
        onMain(()->{View one=rows().findViewWithTag(ONE);assertNotNull(one);one.findViewById(R.id.favorite_remove).performClick();});
        awaitLoaded();release.countDown();Thread.sleep(50);onMain(()->{assertEquals(1,rows().getChildCount());assertNull(rows().findViewWithTag(ONE));assertEquals(TWO,row(0).getTag());active.set(false);screen.pause();});
        int count=requests.get();onMain(()->{screen.refresh();screen.hide();});assertEquals(count,requests.get());assertEquals(1,store.load().size());
        onMain(()->{active.set(true);screen.show();});awaitLoaded();assertEquals(1,store.load().size());
    }
    @Test public void nativeCardsKeepActualPriceContextAndAccessibleActions()throws Exception{
        byte[] savedBefore=file.read();show();awaitLoaded();
        onMain(()->{
            View card=row(1);
            assertTrue(text(card).contains("Locale reale"));assertTrue(text(card).contains("8,00"));
            assertTrue(text(card).contains("Birra media"));assertTrue(text(card).contains("Normale"));
            assertTrue(text(card).contains("28/10/2026"));assertTrue(text(card).contains("2 conferme"));
            assertFalse("No uncomputed value judgement is invented",text(card).contains("Affare"));
            assertTrue(card.getBackground() instanceof android.graphics.drawable.GradientDrawable);
            assertEquals(16*activity.getResources().getDisplayMetrics().density,((android.graphics.drawable.GradientDrawable)card.getBackground()).getCornerRadius(),1f);
            for(int id:new int[]{R.id.favorite_open,R.id.favorite_remove}) {
                View action=card.findViewById(id);assertTrue(action.isClickable());assertNotNull(action.getContentDescription());
                assertTrue(action.getMinimumHeight()>=48*activity.getResources().getDisplayMetrics().density);
            }
        });
        assertArrayEquals(savedBefore,file.read());
    }
    @Test public void comparisonFiltersReflowTheSameSelectorsWithoutLosingChoices()throws Exception{
        show();awaitLoaded();
        onMain(()->{
            Spinner drink=activity.findViewById(R.id.favorites_drink),band=activity.findViewById(R.id.favorites_band);
            drink.setSelection(RecommendationDrink.SPRITZ.ordinal());band.setSelection(1);
            ComparisonFilters filters=(ComparisonFilters)((View)drink.getParent()).getParent();
            float density=activity.getResources().getDisplayMetrics().density;
            for(int widthDp:new int[]{720,320,720}) {
                int width=Math.round(widthDp*density);
                filters.measure(View.MeasureSpec.makeMeasureSpec(width,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
                filters.layout(0,0,width,filters.getMeasuredHeight());
                assertEquals(widthDp==720?LinearLayout.HORIZONTAL:LinearLayout.VERTICAL,filters.getOrientation());
                assertSame(drink,filters.findViewById(R.id.favorites_drink));assertSame(band,filters.findViewById(R.id.favorites_band));
                assertEquals(RecommendationDrink.SPRITZ.ordinal(),drink.getSelectedItemPosition());assertEquals(1,band.getSelectedItemPosition());
                assertTrue(drink.getWidth()>=48*density);assertTrue(band.getWidth()>=48*density);
            }
        });
    }
    @Test public void unavailableDataIsNotZeroAndClearedStoreHasNativeEmptyInstructions()throws Exception{
        onMain(()->{FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{throw new IOException("Owned offline fixture");},()->"2026-10-29");screen=new FavoritesScreen(activity,store,opened::set,active::get,new FavoritesLoader(client,task->activity.runOnUiThread(task)));activity.setContentView(screen.view());screen.show();});
        awaitLoaded();onMain(()->{assertTrue(text(row(0)).contains("non verificabili"));assertFalse(text(row(0)).contains("0,00"));});
        assertEquals(SavedVenueStore.Result.REMOVED,store.remove(ONE));assertEquals(SavedVenueStore.Result.REMOVED,store.remove(TWO));onMain(()->screen.refresh());
        onMain(()->{assertEquals(0,rows().getChildCount());assertTrue(((TextView)activity.findViewById(R.id.favorites_status)).getText().toString().contains("Non hai preferiti"));});
    }
    private void show(){onMain(()->{
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{requests.incrementAndGet();if(url.contains("/api/prices/")&&hold.compareAndSet(true,false)){
            held.countDown();try{release.await(3,TimeUnit.SECONDS);}catch(InterruptedException ignored){/* Simulate an old completion racing retirement. */}
        }return(url.endsWith("health")?"{\"status\":\"ok\",\"data_version\":\"20261027\"}":url.endsWith(".json")?STATIC:PRICES).getBytes(StandardCharsets.UTF_8);},()->"2026-10-29");
        screen=new FavoritesScreen(activity,store,opened::set,active::get,new FavoritesLoader(client,task->activity.runOnUiThread(task)));activity.setContentView(screen.view());screen.show();
    });}
    private void awaitLoaded()throws Exception{long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);AtomicBoolean loaded=new AtomicBoolean();while(System.nanoTime()<until){onMain(()->loaded.set(((TextView)activity.findViewById(R.id.favorites_status)).getText().toString().equals(activity.getString(R.string.favorites_loaded))));if(loaded.get())return;Thread.sleep(10);}fail("Owned native comparison did not finish");}
    private LinearLayout rows(){return activity.findViewById(R.id.favorites_rows);}private View row(int at){return rows().getChildAt(at);}
    private String text(View view){StringBuilder result=new StringBuilder();if(view instanceof TextView)result.append(((TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)result.append(' ').append(text(group.getChildAt(i)));}return result.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
}
