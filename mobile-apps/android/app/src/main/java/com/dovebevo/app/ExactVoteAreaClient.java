package com.dovebevo.app;

import java.io.IOException;
import java.util.List;

/** Dedicated public GET; no browser cookies, voter identifier, or write method. */
final class ExactVoteAreaClient {
    private final FavoritePricesClient.Transport transport;
    ExactVoteAreaClient(){this(new FavoritePricesClient.HttpsTransport());}
    ExactVoteAreaClient(FavoritePricesClient.Transport transport){this.transport=transport;}
    ExactVoteArea.Page load(List<String> cells,String after,FavoritePricesClient.Call call)throws IOException{
        String url=ExactVoteArea.endpoint(cells,after);
        call.check();byte[] body=transport.get(url,ExactVoteArea.MAX_BYTES,call);call.check();
        ExactVoteArea.Page page=ExactVoteArea.parse(body,cells);
        if(after!=null&&after.equals(page.next))throw NativeJson.invalid();
        return page;
    }
}
