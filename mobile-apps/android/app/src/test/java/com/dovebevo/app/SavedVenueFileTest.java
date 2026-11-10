package com.dovebevo.app;

import static org.junit.Assert.assertNotNull;

import java.io.File;
import org.junit.Test;

public final class SavedVenueFileTest {
    @Test public void appCanOpenTheCustomerDrinkStoreAfterRulesAcceptance() {
        assertNotNull(new SavedVenueFile(new File("unused-private-directory"), "saved-customer-drinks-v1"));
        assertNotNull(new SavedVenueFile(new File("unused-private-directory"), "saved-europe-drinks-v1"));
    }
}
