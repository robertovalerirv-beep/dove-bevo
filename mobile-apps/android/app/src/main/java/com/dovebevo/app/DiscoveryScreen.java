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
import android.view.Gravity;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.HorizontalScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Native nearby price discovery, independent of the website's controls and private bookmarks. */
final class DiscoveryScreen {
    private final Activity activity;private final Consumer<String> navigate;private final Runnable chooseArea;private final Supplier<Boolean> foreground;private final DiscoveryLoader loader;
    private final ScrollView view;private final LinearLayout rows,categoryCards;private final TextView status;private final Button refresh;private final Spinner bands,drinks;
    private RecommendationDrink drink=RecommendationDrink.BEER_DRAFT;private int band;private DiscoveryArea area;private DiscoveryLoader.Result snapshot;
    private boolean visible,closed,busy;private long generation;private DiscoveryLoader.Batch request;
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Runnable chooseArea,Supplier<Boolean> foreground){this(activity,navigate,chooseArea,foreground,new DiscoveryLoader(new FavoritePricesClient(),task->new Handler(Looper.getMainLooper()).post(task)));}
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Runnable chooseArea,Supplier<Boolean> foreground,DiscoveryLoader loader){
        this.activity=activity;this.navigate=navigate;this.chooseArea=chooseArea;this.foreground=foreground;this.loader=loader;
        view=new ScrollView(activity);view.setId(R.id.discovery_screen);view.setBackgroundColor(activity.getColor(R.color.shell_background));
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(12),dp(16),dp(24));view.addView(body);
        TextView title=text(activity.getString(R.string.discovery_title),26);NativeAppearance.title(title);heading(title);title.setContentDescription(activity.getString(R.string.discovery_title)+". "+activity.getString(R.string.discovery_explanation));
        bands=new Spinner(activity);bands.setId(R.id.discovery_band);bands.setContentDescription(activity.getString(R.string.favorites_band));
        ArrayAdapter<String> bandOptions=new ArrayAdapter<String>(activity,android.R.layout.simple_spinner_item,new String[]{activity.getString(R.string.favorites_normal),activity.getString(R.string.favorites_happy_hour)}){
            @Override public View getView(int position,View converted,android.view.ViewGroup parent){TextView label=(TextView)super.getView(position,converted,parent);label.setTextSize(14);label.setPadding(dp(4),0,dp(4),0);label.setSingleLine(true);label.setEllipsize(null);label.setGravity(Gravity.CENTER_VERTICAL);return label;}
        };
        bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);bands.setAdapter(bandOptions);bands.setMinimumHeight(dp(48));bands.setOnItemSelectedListener(selection(()->{band=bands.getSelectedItemPosition();render();}));
        refresh=new Button(activity);refresh.setId(R.id.discovery_refresh);refresh.setText("↻");refresh.setContentDescription(activity.getString(R.string.favorites_refresh));NativeAppearance.button(refresh,true);refresh.setOnClickListener(v->refresh());
        Button map=new Button(activity);map.setId(R.id.discovery_choose_area);map.setText("Zona");map.setContentDescription(activity.getString(R.string.discovery_choose_area));NativeAppearance.button(map,false);map.setOnClickListener(v->{if(usable())chooseArea.run();});
        body.addView(new DiscoveryHeader(activity,title,bands,refresh,map),new LinearLayout.LayoutParams(-1,-2));
        status=text("",12);status.setId(R.id.discovery_status);NativeAppearance.muted(status);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);status.setPadding(0,0,0,dp(4));
        TextView featureTitle=text("Esplora i drink",20);NativeAppearance.title(featureTitle);heading(featureTitle);featureTitle.setPadding(0,dp(4),0,dp(4));body.addView(featureTitle);
        HorizontalScrollView carousel=new HorizontalScrollView(activity);carousel.setTag("discovery.categoryCarousel");carousel.setHorizontalScrollBarEnabled(false);
        categoryCards=new LinearLayout(activity);categoryCards.setOrientation(LinearLayout.HORIZONTAL);categoryCards.setGravity(Gravity.TOP);
        carousel.addView(categoryCards,new HorizontalScrollView.LayoutParams(-2,-2));body.addView(carousel,new LinearLayout.LayoutParams(-1,-2));
        drinks=new Spinner(activity);drinks.setId(R.id.discovery_drink);drinks.setContentDescription("Scegli cosa bere");
        RecommendationDrink[] options=RecommendationDrink.values();String[] names=new String[options.length];for(int index=0;index<options.length;index++)names[index]=NativePricePresentation.category(options[index]);
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,names);drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);drinks.setAdapter(drinkOptions);drinks.setMinimumHeight(dp(48));drinks.setSelection(drink.ordinal(),false);
        drinks.setOnItemSelectedListener(selection(()->{drink=options[drinks.getSelectedItemPosition()];render();}));body.addView(drinks,new LinearLayout.LayoutParams(-1,-2));
        TextView artworkNote=text("Immagini illustrative dei drink, non foto dei locali",12);NativeAppearance.muted(artworkNote);body.addView(artworkNote);body.addView(status);
        TextView resultsTitle=text("I prezzi nella zona",20);NativeAppearance.title(resultsTitle);heading(resultsTitle);resultsTitle.setPadding(0,dp(6),0,dp(4));body.addView(resultsTitle);
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
    void restoreSelection(String code,int selectedBand){RecommendationDrink value=RecommendationDrink.from(code);if(value!=null){drink=value;drinks.setSelection(drink.ordinal(),false);}if(selectedBand==0||selectedBand==1){band=selectedBand;bands.setSelection(band);}render();}
    private void render(){
        if(rows==null||refresh==null||status==null)return;rows.removeAllViews();refresh.setEnabled(usable()&&!busy&&area!=null);renderCategoryCards();
        if(area==null){status.setText(R.string.discovery_unready);return;}if(busy){status.setText(R.string.favorites_loading);return;}
        if(snapshot==null){status.setText(R.string.favorites_paused);return;}
        if(snapshot.cells.isEmpty()){status.setText(R.string.discovery_unavailable);return;}
        List<DiscoveryData.Row> values;try{values=DiscoveryData.rows(snapshot.cells,area,drink,band);}catch(IOException unavailable){status.setText(R.string.discovery_unavailable);return;}
        status.setText(activity.getString(R.string.discovery_status_format,
                values.isEmpty()?activity.getString(R.string.discovery_empty):Math.min(values.size(),DiscoveryData.MAX_ROWS)+" prezzi · valuta e formato separati",
                snapshot.partial?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_partial)):"",
                values.size()>DiscoveryData.MAX_ROWS?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_limit)):""));
        int count=0,rank=0;String group=null;
        for(DiscoveryData.Row row:values){if(count++==DiscoveryData.MAX_ROWS)break;
            if(!row.group().equals(group)){group=row.group();rank=0;}rank++;
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag(row.venue.url());NativeAppearance.card(card);card.setPadding(dp(10),dp(6),dp(10),dp(6));
            boolean large=activity.getResources().getConfiguration().fontScale>=1.3f;
            LinearLayout headline=new LinearLayout(activity);headline.setGravity(Gravity.CENTER_VERTICAL);headline.setOrientation(large?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            TextView order=text(Integer.toString(rank),12);NativeAppearance.title(order);headline.addView(order,new LinearLayout.LayoutParams(dp(20),-2));
            DrinkArtwork art=new DrinkArtwork(activity,drink);LinearLayout.LayoutParams artSize=new LinearLayout.LayoutParams(dp(32),dp(40));artSize.rightMargin=dp(8);headline.addView(art,artSize);
            LinearLayout identity=new LinearLayout(activity);identity.setOrientation(LinearLayout.VERTICAL);headline.addView(identity,large?new LinearLayout.LayoutParams(-1,-2):new LinearLayout.LayoutParams(0,-2,1));
            TextView name=text(row.venue.name,16);heading(name);NativeAppearance.title(name);identity.addView(name);
            String distance=row.metres<1000?String.format(Locale.ITALY,"%.0f m",row.metres):String.format(Locale.ITALY,"%.1f km",row.metres/1000);
            TextView location=text((row.venue.city.isEmpty()?"":row.venue.city+" · ")+distance,12);NativeAppearance.muted(location);identity.addView(location);
            TextView price=text(NativePricePresentation.amount(row.price,row.mobilePrice),18);NativeAppearance.title(price);headline.addView(price);
            Button open=new Button(activity);open.setId(R.id.discovery_open);open.setText("›");open.setContentDescription(activity.getString(R.string.favorites_open_named,row.venue.name));NativeAppearance.button(open,false);open.setMinWidth(dp(44));open.setMinimumWidth(dp(44));open.setOnClickListener(v->{if(usable()&&!busy&&snapshot!=null)navigate.accept(row.venue.url());});headline.addView(open,new LinearLayout.LayoutParams(-2,-2));card.addView(headline);
            String date=row.mobilePrice==null?row.price.day:row.mobilePrice.sourceKind.equals("online_menu")?row.mobilePrice.sourceCheckedOn:row.mobilePrice.observedOn;
            String formatted=date.substring(8)+"/"+date.substring(5,7)+"/"+date.substring(0,4);
            boolean menu=row.mobilePrice!=null&&row.mobilePrice.sourceKind.equals("online_menu"),old=row.mobilePrice==null?row.price.old:row.mobilePrice.old;
            String serving=row.mobilePrice==null?"EUR · formato non indicato":NativePricePresentation.groupLabel(null,row.mobilePrice);
            LinearLayout summary=new LinearLayout(activity);summary.setGravity(Gravity.CENTER_VERTICAL);
            TextView line=text(serving+" · "+(menu?"Menu verificato ":"Segnalato ")+formatted+(old?menu?" · Menu da ricontrollare":" · Datato":""),12);NativeAppearance.muted(line);summary.addView(line,new LinearLayout.LayoutParams(0,-2,1));
            LinearLayout details=new LinearLayout(activity);details.setTag("discovery.details");details.setOrientation(LinearLayout.VERTICAL);details.setVisibility(View.GONE);
            details.addView(text(row.venue.address+(row.venue.address.isEmpty()?"":" · ")+activity.getString(R.string.discovery_distance,distance),13));
            details.addView(text(NativePricePresentation.category(drink)+" · "+activity.getString(band==0?R.string.favorites_normal:R.string.favorites_happy_hour)+" · "+NativePricePresentation.groupLabel(row.price,row.mobilePrice),13));
            if(menu||row.mobilePrice!=null){details.addView(text(NativePricePresentation.context(row.mobilePrice),13));}
            else{String confirmations=activity.getResources().getQuantityString(R.plurals.favorites_confirmations,row.price.confirmations==1?1:2,row.price.confirmations);details.addView(text(activity.getString(R.string.favorites_observed,formatted)+" · "+confirmations,13));}
            if(old)details.addView(text(menu?NativePricePresentation.menuWarning():activity.getString(R.string.favorites_old),13));
            Button disclosure=new Button(activity);disclosure.setId(R.id.discovery_details);disclosure.setText("⌄");disclosure.setContentDescription("Dettagli prezzo per "+row.venue.name);NativeAppearance.button(disclosure,false);disclosure.setMinWidth(dp(44));disclosure.setMinimumWidth(dp(44));disclosure.setOnClickListener(v->{boolean expand=details.getVisibility()!=View.VISIBLE;details.setVisibility(expand?View.VISIBLE:View.GONE);disclosure.setText(expand?"⌃":"⌄");disclosure.setContentDescription((expand?"Nascondi dettagli prezzo per ":"Dettagli prezzo per ")+row.venue.name);});summary.addView(disclosure,new LinearLayout.LayoutParams(-2,-2));card.addView(summary);card.addView(details);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(6);rows.addView(card,size);
        }
    }

    private void renderCategoryCards(){
        categoryCards.removeAllViews();
        for(RecommendationDrink category:RecommendationDrink.values()){
            String headline,detail;
            if(busy){headline="Caricamento…";detail="Prezzi nella zona";}
            else if(area==null||snapshot==null||snapshot.cells.isEmpty()){
                headline="Prezzi non caricati";detail="Apri la mappa o ricarica";
            }else{
                List<DiscoveryData.Row> offers;
                try{offers=DiscoveryData.rows(snapshot.cells,area,category,band);}
                catch(IOException unavailable){offers=null;}
                if(offers==null){headline="Prezzi non caricati";detail="Ricarica";}
                else if(offers.isEmpty()){headline="Nessun prezzo";detail="Prova un altro drink";}
                else{
                    String firstGroup=offers.get(0).group();boolean comparable=true;
                    for(DiscoveryData.Row offer:offers)if(!firstGroup.equals(offer.group())){comparable=false;break;}
                    if(comparable){
                        DiscoveryData.Row lowest=offers.get(0);
                        headline="Da "+NativePricePresentation.amount(lowest.price,lowest.mobilePrice);
                        detail=NativePricePresentation.groupLabel(lowest.price,lowest.mobilePrice);
                    }else{headline=offers.size()+" prezzi";detail="Valute o formati diversi";}
                }
            }
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);
            card.setTag("discovery.category."+category.code);card.setClickable(true);card.setFocusable(true);
            card.setPadding(dp(8),dp(8),dp(8),dp(8));
            card.setBackground(NativeAppearance.shape(activity,category==drink?R.color.chrome:R.color.surface,14,true));
            DrinkArtwork art=new DrinkArtwork(activity,category);art.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
            card.addView(art,new LinearLayout.LayoutParams(-1,dp(82)));
            TextView name=text(NativePricePresentation.category(category),15);NativeAppearance.title(name);card.addView(name);
            TextView price=text(headline,15);NativeAppearance.title(price);card.addView(price);
            TextView serving=text(detail,12);NativeAppearance.muted(serving);card.addView(serving);
            card.setContentDescription(NativePricePresentation.category(category)+". "+headline+". "+detail+". Immagine illustrativa del drink");
            card.setOnClickListener(v->{if(drink!=category){drink=category;drinks.setSelection(category.ordinal());render();}});
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(dp(146),-2);size.rightMargin=dp(8);categoryCards.addView(card,size);
        }
    }

    private TextView text(String value,int size){TextView view=new TextView(activity);view.setText(value);view.setTextSize(size);view.setTextColor(activity.getColor(R.color.shell_text));view.setPadding(0,dp(1),0,dp(1));return view;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private void heading(TextView view){if(Build.VERSION.SDK_INT>=28)view.setAccessibilityHeading(true);}
    private AdapterView.OnItemSelectedListener selection(Runnable changed){return new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,View v,int position,long id){changed.run();}public void onNothingSelected(AdapterView<?> p){}};}
}
