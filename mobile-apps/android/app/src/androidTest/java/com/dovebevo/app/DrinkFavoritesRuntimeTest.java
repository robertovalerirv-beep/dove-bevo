package com.dovebevo.app;

import static org.junit.Assert.*;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.Button;
import android.widget.Spinner;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;

/** Owned local choices and GET fixtures only; no public contribution or live browser dependency. */
public final class DrinkFavoritesRuntimeTest {
    private static final String URL="https://www.dovebevo.com/mobile/?path=%2Fbar%2Fn123&c=u0nd9";
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;private SavedDrinkUi chooser;private SavedDrinkScreen screen;private FavoritesScreen favorites;
    private SharedPreferences rules;private boolean hadRule;private String oldRule;private File directory;
    private SavedDrinkStore drinks;private SavedVenueStore venues;private SavedVenueFile oldFile;private boolean failDrinkWrites;
    @Before public void setUp()throws Exception {
        rules=instrumentation.getTargetContext().getSharedPreferences("dovebevo_rules",0);hadRule=rules.contains("accepted_rules_version");oldRule=rules.getString("accepted_rules_version",null);assertTrue(rules.edit().remove("accepted_rules_version").commit());
        activity=(MainActivity)instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(),MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
        directory=new File(activity.getFilesDir(),"owned-drinks-"+UUID.randomUUID());assertTrue(directory.mkdir());
        oldFile=new SavedVenueFile(directory);venues=new SavedVenueStore(oldFile);SavedVenueFile drinkFile=new SavedVenueFile(directory,"saved-drinks-v1");
        drinks=new SavedDrinkStore(new SavedVenueStore.Storage(){public byte[] read()throws IOException{return drinkFile.read();}public void write(byte[] bytes)throws IOException{if(failDrinkWrites)throw new IOException("Owned atomic write failure");drinkFile.write(bytes);}});
    }
    @After public void tearDown(){
        onMain(()->{if(chooser!=null)chooser.dismiss();if(favorites!=null)favorites.close();activity.finish();});
        SharedPreferences.Editor edit=rules.edit();if(hadRule)edit.putString("accepted_rules_version",oldRule);else edit.remove("accepted_rules_version");assertTrue(edit.commit());
        for(String name:new String[]{"saved-venues-v1.bin","saved-venues-v1.tmp","saved-drinks-v1.bin","saved-drinks-v1.tmp"}){File f=new File(directory,name);if(f.exists())assertTrue(f.delete());}assertTrue(directory.delete());
    }
    @Test public void explicitDrinkAndBandSaveUsesVerifiedVenueNameWithoutChangingOldPlaces()throws Exception {
        venues.save(URL,"Old place");byte[] before=oldFile.read();
        onMain(()->{chooser=new SavedDrinkUi(activity,drinks,()->URL,callback->callback.accept(verified()),()->7L);chooser.show();});
        onMain(()->{assertNotNull(dialog());confirm().performClick();});assertTrue(drinks.load().isEmpty());
        onMain(()->{choice("save_choice_drink").setSelection(RecommendationDrink.SPRITZ.ordinal()+1);choice("save_choice_band").setSelection(1);confirm().performClick();});
        assertEquals(1,drinks.load().size());assertEquals("n123/spritz/1",drinks.load().get(0).key());assertEquals("Locale verificato",drinks.load().get(0).venue.label);assertArrayEquals(before,oldFile.read());
    }
    @Test public void staleNameCallbackCannotSaveAfterDismissalOrNewerChoice()throws Exception {
        AtomicReference<Consumer<SavedVenueCapture.Venue>> pending=new AtomicReference<>();
        onMain(()->{chooser=new SavedDrinkUi(activity,drinks,()->URL,pending::set,()->7L);chooser.show();assertNotNull(pending.get());chooser.dismiss();pending.get().accept(verified());});
        assertNull(dialog());assertTrue(drinks.load().isEmpty());
        onMain(()->{chooser.show();Consumer<SavedVenueCapture.Venue> old=pending.get();chooser.show();old.accept(verified());assertNull(dialog());});
        assertTrue(drinks.load().isEmpty());
    }
    @Test public void oneFavouriteTabFiltersComparableDrinksAndReopensFocusedRoute()throws Exception {
        drinks.save(URL,"Saved name",RecommendationDrink.SPRITZ,1);drinks.save(URL,"Saved name",RecommendationDrink.BEER_DRAFT,0);
        AtomicReference<String> opened=new AtomicReference<>();showScreen(opened,false);awaitRows("7,00");
        onMain(()->{assertEquals(View.GONE,favorites.view().findViewWithTag("favourites_local_tab").getParent() instanceof View ? ((View)favorites.view().findViewWithTag("favourites_local_tab").getParent()).getVisibility():View.VISIBLE);assertEquals(2,countTag(screen.view(),"drink_favourite_open"));
            Spinner filter=(Spinner)screen.view().findViewWithTag("drink_favourites_filter");filter.setSelection(RecommendationDrink.SPRITZ.ordinal()+1);});
        onMain(()->{assertEquals(1,countTag(screen.view(),"drink_favourite_open"));screen.view().findViewWithTag("drink_favourite_open").performClick();});
        assertEquals(URL+"&drink=spritz&hh=1",opened.get());
    }
    @Test public void oldPlaceConversionKeepsOldRecordUntilDrinkWriteSucceeds()throws Exception {
        assertEquals(SavedVenueStore.Result.SAVED,venues.save(URL,"Old saved place"));
        String savedUrl=venues.load().get(0).url;
        assertEquals("https://www.dovebevo.com/bar/n123?c=u0nd9",savedUrl);
        showScreen(new AtomicReference<>(),false);awaitRows("Old saved place");
        onMain(()->{
            View action=screen.view().findViewWithTag("drink_favourite_migrate_"+savedUrl);
            assertNotNull("The old venue must offer an explicit drink conversion",action);
            assertTrue("The old venue conversion control must accept a tap",action.performClick());
            AlertDialog dialog=dialogFromScreen();
            assertNotNull("Tapping the old venue must open the conversion dialog",dialog);
            Spinner choice=choiceFromScreen("migration_drink");
            assertNotNull("Conversion must require a drink choice",choice);
            choice.setSelection(RecommendationDrink.SPRITZ.ordinal()+1);
        });
        // Let the real dialog OnShow listener and spinner selection run before
        // tapping Save, as they do before a user can interact with the window.
        onMain(()->{
            failDrinkWrites=true;
            AlertDialog dialog=dialogFromScreen();
            assertNotNull("Conversion dialog must remain open for saving",dialog);
            Button confirm=dialog.getButton(AlertDialog.BUTTON_POSITIVE);
            assertNotNull("Conversion must present an explicit save action",confirm);
            confirm.performClick();
        });
        assertTrue(drinks.load().isEmpty());assertEquals(1,venues.load().size());
        onMain(()->{
            AlertDialog retry=dialogFromScreen();
            assertNotNull("A failed write must keep the conversion dialog available",retry);
            assertTrue(retry.isShowing());
            failDrinkWrites=false;
            retry.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
        });
        assertEquals(1,drinks.load().size());assertTrue(venues.load().isEmpty());
    }
    private SavedVenueCapture.Venue verified(){return new SavedVenueCapture(URL,7L).complete(URL,"Locale verificato","n123",URL,7L);}
    private void showScreen(AtomicReference<String> opened,boolean hidden){
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            if(url.endsWith("health"))return bytes("{\"status\":\"ok\",\"data_version\":\"20261031\"}");
            if(url.endsWith("catalog.json"))throw new IOException("No foreign fixture");
            if(url.contains("/data/"))return bytes("{\"c\":[[1,\"Milano\"]],\"v\":[[\"n123\",\"Locale attuale\",1,45.4642,9.19,\"\",0]]}");
            if(url.endsWith("/api/prices/u0nd9"))return bytes(hidden?"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[\"n123\"]}":"{\"p\":[[\"n123\",\"beer_draft\",0,400,\"2026-11-02\",0,0],[\"n123\",\"spritz\",1,700,\"2026-11-02\",0,0]],\"u\":[],\"pend\":[],\"h\":[]}");
            throw new IOException("Unexpected owned URL");
        },()->"2026-11-02");
        onMain(()->{favorites=new FavoritesScreen(activity,venues,opened::set,()->true,new FavoritesLoader(client,activity::runOnUiThread),drinks,new FavoritesLoader(client,activity::runOnUiThread));activity.setContentView(favorites.view());favorites.show();try{java.lang.reflect.Field f=FavoritesScreen.class.getDeclaredField("drinkPane");f.setAccessible(true);screen=(SavedDrinkScreen)f.get(favorites);}catch(ReflectiveOperationException error){throw new AssertionError(error);}});
    }
    private void awaitRows(String expected)throws Exception {long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);while(System.nanoTime()<end){AtomicReference<String> text=new AtomicReference<>("");onMain(()->text.set(allText(screen.view())));if(text.get().contains(expected))return;Thread.sleep(40);}fail("Fresh owned row missing: "+expected);}
    private AlertDialog dialog(){try{java.lang.reflect.Field f=SavedDrinkUi.class.getDeclaredField("dialog");f.setAccessible(true);return (AlertDialog)f.get(chooser);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private AlertDialog dialogFromScreen(){try{java.lang.reflect.Field f=SavedDrinkScreen.class.getDeclaredField("migrationDialog");f.setAccessible(true);return (AlertDialog)f.get(screen);}catch(ReflectiveOperationException e){throw new AssertionError(e);}}
    private Spinner choice(String tag){return (Spinner)dialog().getWindow().getDecorView().findViewWithTag(tag);}
    private Spinner choiceFromScreen(String tag){return (Spinner)dialogFromScreen().getWindow().getDecorView().findViewWithTag(tag);}
    private Button confirm(){return (Button)dialog().getWindow().getDecorView().findViewWithTag("save_drink_confirm");}
    private int countTag(View root,String tag){int count=tag.equals(root.getTag())?1:0;if(root instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)root;for(int i=0;i<group.getChildCount();i++)count+=countTag(group.getChildAt(i),tag);}return count;}
    private String allText(View view){StringBuilder text=new StringBuilder();if(view instanceof android.widget.TextView)text.append(((android.widget.TextView)view).getText());if(view instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)view;for(int i=0;i<group.getChildCount();i++)text.append(' ').append(allText(group.getChildAt(i)));}return text.toString();}
    private void onMain(Runnable action){instrumentation.runOnMainSync(action);instrumentation.waitForIdleSync();}
    private static byte[] bytes(String value){return value.getBytes(StandardCharsets.UTF_8);}
}
