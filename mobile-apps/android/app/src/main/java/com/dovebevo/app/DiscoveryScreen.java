package com.dovebevo.app;

import android.app.Activity;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Native nearby price discovery, independent of the website's controls and private bookmarks. */
final class DiscoveryScreen {
    private final Activity activity;private final Consumer<String> navigate;private final Runnable chooseArea;private final Supplier<Boolean> foreground;private final DiscoveryLoader loader;
    private final ScrollView view;private final LinearLayout rows;private final TextView status;private final Button refresh;private final Spinner drinks,bands;
    private RecommendationDrink drink=RecommendationDrink.SPRITZ;private int band;private DiscoveryArea area;private DiscoveryLoader.Result snapshot;
    private boolean visible,closed,busy;private long generation;private DiscoveryLoader.Batch request;
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Runnable chooseArea,Supplier<Boolean> foreground){this(activity,navigate,chooseArea,foreground,new DiscoveryLoader(new FavoritePricesClient(),task->new Handler(Looper.getMainLooper()).post(task)));}
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Runnable chooseArea,Supplier<Boolean> foreground,DiscoveryLoader loader){
        this.activity=activity;this.navigate=navigate;this.chooseArea=chooseArea;this.foreground=foreground;this.loader=loader;
        view=new ScrollView(activity);view.setId(R.id.discovery_screen);view.setBackgroundColor(activity.getColor(R.color.shell_background));
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(16),dp(16),dp(24));view.addView(body);
        TextView title=text(activity.getString(R.string.discovery_title),28);NativeAppearance.title(title);heading(title);body.addView(title);
        TextView subtitle=text(activity.getString(R.string.discovery_explanation),15);NativeAppearance.muted(subtitle);subtitle.setPadding(0,dp(4),0,dp(16));body.addView(subtitle);
        LinearLayout filters=new ComparisonFilters(activity);NativeAppearance.card(filters);body.addView(filters,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout drinkFilter=new LinearLayout(activity),bandFilter=new LinearLayout(activity);drinkFilter.setOrientation(LinearLayout.VERTICAL);bandFilter.setOrientation(LinearLayout.VERTICAL);filters.addView(drinkFilter);filters.addView(bandFilter);
        TextView drinkLabel=text(activity.getString(R.string.favorites_drink),14);NativeAppearance.title(drinkLabel);drinkLabel.setLabelFor(R.id.discovery_drink);drinkFilter.addView(drinkLabel);
        drinks=new Spinner(activity);drinks.setId(R.id.discovery_drink);drinks.setContentDescription(activity.getString(R.string.favorites_drink));String[] labels=new String[RecommendationDrink.values().length];for(int i=0;i<labels.length;i++)labels[i]=RecommendationDrink.values()[i].label;
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,labels);drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);drinks.setAdapter(drinkOptions);drinks.setSelection(drink.ordinal());drinks.setMinimumHeight(dp(56));drinkFilter.addView(drinks,new LinearLayout.LayoutParams(-1,-2));
        TextView bandLabel=text(activity.getString(R.string.favorites_band),14);NativeAppearance.title(bandLabel);bandLabel.setLabelFor(R.id.discovery_band);bandFilter.addView(bandLabel);
        bands=new Spinner(activity);bands.setId(R.id.discovery_band);bands.setContentDescription(activity.getString(R.string.favorites_band));ArrayAdapter<String> bandOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,new String[]{activity.getString(R.string.favorites_normal),activity.getString(R.string.favorites_happy_hour)});bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);bands.setAdapter(bandOptions);bands.setMinimumHeight(dp(56));bandFilter.addView(bands,new LinearLayout.LayoutParams(-1,-2));
        drinks.setOnItemSelectedListener(selection(()->{drink=RecommendationDrink.values()[drinks.getSelectedItemPosition()];render();}));bands.setOnItemSelectedListener(selection(()->{band=bands.getSelectedItemPosition();render();}));
        status=text("",15);status.setId(R.id.discovery_status);NativeAppearance.muted(status);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);status.setPadding(0,dp(16),0,dp(8));body.addView(status);
        LinearLayout actions=new ComparisonFilters(activity);body.addView(actions,new LinearLayout.LayoutParams(-1,-2));
        refresh=new Button(activity);refresh.setId(R.id.discovery_refresh);refresh.setText(R.string.favorites_refresh);NativeAppearance.button(refresh,true);refresh.setOnClickListener(v->refresh());actions.addView(refresh,new LinearLayout.LayoutParams(0,-2,1));
        Button map=new Button(activity);map.setId(R.id.discovery_choose_area);map.setText(R.string.discovery_choose_area);NativeAppearance.button(map,false);map.setOnClickListener(v->{if(usable())chooseArea.run();});actions.addView(map,new LinearLayout.LayoutParams(0,-2,1));
        rows=new LinearLayout(activity);rows.setId(R.id.discovery_rows);rows.setOrientation(LinearLayout.VERTICAL);rows.setPadding(0,dp(16),0,0);body.addView(rows);
    }
    View view(){return view;}
    DiscoveryArea area(){return area;}
    void show(DiscoveryArea area){if(closed)return;visible=true;this.area=area;refresh();}
    void hide(){visible=false;retire();snapshot=null;}
    void pause(){retire();snapshot=null;if(visible)render();}
    void resume(){if(visible&&!closed&&foreground.get())refresh();}
    void close(){closed=true;hide();loader.close();}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;if(request!=null)request.cancel();request=null;busy=false;}
    void refresh(){
        if(!usable())return;retire();snapshot=null;if(area==null){render();return;}long token=generation;busy=true;render();
        try{request=loader.load(area,result->{if(token!=generation||!usable())return;request=null;busy=false;snapshot=result;render();});}
        catch(IOException|RuntimeException unavailable){busy=false;snapshot=new DiscoveryLoader.Result(Collections.emptyMap(),area.cells().size());render();}
    }
    String selectedDrink(){return drink.code;}int selectedBand(){return band;}
    void restoreSelection(String code,int selectedBand){RecommendationDrink value=RecommendationDrink.from(code);if(value!=null){drink=value;drinks.setSelection(value.ordinal());}if(selectedBand==0||selectedBand==1){band=selectedBand;bands.setSelection(band);}}
    private void render(){
        if(rows==null||refresh==null||status==null)return;rows.removeAllViews();refresh.setEnabled(usable()&&!busy&&area!=null);
        if(area==null){status.setText(R.string.discovery_unready);return;}if(busy){status.setText(R.string.favorites_loading);return;}
        if(snapshot==null){status.setText(R.string.favorites_paused);return;}
        if(snapshot.cells.isEmpty()){status.setText(R.string.discovery_unavailable);return;}
        List<DiscoveryData.Row> values;try{values=DiscoveryData.rows(snapshot.cells,area,drink,band);}catch(IOException unavailable){status.setText(R.string.discovery_unavailable);return;}
        status.setText(activity.getString(R.string.discovery_status_format,
                activity.getString(values.isEmpty()?R.string.discovery_empty:R.string.discovery_loaded,Math.min(values.size(),DiscoveryData.MAX_ROWS)),
                snapshot.partial?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_partial)):"",
                values.size()>DiscoveryData.MAX_ROWS?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_limit)):""));
        NumberFormat euros=NumberFormat.getCurrencyInstance(Locale.ITALY);int count=0;
        for(DiscoveryData.Row row:values){if(count++==DiscoveryData.MAX_ROWS)break;
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag(row.venue.url());NativeAppearance.card(card);
            LinearLayout headline=new LinearLayout(activity);boolean large=activity.getResources().getConfiguration().fontScale>=1.3f;headline.setOrientation(large?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            TextView name=text(row.venue.name,19);heading(name);NativeAppearance.title(name);headline.addView(name,large?new LinearLayout.LayoutParams(-1,-2):new LinearLayout.LayoutParams(0,-2,1));
            TextView price=text(euros.format(BigDecimal.valueOf(row.price.cents,2)),24);NativeAppearance.price(price);LinearLayout.LayoutParams priceSize=new LinearLayout.LayoutParams(-2,-2);priceSize.leftMargin=large?0:dp(12);headline.addView(price,priceSize);card.addView(headline,new LinearLayout.LayoutParams(-1,-2));
            if(!row.venue.address.isEmpty()||!row.venue.city.isEmpty()){TextView address=text(row.venue.address+(row.venue.address.isEmpty()||row.venue.city.isEmpty()?"":" · ")+row.venue.city,14);NativeAppearance.muted(address);card.addView(address);}
            String distance=row.metres<1000?String.format(Locale.ITALY,"%.0f m",row.metres):String.format(Locale.ITALY,"%.1f km",row.metres/1000);
            TextView category=text(drink.label+" · "+activity.getString(band==0?R.string.favorites_normal:R.string.favorites_happy_hour)+"\n"+activity.getString(R.string.discovery_distance,distance),14);NativeAppearance.muted(category);card.addView(category);
            String date=row.price.day.substring(8)+"/"+row.price.day.substring(5,7)+"/"+row.price.day.substring(0,4);String confirmations=activity.getResources().getQuantityString(R.plurals.favorites_confirmations,row.price.confirmations==1?1:2,row.price.confirmations);
            TextView provenance=text(activity.getString(R.string.favorites_observed,date)+" · "+confirmations,14);NativeAppearance.muted(provenance);card.addView(provenance);if(row.price.old)card.addView(text(activity.getString(R.string.favorites_old),14));
            Button open=new Button(activity);open.setId(R.id.discovery_open);open.setText(R.string.open_saved_venue);open.setContentDescription(activity.getString(R.string.favorites_open_named,row.venue.name));NativeAppearance.button(open,true);open.setOnClickListener(v->{if(usable()&&!busy&&snapshot!=null)navigate.accept(row.venue.url());});LinearLayout.LayoutParams actionSize=new LinearLayout.LayoutParams(-1,-2);actionSize.topMargin=dp(12);card.addView(open,actionSize);
            LinearLayout.LayoutParams cardSize=new LinearLayout.LayoutParams(-1,-2);cardSize.bottomMargin=dp(12);rows.addView(card,cardSize);
        }
    }
    private TextView text(String value,int size){TextView view=new TextView(activity);view.setText(value);view.setTextSize(size);view.setTextColor(activity.getColor(R.color.shell_text));view.setPadding(0,dp(4),0,dp(4));return view;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private void heading(TextView view){if(Build.VERSION.SDK_INT>=28)view.setAccessibilityHeading(true);}
    private AdapterView.OnItemSelectedListener selection(Runnable changed){return new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,View v,int position,long id){changed.run();}public void onNothingSelected(AdapterView<?> p){}};}
}
