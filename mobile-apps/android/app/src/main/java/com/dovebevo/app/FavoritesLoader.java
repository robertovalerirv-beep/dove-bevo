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

/** One refresh has a global deadline, three workers, shared-cell reads and a single immutable result. */
final class FavoritesLoader {
    private final FavoritePricesClient client;private final ExecutorService network;private final ScheduledExecutorService timer;private final Executor deliver;private final long timeoutMs;
    FavoritesLoader(FavoritePricesClient client,Executor deliver){this(client,deliver,Executors.newFixedThreadPool(3),Executors.newSingleThreadScheduledExecutor(),60000);}
    FavoritesLoader(FavoritePricesClient client,Executor deliver,ExecutorService network,ScheduledExecutorService timer,long timeoutMs){this.client=client;this.deliver=deliver;this.network=network;this.timer=timer;this.timeoutMs=timeoutMs;}
    Batch load(List<SavedVenueStore.Venue> saved,Consumer<Map<String,FavoriteComparison.Cell>> result)throws IOException{
        if(saved.size()>SavedVenueStore.MAX_VENUES)throw NativeJson.invalid();
        Map<String,Boolean> cells=new LinkedHashMap<>();
        for(SavedVenueStore.Venue venue:saved){String cell=FavoriteComparison.cell(venue.url);boolean osm=!FavoriteComparison.key(venue.url).startsWith("u");cells.put(cell,osm||Boolean.TRUE.equals(cells.get(cell)));}
        Batch batch=new Batch(cells,result);batch.start();return batch;
    }
    final class Batch{
        private final Map<String,Boolean> cells;private final Consumer<Map<String,FavoriteComparison.Cell>> result;
        private final Map<String,FavoriteComparison.Cell> values=new HashMap<>();private final List<FavoritePricesClient.Call> calls=new ArrayList<>();private final List<Future<?>> futures=new ArrayList<>();
        private final long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeoutMs);private ScheduledFuture<?> timeout;private int remaining;private boolean finished,cancelled;
        Batch(Map<String,Boolean> cells,Consumer<Map<String,FavoriteComparison.Cell>> result){this.cells=cells;this.result=result;remaining=cells.size();}
        void start(){
            if(cells.isEmpty()){finish(false);return;}
            timeout=timer.schedule(()->finish(true),timeoutMs,TimeUnit.MILLISECONDS);
            submit(()->{
                String version=null;FavoritePricesClient.Call call=call();
                try{version=client.version(call);}catch(IOException unavailable){/* Valid approved user venues remain independently readable. */}
                String current=version;
                for(Map.Entry<String,Boolean> entry:cells.entrySet())submit(()->{
                    FavoriteComparison.Cell value=null;FavoritePricesClient.Call request=call();
                    try{value=client.cell(entry.getKey(),current,entry.getValue(),request);}catch(IOException|RuntimeException unavailable){ }
                    boolean done;
                    synchronized(this){if(finished||cancelled)return;if(value!=null)values.put(entry.getKey(),value);done=--remaining==0;}
                    if(done)finish(false);
                });
            });
        }
        private synchronized FavoritePricesClient.Call call(){FavoritePricesClient.Call call=new FavoritePricesClient.Call(deadline);calls.add(call);if(finished||cancelled)call.cancel();return call;}
        private synchronized void submit(Runnable task){if(finished||cancelled)return;futures.add(network.submit(task));}
        private void finish(boolean expired){
            Map<String,FavoriteComparison.Cell> copy;
            synchronized(this){if(finished||cancelled)return;finished=true;if(timeout!=null)timeout.cancel(false);copy=Collections.unmodifiableMap(new HashMap<>(values));if(expired)stop();}
            deliver.execute(()->{synchronized(this){if(cancelled)return;}result.accept(copy);});
        }
        synchronized void cancel(){if(cancelled)return;cancelled=true;if(timeout!=null)timeout.cancel(false);stop();}
        private void stop(){for(FavoritePricesClient.Call call:calls)call.cancel();for(Future<?> future:futures)future.cancel(true);}
    }
    void close(){network.shutdownNow();timer.shutdownNow();}
}
