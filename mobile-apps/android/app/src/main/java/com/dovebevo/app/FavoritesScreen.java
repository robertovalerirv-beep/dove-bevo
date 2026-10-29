package com.dovebevo.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.io.IOException;
import java.text.NumberFormat;
import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Full native favourites. Network names/prices are memory-only and never rewrite the bookmark file. */
final class FavoritesScreen {
    private final Activity activity;private final SavedVenueStore store;private final Consumer<String> navigate;private final Supplier<Boolean> foreground;private final FavoritesLoader loader;
    private final ScrollView view;private final LinearLayout rows;private final TextView status;private final Button refresh;private final Spinner drinks,bands;
    private List<SavedVenueStore.Venue> saved=Collections.emptyList();private Map<String,FavoriteComparison.Cell> cells=Collections.emptyMap();
    private RecommendationDrink drink=RecommendationDrink.BEER_DRAFT;private int band;private long generation;private boolean visible,busy,closed;private FavoritesLoader.Batch request;
    FavoritesScreen(Activity activity,SavedVenueStore store,Consumer<String> navigate,Supplier<Boolean> foreground){
        this(activity,store,navigate,foreground,new FavoritesLoader(new FavoritePricesClient(),task->new Handler(Looper.getMainLooper()).post(task)));
    }
    FavoritesScreen(Activity activity,SavedVenueStore store,Consumer<String> navigate,Supplier<Boolean> foreground,FavoritesLoader loader){
        this.activity=activity;this.store=store;this.navigate=navigate;this.foreground=foreground;this.loader=loader;
        view=new ScrollView(activity);view.setId(R.id.favorites_screen);view.setBackgroundColor(activity.getColor(R.color.shell_background));LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);int pad=dp(16);body.setPadding(pad,pad,pad,pad);view.addView(body);
        TextView title=text(activity.getString(R.string.saved_venues),24);heading(title);body.addView(title);
        body.addView(text(activity.getString(R.string.favorites_explanation),16));
        TextView drinkLabel=text(activity.getString(R.string.favorites_drink),16);drinkLabel.setLabelFor(R.id.favorites_drink);body.addView(drinkLabel);
        drinks=new Spinner(activity);drinks.setId(R.id.favorites_drink);drinks.setContentDescription(activity.getString(R.string.favorites_drink));
        String[] labels=new String[RecommendationDrink.values().length];for(int i=0;i<labels.length;i++)labels[i]=RecommendationDrink.values()[i].label;
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,labels);drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);drinks.setAdapter(drinkOptions);drinks.setMinimumHeight(dp(56));body.addView(drinks,new LinearLayout.LayoutParams(-1,-2));
        TextView bandLabel=text(activity.getString(R.string.favorites_band),16);bandLabel.setLabelFor(R.id.favorites_band);body.addView(bandLabel);
        bands=new Spinner(activity);bands.setId(R.id.favorites_band);bands.setContentDescription(activity.getString(R.string.favorites_band));
        ArrayAdapter<String> bandOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,new String[]{activity.getString(R.string.favorites_normal),activity.getString(R.string.favorites_happy_hour)});bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);bands.setAdapter(bandOptions);bands.setMinimumHeight(dp(56));body.addView(bands,new LinearLayout.LayoutParams(-1,-2));
        drinks.setOnItemSelectedListener(selection(()->{drink=RecommendationDrink.values()[drinks.getSelectedItemPosition()];render();}));
        bands.setOnItemSelectedListener(selection(()->{band=bands.getSelectedItemPosition();render();}));
        status=text("",16);status.setId(R.id.favorites_status);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);body.addView(status);
        refresh=new Button(activity);refresh.setId(R.id.favorites_refresh);refresh.setText(R.string.favorites_refresh);refresh.setAllCaps(false);refresh.setMinHeight(dp(48));refresh.setOnClickListener(v->refresh());body.addView(refresh,new LinearLayout.LayoutParams(-1,-2));
        rows=new LinearLayout(activity);rows.setId(R.id.favorites_rows);rows.setOrientation(LinearLayout.VERTICAL);body.addView(rows);
    }
    View view(){return view;}
    void show(){if(closed)return;visible=true;if(foreground.get())refresh();else render();}
    void hide(){visible=false;retire();cells=Collections.emptyMap();}
    void pause(){retire();cells=Collections.emptyMap();if(visible){status.setText(R.string.favorites_paused);render();}}
    void resume(){if(visible&&!closed&&foreground.get())refresh();}
    void close(){closed=true;hide();loader.close();}
    String selectedDrink(){return drink.code;}int selectedBand(){return band;}
    void restoreSelection(String code,int band){RecommendationDrink selection=RecommendationDrink.from(code);if(selection!=null){drink=selection;drinks.setSelection(selection.ordinal());}if(band==0||band==1){this.band=band;bands.setSelection(band);}}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;if(request!=null)request.cancel();request=null;busy=false;}
    void refresh(){
        if(!usable())return;retire();long token=generation;cells=Collections.emptyMap();
        try{saved=store.load();}catch(IOException unavailable){saved=Collections.emptyList();status.setText(R.string.saved_venues_storage_error);render();return;}
        if(saved.isEmpty()){status.setText(R.string.saved_venues_empty);render();return;}
        busy=true;status.setText(R.string.favorites_loading);render();
        try{request=loader.load(saved,value->{if(token!=generation||!usable())return;request=null;busy=false;cells=value;status.setText(R.string.favorites_loaded);render();});}
        catch(IOException unavailable){busy=false;status.setText(R.string.favorites_unavailable);render();}
    }
    private void render(){
        if(rows==null||refresh==null)return;refresh.setEnabled(usable()&&!busy);rows.removeAllViews();
        List<FavoriteComparison.Row> values;
        try{values=FavoriteComparison.rows(saved,cells,drink,band);}catch(IOException invalid){status.setText(R.string.favorites_unavailable);return;}
        NumberFormat euros=NumberFormat.getCurrencyInstance(Locale.ITALY);
        for(FavoriteComparison.Row row:values){
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(0,dp(16),0,dp(16));card.setTag(row.saved.url);
            LinearLayout headline=new LinearLayout(activity);boolean large=activity.getResources().getConfiguration().fontScale>=1.3f;
            headline.setOrientation(large?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            TextView name=text(row.name,18);heading(name);headline.addView(name,large?new LinearLayout.LayoutParams(-1,-2):new LinearLayout.LayoutParams(0,-2,1));
            if(!busy&&row.price!=null){TextView price=text(euros.format(BigDecimal.valueOf(row.price.cents,2)),22);price.setPadding(dp(8),dp(4),0,dp(4));headline.addView(price,new LinearLayout.LayoutParams(-2,-2));}
            card.addView(headline,new LinearLayout.LayoutParams(-1,-2));
            if(row.state==FavoriteComparison.State.UNAVAILABLE)card.addView(text(activity.getString(R.string.favorites_saved_name),14));
            if(busy)card.addView(text(activity.getString(R.string.favorites_loading),16));
            else if(row.price==null)card.addView(text(activity.getString(row.state==FavoriteComparison.State.MISSING?R.string.favorites_missing:R.string.favorites_unavailable),16));
            else{
                String date=row.price.day.substring(8)+"/"+row.price.day.substring(5,7)+"/"+row.price.day.substring(0,4);
                String confirmations=activity.getResources().getQuantityString(R.plurals.favorites_confirmations,row.price.confirmations==1?1:2,row.price.confirmations);
                card.addView(text(activity.getString(R.string.favorites_observed,date)+" · "+confirmations,16));
                if(row.price.old)card.addView(text(activity.getString(R.string.favorites_old),16));
            }
            LinearLayout actions=new LinearLayout(activity);
            Button open=action(R.id.favorite_open,R.string.open_saved_venue,activity.getString(R.string.favorites_open_named,row.name),()->{if(usable()&&contains(row.saved.url))navigate.accept(row.saved.url);});actions.addView(open,new LinearLayout.LayoutParams(0,-2,1));
            Button remove=action(R.id.favorite_remove,R.string.remove_saved_venue,activity.getString(R.string.favorites_remove_named,row.name),()->remove(row.saved.url));actions.addView(remove,new LinearLayout.LayoutParams(0,-2,1));card.addView(actions,new LinearLayout.LayoutParams(-1,-2));
            rows.addView(card,new LinearLayout.LayoutParams(-1,-2));
        }
    }
    private void remove(String url){
        if(!usable()||!contains(url))return;retire();SavedVenueStore.Result result=store.remove(url);
        if(result==SavedVenueStore.Result.REMOVED||result==SavedVenueStore.Result.NOT_FOUND)refresh();else{status.setText(R.string.saved_venues_storage_error);render();}
    }
    private boolean contains(String url){for(SavedVenueStore.Venue venue:saved)if(venue.url.equals(url))return true;return false;}
    private Button action(int id,int label,String description,Runnable action){Button button=new Button(activity);button.setId(id);button.setText(label);button.setContentDescription(description);button.setAllCaps(false);button.setTextSize(16);button.setMinHeight(dp(48));button.setOnClickListener(v->action.run());return button;}
    private TextView text(String value,int size){TextView text=new TextView(activity);text.setText(value);text.setTextSize(size);text.setTextColor(activity.getColor(R.color.shell_text));text.setPadding(0,dp(4),0,dp(4));return text;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private void heading(TextView text){if(Build.VERSION.SDK_INT>=28)text.setAccessibilityHeading(true);}
    private AdapterView.OnItemSelectedListener selection(Runnable changed){return new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> parent,View view,int position,long id){changed.run();}public void onNothingSelected(AdapterView<?> parent){}};}
}
