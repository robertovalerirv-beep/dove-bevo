import type { Tier } from "@site/app/lib/tiers";

const FILL: Record<Tier, string> = {
  affare: "#c5f23e",
  giusto: "#fffbf4",
  salato: "#6e1a4e",
  neutro: "#ff5a1f",
};
const GLYPH: Record<Tier, string> = { affare: "↓", giusto: "=", salato: "↑", neutro: "" };

/** Keep source and currency visible without mistaking a menu count for a drink price. */
export function mobilePinLabel(label: string): {
  amount: string;
  currency: string;
  detail: string;
} {
  const cue = (suffix?: string) => {
    const value = suffix?.trim().toUpperCase();
    if (value === "MENU") return "MENU";
    if (value === "HH" || value === "HAPPY HOUR") return "HH";
    return "";
  };
  const count = /^([1-9][0-9]*) (VOCE|VOCI|PREZZO|PREZZI)$/.exec(label.trim());
  if (count)
    return {
      amount: count[1] ?? "",
      currency: "",
      detail: count[2] === "VOCE" || count[2] === "VOCI" ? "MENU" : "PREZZI",
    };
  const pounds =
    /^£\s*([0-9]+[.,][0-9]{2})(?:\s+(.+))?$/.exec(label.trim()) ??
    /^([0-9]+[.,][0-9]{2})\s*£(?:\s+(.+))?$/.exec(label.trim());
  if (pounds?.[1]) return { amount: pounds[1], currency: "£", detail: cue(pounds[2]) };
  const euros = /^([0-9]+[.,][0-9]{2})\s*€(?:\s+(.+))?$/.exec(label.trim());
  if (euros?.[1]) return { amount: euros[1], currency: "€", detail: cue(euros[2]) };
  return { amount: label.trim(), currency: "", detail: "" };
}

/** Semantic data annotation; numbers and tiers come unchanged from the shared map contract. */
export function mobilePinImage(tier: Tier, stale: boolean, label: string): ImageData {
  const ratio = 2,
    width = 56,
    height = 68;
  const canvas = document.createElement("canvas");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext("2d");
  if (!context) return new ImageData(canvas.width, canvas.height);
  context.scale(ratio, ratio);
  context.shadowColor = stale ? "transparent" : "rgba(27,22,17,0.24)";
  context.shadowBlur = 8;
  context.shadowOffsetY = 3;
  context.beginPath();
  context.moveTo(28, 60);
  context.bezierCurveTo(22, 52, 5, 43, 5, 27);
  context.arc(28, 27, 23, Math.PI, 0);
  context.bezierCurveTo(51, 43, 34, 52, 28, 60);
  context.closePath();
  context.fillStyle = "#fffbf4";
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = stale ? "#5e554b" : "#1b1611";
  context.lineWidth = 1.5;
  context.setLineDash(stale ? [3, 2] : []);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.arc(28, 27, 20, 0, Math.PI * 2);
  context.fillStyle = FILL[tier];
  context.fill();
  context.strokeStyle = stale ? "#5e554b" : "#1b1611";
  context.lineWidth = 1;
  context.stroke();
  context.fillStyle = tier === "salato" ? "#fffbf4" : "#1b1611";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const text = mobilePinLabel(label);
  context.font = `${stale ? "italic " : ""}700 14px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.fillText(text.amount, 28, text.currency ? 22 : 28, 38);
  if (text.currency) {
    context.font = "700 11px -apple-system, BlinkMacSystemFont, sans-serif";
    context.fillText(text.currency, 28, 38, 38);
  }
  // Preserve the original non-colour tier cue for colour-blind readers.
  context.fillStyle = "#1b1611";
  context.font = "700 10px -apple-system, BlinkMacSystemFont, sans-serif";
  context.fillText([GLYPH[tier], text.detail].filter(Boolean).join(" "), 28, 52, 46);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
