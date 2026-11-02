package com.dovebevo.app;

import android.graphics.Bitmap;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;

/** Explicit opt-in original fixture screenshots, never production or physical-device evidence. */
final class ReferenceCapture {
    static void save(String name) {
        if(!"true".equals(InstrumentationRegistry.getArguments().getString("captureReference")))return;
        if(!name.matches("(?:discovery|share|information)-owned-fixture\\.png"))throw new AssertionError("Unknown fixture capture");
        try{
            android.app.Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();instrumentation.waitForIdleSync();
            try{Thread.sleep(450);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new AssertionError(interrupted);}
            instrumentation.waitForIdleSync();
            File directory=new File(instrumentation.getTargetContext().getExternalFilesDir(null),"reference-fixtures");
            if(!directory.isDirectory()&&!directory.mkdirs())throw new AssertionError("Capture directory unavailable");
            Bitmap image=instrumentation.getUiAutomation().takeScreenshot();if(image==null)throw new AssertionError("Original screenshot unavailable");
            try(FileOutputStream output=new FileOutputStream(new File(directory,name))){if(!image.compress(Bitmap.CompressFormat.PNG,100,output))throw new AssertionError("Capture failed");}
        }catch(java.io.IOException failure){throw new AssertionError(failure);}
    }
}
