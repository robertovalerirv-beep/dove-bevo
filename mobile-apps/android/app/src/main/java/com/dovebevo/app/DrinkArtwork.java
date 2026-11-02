package com.dovebevo.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.lang.ref.SoftReference;

/** Bundled category illustrations only. Never downloads or claims to depict a venue. */
final class DrinkArtwork extends View {
    private static final HashMap<String, SoftReference<Bitmap>> CACHE = new HashMap<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Bitmap photo;
    private final RecommendationDrink drink;
    DrinkArtwork(Context context, RecommendationDrink drink) {
        super(context); this.drink = drink;
        setContentDescription("Illustrazione di " + NativePricePresentation.category(drink) + "; non ÃƒÂ¨ una foto del locale");
        String name = filename(drink);
        Bitmap cached = CACHE.containsKey(name) ? CACHE.get(name).get() : null;
        if (cached == null) {
            try (InputStream in = context.getAssets().open("reference-drinks/" + name)) {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
                cached = BitmapFactory.decodeStream(in, null, options);
                if (cached != null) CACHE.put(name, new SoftReference<>(cached));
            } catch (IOException absent) { /* Accessible local illustration until an asset is bundled. */ }
        }
        photo = cached;
    }
    static String filename(RecommendationDrink drink) {
        return switch (drink) {
            case BEER_DRAFT -> "beer-scene.png";
            case SPRITZ -> "spritz-scene.png";
            case GIN_TONIC, GIN_LEMON -> "gin-tonic-scene.png";
            case WINE_GLASS -> "wine-scene.png";
            default -> drink.code.replace('_', '-') + "-scene.png";
        };
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float w = getWidth(), h = getHeight();
        canvas.save();
        android.graphics.Path clip = new android.graphics.Path();
        clip.addRoundRect(new RectF(0, 0, w, h), 12, 12, android.graphics.Path.Direction.CW); canvas.clipPath(clip);
        if (photo != null) {
            float ratio = Math.max(w / photo.getWidth(), h / photo.getHeight());
            float dw = photo.getWidth() * ratio, dh = photo.getHeight() * ratio;
            canvas.drawBitmap(photo, null, new RectF((w-dw)/2, (h-dh)/2, (w+dw)/2, (h+dh)/2), paint);
        } else {
            canvas.drawColor(Color.rgb(255, 240, 221));
            paint.setColor(drink == RecommendationDrink.WATER ? 0xff8bc5d5 : 0xffef8d32);
            canvas.drawRoundRect(new RectF(w*.33f,h*.2f,w*.67f,h*.72f), w*.07f,w*.07f,paint);
            paint.setColor(0xfffdfaf5); paint.setStrokeWidth(Math.max(2,w*.025f));
            canvas.drawLine(w*.4f,h*.29f,w*.4f,h*.55f,paint);
            paint.setColor(0xff493b2b); canvas.drawRect(w*.48f,h*.72f,w*.52f,h*.85f,paint);
            canvas.drawRoundRect(new RectF(w*.36f,h*.84f,w*.64f,h*.88f),3,3,paint);
        }
        canvas.restore();
    }
}
