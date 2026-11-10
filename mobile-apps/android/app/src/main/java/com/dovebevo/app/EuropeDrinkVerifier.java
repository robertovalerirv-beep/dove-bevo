package com.dovebevo.app;

import java.io.IOException;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** Reads the current public catalogue and exact venue row before a private save. */
final class EuropeDrinkVerifier {
    static final class Verified {
        final SavedEuropeDrinkStore.Entry entry;
        final EuropePrices.Price price;
        Verified(SavedEuropeDrinkStore.Entry entry,EuropePrices.Price price){this.entry=entry;this.price=price;}
    }
    private final EuropePricesClient client;
    private final Executor deliver;
    private final ExecutorService network;
    private final ScheduledExecutorService timer;
    EuropeDrinkVerifier(Executor deliver){this(new EuropePricesClient(new FavoritePricesClient.HttpsTransport(),FavoriteDay::today),deliver);}
    EuropeDrinkVerifier(EuropePricesClient client,Executor deliver){
        this.client=client;this.deliver=deliver;network=Executors.newSingleThreadExecutor();timer=Executors.newSingleThreadScheduledExecutor();
    }
    static Verified verify(EuropeDrinkSaveCommand command,EuropePrices.Catalog catalog,EuropePrices.Cell cell)throws IOException{
        if(command==null||catalog==null||cell==null)throw NativeJson.invalid();
        String key=FavoriteComparison.key(command.venueUrl),scope=FavoriteComparison.cell(command.venueUrl);
        if(!cell.catalogVersion.equals(catalog.version)||!cell.scoped.contains(key)||!catalog.venues.containsKey(key))throw NativeJson.invalid();
        EuropePrices.Venue venue=cell.venues.get(key);
        if(venue==null||!scope.equals(venue.cell))return null;
        SavedVenueStore.Venue saved=SavedVenueStore.reference(command.venueUrl,venue.name);
        for(EuropePrices.Price price:cell.prices)if(command.matches(price)){
            SavedEuropeDrinkStore.Entry entry=SavedEuropeDrinkStore.verified(saved,price);
            if(entry!=null)return new Verified(entry,price);
        }
        return null;
    }
    Batch load(EuropeDrinkSaveCommand command,Consumer<Verified> callback)throws IOException{
        if(command==null||callback==null)throw NativeJson.invalid();
        Batch batch=new Batch(command,FavoriteComparison.key(command.venueUrl),FavoriteComparison.cell(command.venueUrl),callback);batch.start();return batch;
    }
    final class Batch {
        private final EuropeDrinkSaveCommand command;private final String key,cell;private final Consumer<Verified> callback;
        private final FavoritePricesClient.Call call=new FavoritePricesClient.Call(System.nanoTime()+TimeUnit.SECONDS.toNanos(25));
        private Future<?> future;private ScheduledFuture<?> deadline;private boolean finished,cancelled;
        Batch(EuropeDrinkSaveCommand command,String key,String cell,Consumer<Verified> callback){this.command=command;this.key=key;this.cell=cell;this.callback=callback;}
        void start(){
            synchronized(this){
                deadline=timer.schedule(this::expire,25,TimeUnit.SECONDS);
                future=network.submit(()->{
                    Verified value=null;
                    try{EuropePrices.Catalog catalog=client.catalog(call);EuropePrices.Cell venue=client.venue(key,cell,catalog,call);value=verify(command,catalog,venue);}
                    catch(IOException|RuntimeException unavailable){/* A failed read never saves a stale price. */}
                    complete(value);
                });
            }
        }
        private void expire(){
            synchronized(this){if(finished||cancelled)return;call.cancel();if(future!=null)future.cancel(true);}
            complete(null);
        }
        private void complete(Verified value){
            synchronized(this){if(finished||cancelled)return;finished=true;if(deadline!=null)deadline.cancel(false);}
            deliver.execute(()->{synchronized(this){if(cancelled)return;}callback.accept(value);});
        }
        synchronized void cancel(){if(cancelled)return;cancelled=true;call.cancel();if(future!=null)future.cancel(true);if(deadline!=null)deadline.cancel(false);}
    }
    void close(){network.shutdownNow();timer.shutdownNow();}
}
