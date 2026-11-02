// WCAG relative luminance for the opaque computed sRGB colours exercised here.
export function contrastRatio(first, second) {
  function luminance(value) {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length < 3 || (channels.length > 3 && channels[3] !== 1))
      throw new Error("Contrast fixture requires opaque computed sRGB colours");
    const linear = channels.slice(0, 3).map((channel) => {
      const s = channel / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  }
  const values = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
