package com.dovebevo.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.function.LongSupplier;

/** Local explicit actions. Only the guarded actual featured row may offer a drink save. */
final class SavedDrinkUi {
    private final Activity activity;
    private final SavedDrinkStore store;
    private final Supplier<String> eligible;
    private final Consumer<Consumer<PriceShareSnapshot>> read;
    private final Runnable saveVenue;
    private final LongSupplier epoch;
    private long shownEpoch;
    private AlertDialog dialog;
    private long generation;

    SavedDrinkUi(Activity activity,SavedDrinkStore store,Supplier<String> eligible,
                 Consumer<Consumer<PriceShareSnapshot>> read,Runnable saveVenue,LongSupplier epoch) {
        this.activity=activity;this.store=store;this.eligible=eligible;this.read=read;this.saveVenue=saveVenue;this.epoch=epoch;
    }

    void show() {
        String identity=SavedVenueUrl.canonicalize(eligible.get());
        if(identity==null||activity.isFinishing()||activity.isDestroyed())return;
        dismiss();long request=generation;shownEpoch=epoch.getAsLong();
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);
        int pad=Math.round(16*activity.getResources().getDisplayMetrics().density);body.setPadding(pad,pad,pad,pad);
        Button venue=button("Salva locale");venue.setTag("save_choice_venue");body.addView(venue);
        Button drink=button("Lettura del drink…");drink.setTag("save_choice_drink");drink.setEnabled(false);body.addView(drink);
        AlertDialog shown=new AlertDialog.Builder(activity).setTitle("Salva nei preferiti").setView(body).setNegativeButton("Annulla",null).create();
        dialog=shown;shown.setOnDismissListener(ignored->{if(dialog==shown){dialog=null;generation++;}});
        venue.setOnClickListener(v->{if(current(shown,request,identity)){shown.dismiss();saveVenue.run();}});
        shown.show();
        read.accept(snapshot->{
            if(!current(shown,request,identity))return;
            if(snapshot==null||!identity.equals(snapshot.identityUrl)){drink.setText("Drink non disponibile");return;}
            drink.setText("Salva "+NativePricePresentation.category(snapshot.drink)+" · "+snapshot.name+"\n"+(snapshot.hh==1?"Happy hour":"Prezzo normale"));
            drink.setContentDescription(drink.getText());drink.setEnabled(true);
            drink.setOnClickListener(v->{
                if(!current(shown,request,identity))return;
                SavedDrinkStore.Result result=store.save(snapshot.identityUrl,snapshot.name,snapshot.drink,snapshot.hh);
                if(result==SavedDrinkStore.Result.SAVED)shown.dismiss();
                Toast.makeText(activity,result==SavedDrinkStore.Result.SAVED?"Drink salvato nei preferiti":result==SavedDrinkStore.Result.FULL?"Puoi salvare fino a 50 drink":"Impossibile salvare il drink. Riprova.",Toast.LENGTH_LONG).show();
            });
        });
    }

    private boolean current(AlertDialog shown,long request,String identity) {
        return request==generation&&shownEpoch==epoch.getAsLong()&&dialog==shown&&shown.isShowing()&&!activity.isFinishing()&&!activity.isDestroyed()&&identity.equals(SavedVenueUrl.canonicalize(eligible.get()));
    }
    private Button button(String label) {Button b=new Button(activity);b.setText(label);NativeAppearance.button(b,false);return b;}
    void dismiss(){generation++;if(dialog!=null){AlertDialog old=dialog;dialog=null;old.dismiss();}}
}
