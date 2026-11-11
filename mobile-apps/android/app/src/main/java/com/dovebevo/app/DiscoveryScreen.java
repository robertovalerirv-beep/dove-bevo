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
import android.widget.HorizontalScrollView;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Native nearby price discovery, independent of the website's controls and private bookmarks. */
final class DiscoveryScreen {
    private final Activity activity;private final Consumer<String> navigate;private final Supplier<Boolean> foreground;private final DiscoveryLoader loader;
    private final ScrollView view;private final LinearLayout rows,featured;private final TextView status,featuredTitle,cityStatus;private final Spinner bands,drinks,citySelector;
    private final Button cityRetry;private final ArrayAdapter<String> cityAdapter;private final DiscoveryCities.Source citySource;
    private final ExecutorService cityNetwork=Executors.newSingleThreadExecutor();
    private RecommendationDrink drink=RecommendationDrink.BEER_DRAFT;private int band;private DiscoveryArea area,sourceArea;private DiscoveryLoader.Result snapshot;
    private List<DiscoveryCities.City> cityOptions=Collections.emptyList();private DiscoveryCities.City selectedCity;
    private boolean cityLoaded,cityLoading;private long cityGeneration;private Future<?> cityRequest;
    private boolean visible,closed,busy;private long generation;private DiscoveryLoader.Batch request;
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Supplier<Boolean> foreground){this(activity,navigate,foreground,new DiscoveryLoader(new FavoritePricesClient(),task->new Handler(Looper.getMainLooper()).post(task)));}
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Supplier<Boolean> foreground,DiscoveryLoader loader){this(activity,navigate,foreground,loader,new DiscoveryCities.PublicSource());}
    DiscoveryScreen(Activity activity,Consumer<String> navigate,Supplier<Boolean> foreground,DiscoveryLoader loader,DiscoveryCities.Source citySource){
        this.activity=activity;this.navigate=navigate;this.foreground=foreground;this.loader=loader;this.citySource=citySource;
        view=new ScrollView(activity);view.setId(R.id.discovery_screen);view.setBackgroundColor(activity.getColor(R.color.shell_background));
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(6),dp(16),dp(16));view.addView(body);
        TextView title=text(activity.getString(R.string.discovery_title),24);NativeAppearance.title(title);heading(title);title.setContentDescription(activity.getString(R.string.discovery_title)+". "+activity.getString(R.string.discovery_explanation));
        bands=new Spinner(activity);bands.setId(R.id.discovery_band);bands.setContentDescription(activity.getString(R.string.favorites_band));
        ArrayAdapter<String> bandOptions=new ArrayAdapter<String>(activity,android.R.layout.simple_spinner_item,new String[]{activity.getString(R.string.favorites_normal),activity.getString(R.string.favorites_happy_hour)}){
            @Override public View getView(int position,View converted,android.view.ViewGroup parent){TextView label=(TextView)super.getView(position,converted,parent);label.setTextSize(14);label.setPadding(dp(4),0,dp(4),0);label.setSingleLine(true);label.setEllipsize(null);label.setGravity(Gravity.CENTER_VERTICAL);return label;}
        };
        bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);bands.setAdapter(bandOptions);bands.setMinimumHeight(dp(48));bands.setOnItemSelectedListener(selection(()->{band=bands.getSelectedItemPosition();render();}));
        body.addView(new DiscoveryHeader(activity,title,bands),new LinearLayout.LayoutParams(-1,-2));
        TextView cityTitle=text("Scegli una città",13);NativeAppearance.muted(cityTitle);cityTitle.setPadding(0,dp(4),0,0);body.addView(cityTitle);
        citySelector=new Spinner(activity);citySelector.setTag("discovery.citySelector");citySelector.setContentDescription("Scegli una città per Scopri");citySelector.setMinimumHeight(dp(48));
        cityAdapter=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,new ArrayList<>(Collections.singletonList("Area della mappa")));
        cityAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);citySelector.setAdapter(cityAdapter);
        citySelector.setOnItemSelectedListener(selection(()->chooseCity(citySelector.getSelectedItemPosition())));
        body.addView(citySelector,new LinearLayout.LayoutParams(-1,-2));
        cityStatus=text("",12);cityStatus.setTag("discovery.cityStatus");NativeAppearance.muted(cityStatus);cityStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);body.addView(cityStatus);
        cityRetry=new Button(activity);cityRetry.setTag("discovery.cityRetry");cityRetry.setText("Riprova elenco città");NativeAppearance.button(cityRetry,false);
        cityRetry.setVisibility(View.GONE);cityRetry.setOnClickListener(v->loadCities());body.addView(cityRetry,new LinearLayout.LayoutParams(-1,-2));
        status=text("",12);status.setId(R.id.discovery_status);NativeAppearance.muted(status);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);status.setPadding(0,0,0,dp(4));
        TextView featureTitle=text("Scegli cosa bere",13);NativeAppearance.muted(featureTitle);featureTitle.setPadding(0,dp(2),0,0);body.addView(featureTitle);
        drinks=new Spinner(activity);drinks.setId(R.id.discovery_drink);drinks.setContentDescription("Scegli cosa bere");
        RecommendationDrink[] options=RecommendationDrink.values();String[] names=new String[options.length];for(int index=0;index<options.length;index++)names[index]=NativePricePresentation.category(options[index]);
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,names);drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);drinks.setAdapter(drinkOptions);drinks.setMinimumHeight(dp(48));drinks.setSelection(drink.ordinal(),false);
        drinks.setOnItemSelectedListener(selection(()->{drink=options[drinks.getSelectedItemPosition()];render();}));body.addView(drinks,new LinearLayout.LayoutParams(-1,-2));
        body.addView(status);
        TextView artworkNote=text("Immagini illustrative dei drink, non foto dei locali",12);NativeAppearance.muted(artworkNote);artworkNote.setPadding(0,dp(2),0,dp(2));body.addView(artworkNote);
        featuredTitle=text("Prezzi disponibili",18);NativeAppearance.title(featuredTitle);heading(featuredTitle);featuredTitle.setVisibility(View.GONE);featuredTitle.setPadding(0,dp(4),0,dp(4));body.addView(featuredTitle);
        HorizontalScrollView featuredScroll=new HorizontalScrollView(activity);featuredScroll.setTag("discovery.featuredScroll");featuredScroll.setHorizontalScrollBarEnabled(false);featuredScroll.setFillViewport(false);featuredScroll.setVisibility(View.GONE);
        featured=new LinearLayout(activity);featured.setTag("discovery.featured");featured.setOrientation(LinearLayout.HORIZONTAL);featuredScroll.addView(featured,new ScrollView.LayoutParams(-2,-2));body.addView(featuredScroll,new LinearLayout.LayoutParams(-1,-2));
        TextView resultsTitle=text("I prezzi nella zona",18);NativeAppearance.title(resultsTitle);heading(resultsTitle);resultsTitle.setPadding(0,dp(2),0,dp(3));body.addView(resultsTitle);
        rows=new LinearLayout(activity);rows.setId(R.id.discovery_rows);rows.setOrientation(LinearLayout.VERTICAL);rows.setPadding(0,dp(4),0,0);body.addView(rows);
    }
    View view(){return view;}
    DiscoveryArea area(){return area;}
    void show(DiscoveryArea area){
        if(closed)return;visible=true;
        if(selectedCity!=null&&sameArea(sourceArea,area)){
            try{this.area=selectedCity.area();}catch(IOException impossible){selectedCity=null;this.area=area;}
        }else{selectedCity=null;sourceArea=area;this.area=area;citySelector.setSelection(0,false);}
        loadCities();refresh();
    }
    void hide(){visible=false;retire();retireCities();snapshot=null;}
    void pause(){retire();retireCities();snapshot=null;if(visible)render();}
    void resume(){if(visible&&!closed&&foreground.get()){loadCities();refresh();}}
    void close(){closed=true;hide();loader.close();cityNetwork.shutdownNow();}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;if(request!=null)request.cancel();request=null;busy=false;}
    private void retireCities(){cityGeneration++;if(cityRequest!=null)cityRequest.cancel(true);cityRequest=null;cityLoading=false;if(citySource instanceof DiscoveryCities.PublicSource)((DiscoveryCities.PublicSource)citySource).cancel();}
    private static boolean sameArea(DiscoveryArea first,DiscoveryArea second){return first==second||first!=null&&second!=null&&first.lat==second.lat&&first.lon==second.lon&&first.zoom==second.zoom;}
    private void chooseCity(int position){
        if(position<0||position>cityOptions.size()||!visible||closed)return;
        DiscoveryCities.City choice=position==0?null:cityOptions.get(position-1);
        if(choice==selectedCity)return;
        selectedCity=choice;
        try{area=choice==null?sourceArea:choice.area();}
        catch(IOException unavailable){selectedCity=null;area=sourceArea;cityStatus.setText("Città non disponibile. Scegline un'altra.");return;}
        view.scrollTo(0,0);refresh();
    }
    private void loadCities(){
        if(closed||!visible||!foreground.get()||cityLoaded||cityLoading)return;
        cityLoading=true;cityStatus.setText("Caricamento città…");cityRetry.setVisibility(View.GONE);
        long token=++cityGeneration;
        cityRequest=cityNetwork.submit(()->{
            DiscoveryCities.Result result=DiscoveryCities.load(citySource,FavoriteDay.today());
            activity.runOnUiThread(()->{
                if(closed||token!=cityGeneration)return;
                cityRequest=null;cityLoading=false;cityLoaded=!result.italianUnavailable&&!result.europeanUnavailable&&!result.cities.isEmpty();
                cityOptions=result.cities;citySelector.setOnItemSelectedListener(null);cityAdapter.clear();cityAdapter.add("Area della mappa");
                for(DiscoveryCities.City city:cityOptions)cityAdapter.add(city.label());
                cityAdapter.notifyDataSetChanged();
                int position=0;if(selectedCity!=null)for(int i=0;i<cityOptions.size();i++)if(cityOptions.get(i).key().equals(selectedCity.key())){position=i+1;selectedCity=cityOptions.get(i);break;}
                citySelector.setSelection(position,false);
                citySelector.setOnItemSelectedListener(selection(()->chooseCity(citySelector.getSelectedItemPosition())));
                boolean partial=result.italianUnavailable||result.europeanUnavailable;
                cityStatus.setText(cityOptions.isEmpty()?"Elenco città non disponibile. Riprova.":partial?"Elenco città parziale. Riprova per altre città.":"");
                cityRetry.setVisibility(partial||cityOptions.isEmpty()?View.VISIBLE:View.GONE);
            });
        });
    }
    void refresh(){
        if(!usable())return;retire();snapshot=null;if(area==null){render();return;}long token=generation;busy=true;render();
        try{request=loader.load(area,result->{if(token!=generation||!usable())return;request=null;busy=false;snapshot=result;render();});}
        catch(IOException|RuntimeException unavailable){busy=false;snapshot=new DiscoveryLoader.Result(Collections.emptyMap(),area.cells().size());render();}
    }
    boolean canRefresh(){return usable()&&!busy&&area!=null;}
    String selectedDrink(){return drink.code;}int selectedBand(){return band;}
    void restoreSelection(String code,int selectedBand){RecommendationDrink value=RecommendationDrink.from(code);if(value!=null){drink=value;drinks.setSelection(drink.ordinal(),false);}if(selectedBand==0||selectedBand==1){band=selectedBand;bands.setSelection(band);}render();}
    private void render(){
        if(rows==null||status==null||featured==null)return;rows.removeAllViews();featured.removeAllViews();featuredTitle.setVisibility(View.GONE);((View)featured.getParent()).setVisibility(View.GONE);
        if(area==null){status.setText(R.string.discovery_unready);return;}if(busy){status.setText(R.string.favorites_loading);return;}
        if(snapshot==null){status.setText(R.string.favorites_paused);return;}
        if(snapshot.cells.isEmpty()){status.setText(R.string.discovery_unavailable);return;}
        List<DiscoveryData.Row> values;try{values=DiscoveryData.rows(snapshot.cells,area,drink,band);}catch(IOException unavailable){status.setText(R.string.discovery_unavailable);return;}
        status.setText(activity.getString(R.string.discovery_status_format,
                values.isEmpty()?activity.getString(R.string.discovery_empty):Math.min(values.size(),DiscoveryData.MAX_ROWS)+" prezzi · valuta e formato separati",
                snapshot.partial?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_partial)):"",
                (snapshot.menuSamples?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_menu_samples)):"")+
                        (values.size()>DiscoveryData.MAX_ROWS?activity.getString(R.string.discovery_status_line,activity.getString(R.string.discovery_limit)):"")));
        if(!values.isEmpty()){
            featuredTitle.setVisibility(View.VISIBLE);((View)featured.getParent()).setVisibility(View.VISIBLE);
            for(DiscoveryData.Row row:featuredRows(values))addFeatured(row);
        }
        int count=0,rank=0;String group=null;
        for(DiscoveryData.Row row:values){if(count++==DiscoveryData.MAX_ROWS)break;
            if(!row.group().equals(group)){group=row.group();rank=0;}rank++;
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag(row.venue.url());NativeAppearance.discoveryCard(card);card.setPadding(dp(8),dp(4),dp(8),dp(4));
            boolean large=activity.getResources().getConfiguration().fontScale>=1.3f;
            LinearLayout headline=new LinearLayout(activity);headline.setGravity(Gravity.CENTER_VERTICAL);headline.setOrientation(large?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
            TextView order=text(Integer.toString(rank),12);NativeAppearance.title(order);headline.addView(order,new LinearLayout.LayoutParams(dp(20),-2));
            DrinkArtwork art=new DrinkArtwork(activity,drink);LinearLayout.LayoutParams artSize=new LinearLayout.LayoutParams(dp(32),dp(40));artSize.rightMargin=dp(8);headline.addView(art,artSize);
            LinearLayout identity=new LinearLayout(activity);identity.setOrientation(LinearLayout.VERTICAL);headline.addView(identity,large?new LinearLayout.LayoutParams(-1,-2):new LinearLayout.LayoutParams(0,-2,1));
            TextView name=text(row.venue.name,15);heading(name);NativeAppearance.title(name);identity.addView(name);
            String distance=row.metres<1000?String.format(Locale.ITALY,"%.0f m",row.metres):String.format(Locale.ITALY,"%.1f km",row.metres/1000);
            TextView location=text((row.venue.city.isEmpty()?"":row.venue.city+" · ")+distance,12);NativeAppearance.muted(location);identity.addView(location);
            TextView price=text(row.amountLabel(),17);NativeAppearance.title(price);headline.addView(price);
            Button open=new Button(activity);open.setId(R.id.discovery_open);open.setText("›");open.setContentDescription(activity.getString(R.string.favorites_open_named,row.venue.name));NativeAppearance.button(open,false);open.setMinWidth(dp(44));open.setMinimumWidth(dp(44));open.setOnClickListener(v->{if(usable()&&!busy&&snapshot!=null)navigate.accept(row.venue.url());});headline.addView(open,new LinearLayout.LayoutParams(-2,-2));card.addView(headline);
            String date=row.day();
            String formatted=date.substring(8)+"/"+date.substring(5,7)+"/"+date.substring(0,4);
            boolean menu=row.menuSource(),old=row.old();
            String serving=row.groupLabel();
            LinearLayout summary=new LinearLayout(activity);summary.setGravity(Gravity.CENTER_VERTICAL);
            TextView line=text((row.menuPrice==null?"":row.menuPrice.name+" · ")+serving+" · "+(menu?"Menu verificato ":"Segnalato ")+formatted+(old?menu?" · Menu da ricontrollare":" · Datato":""),12);NativeAppearance.muted(line);summary.addView(line,new LinearLayout.LayoutParams(0,-2,1));
            LinearLayout details=new LinearLayout(activity);details.setTag("discovery.details");details.setOrientation(LinearLayout.VERTICAL);details.setVisibility(View.GONE);
            details.addView(text(row.venue.address+(row.venue.address.isEmpty()?"":" · ")+activity.getString(R.string.discovery_distance,distance),13));
            details.addView(text(NativePricePresentation.category(drink)+" · "+activity.getString(band==0?R.string.favorites_normal:R.string.favorites_happy_hour)+" · "+row.groupLabel(),13));
            if(menu||row.mobilePrice!=null){details.addView(text(row.context(),13));}
            else{String confirmations=activity.getResources().getQuantityString(R.plurals.favorites_confirmations,row.price.confirmations==1?1:2,row.price.confirmations);details.addView(text(activity.getString(R.string.favorites_observed,formatted)+" · "+confirmations,13));}
            if(row.menuPrice!=null&&row.menuPrice.sourceUrl!=null)details.addView(text("Fonte: "+row.menuPrice.sourceUrl,12));
            if(old)details.addView(text(menu?NativePricePresentation.menuWarning():activity.getString(R.string.favorites_old),13));
            Button disclosure=new Button(activity);disclosure.setId(R.id.discovery_details);disclosure.setText("⌄");disclosure.setContentDescription("Dettagli prezzo per "+row.venue.name);NativeAppearance.button(disclosure,false);disclosure.setMinWidth(dp(44));disclosure.setMinimumWidth(dp(44));disclosure.setOnClickListener(v->{boolean expand=details.getVisibility()!=View.VISIBLE;details.setVisibility(expand?View.VISIBLE:View.GONE);disclosure.setText(expand?"⌃":"⌄");disclosure.setContentDescription((expand?"Nascondi dettagli prezzo per ":"Dettagli prezzo per ")+row.venue.name);});summary.addView(disclosure,new LinearLayout.LayoutParams(-2,-2));card.addView(summary);card.addView(details);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(6);rows.addView(card,size);
        }
    }

    /** Preserve list order while showing each venue at most once in the preview. */
    static List<DiscoveryData.Row> featuredRows(List<DiscoveryData.Row> rows){
        List<DiscoveryData.Row> preview=new ArrayList<>(3);Set<String> seen=new HashSet<>();
        for(int index=0;index<Math.min(rows.size(),DiscoveryData.MAX_ROWS)&&preview.size()<3;index++){
            DiscoveryData.Row row=rows.get(index);if(seen.add(row.venue.key))preview.add(row);
        }
        return preview;
    }
    static String featuredDrinkName(DiscoveryData.Row row,RecommendationDrink selected){
        if(row.menuPrice!=null)return row.menuPrice.name;
        if(row.mobilePrice!=null&&row.mobilePrice.menuItem!=null)return row.mobilePrice.menuItem;
        return NativePricePresentation.category(selected);
    }
    /** An ordered preview of the same read-only rows shown below, never a synthetic deal. */
    private void addFeatured(DiscoveryData.Row row){
        LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag(row.venue.url());NativeAppearance.discoveryCard(card);card.setPadding(dp(10),dp(10),dp(10),dp(10));
        LinearLayout.LayoutParams cardSize=new LinearLayout.LayoutParams(dp(208),-2);cardSize.rightMargin=dp(10);cardSize.bottomMargin=dp(8);featured.addView(card,cardSize);
        DrinkArtwork art=new DrinkArtwork(activity,drink);art.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);card.addView(art,new LinearLayout.LayoutParams(-1,dp(88)));
        String drinkName=featuredDrinkName(row,drink);
        TextView name=text(drinkName,15);NativeAppearance.title(name);name.setPadding(0,dp(6),0,0);card.addView(name);
        TextView venue=text(row.venue.name,13);card.addView(venue);
        TextView price=text(row.amountLabel(),18);NativeAppearance.title(price);card.addView(price);
        TextView serving=text(row.groupLabel(),12);NativeAppearance.muted(serving);card.addView(serving);
        String date=row.day();String formatted=date.substring(8)+"/"+date.substring(5,7)+"/"+date.substring(0,4);
        TextView source=text((row.menuSource()?"Menu verificato ":"Segnalato ")+formatted+(row.old()?row.menuSource()?" · Menu da ricontrollare":" · Datato":""),11);NativeAppearance.muted(source);card.addView(source);
        card.setClickable(true);card.setFocusable(true);card.setMinimumHeight(dp(48));card.setContentDescription("Apri "+drinkName+" da "+row.venue.name+", "+row.amountLabel()+", "+row.groupLabel()+", "+source.getText());
        card.setDescendantFocusability(android.view.ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        card.setOnClickListener(v->{if(usable()&&!busy&&snapshot!=null)navigate.accept(row.venue.url());});
    }

    private TextView text(String value,int size){TextView view=new TextView(activity);view.setText(value);view.setTextSize(size);view.setTextColor(activity.getColor(R.color.shell_text));view.setPadding(0,dp(1),0,dp(1));return view;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
    private void heading(TextView view){if(Build.VERSION.SDK_INT>=28)view.setAccessibilityHeading(true);}
    private AdapterView.OnItemSelectedListener selection(Runnable changed){return new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> p,View v,int position,long id){changed.run();}public void onNothingSelected(AdapterView<?> p){}};}
}
