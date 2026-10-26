package com.dovebevo.app.preview;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.security.NetworkSecurityPolicy;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Checks the installed merged manifest rather than just the source declaration. Requires a device. */
@RunWith(AndroidJUnit4.class)
public class NativeBoundaryInstrumentedTest {
    @Test
    public void installedPreviewHasNoBackgroundLocationAdvertisingIdBackupOrCleartext() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.dovebevo.app.preview", context.getPackageName());
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        Set<String> permissions = new HashSet<>(Arrays.asList(info.requestedPermissions));
        assertTrue(permissions.contains("android.permission.ACCESS_COARSE_LOCATION"));
        assertTrue(permissions.contains("android.permission.ACCESS_FINE_LOCATION"));
        assertFalse(permissions.contains("android.permission.ACCESS_BACKGROUND_LOCATION"));
        assertFalse(permissions.contains("com.google.android.gms.permission.AD_ID"));
        assertFalse((info.applicationInfo.flags & ApplicationInfo.FLAG_ALLOW_BACKUP) != 0);
        assertFalse(NetworkSecurityPolicy.getInstance().isCleartextTrafficPermitted());
    }
}
