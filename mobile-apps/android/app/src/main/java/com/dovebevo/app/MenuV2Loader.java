package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Refreshes verified menu prices in memory; cancellation and the 60-second deadline follow the Favourite pane. */
final class MenuV2Loader {
    private final MenuV2Prices client;private final ExecutorService network;private final ScheduledExecutorService timer;private final Executor deliver;private final long timeoutMs;
    MenuV2Loader(MenuV2Prices client,Executor deliver){this(client,deliver,Executors.newFixedThreadPool(3),Executors.newSingleThreadScheduledExecutor(),60000);}
    MenuV2Loader(MenuV2Prices client,Executor deliver,ExecutorService network,ScheduledExecutorService timer,long timeoutMs){
        this.client=client;this.deliver=deliver;this.network=network;this.timer=timer;this.timeoutMs=timeoutMs;
    }
    Batch load(List<SavedVenueStore.Venue> saved,Consumer<Map<String,MenuV2Prices.Venue>> result)throws IOException{
        if(saved.size()>SavedDrinkStore.MAX_ITEMS+2*SavedMenuOfferStore.MAX_ITEMS)throw NativeJson.invalid();
        Map<String,SavedVenueStore.Venue> unique=new LinkedHashMap<>();
        for(SavedVenueStore.Venue venue:saved){String key=FavoriteComparison.key(venue.url),cell=FavoriteComparison.cell(venue.url);
            MenuV2Prices.endpoint(true,key,cell,null);unique.put(venue.url,venue);}
        Batch batch=new Batch(new ArrayList<>(unique.values()),result);batch.start();return batch;
    }
    final class Batch {
        private final List<SavedVenueStore.Venue> saved;private final Consumer<Map<String,MenuV2Prices.Venue>> result;
        private final Map<String,MenuV2Prices.Venue> values=new HashMap<>();private final List<FavoritePricesClient.Call> calls=new ArrayList<>();
        private final List<Future<?>> futures=new ArrayList<>();private final long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeoutMs);
        private ScheduledFuture<?> timeout;private int remaining;private boolean finished,cancelled;
        Batch(List<SavedVenueStore.Venue> saved,Consumer<Map<String,MenuV2Prices.Venue>> result){this.saved=saved;this.result=result;remaining=saved.size();}
        void start(){
            if(saved.isEmpty()){finish(false);return;}
            timeout=timer.schedule(()->finish(true),timeoutMs,TimeUnit.MILLISECONDS);
            for(SavedVenueStore.Venue venue:saved)submit(()->{
                MenuV2Prices.Venue value=null;FavoritePricesClient.Call call=call();
                try{value=client.load(venue,call);}catch(IOException|RuntimeException unavailable){/* Keep a saved choice without making up a price. */}
                boolean done; synchronized(this){if(finished||cancelled)return;if(value!=null)values.put(venue.url,value);done=--remaining==0;}
                if(done)finish(false);
            });
        }
        private synchronized FavoritePricesClient.Call call(){FavoritePricesClient.Call call=new FavoritePricesClient.Call(deadline);calls.add(call);if(finished||cancelled)call.cancel();return call;}
        private synchronized void submit(Runnable task){if(finished||cancelled)return;futures.add(network.submit(task));}
        private void finish(boolean expired){Map<String,MenuV2Prices.Venue> copy;
            synchronized(this){if(finished||cancelled)return;finished=true;if(timeout!=null)timeout.cancel(false);copy=Collections.unmodifiableMap(new HashMap<>(values));if(expired)stop();}
            deliver.execute(()->{synchronized(this){if(cancelled)return;}result.accept(copy);});
        }
        synchronized void cancel(){if(cancelled)return;cancelled=true;if(timeout!=null)timeout.cancel(false);stop();}
        private void stop(){for(FavoritePricesClient.Call call:calls)call.cancel();for(Future<?> future:futures)future.cancel(true);}
    }
    void close(){network.shutdownNow();timer.shutdownNow();}
}
