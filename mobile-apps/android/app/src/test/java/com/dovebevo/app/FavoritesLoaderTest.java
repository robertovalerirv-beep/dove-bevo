package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class FavoritesLoaderTest {
    @Test public void equalCellsReadOnceAndChangingDrinkUsesAlreadyParsedSnapshot() throws Exception {
        List<String> urls=new CopyOnWriteArrayList<>();FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{urls.add(url);return FavoriteComparisonTest.bytes(url.endsWith("health")?"{\"status\":\"ok\",\"data_version\":\"20261027\"}":url.endsWith(".json")?FavoriteComparisonTest.STATIC:FavoriteComparisonTest.PRICES);},()->"2026-10-29");
        FavoritesLoader loader=new FavoritesLoader(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<Map<String,FavoriteComparison.Cell>> result=new AtomicReference<>();
        try{loader.load(FavoriteComparisonTest.saved(),value->{result.set(value);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));assertEquals(3,urls.size());
            assertEquals(800,FavoriteComparison.rows(FavoriteComparisonTest.saved(),result.get(),RecommendationDrink.BEER_DRAFT,0).get(1).price.cents);
            FavoriteComparison.rows(FavoriteComparisonTest.saved(),result.get(),RecommendationDrink.SPRITZ,1);assertEquals(3,urls.size());
        }finally{loader.close();}
    }
    @Test public void globalDeadlineStopsQueuedAndActiveWorkWithAtMostThreeInFlight() throws Exception {
        AtomicInteger active=new AtomicInteger(),peak=new AtomicInteger(),reads=new AtomicInteger();
        FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            if(url.endsWith("health"))return FavoriteComparisonTest.bytes("{\"status\":\"ok\",\"data_version\":\"20261027\"}");
            reads.incrementAndGet();int now=active.incrementAndGet();peak.accumulateAndGet(now,Math::max);
            try{while(true){call.check();try{Thread.sleep(5);}catch(InterruptedException interrupted){throw new IOException();}}}finally{active.decrementAndGet();}
        },()->"2026-10-29");
        FavoritesLoader loader=new FavoritesLoader(client,Runnable::run,Executors.newFixedThreadPool(3),Executors.newSingleThreadScheduledExecutor(),150);
        CountDownLatch done=new CountDownLatch(1);AtomicInteger callbacks=new AtomicInteger();
        try{loader.load(manyCells(),value->{assertTrue(value.isEmpty());callbacks.incrementAndGet();done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));Thread.sleep(40);
            assertEquals(1,callbacks.get());assertTrue(peak.get()<=3);assertTrue(reads.get()<=3);assertEquals(0,active.get());
        }finally{loader.close();}
    }
    @Test public void cancellationSuppressesAnAlreadyQueuedDelivery() throws Exception {
        List<Runnable> deliveries=new CopyOnWriteArrayList<>();CountDownLatch queued=new CountDownLatch(1);AtomicInteger callbacks=new AtomicInteger();
        FavoritesLoader loader=new FavoritesLoader(new FavoritePricesClient((url,max,call)->{throw new IOException("Owned unavailable");},()->"2026-10-29"),task->{deliveries.add(task);queued.countDown();});
        try{FavoritesLoader.Batch batch=loader.load(FavoriteComparisonTest.saved(),value->callbacks.incrementAndGet());assertTrue(queued.await(3,TimeUnit.SECONDS));batch.cancel();for(Runnable task:deliveries)task.run();assertEquals(0,callbacks.get());}finally{loader.close();}
    }
    private List<SavedVenueStore.Venue> manyCells()throws Exception{
        SavedVenueStore store=new SavedVenueStore(new SavedVenueStore.Storage(){byte[] bytes;public byte[] read(){return bytes;}public void write(byte[] value){bytes=value;}});
        int key=1;for(String cell:new String[]{"u0nd9","u0nd8","u0nd3","sr2y7","sr2y6","sr2y5","u0n00"})assertEquals(SavedVenueStore.Result.SAVED,store.save("https://www.dovebevo.com/bar/n"+key++ +"?c="+cell,"Locale di prova"));
        return store.load();
    }
}
