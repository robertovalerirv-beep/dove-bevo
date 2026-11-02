package com.dovebevo.app;

import static org.junit.Assert.*;
import java.nio.file.Path;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.Test;
import org.w3c.dom.NodeList;

/** Contrast is measured from shipped resources, not duplicate test palette values. */
public final class NativeAppearanceContrastTest {
    private static int color(String name) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        NodeList colors = factory.newDocumentBuilder()
                .parse(Path.of("src/main/res/values/colors.xml").toFile()).getElementsByTagName("color");
        for (int index = 0; index < colors.getLength(); index++) {
            org.w3c.dom.Element element = (org.w3c.dom.Element) colors.item(index);
            if (name.equals(element.getAttribute("name"))) {
                String value = element.getTextContent().trim();
                assertTrue("Opaque RGB resource required: " + name, value.matches("#[0-9A-Fa-f]{6}"));
                return Integer.parseInt(value.substring(1), 16);
            }
        }
        throw new AssertionError("Missing shipped color: " + name);
    }

    @Test public void originalOrangePrimaryUsesReadableDarkTextInsteadOfWhite() throws Exception {
        int fill = color("colorPrimary");
        assertEquals("Restore the existing original brand orange", color("ic_launcher_background"), fill);
        assertEquals(fill, color("colorAccent"));
        assertTrue(contrast(color("on_brand"), fill) >= 4.5);
        assertTrue("White on the bright brand orange is not an accessible substitute", contrast(color("surface"), fill) < 4.5);
    }

    @Test public void selectedOrangeTextAndIconsRemainLegibleOnBothNativeSurfaces() throws Exception {
        int selected = color("brand_text");
        assertTrue((selected >> 16 & 255) > (selected >> 8 & 255));
        assertTrue((selected >> 8 & 255) > (selected & 255));
        for (String background : new String[]{"surface", "shell_background"}) {
            assertTrue("Selected text on " + background, contrast(selected, color(background)) >= 4.5);
            assertTrue("Selected icons on " + background, contrast(selected, color(background)) >= 3);
            assertTrue("Unselected labels on " + background, contrast(color("muted_text"), color(background)) >= 4.5);
        }
        assertTrue("Recommendation semantic green stays accessible", contrast(color("positive_text"), color("positive_surface")) >= 4.5);
    }

    private static double contrast(int first, int second) {
        double a = luminance(first), b = luminance(second);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    }

    private static double luminance(int rgb) {
        return .2126 * linear(rgb >> 16 & 255) + .7152 * linear(rgb >> 8 & 255) + .0722 * linear(rgb & 255);
    }

    private static double linear(int channel) {
        double value = channel / 255.0;
        return value <= .04045 ? value / 12.92 : Math.pow((value + .055) / 1.055, 2.4);
    }
}
