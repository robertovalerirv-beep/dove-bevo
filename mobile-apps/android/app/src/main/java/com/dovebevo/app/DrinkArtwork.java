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
        setContentDescription("Illustrazione di " + NativePricePresentation.category(drink) + "; non è una foto del locale");
        String name = filename(drink);
        Bitmap cached = CACHE.containsKey(name) ? CACHE.get(name).get() : null;
        if (cached == null) {
            try (InputStream in = context.getAssets().open("reference-drinks/" + name)) {
                BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 2;
                cached = BitmapFactory.decodeStream(in, null, options);
                if (cached != null) CACHE.put(name, new SoftReference<>(cached));
            } catch (IOException absent) { /* Missing artwork stays neutral; never fabricate a venue photograph. */ }
        }
        photo = cached;
        if(photo==null)setContentDescription("Illustrazione del drink non disponibile");
    }
    static String filename(RecommendationDrink drink) {
        return switch (drink) {
            case BEER_DRAFT -> "beer-scene.jpg";
            case SPRITZ -> "spritz-scene.jpg";
            case GIN_TONIC, GIN_LEMON -> "gin-tonic-scene.jpg";
            case WINE_GLASS -> "wine-scene.jpg";
            default -> drink.code.replace('_', '-') + "-scene.jpg";
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
        }
        canvas.restore();
    }
}
