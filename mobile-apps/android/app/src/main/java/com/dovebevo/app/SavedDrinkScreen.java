package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.Toast;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Read-only live comparison of independent local drink choices. */
final class SavedDrinkScreen {
    private final Activity activity;private final SavedDrinkStore store;private final FavoritesLoader loader;private final MenuV2Loader menuLoader;
    private final Consumer<String> navigate;private final Supplier<Boolean> foreground;private final SavedVenueStore legacyStore;
    private final LinearLayout view,rows;private final TextView status;private final Button refresh;private final Spinner categoryFilter;
    private List<SavedDrinkStore.Entry> saved=Collections.emptyList();private List<SavedVenueStore.Venue> legacy=Collections.emptyList();private Map<String,FavoriteComparison.Cell> cells=Collections.emptyMap();private Map<String,MenuV2Prices.Venue> menus=Collections.emptyMap();
    private boolean visible,closed,busy,menuBusy,legacyFailed;private long generation;private FavoritesLoader.Batch request;private MenuV2Loader.Batch menuRequest;private AlertDialog migrationDialog;

    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground) {
        this(activity,store,loader,navigate,foreground,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore) {
        this(activity,store,loader,navigate,foreground,legacyStore,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore,MenuV2Loader menuLoader) {
        this.activity=activity;this.store=store;this.loader=loader;this.menuLoader=menuLoader;this.navigate=navigate;this.foreground=foreground;this.legacyStore=legacyStore;
        view=new LinearLayout(activity);view.setOrientation(LinearLayout.VERTICAL);view.setTag("drink_favourites_pane");
        view.addView(text("Drink salvati su questo dispositivo. Confronta i prezzi per drink; valuta e formato restano separati.",15));
        categoryFilter=new Spinner(activity);categoryFilter.setTag("drink_favourites_filter");categoryFilter.setContentDescription("Filtra i drink preferiti");
        String[] choices=new String[RecommendationDrink.values().length+1];choices[0]="Tutti i drink";
        for(int i=0;i<RecommendationDrink.values().length;i++)choices[i+1]=NativePricePresentation.category(RecommendationDrink.values()[i]);
        ArrayAdapter<String> options=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,choices);options.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);categoryFilter.setAdapter(options);view.addView(categoryFilter);
        categoryFilter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> parent,View v,int position,long id){render();}public void onNothingSelected(AdapterView<?> parent){}});
        status=text("",15);status.setTag("drink_favourites_status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);view.addView(status);
        refresh=button("Aggiorna prezzi",()->refresh());refresh.setTag("drink_favourites_refresh");view.addView(refresh);
        rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);rows.setTag("drink_favourites_rows");view.addView(rows);
    }
    View view(){return view;}
    void show(){if(closed)return;visible=true;refresh();}
    void hide(){visible=false;retire();cells=Collections.emptyMap();menus=Collections.emptyMap();if(migrationDialog!=null){migrationDialog.dismiss();migrationDialog=null;}}
    void pause(){retire();cells=Collections.emptyMap();menus=Collections.emptyMap();if(visible){status.setText("Aggiornamento in pausa");render();}}
    void resume(){if(visible&&!closed)refresh();}
    void close(){closed=true;hide();loader.close();if(menuLoader!=null)menuLoader.close();}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;if(request!=null)request.cancel();if(menuRequest!=null)menuRequest.cancel();request=null;menuRequest=null;busy=false;menuBusy=false;}
    void refresh(){
        if(!usable())return;retire();long token=generation;cells=Collections.emptyMap();menus=Collections.emptyMap();
        if(legacyStore!=null){try{legacy=legacyStore.load();legacyFailed=false;}catch(IOException unavailable){legacy=Collections.emptyList();legacyFailed=true;}}
        try{saved=store.load();}catch(IOException unavailable){saved=Collections.emptyList();status.setText("Impossibile leggere i drink salvati. Nessun dato modificato.");render();return;}
        if(saved.isEmpty()){status.setText(legacy.isEmpty()?"Non hai ancora salvato drink. Apri un locale sulla mappa e tocca Salva.":"Hai locali salvati in precedenza: scegli un drink qui sotto per conservarli.");render();return;}
        List<SavedVenueStore.Venue> venues=new ArrayList<>();for(SavedDrinkStore.Entry item:saved)venues.add(item.venue);
        busy=true;status.setText("Aggiornamento prezzi…");render();
        try{request=loader.load(venues,value->{if(token!=generation||!usable())return;request=null;busy=false;cells=value;status.setText("Prezzi disponibili aggiornati");render();});}
        catch(IOException unavailable){busy=false;status.setText("Prezzi non disponibili. I drink salvati restano sul dispositivo.");render();}
        if(menuLoader!=null){
            menuBusy=true;render();
            try{menuRequest=menuLoader.load(venues,value->{if(token!=generation||!usable())return;menuRequest=null;menuBusy=false;menus=value;render();});}
            catch(IOException unavailable){menuBusy=false;render();}
        }
    }
    private void render(){
        if(rows==null||refresh==null)return;
        refresh.setEnabled(usable()&&!busy&&!menuBusy);rows.removeAllViews();
        List<SavedDrinkComparison.Row> values;
        try{values=SavedDrinkComparison.rows(saved,cells,menus);}catch(IOException invalid){status.setText("Prezzi non disponibili");return;}
        int filter=categoryFilter.getSelectedItemPosition();
        if(filter>0)values.removeIf(value->value.saved.drink!=RecommendationDrink.values()[filter-1]);
        values.sort(Comparator.comparingInt((SavedDrinkComparison.Row value)->value.saved.drink.ordinal())
                .thenComparingInt(value->value.saved.band)
                .thenComparing(SavedDrinkComparison.Row::group)
                .thenComparingInt(SavedDrinkComparison.Row::amount)
                .thenComparing(SavedDrinkComparison.Row::venueName));
        if(values.isEmpty()&&!saved.isEmpty())rows.addView(text("Nessun drink salvato per questa scelta.",15));
        for(SavedDrinkComparison.Row value:values){
            SavedDrinkStore.Entry item=value.saved;FavoriteComparison.Row price=value.price;MenuV2Prices.Price named=value.menuPrice;String venueName=value.venueName();
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag("drink_favourite_"+item.key());NativeAppearance.card(card);
            TextView name=text(venueName,18);NativeAppearance.title(name);if(Build.VERSION.SDK_INT>=28)name.setAccessibilityHeading(true);card.addView(name);
            card.addView(text(NativePricePresentation.category(item.drink)+" · "+(item.band==1?"Happy hour":"Prezzo normale"),16));
            if(named!=null){
                card.addView(text(named.name+" · "+named.serving(),16));
                TextView amount=text(named.amount(),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(named.currency+" · "+named.serving(),14));
                card.addView(text(named.evidence(),15));
            }
            else if(busy||menuBusy)card.addView(text("Aggiornamento prezzi…",16));
            else if(!price.available())card.addView(text("Prezzo non disponibile",16));
            else{
                TextView amount=text(NativePricePresentation.amount(price.price,price.mobilePrice),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(NativePricePresentation.groupLabel(price.price,price.mobilePrice),14));
                if(price.mobilePrice!=null){card.addView(text(NativePricePresentation.context(price.mobilePrice),15));if(price.mobilePrice.old)card.addView(text(price.mobilePrice.sourceKind.equals("online_menu")?NativePricePresentation.menuWarning():activity.getString(R.string.favorites_old),15));}
                else{String day=price.price.day;String date=day.substring(8)+"/"+day.substring(5,7)+"/"+day.substring(0,4);card.addView(text(activity.getString(R.string.favorites_observed,date)+" · "+activity.getResources().getQuantityString(R.plurals.favorites_confirmations,price.price.confirmations==1?1:2,price.price.confirmations),15));if(price.price.old)card.addView(text(activity.getString(R.string.favorites_old),15));}
            }
            if(named==null&&price.state==FavoriteComparison.State.UNAVAILABLE)card.addView(text("Nome salvato sul dispositivo",14));
            Button open=button("Apri "+NativePricePresentation.category(item.drink),()->{if(usable()&&contains(item.key()))navigate.accept(item.focusedUrl());});open.setTag("drink_favourite_open");NativeAppearance.button(open,true);card.addView(open);
            Button remove=button("Rimuovi questo drink",()->{if(!usable()||!contains(item.key()))return;retire();SavedDrinkStore.Result result=store.remove(item);if(result==SavedDrinkStore.Result.REMOVED||result==SavedDrinkStore.Result.NOT_FOUND)refresh();else{render();status.setText("Impossibile rimuovere il drink. Nessun dato modificato.");}});remove.setTag("drink_favourite_remove");card.addView(remove);
            String context=NativePricePresentation.category(item.drink)+" · "+venueName+" · "+(item.band==1?"Happy hour":"Prezzo normale");open.setContentDescription("Apri "+context);remove.setContentDescription("Rimuovi dai preferiti "+context+", tutti i formati");
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(12);rows.addView(card,size);
        }
        if(legacyFailed)rows.addView(text("Vecchi locali non disponibili. Riprova piu tardi; nessun dato e stato modificato.",15));
        if(legacyStore!=null&&!legacy.isEmpty()){
            TextView heading=text("Locali salvati prima - scegli un drink",19);NativeAppearance.title(heading);if(Build.VERSION.SDK_INT>=28)heading.setAccessibilityHeading(true);rows.addView(heading);
            for(SavedVenueStore.Venue venue:legacy){
                Button migrate=button(venue.label+" - scegli un drink",()->migrate(venue));
                migrate.setTag("drink_favourite_migrate_"+venue.url);rows.addView(migrate);
            }
        }
    }
    private boolean hasLegacy(String url){
        if(legacyStore==null)return false;
        try{for(SavedVenueStore.Venue item:legacyStore.load())if(item.url.equals(url))return true;}
        catch(IOException unavailable){return false;}
        return false;
    }
    private void migrate(SavedVenueStore.Venue venue){
        if(!usable()||legacyStore==null||migrationDialog!=null||!hasLegacy(venue.url))return;
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);int pad=dp(16);body.setPadding(pad,pad,pad,pad);
        body.addView(text("Scegli un drink da "+venue.label+". Il vecchio locale resta salvato finche il drink non viene salvato.",15));
        Spinner drinkChoice=new Spinner(activity);drinkChoice.setTag("migration_drink");
        String[] names=new String[RecommendationDrink.values().length+1];names[0]="Scegli un drink";for(int i=0;i<RecommendationDrink.values().length;i++)names[i+1]=NativePricePresentation.category(RecommendationDrink.values()[i]);
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,names);drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);drinkChoice.setAdapter(drinkOptions);body.addView(drinkChoice);
        Spinner bandChoice=new Spinner(activity);bandChoice.setTag("migration_band");ArrayAdapter<String> bandOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,new String[]{"Normale","Happy hour"});bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);bandChoice.setAdapter(bandOptions);body.addView(bandChoice);
        AlertDialog dialog=new AlertDialog.Builder(activity).setTitle("Salva un drink").setView(body).setPositiveButton("Salva",null).setNegativeButton("Annulla",null).create();migrationDialog=dialog;
        dialog.setOnDismissListener(ignored->{if(migrationDialog==dialog)migrationDialog=null;});
        dialog.setOnShowListener(ignored->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
            if(!usable()||migrationDialog!=dialog||!hasLegacy(venue.url))return;
            int chosen=drinkChoice.getSelectedItemPosition();if(chosen<=0){Toast.makeText(activity,"Scegli un drink",Toast.LENGTH_LONG).show();return;}
            SavedDrinkStore.Result result=store.save(venue.url,venue.label,RecommendationDrink.values()[chosen-1],bandChoice.getSelectedItemPosition());
            if(result!=SavedDrinkStore.Result.SAVED){Toast.makeText(activity,"Drink non salvato. Il vecchio locale e stato mantenuto.",Toast.LENGTH_LONG).show();return;}
            SavedVenueStore.Result removal=legacyStore.remove(venue.url);
            dialog.dismiss();refresh();
            if(removal!=SavedVenueStore.Result.REMOVED&&removal!=SavedVenueStore.Result.NOT_FOUND)Toast.makeText(activity,"Drink salvato; il vecchio locale resta da rimuovere.",Toast.LENGTH_LONG).show();
        }));dialog.show();
    }
    private boolean contains(String key){for(SavedDrinkStore.Entry item:saved)if(item.key().equals(key))return true;return false;}
    private TextView text(String value,int size){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(activity.getColor(R.color.shell_text));t.setPadding(0,dp(4),0,dp(4));return t;}
    private Button button(String label,Runnable action){Button b=new Button(activity);b.setText(label);b.setContentDescription(label);NativeAppearance.button(b,false);b.setOnClickListener(v->action.run());return b;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
}
