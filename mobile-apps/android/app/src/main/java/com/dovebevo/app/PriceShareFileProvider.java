package com.dovebevo.app;

/** App-owned provider subclass, as required for reliable AndroidX manifest instantiation. */
public final class PriceShareFileProvider extends androidx.core.content.FileProvider {
    public PriceShareFileProvider() { super(); }
}
