package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import java.util.function.Consumer;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Save one explicit drink at the venue whose public heading is currently visible. */
final class SavedDrinkUi {
    private final Activity activity;
    private final SavedDrinkStore store;
    private final Supplier<String> eligible;
    private final Consumer<Consumer<SavedVenueCapture.Venue>> readVenue;
    private final LongSupplier epoch;
    private AlertDialog dialog;
    private long generation;

    SavedDrinkUi(Activity activity, SavedDrinkStore store, Supplier<String> eligible,
                 Consumer<Consumer<SavedVenueCapture.Venue>> readVenue, LongSupplier epoch) {
        this.activity=activity;this.store=store;this.eligible=eligible;this.readVenue=readVenue;this.epoch=epoch;
    }

    void show() {
        show(null,-1);
    }

    void showExact(RecommendationDrink drink,int band){
        if(drink==null||(band!=0&&band!=1))return;
        show(drink,band);
    }

    private void show(RecommendationDrink selectedDrink,int selectedBand) {
        String identity=SavedVenueUrl.canonicalize(eligible.get());
        if(identity==null||activity.isFinishing()||activity.isDestroyed())return;
        dismiss();
        long request=generation, shownEpoch=epoch.getAsLong();
        readVenue.accept(venue -> {
            if(request!=generation||shownEpoch!=epoch.getAsLong()||activity.isFinishing()||activity.isDestroyed()
                    ||!identity.equals(SavedVenueUrl.canonicalize(eligible.get())))return;
            if(venue==null||!identity.equals(venue.url)){message("Impossibile leggere il nome del locale. Riprova.");return;}
            if(selectedDrink==null)present(venue,request,shownEpoch);
            else presentExact(venue,selectedDrink,selectedBand,request,shownEpoch);
        });
    }

    private void presentExact(SavedVenueCapture.Venue venue,RecommendationDrink drink,int band,long request,long shownEpoch){
        String detail=NativePricePresentation.category(drink)+(band==1?" · Happy hour":" · Prezzo normale")+" · "+venue.name;
        AlertDialog shown=new AlertDialog.Builder(activity).setTitle("Salva nei preferiti?")
                .setMessage(detail+". Il prezzo si aggiorna quando sei online.")
                .setPositiveButton("Salva",(dialog,which)->{
                    if(request!=generation||shownEpoch!=epoch.getAsLong()||!venue.url.equals(SavedVenueUrl.canonicalize(eligible.get())))return;
                    SavedDrinkStore.Result result=store.save(venue.url,venue.name,drink,band);
                    message(result==SavedDrinkStore.Result.SAVED?"Drink salvato nei preferiti"
                            :result==SavedDrinkStore.Result.FULL?"Puoi salvare fino a 50 drink":"Impossibile salvare il drink. Riprova.");
                }).setNegativeButton("Annulla",null).create();
        dialog=shown;
        shown.setOnDismissListener(ignored->{if(dialog==shown){dialog=null;generation++;}});
        shown.show();
    }

    private void present(SavedVenueCapture.Venue venue,long request,long shownEpoch) {
        LinearLayout body=new LinearLayout(activity);
        body.setOrientation(LinearLayout.VERTICAL);
        int pad=Math.round(16*activity.getResources().getDisplayMetrics().density);
        body.setPadding(pad,pad,pad,pad);
        TextView context=new TextView(activity);
        context.setText("Salva un drink da "+venue.name+". Il prezzo si aggiorna quando sei online.");
        body.addView(context);
        Spinner drinks=new Spinner(activity);
        drinks.setTag("save_choice_drink");
        drinks.setContentDescription("Scegli il drink da salvare");
        String[] names=new String[RecommendationDrink.values().length+1];
        names[0]="Scegli un drink";
        for(int i=0;i<RecommendationDrink.values().length;i++)
            names[i+1]=NativePricePresentation.category(RecommendationDrink.values()[i]);
        ArrayAdapter<String> drinkOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,names);
        drinkOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        drinks.setAdapter(drinkOptions);
        body.addView(drinks);
        Spinner bands=new Spinner(activity);
        bands.setTag("save_choice_band");
        bands.setContentDescription("Fascia del drink");
        ArrayAdapter<String> bandOptions=new ArrayAdapter<>(activity,android.R.layout.simple_spinner_item,
                new String[]{"Normale","Happy hour"});
        bandOptions.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        bands.setAdapter(bandOptions);
        body.addView(bands);
        AlertDialog shown=new AlertDialog.Builder(activity).setTitle("Salva nei preferiti")
                .setView(body).setPositiveButton("Salva",null).setNegativeButton("Annulla",null).create();
        dialog=shown;
        shown.setOnDismissListener(ignored->{if(dialog==shown){dialog=null;generation++;}});
        shown.setOnShowListener(ignored -> {
            View save=shown.getButton(AlertDialog.BUTTON_POSITIVE);
            save.setTag("save_drink_confirm");
            save.setOnClickListener(v -> {
                if(!current(shown,request,shownEpoch,venue.url))return;
                int selected=drinks.getSelectedItemPosition();
                if(selected<=0){message("Scegli il drink da salvare.");return;}
                RecommendationDrink drink=RecommendationDrink.values()[selected-1];
                SavedDrinkStore.Result result=store.save(venue.url,venue.name,drink,bands.getSelectedItemPosition());
                if(result==SavedDrinkStore.Result.SAVED)shown.dismiss();
                message(result==SavedDrinkStore.Result.SAVED?"Drink salvato nei preferiti"
                        :result==SavedDrinkStore.Result.FULL?"Puoi salvare fino a 50 drink"
                        :"Impossibile salvare il drink. Riprova.");
            });
        });
        shown.show();
    }

    private boolean current(AlertDialog shown,long request,long shownEpoch,String identity) {
        return request==generation&&shownEpoch==epoch.getAsLong()&&dialog==shown&&shown.isShowing()
                &&!activity.isFinishing()&&!activity.isDestroyed()
                &&identity.equals(SavedVenueUrl.canonicalize(eligible.get()));
    }
    private void message(String value){Toast.makeText(activity,value,Toast.LENGTH_LONG).show();}
    void dismiss(){generation++;if(dialog!=null){AlertDialog old=dialog;dialog=null;old.dismiss();}}
}
