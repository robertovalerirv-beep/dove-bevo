package com.dovebevo.app;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import java.util.function.Supplier;

/** Community counts near the selected map centre; this destination never offers a vote action. */
final class ExactVoteAreaScreen {
    private final Activity activity;private final ExactVoteAreaClient client;private final Consumer<String> navigate;
    private final Runnable chooseCity;private final Supplier<Boolean> foreground;private final ExecutorService worker;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ScrollView view;private final LinearLayout rows;private final TextView status;private final Button more,choose;
    private List<String> cells;private List<ExactVoteArea.Row> items=Collections.emptyList();private String next;
    private FavoritePricesClient.Call request;private long generation;private boolean visible,busy,closed;
    ExactVoteAreaScreen(Activity activity,Consumer<String> navigate,Runnable chooseCity,Supplier<Boolean> foreground){
        this(activity,new ExactVoteAreaClient(),navigate,chooseCity,foreground,Executors.newSingleThreadExecutor());
    }
    ExactVoteAreaScreen(Activity activity,ExactVoteAreaClient client,Consumer<String> navigate,Runnable chooseCity,Supplier<Boolean> foreground,ExecutorService worker){
        this.activity=activity;this.client=client;this.navigate=navigate;this.chooseCity=chooseCity;this.foreground=foreground;this.worker=worker;
        view=new ScrollView(activity);view.setId(R.id.recommendation_area_screen);view.setBackgroundColor(activity.getColor(R.color.shell_background));
        LinearLayout body=new LinearLayout(activity);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(16),dp(16),dp(16),dp(24));view.addView(body);
        TextView title=text("Consigliati in questa zona",24);NativeAppearance.title(title);title.setMinHeight(dp(48));title.setPadding(0,0,dp(56),0);body.addView(title);
        TextView explanation=text("I drink che le persone consigliano vicino al centro della Mappa. Tocca un locale per vedere prezzi e dettagli.",15);
        NativeAppearance.muted(explanation);body.addView(explanation);
        status=text("",15);status.setId(R.id.recommendation_area_status);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);status.setPadding(0,dp(12),0,dp(12));body.addView(status);
        choose=button("Cerca una città",chooseCity);choose.setId(R.id.recommendation_area_choose);body.addView(choose);
        rows=new LinearLayout(activity);rows.setId(R.id.recommendation_area_rows);rows.setOrientation(LinearLayout.VERTICAL);body.addView(rows);
        more=button("Altri consigliati",this::loadMore);more.setId(R.id.recommendation_area_more);body.addView(more);
    }
    View view(){return view;}
    List<String> areaCells(){return cells;}
    void show(DiscoveryArea area){
        if(closed)return;visible=true;retire();items=Collections.emptyList();next=null;
        cells=area==null?null:area.cells();render();if(cells!=null)load(null);
    }
    void hide(){visible=false;retire();}
    void pause(){retire();if(visible)render();}
    void resume(){if(visible&&!closed&&cells!=null)refresh();}
    void close(){closed=true;hide();worker.shutdownNow();}
    boolean canRefresh(){return usable()&&cells!=null&&!busy;}
    void refresh(){if(!usable()||cells==null)return;retire();items=Collections.emptyList();next=null;render();load(null);}
    private boolean usable(){return visible&&!closed&&foreground.get()&&!activity.isFinishing()&&!activity.isDestroyed();}
    private void retire(){generation++;busy=false;if(request!=null)request.cancel();request=null;}
    private void loadMore(){if(usable()&&!busy&&next!=null)load(next);}
    private void load(String cursor){
        if(!usable()||busy||cells==null)return;
        List<String> scope=cells;long token=++generation;busy=true;
        FavoritePricesClient.Call call=new FavoritePricesClient.Call(System.nanoTime()+TimeUnit.SECONDS.toNanos(20));request=call;render();
        worker.execute(()->{
            ExactVoteArea.Page page=null;
            try{page=client.load(scope,cursor,call);}catch(IOException|RuntimeException unavailable){/* Fixed native error below. */}
            ExactVoteArea.Page result=page;
            main.post(()->{
                if(token!=generation||!usable()||cells!=scope)return;
                request=null;busy=false;
                if(result!=null){
                    List<ExactVoteArea.Row> combined=new ArrayList<>(cursor==null?Collections.emptyList():items);
                    combined.addAll(result.rows);items=Collections.unmodifiableList(combined);next=result.next;
                }
                render(result==null);
            });
        });
    }
    private void render(){render(false);}
    private void render(boolean unavailable){
        rows.removeAllViews();choose.setVisibility(cells==null?View.VISIBLE:View.GONE);
        if(cells==null)status.setText("Apri una città sulla Mappa per vedere i drink consigliati in quella zona.");
        else if(busy)status.setText(items.isEmpty()?"Caricamento dei consigliati...":"Caricamento di altri consigliati...");
        else if(unavailable)status.setText("Consigliati non disponibili ora. Riprova dal menu in alto.");
        else if(items.isEmpty())status.setText("Nessun drink consigliato in questa zona per ora.");
        else status.setText(items.size()+" drink consigliati in questa zona");
        for(ExactVoteArea.Row item:items){
            LinearLayout card=new LinearLayout(activity);card.setOrientation(LinearLayout.VERTICAL);NativeAppearance.card(card);card.setTag("recommendation_area_item_"+item.targetKey);
            TextView name=text(item.drinkName,19);NativeAppearance.title(name);card.addView(name);
            TextView venue=text(item.venueName+(item.city==null||item.city.isEmpty()?"":" · "+item.city),16);card.addView(venue);
            if(item.serving!=null)card.addView(text(item.serving,14));
            card.addView(text(item.count==1?"👍 1 persona lo consiglia":"👍 "+item.count+" persone lo consigliano",15));
            Button open=button("Apri "+item.venueName,()->{if(usable())navigate.accept(item.venueUrl);});
            open.setContentDescription("Apri "+item.drinkName+" da "+item.venueName);card.addView(open);
            LinearLayout.LayoutParams size=new LinearLayout.LayoutParams(-1,-2);size.bottomMargin=dp(12);rows.addView(card,size);
        }
        more.setVisibility(next!=null?View.VISIBLE:View.GONE);more.setEnabled(!busy&&usable());
    }
    private TextView text(String label,int size){TextView view=new TextView(activity);view.setText(label);view.setTextSize(size);view.setTextColor(activity.getColor(R.color.shell_text));view.setPadding(0,dp(4),0,dp(4));return view;}
    private Button button(String label,Runnable action){Button button=new Button(activity);button.setText(label);button.setContentDescription(label);NativeAppearance.button(button,false);button.setOnClickListener(v->action.run());return button;}
    private int dp(int amount){return Math.round(amount*activity.getResources().getDisplayMetrics().density);}
}
