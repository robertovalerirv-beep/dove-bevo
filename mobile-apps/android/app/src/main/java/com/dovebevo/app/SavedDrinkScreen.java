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
    private final Activity activity;private final SavedDrinkStore store;private final SavedMenuOfferStore offerStore,customerStore;private final SavedEuropeDrinkStore europeStore;private final FavoritesLoader loader,europeLoader;private final MenuV2Loader menuLoader;
    private final Consumer<String> navigate;private final Supplier<Boolean> foreground;private final SavedVenueStore legacyStore;
    private final LinearLayout view,rows;private final TextView status;private final Spinner categoryFilter;
    private List<SavedMenuOfferStore.Entry> offers=Collections.emptyList(),customerOffers=Collections.emptyList();private List<SavedEuropeDrinkStore.Entry> europe=Collections.emptyList();private List<SavedDrinkStore.Entry> saved=Collections.emptyList();private List<SavedVenueStore.Venue> legacy=Collections.emptyList();private Map<String,FavoriteComparison.Cell> cells=Collections.emptyMap(),europeCells=Collections.emptyMap();private Map<String,MenuV2Prices.Venue> menus=Collections.emptyMap();
    private boolean visible,closed,busy,menuBusy,europeBusy,legacyFailed;private long generation;private FavoritesLoader.Batch request,europeRequest;private MenuV2Loader.Batch menuRequest;private AlertDialog migrationDialog;

    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground) {
        this(activity,store,loader,navigate,foreground,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore) {
        this(activity,store,loader,navigate,foreground,legacyStore,null,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore,MenuV2Loader menuLoader) {
        this(activity,store,loader,navigate,foreground,legacyStore,menuLoader,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore,MenuV2Loader menuLoader,SavedMenuOfferStore offerStore) {
        this(activity,store,loader,navigate,foreground,legacyStore,menuLoader,offerStore,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore,MenuV2Loader menuLoader,SavedMenuOfferStore offerStore,SavedMenuOfferStore customerStore) {
        this(activity,store,loader,navigate,foreground,legacyStore,menuLoader,offerStore,customerStore,null);
    }
    SavedDrinkScreen(Activity activity,SavedDrinkStore store,FavoritesLoader loader,Consumer<String> navigate,Supplier<Boolean> foreground,SavedVenueStore legacyStore,MenuV2Loader menuLoader,SavedMenuOfferStore offerStore,SavedMenuOfferStore customerStore,SavedEuropeDrinkStore europeStore) {
        this.activity=activity;this.store=store;this.offerStore=offerStore;this.customerStore=customerStore;this.europeStore=europeStore;this.loader=loader;this.europeLoader=europeStore==null?null:new FavoritesLoader(new FavoritePricesClient(),task->new android.os.Handler(android.os.Looper.getMainLooper()).post(task),true);this.menuLoader=menuLoader;this.navigate=navigate;this.foreground=foreground;this.legacyStore=legacyStore;
        view=new LinearLayout(activity);view.setOrientation(LinearLayout.VERTICAL);view.setTag("drink_favourites_pane");
        view.addView(text("Drink salvati su questo dispositivo. Confronta i prezzi per drink; valuta e formato restano separati.",15));
        categoryFilter=new Spinner(activity);categoryFilter.setTag("drink_favourites_filter");categoryFilter.setContentDescription("Filtra i drink preferiti");
        String[] choices=new String[RecommendationDrink.values().length+1];
        for(int i=0;i<RecommendationDrink.values().length;i++)choices[i]=NativePricePresentation.category(RecommendationDrink.values()[i]);
        choices[RecommendationDrink.values().length]="Tutti i drink";
        ArrayAdapter<String> options=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,choices);options.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);categoryFilter.setAdapter(options);categoryFilter.setSelection(RecommendationDrink.values().length);view.addView(categoryFilter);
        categoryFilter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener(){public void onItemSelected(AdapterView<?> parent,View v,int position,long id){render();}public void onNothingSelected(AdapterView<?> parent){}});
        status=text("",15);status.setTag("drink_favourites_status");status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);view.addView(status);
        rows=new LinearLayout(activity);rows.setOrientation(LinearLayout.VERTICAL);rows.setTag("drink_favourites_rows");view.addView(rows);
    }
    View view(){return view;}
    void show(){if(closed)return;visible=true;refresh();}
    void hide(){visible=false;retire();cells=Collections.emptyMap();europeCells=Collections.emptyMap();menus=Collections.emptyMap();if(migrationDialog!=null){migrationDialog.dismiss();migrationDialog=null;}}
    void pause(){retire();cells=Collections.emptyMap();europeCells=Collections.emptyMap();menus=Collections.emptyMap();if(visible){status.setText("Aggiornamento in pausa");render();}}
    void resume(){if(visible&&!closed)refresh();}
    void close(){closed=true;hide();loader.close();if(europeLoader!=null)europeLoader.close();if(menuLoader!=null)menuLoader.close();}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    boolean canRefresh(){return usable()&&!busy&&!menuBusy&&!europeBusy;}
    private void retire(){generation++;if(request!=null)request.cancel();if(europeRequest!=null)europeRequest.cancel();if(menuRequest!=null)menuRequest.cancel();request=null;europeRequest=null;menuRequest=null;busy=false;europeBusy=false;menuBusy=false;}
    void refresh(){
        if(!usable())return;retire();long token=generation;cells=Collections.emptyMap();europeCells=Collections.emptyMap();menus=Collections.emptyMap();
        if(legacyStore!=null){try{legacy=legacyStore.load();legacyFailed=false;}catch(IOException unavailable){legacy=Collections.emptyList();legacyFailed=true;}}
        try{saved=store.load();offers=offerStore==null?Collections.emptyList():offerStore.load();customerOffers=customerStore==null?Collections.emptyList():customerStore.load();europe=europeStore==null?Collections.emptyList():europeStore.load();}
        catch(IOException unavailable){saved=Collections.emptyList();offers=Collections.emptyList();customerOffers=Collections.emptyList();europe=Collections.emptyList();status.setText("Impossibile leggere i drink salvati. Nessun dato modificato.");render();return;}
        if(saved.isEmpty()&&offers.isEmpty()&&customerOffers.isEmpty()&&europe.isEmpty()){status.setText(legacy.isEmpty()?"Non hai ancora salvato drink. Apri un locale sulla mappa e tocca Preferiti accanto al drink.":"Hai locali salvati in precedenza: scegli un drink qui sotto per conservarli.");render();return;}
        List<SavedVenueStore.Venue> legacyVenues=new ArrayList<>();for(SavedDrinkStore.Entry item:saved)legacyVenues.add(item.venue);
        List<SavedVenueStore.Venue> venues=new ArrayList<>(legacyVenues);for(SavedMenuOfferStore.Entry item:offers)venues.add(item.venue);for(SavedMenuOfferStore.Entry item:customerOffers)venues.add(item.venue);
        if(!legacyVenues.isEmpty()){
            busy=true;status.setText("Aggiornamento prezzi...");render();
            try{request=loader.load(legacyVenues,value->{if(token!=generation||!usable())return;request=null;busy=false;cells=value;status.setText("Prezzi disponibili aggiornati");render();});}
            catch(IOException unavailable){busy=false;status.setText("Prezzi non disponibili. I drink salvati restano sul dispositivo.");render();}
        }
        if(europeLoader!=null&&!europe.isEmpty()){
            List<SavedVenueStore.Venue> venuesForEurope=new ArrayList<>();for(SavedEuropeDrinkStore.Entry item:europe)venuesForEurope.add(item.venue);
            europeBusy=true;status.setText("Aggiornamento prezzi...");render();
            try{europeRequest=europeLoader.load(venuesForEurope,value->{if(token!=generation||!usable())return;europeRequest=null;europeBusy=false;europeCells=value;status.setText("Prezzi disponibili aggiornati");render();});}
            catch(IOException unavailable){europeBusy=false;status.setText("Prezzi non disponibili. I drink salvati restano sul dispositivo.");render();}
        }
        if(menuLoader!=null){
            menuBusy=true;render();
            try{menuRequest=menuLoader.load(venues,value->{if(token!=generation||!usable())return;menuRequest=null;menuBusy=false;menus=value;render();});}
            catch(IOException unavailable){menuBusy=false;render();}
        }
    }
    private void render(){
        if(rows==null)return;
        rows.removeAllViews();
        List<SavedDrinkComparison.Row> values;
        try{values=SavedDrinkComparison.rows(saved,cells,menus);}catch(IOException invalid){status.setText("Prezzi non disponibili");return;}
        int filter=categoryFilter.getSelectedItemPosition();
        if(filter>=0&&filter<RecommendationDrink.values().length)values.removeIf(value->value.saved.drink!=RecommendationDrink.values()[filter]);
        values.sort(Comparator.comparingInt((SavedDrinkComparison.Row value)->value.saved.drink.ordinal())
                .thenComparingInt(value->value.saved.band)
                .thenComparing(SavedDrinkComparison.Row::group)
                .thenComparingInt(SavedDrinkComparison.Row::amount)
                .thenComparing(SavedDrinkComparison.Row::venueName));
        if(values.isEmpty()&&!saved.isEmpty()&&offers.isEmpty()&&customerOffers.isEmpty())rows.addView(text("Nessun drink salvato per questa scelta.",15));
        for(SavedDrinkComparison.Row value:values){
            SavedDrinkStore.Entry item=value.saved;FavoriteComparison.Row price=value.price;MenuV2Prices.Price named=value.menuPrice;String venueName=value.venueName();
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);card.setTag("drink_favourite_"+item.key());NativeAppearance.card(card);
            TextView name=text(venueName,18);NativeAppearance.title(name);if(Build.VERSION.SDK_INT>=28)name.setAccessibilityHeading(true);card.addView(name);
            card.addView(text(NativePricePresentation.category(item.drink)+" · "+(item.band==1?"Happy hour":"Prezzo normale"),16));
            if(named!=null){
                card.addView(text(named.name+(named.serving().isEmpty()?"":" · "+named.serving()),16));
                TextView amount=text(named.amount(),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(named.currency+(named.serving().isEmpty()?"":" · "+named.serving()),14));
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
            String amount=named!=null?named.amount():!busy&&!menuBusy&&price.available()?NativePricePresentation.amount(price.price,price.mobilePrice):"Prezzo non disponibile";
            String format=named!=null?named.currency+(named.serving().isEmpty()?"":" · "+named.serving())
                    :price.available()?NativePricePresentation.groupLabel(price.price,price.mobilePrice):"";
            compactCard(card,named!=null?named.name:NativePricePresentation.category(item.drink),venueName,amount,format,open,remove);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(8);rows.addView(card,size);
        }
        int visibleOffers=0;
        for(SavedMenuOfferStore.Entry item:offers){
            if(filter>=0&&filter<RecommendationDrink.values().length&&(item.category==null||!item.category.equals(RecommendationDrink.values()[filter].code)))continue;
            visibleOffers++;
            MenuV2Prices.Venue menu=menus.get(item.venue.url);MenuV2Prices.Price current=null;
            if(menu!=null)for(MenuV2Prices.Price price:menu.prices)if(!price.customer&&item.id.equals(price.id)){current=price;break;}
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);NativeAppearance.card(card);card.setTag("menu_offer_favourite_"+item.key());
            TextView title=text(item.name+" - "+(menu==null?item.venue.label:menu.name),18);NativeAppearance.title(title);card.addView(title);
            if(current!=null){
                if(!current.serving().isEmpty())card.addView(text(current.serving(),16));TextView amount=text(current.amount(),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(current.evidence(),15));
                if(current.band<0)card.addView(text("Prezzo soggetto a condizioni: "+(current.condition==null?"verifica il menu del locale":current.condition)+".",15));
                if(current.servingLabel==null&&current.servingML==null)
                    card.addView(text("Formato non dichiarato: prezzi con formati diversi non sono confrontabili.",15));
                int linkedCount=0;
                for(MenuV2Prices.Price report:menu.linkedReports)if(item.id.equals(report.linkedOfferId)){
                    linkedCount++;
                    if(linkedCount<=3){
                        card.addView(text("Segnalazione cliente distinta: "+report.amount()+(report.serving().isEmpty()?"":" - "+report.serving()),15));
                        card.addView(text(report.evidence(),14));
                        if(!report.currency.equals(current.currency)||report.exponent!=current.exponent
                                ||!report.category.equals(current.category)||!java.util.Objects.equals(report.servingLabel,current.servingLabel)
                                ||!java.util.Objects.equals(report.servingML,current.servingML))
                            card.addView(text("Formato, categoria o valuta diversi dal menu: non confrontabile.",14));
                    }
                }
                if(linkedCount>3)card.addView(text("Altre "+(linkedCount-3)+" segnalazioni cliente nel locale.",14));
            }else{
                String serving=MenuV2Prices.Price.displayServing(item.serving,item.ml);
                if(!serving.isEmpty())card.addView(text(serving,15));
                card.addView(text(menuBusy?"Caricamento del prezzo online...":"Offerta del menu non disponibile ora. Il preferito resta salvato; riprova piu tardi.",15));
            }
            Button open=button("Apri "+item.name,()->{if(usable()&&containsOffer(item.key()))navigate.accept(item.focusedUrl());});
            open.setTag("menu_offer_favourite_open");NativeAppearance.button(open,true);card.addView(open);
            Button remove=button("Rimuovi questo drink",()->{if(!usable()||!containsOffer(item.key())||offerStore==null)return;
                retire();SavedMenuOfferStore.Result result=offerStore.remove(item);
                if(result==SavedMenuOfferStore.Result.REMOVED||result==SavedMenuOfferStore.Result.NOT_FOUND)refresh();
                else{render();status.setText("Impossibile rimuovere il drink. Nessun dato modificato.");}});
            remove.setTag("menu_offer_favourite_remove");remove.setContentDescription("Rimuovi dai preferiti "+item.name+" - "+item.venue.label);card.addView(remove);
            String format=current==null?MenuV2Prices.Price.displayServing(item.serving,item.ml):current.serving();
            if(current!=null)format=current.currency+(format.isEmpty()?"":" · "+format);
            compactCard(card,item.name,menu==null?item.venue.label:menu.name,
                    current==null?"Prezzo non disponibile":current.amount(),format,open,remove);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(8);rows.addView(card,size);
        }
        int visibleCustomers=0;
        for(SavedMenuOfferStore.Entry item:customerOffers){
            if(filter>=0&&filter<RecommendationDrink.values().length&&(item.category==null||!item.category.equals(RecommendationDrink.values()[filter].code)))continue;
            visibleCustomers++;
            MenuV2Prices.Venue menu=menus.get(item.venue.url);MenuV2Prices.Price current=null;
            if(menu!=null)for(MenuV2Prices.Price price:menu.customerPrices)if(price.customer&&item.id.equals(price.id)){current=price;break;}
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);NativeAppearance.card(card);card.setTag("customer_drink_favourite_"+item.key());
            TextView title=text(item.name+" - "+(menu==null?item.venue.label:menu.name),18);NativeAppearance.title(title);card.addView(title);
            if(current!=null){
                if(!current.serving().isEmpty())card.addView(text(current.serving(),16));TextView amount=text(current.amount(),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(current.evidence(),15));
            }else{
                String serving=MenuV2Prices.Price.displayServing(item.serving,item.ml);
                if(!serving.isEmpty())card.addView(text(serving,15));
                card.addView(text(menuBusy?"Caricamento del prezzo online...":"Segnalazione non disponibile ora. Il preferito resta salvato; riprova piu tardi.",15));
            }
            Button open=button("Apri "+item.name,()->{if(usable()&&containsCustomer(item.key()))navigate.accept(MobileEntry.venueDocument(item.venue.url));});
            open.setTag("customer_drink_favourite_open");NativeAppearance.button(open,true);card.addView(open);
            Button remove=button("Rimuovi questo drink",()->{if(!usable()||!containsCustomer(item.key())||customerStore==null)return;
                retire();SavedMenuOfferStore.Result result=customerStore.remove(item);
                if(result==SavedMenuOfferStore.Result.REMOVED||result==SavedMenuOfferStore.Result.NOT_FOUND)refresh();
                else{render();status.setText("Impossibile rimuovere il drink. Nessun dato modificato.");}});
            remove.setTag("customer_drink_favourite_remove");remove.setContentDescription("Rimuovi dai preferiti "+item.name+" - "+item.venue.label);card.addView(remove);
            String format=current==null?MenuV2Prices.Price.displayServing(item.serving,item.ml):current.serving();
            if(current!=null)format=current.currency+(format.isEmpty()?"":" · "+format);
            compactCard(card,item.name,menu==null?item.venue.label:menu.name,
                    current==null?"Prezzo non disponibile":current.amount(),format,open,remove);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(8);rows.addView(card,size);
        }
        int visibleEurope=0;
        for(SavedEuropeDrinkStore.Entry item:europe){
            if(filter>=0&&filter<RecommendationDrink.values().length&&item.drink!=RecommendationDrink.values()[filter])continue;
            visibleEurope++;
            FavoriteComparison.Cell cell=null;try{cell=europeCells.get(FavoriteComparison.cell(item.venue.url));}catch(IOException invalid){/* The private file reader already validated this URL. */}
            EuropePrices.Price current=SavedEuropeDrinkStore.current(item,cell);
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);NativeAppearance.card(card);card.setTag("europe_drink_favourite_"+item.key());
            TextView title=text(NativePricePresentation.category(item.drink)+" - "+item.venue.label,18);NativeAppearance.title(title);card.addView(title);
            card.addView(text((item.band==1?"Happy hour":"Prezzo normale")+(item.serving.label().isEmpty()?"":" · "+item.serving.label())+" · "+item.currency,15));
            if(current!=null){
                TextView amount=text(NativePricePresentation.amount(null,current),22);NativeAppearance.price(amount);card.addView(amount);
                card.addView(text(NativePricePresentation.context(current),15));
                if(current.old)card.addView(text(current.sourceKind.equals("online_menu")?NativePricePresentation.menuWarning():activity.getString(R.string.favorites_old),15));
            }else card.addView(text(europeBusy?"Caricamento del prezzo online...":"Prezzo non disponibile ora per questo drink, formato e valuta. Il preferito resta salvato.",15));
            Button open=button("Apri "+NativePricePresentation.category(item.drink),()->{if(usable()&&containsEurope(item.key()))navigate.accept(item.focusedUrl());});
            open.setTag("europe_drink_favourite_open");NativeAppearance.button(open,true);card.addView(open);
            Button remove=button("Rimuovi questo drink",()->{if(!usable()||!containsEurope(item.key())||europeStore==null)return;
                retire();SavedEuropeDrinkStore.Result result=europeStore.remove(item);
                if(result==SavedEuropeDrinkStore.Result.REMOVED||result==SavedEuropeDrinkStore.Result.NOT_FOUND)refresh();
                else{render();status.setText("Impossibile rimuovere il drink. Nessun dato modificato.");}});
            remove.setTag("europe_drink_favourite_remove");remove.setContentDescription("Rimuovi dai preferiti "+NativePricePresentation.category(item.drink)+" - "+item.venue.label+(item.serving.label().isEmpty()?"":" - "+item.serving.label()));card.addView(remove);
            compactCard(card,NativePricePresentation.category(item.drink),item.venue.label,
                    current==null?"Prezzo non disponibile":NativePricePresentation.amount(null,current),
                    item.currency+(item.serving.label().isEmpty()?"":" · "+item.serving.label()),open,remove);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(8);rows.addView(card,size);
        }
        if(values.isEmpty()&&visibleOffers==0&&visibleCustomers==0&&visibleEurope==0&&(!saved.isEmpty()||!offers.isEmpty()||!customerOffers.isEmpty()||!europe.isEmpty()))rows.addView(text("Nessun drink salvato per questa scelta.",15));
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
    private boolean containsOffer(String key){for(SavedMenuOfferStore.Entry item:offers)if(item.key().equals(key))return true;return false;}
    private boolean containsCustomer(String key){for(SavedMenuOfferStore.Entry item:customerOffers)if(item.key().equals(key))return true;return false;}
    private boolean containsEurope(String key){for(SavedEuropeDrinkStore.Entry item:europe)if(item.key().equals(key))return true;return false;}
    /** Keep the price and exact serving visible; source detail and removal expand on demand. */
    private void compactCard(LinearLayout card,String drinkName,String venueName,String amount,String format,Button open,Button remove){
        List<View> original=new ArrayList<>();for(int i=0;i<card.getChildCount();i++)original.add(card.getChildAt(i));
        card.removeAllViews();card.setPadding(dp(12),dp(8),dp(12),dp(8));
        LinearLayout summary=new LinearLayout(activity);
        boolean large=activity.getResources().getConfiguration().fontScale>=1.3f||amount.length()>20;
        summary.setOrientation(large?LinearLayout.VERTICAL:LinearLayout.HORIZONTAL);
        LinearLayout labels=new LinearLayout(activity);labels.setOrientation(LinearLayout.VERTICAL);
        TextView title=text(drinkName,16);NativeAppearance.title(title);if(Build.VERSION.SDK_INT>=28)title.setAccessibilityHeading(true);labels.addView(title);
        TextView venue=text(venueName,14);NativeAppearance.muted(venue);labels.addView(venue);
        if(format!=null&&!format.isEmpty()){TextView serving=text(format,13);NativeAppearance.muted(serving);labels.addView(serving);}
        summary.addView(labels,large?new LinearLayout.LayoutParams(-1,-2):new LinearLayout.LayoutParams(0,-2,1));
        TextView price=text(amount,large?18:17);NativeAppearance.price(price);
        LinearLayout.LayoutParams priceSize=new LinearLayout.LayoutParams(-2,-2);
        if(!large)priceSize.leftMargin=dp(8);
        summary.addView(price,priceSize);
        card.addView(summary);
        LinearLayout actions=new LinearLayout(activity);actions.setOrientation(LinearLayout.HORIZONTAL);
        open.setText("Apri");open.setMinimumHeight(dp(48));
        LinearLayout.LayoutParams openSize=new LinearLayout.LayoutParams(0,dp(48),1);openSize.rightMargin=dp(8);
        actions.addView(open,openSize);
        LinearLayout detailContent=new LinearLayout(activity);detailContent.setOrientation(LinearLayout.VERTICAL);
        detailContent.setVisibility(View.GONE);detailContent.setTag("details_content_"+card.getTag());
        Button details=button("Dettagli",()->{
            boolean expanded=detailContent.getVisibility()!=View.VISIBLE;
            detailContent.setVisibility(expanded?View.VISIBLE:View.GONE);
            detailsToggleLabel(card,expanded);
        });
        details.setTag("details_toggle_"+card.getTag());
        details.setContentDescription("Dettagli del prezzo di "+drinkName+" da "+venueName);
        actions.addView(details,new LinearLayout.LayoutParams(0,dp(48),1));
        card.addView(actions);
        for(View child:original)if(child!=open&&child!=remove)detailContent.addView(child);
        detailContent.addView(remove);
        card.addView(detailContent);
    }
    private void detailsToggleLabel(LinearLayout card,boolean expanded){
        Button button=(Button)card.findViewWithTag("details_toggle_"+card.getTag());
        button.setText(expanded?"Meno dettagli":"Dettagli");
        button.setSelected(expanded);
        button.setContentDescription((expanded?"Nascondi":"Mostra")+" dettagli del prezzo");
    }
    private TextView text(String value,int size){TextView t=new TextView(activity);t.setText(value);t.setTextSize(size);t.setTextColor(activity.getColor(R.color.shell_text));t.setPadding(0,dp(4),0,dp(4));return t;}
    private Button button(String label,Runnable action){Button b=new Button(activity);b.setText(label);b.setContentDescription(label);NativeAppearance.button(b,false);b.setOnClickListener(v->action.run());return b;}
    private int dp(int value){return Math.round(value*activity.getResources().getDisplayMetrics().density);}
}
