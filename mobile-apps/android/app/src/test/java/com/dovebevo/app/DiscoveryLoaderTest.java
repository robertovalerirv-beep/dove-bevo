package com.dovebevo.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public final class DiscoveryLoaderTest {
    @Test public void boundedPublicReadGetsNineCellsAndOneVersionWithoutBookmarks()throws Exception {
        List<String> urls=new CopyOnWriteArrayList<>();FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            urls.add(url);if(url.endsWith("health"))return DiscoveryTest.bytes("{\"status\":\"ok\",\"data_version\":\"20261030\"}");
            if(url.contains("u0nd9"))return DiscoveryTest.bytes(url.endsWith(".json")?DiscoveryTest.STATIC:DiscoveryTest.PRICES);
            return DiscoveryTest.bytes(url.endsWith(".json")?"{\"c\":[],\"v\":[]}":"{\"p\":[],\"u\":[],\"pend\":[],\"h\":[]}");
        },()->"2026-11-01");
        DiscoveryLoader loader=new DiscoveryLoader(client,Runnable::run);CountDownLatch done=new CountDownLatch(1);AtomicReference<DiscoveryLoader.Result> result=new AtomicReference<>();
        try{loader.load(new DiscoveryArea(45.4642,9.19,14),r->{result.set(r);done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));assertEquals(20,urls.size());assertEquals(9,result.get().cells.size());assertFalse(result.get().partial);assertEquals(3,DiscoveryData.rows(result.get().cells,new DiscoveryArea(45.4642,9.19,14),RecommendationDrink.SPRITZ,0).size());}
        finally{loader.close();}
    }
    @Test public void globalDeadlineBoundsConcurrencyAndReturnsExplicitPartialResult()throws Exception {
        AtomicInteger active=new AtomicInteger(),peak=new AtomicInteger(),reads=new AtomicInteger();FavoritePricesClient client=new FavoritePricesClient((url,max,call)->{
            if(url.endsWith("health"))return DiscoveryTest.bytes("{\"status\":\"ok\",\"data_version\":\"20261030\"}");
            reads.incrementAndGet();peak.accumulateAndGet(active.incrementAndGet(),Math::max);try{while(true){call.check();try{Thread.sleep(5);}catch(InterruptedException cancelled){throw new IOException();}}}finally{active.decrementAndGet();}
        },()->"2026-11-01");
        DiscoveryLoader loader=new DiscoveryLoader(client,Runnable::run,Executors.newFixedThreadPool(3),Executors.newSingleThreadScheduledExecutor(),150);CountDownLatch done=new CountDownLatch(1);
        try{loader.load(new DiscoveryArea(45.4642,9.19,14),r->{assertTrue(r.partial);assertEquals(9,r.expected);assertTrue(r.cells.isEmpty());done.countDown();});assertTrue(done.await(3,TimeUnit.SECONDS));Thread.sleep(40);assertTrue(peak.get()<=3);assertTrue(reads.get()<=3);assertEquals(0,active.get());}finally{loader.close();}
    }
    @Test public void cancellationSuppressesQueuedResults()throws Exception {
        List<Runnable> deliveries=new CopyOnWriteArrayList<>();CountDownLatch queued=new CountDownLatch(1);AtomicInteger callbacks=new AtomicInteger();
        DiscoveryLoader loader=new DiscoveryLoader(new FavoritePricesClient((url,max,call)->{throw new IOException("Owned unavailable fixture");},()->"2026-11-01"),r->{deliveries.add(r);queued.countDown();});
        try{DiscoveryLoader.Batch request=loader.load(new DiscoveryArea(45.4642,9.19,14),r->callbacks.incrementAndGet());assertTrue(queued.await(3,TimeUnit.SECONDS));request.cancel();for(Runnable r:deliveries)r.run();assertEquals(0,callbacks.get());}finally{loader.close();}
    }
}
