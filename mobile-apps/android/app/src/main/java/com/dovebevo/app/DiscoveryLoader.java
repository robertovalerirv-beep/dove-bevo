package com.dovebevo.app;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/** At most nine cells, three public GET workers and one global deadline. No persistent data. */
final class DiscoveryLoader {
    static final class Result {
        final Map<String,DiscoveryData.Cell> cells;final int expected;final boolean partial;
        Result(Map<String,DiscoveryData.Cell> cells,int expected){this.cells=Collections.unmodifiableMap(new HashMap<>(cells));this.expected=expected;boolean partial=cells.size()!=expected;for(DiscoveryData.Cell cell:cells.values())if(!cell.approved.staticVerified)partial=true;this.partial=partial;}
    }
    private final FavoritePricesClient client;private final Executor deliver;private final ExecutorService network;private final ScheduledExecutorService timer;private final long timeoutMs;
    DiscoveryLoader(FavoritePricesClient client,Executor deliver){this(client,deliver,Executors.newFixedThreadPool(3),Executors.newSingleThreadScheduledExecutor(),60000);}
    DiscoveryLoader(FavoritePricesClient client,Executor deliver,ExecutorService network,ScheduledExecutorService timer,long timeoutMs){this.client=client;this.deliver=deliver;this.network=network;this.timer=timer;this.timeoutMs=timeoutMs;}
    Batch load(DiscoveryArea area,Consumer<Result> result)throws IOException {
        if(area==null)throw NativeJson.invalid();List<String> cells=area.cells();if(cells.isEmpty()||cells.size()>9)throw NativeJson.invalid();
        Batch batch=new Batch(cells,!area.legacyArea(),result);batch.start();return batch;
    }
    final class Batch {
        private final List<String> cells;private final boolean foreignArea;private final Consumer<Result> result;private final Map<String,DiscoveryData.Cell> values=new HashMap<>();
        private final List<FavoritePricesClient.Call> calls=new ArrayList<>();private final List<Future<?>> futures=new ArrayList<>();
        private final long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeoutMs);private ScheduledFuture<?> timeout;private int remaining;private boolean finished,cancelled;
        Batch(List<String> cells,boolean foreignArea,Consumer<Result> result){this.cells=cells;this.foreignArea=foreignArea;this.result=result;remaining=cells.size();}
        void start(){
            timeout=timer.schedule(()->finish(true),timeoutMs,TimeUnit.MILLISECONDS);
            submit(()->{
                String version=null;FavoritePricesClient.Call versionCall=call();try{version=client.version(versionCall);}catch(IOException|RuntimeException unavailable){ }
                EuropePrices.Catalog catalog=null;try{catalog=client.catalog(call());}catch(IOException|RuntimeException unavailable){ }
                String current=version;EuropePrices.Catalog mobile=catalog;
                for(String cell:cells)submit(()->{
                    DiscoveryData.Cell value=null;try{value=client.discoveryCell(cell,current,mobile,foreignArea,call());}catch(IOException|RuntimeException unavailable){ }
                    boolean done;synchronized(this){if(finished||cancelled)return;if(value!=null)values.put(cell,value);done=--remaining==0;}
                    if(done)finish(false);
                });
            });
        }
        private synchronized FavoritePricesClient.Call call(){FavoritePricesClient.Call value=new FavoritePricesClient.Call(deadline);calls.add(value);if(finished||cancelled)value.cancel();return value;}
        private void submit(Runnable task){synchronized(this){if(finished||cancelled)return;try{futures.add(network.submit(task));}catch(RejectedExecutionException closed){finish(true);}}}
        private void finish(boolean expired){
            Result copy;synchronized(this){if(finished||cancelled)return;finished=true;if(timeout!=null)timeout.cancel(false);copy=new Result(values,cells.size());if(expired)stop();}
            deliver.execute(()->{synchronized(this){if(cancelled)return;}result.accept(copy);});
        }
        synchronized void cancel(){if(cancelled)return;cancelled=true;if(timeout!=null)timeout.cancel(false);stop();}
        private void stop(){for(FavoritePricesClient.Call value:calls)value.cancel();for(Future<?> future:futures)future.cancel(true);}
    }
    void close(){network.shutdownNow();timer.shutdownNow();}
}
