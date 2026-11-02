package com.dovebevo.app;

import android.app.Activity;
import android.os.Build;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Read-only live comparison of independent local drink choices. */
final class SavedDrinkScreen {
    private final Activity activity;private final SavedDrinkStore store;private final FavoritesLoader loader;
    private final Consumer<String> navigate;private final Supplier<Boolean> foreground;
    private final LinearLayout view,rows;private final TextView status;private final Button refresh;
    private List<SavedDrinkStore.Entry> saved=Collections.emptyList();private Map<String,FavoriteComparison.Cell> cells=Collections.emptyMap();
    private boolean visible,closed,busy;private long generation;private FavoritesLoader.Batch request;

    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground) {
        this.activity=activity;this.store=store;this.loader=loader;this.navigate=navigate;this.foreground=foreground;
        view=new LinearLayout(activity);view.setOrientation(LinearLayout.VERTICAL);view.setTag("drink_favourites_pane");
        view.addView(text("Drink salvati su questo dispositivo. Prezzi aggiornati quando sei online; valuta e formato restano separati.",15));
        status=text("",15);status.setTag("drink_favourites_status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);view.addView(status);
        refresh=button("Aggiorna prezzi",()->refresh());refresh.setTag("drink_favourites_refresh");view.addView(refresh);
        rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);rows.setTag("drink_favourites_rows");view.addView(rows);
    }
    View view(){return view;}
    void show(){if(closed)return;visible=true;refresh();}
    void hide(){visible=false;retire();cells=Collections.emptyMap();}
    void pause(){retire();cells=Collections.emptyMap();if(visible){status.setText("Aggiornamento in pausa");render();}}
    void resume(){if(visible&&!closed)refresh();}
    void close(){closed=true;hide();loader.close();}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;if(request!=null)request.cancel();request=null;busy=false;}
    void refresh(){
        if(!usable())return;retire();long token=generation;cells=Collections.emptyMap();
        try{saved=store.load();}catch(IOException unavailable){saved=Collections.emptyList();status.setText("Impossibile leggere i drink salvati. Nessun dato modificato.");render();return;}
        if(saved.isEmpty()){status.setText("Non hai ancora salvato drink. Apri un locale sulla mappa e tocca Salva.");render();return;}
        List<SavedVenueStore.Venue> venues=new ArrayList<>();for(SavedDrinkStore.Entry item:saved)venues.add(item.venue);
        busy=true;status.setText("Aggiornamento prezzi…");render();
        try{request=loader.load(venues,value->{if(token!=generation||!usable())return;request=null;busy=false;cells=value;status.setText("Prezzi disponibili aggiornati");render();});}
        catch(IOException unavailable){busy=false;status.setText("Prezzi non disponibili. I drink salvati restano sul dispositivo.");render();}
    }
    private void render(){
        refresh.setEnabled(usable()&&!busy);rows.removeAllViews();
        List<SavedDrinkComparison.Row> values;
        try{values=SavedDrinkComparison.rows(saved,cells);}catch(IOException invalid){status.setText("Prezzi non disponibili");return;}
        for(SavedDrinkComparison.Row value:values){
            SavedDrinkStore.Entry item=value.saved;FavoriteComparison.Row price=value.price;
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag("drink_favourite_"+item.key());NativeAppearance.card(card);
            TextView name=text(price.name,18);NativeAppearance.title(name);if(Build.VERSION.SDK_INT>=28)name.setAccessibilityHeading(true);card.addView(name);
            card.addView(text(NativePricePresentation.category(item.drink)+" · "+(item.band==1?"Happy hour":"Prezzo normale"),16));
            if(busy)card.addView(text("Aggiornamento prezzi…",16));
            else if(!price.available())card.addView(text("Prezzo non disponibile",16));
            else{
                TextView amount=text(NativePricePresentation.amount(price.price,price.mobilePrice),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(NativePricePresentation.groupLabel(price.price,price.mobilePrice),14));
                if(price.mobilePrice!=null){card.addView(text(NativePricePresentation.context(price.mobilePrice),15));if(price.mobilePrice.old)card.addView(text(price.mobilePrice.sourceKind.equals("online_menu")?NativePricePresentation.menuWarning():activity.getString(R.string.favorites_old),15));}
                else{String day=price.price.day;String date=day.substring(8)+"/"+day.substring(5,7)+"/"+day.substring(0,4);card.addView(text(activity.getString(R.string.favorites_observed,date)+" · "+activity.getResources().getQuantityString(R.plurals.favorites_confirmations,price.price.confirmations==1?1:2,price.price.confirmations),15));if(price.price.old)card.addView(text(activity.getString(R.string.favorites_old),15));}
            }
            if(price.state==FavoriteComparison.State.UNAVAILABLE)card.addView(text("Nome salvato sul dispositivo",14));
            Button open=button("Apri "+NativePricePresentation.category(item.drink),()->{if(usable()&&contains(item.key()))navigate.accept(item.focusedUrl());});open.setTag("drink_favourite_open");NativeAppearance.button(open,true);card.addView(open);
            Button remove=button("Rimuovi questo drink",()->{if(!usable()||!contains(item.key()))return;retire();SavedDrinkStore.Result result=store.remove(item);if(result==SavedDrinkStore.Result.REMOVED||result==SavedDrinkStore.Result.NOT_FOUND)refresh();else status.setText("Impossibile rimuovere il drink. Nessun dato modificato.");});remove.setTag("drink_favourite_remove");card.addView(remove);
            String context=NativePricePresentation.category(item.drink)+" · "+price.name+" · "+(item.band==1?"Happy hour":"Prezzo normale");open.setContentDescription("Apri "+context);remove.setContentDescription("Rimuovi dai preferiti "+context+", tutti i formati");
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(12);rows.addView(card,size);
        }
    }
    private boolean contains(String key){for(SavedDrinkStore.Entry item:saved)if(item.key().equals(key))return true;return false;}
    private TextView text(String value,int size){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(activity.getColor(R.color.shell_text));t.setPadding(0,dp(4),0,dp(4));return t;}
    private Button button(String label,Runnable action){Button b=new Button(activity);b.setText(label);b.setContentDescription(label);NativeAppearance.button(b,false);b.setOnClickListener(v->action.run());return b;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
}
