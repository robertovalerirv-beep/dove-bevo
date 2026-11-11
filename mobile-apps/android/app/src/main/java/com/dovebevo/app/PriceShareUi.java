package com.dovebevo.app;

import android.app.Activity;
import android.content.Intent;
import android.content.ClipData;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.net.Uri;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.widget.ImageView;
import android.widget.ScrollView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;
import java.util.function.Supplier;

/** User-invoked local image preview and scoped system share. No network or public contribution. */
final class PriceShareUi {
    private PriceShareUi() {}
    static android.app.Dialog show(Activity activity,PriceShareSnapshot price,Supplier<Boolean> current) {
        if(!current.get())return null;
        Bitmap poster=poster(activity,price);
        NativePanel dialog=new NativePanel(activity,"Condividi",true);
        ImageView image=new ImageView(activity);image.setImageBitmap(poster);image.setAdjustViewBounds(true);image.setTag("price_share_poster");image.setContentDescription(price.accessibilityDescription());
        ScrollView scroll=new ScrollView(activity);image.setPadding(24,16,24,16);scroll.addView(image,new ScrollView.LayoutParams(-1,-2));dialog.body.addView(scroll,new android.widget.LinearLayout.LayoutParams(-1,0,1));
        android.widget.Button send=new android.widget.Button(activity);send.setId(R.id.price_share_send);send.setText("Condividi immagine");NativeAppearance.button(send,true);android.widget.LinearLayout.LayoutParams buttonSize=new android.widget.LinearLayout.LayoutParams(-1,-2);buttonSize.setMargins(24,12,24,20);dialog.body.addView(send,buttonSize);
        send.setOnClickListener(view->{
            if(!current.get()){dialog.dismiss();return;}
            try{
                File directory=new File(activity.getCacheDir(),"price-share");
                if(!directory.isDirectory()&&!directory.mkdir())throw new IOException("Private share cache unavailable");
                File[] previous=directory.listFiles();if(previous!=null)for(File file:previous)if(file.isFile()&&file.getName().matches("price-[a-f0-9-]{36}\\.png")&&System.currentTimeMillis()-file.lastModified()>86400000L)file.delete();
                File file=new File(directory,"price-"+UUID.randomUUID()+".png");
                try(FileOutputStream output=new FileOutputStream(file)){if(!poster.compress(Bitmap.CompressFormat.PNG,100,output))throw new IOException("Image unavailable");output.flush();}
                if(!current.get()){file.delete();dialog.dismiss();return;}
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".price-share",file);
                activity.startActivity(Intent.createChooser(intent(price,uri),"Condividi immagine"));
            }catch(IOException|RuntimeException unavailable){Toast.makeText(activity,"Condivisione immagine non disponibile",Toast.LENGTH_SHORT).show();}
        });
        dialog.show();return dialog;
    }
    static Intent intent(PriceShareSnapshot price,Uri uri) {
        Intent send=new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM,uri)
            .putExtra(Intent.EXTRA_TEXT,price.drinkName+" · "+price.amountLabel()+" · "+price.name+"\n"+price.url)
            .putExtra(Intent.EXTRA_TITLE,"Dove Bevo · "+price.name).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        send.setClipData(ClipData.newRawUri("Prezzo Dove Bevo",uri));return send;
    }
    static Bitmap poster(Activity activity,PriceShareSnapshot price) {
        TextPaint body=new TextPaint(Paint.ANTI_ALIAS_FLAG);body.setColor(0xff27313a);body.setTextSize(28);
        String serving=price.servingLabel();
        String details=(serving.isEmpty()?"":serving+" · ")
            +(price.hh==1?"Happy hour":"Prezzo normale")+"\n"+price.provenance+"\n"+price.confirmations+" "+(price.confirmations==1?"conferma":"conferme");
        StaticLayout provenance=layout(details,body,780);
        TextPaint title=new TextPaint(body);title.setTextSize(44);title.setTypeface(Typeface.DEFAULT_BOLD);
        StaticLayout name=layout(price.name,title,780);
        StaticLayout drink=layout(price.drinkName,title,780), location=layout(price.location,body,780);
        int amountY=580+drink.getHeight()+90,nameY=amountY+40,locationY=nameY+name.getHeight()+16,detailY=locationY+(price.location.isEmpty()?0:location.getHeight())+20;
        Bitmap image=Bitmap.createBitmap(900,detailY+provenance.getHeight()+170,Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(image);canvas.drawColor(0xfff7f3e9);
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(0xffff5a1f);
        try(java.io.InputStream input=activity.getAssets().open("reference-drinks/brand-mark.png")){Bitmap mark=android.graphics.BitmapFactory.decodeStream(input);if(mark!=null)canvas.drawBitmap(mark,null,new android.graphics.RectF(46,28,120,108),paint);}catch(IOException missing){/* Bundled brand image is optional only if an installation is damaged. */}
        paint.setColor(0xff111a21);paint.setTypeface(Typeface.DEFAULT_BOLD);paint.setTextSize(44);canvas.drawText("Dove Bevo",125,85,paint);
        DrinkArtwork artwork=new DrinkArtwork(activity,price.drink);artwork.layout(0,0,780,390);canvas.save();canvas.translate(60,130);artwork.draw(canvas);canvas.restore();
        paint.setTextSize(23);paint.setTypeface(Typeface.DEFAULT);canvas.drawText("Illustrazione del drink · non foto del locale",60,552,paint);
        canvas.save();canvas.translate(60,580);drink.draw(canvas);canvas.restore();
        paint.setTextSize(70);canvas.drawText(price.amountLabel(),60,amountY,paint);
        if(!price.tier.equals("neutro")){paint.setTextSize(27);paint.setColor(price.tier.equals("affare")?0xff216831:price.tier.equals("salato")?0xffa12020:0xff735300);canvas.drawText(price.tier.substring(0,1).toUpperCase(java.util.Locale.ITALY)+price.tier.substring(1),590,amountY,paint);}
        canvas.save();canvas.translate(60,nameY);name.draw(canvas);canvas.restore();
        if(!price.location.isEmpty()){canvas.save();canvas.translate(60,locationY);location.draw(canvas);canvas.restore();}
        canvas.save();canvas.translate(60,detailY);provenance.draw(canvas);canvas.restore();
        paint.setColor(0xff27313a);paint.setTextSize(25);canvas.drawText("Prezzi reali. Persone reali.",60,image.getHeight()-50,paint);
        return image;
    }
    private static StaticLayout layout(String text,TextPaint paint,int width){return StaticLayout.Builder.obtain(text,0,text.length(),paint,width).setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setLineSpacing(5,1).build();}
}
