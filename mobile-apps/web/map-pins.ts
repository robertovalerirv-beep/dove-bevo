import type { Tier } from "@site/app/lib/tiers";

const FILL: Record<Tier, string> = {
  affare: "#c5f23e",
  giusto: "#fffbf4",
  salato: "#6e1a4e",
  neutro: "#f6e9d6",
};
const GLYPH: Record<Tier, string> = { affare: "↓", giusto: "=", salato: "↑", neutro: "" };

/** Happy-hour semantics stay visible without squeezing the whole phrase into the price circle. */
export function mobilePinLabel(label: string): { amount: string; detail: string } {
  const cue = (suffix?: string) => (suffix?.toUpperCase() === "MENU" ? "M+" : suffix ? "HH" : "");
  const count = /^([1-9][0-9]*) (VOCE|VOCI|PREZZO|PREZZI)$/.exec(label.trim());
  if (count)
    return {
      amount: count[1] ?? "",
      detail: count[2] === "VOCE" || count[2] === "VOCI" ? "MENU" : "PREZZI",
    };
  const pounds =
    /^£\s*([0-9]+[.,][0-9]{2})(?:\s+(.+))?$/.exec(label.trim()) ??
    /^([0-9]+[.,][0-9]{2})\s*£(?:\s+(.+))?$/.exec(label.trim());
  if (pounds?.[1])
    return { amount: pounds[1], detail: ["£", cue(pounds[2])].filter(Boolean).join(" ") };
  const match = /^(.*?)\s*€(?:\s+(.+))?$/.exec(label.trim());
  return { amount: match?.[1]?.trim() ?? label.trim(), detail: cue(match?.[2]) };
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
  context.shadowColor = stale ? "transparent" : "rgba(27,22,17,0.18)";
  context.shadowBlur = 6;
  context.shadowOffsetY = 2;
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
  context.lineWidth = 1;
  context.setLineDash(stale ? [3, 2] : []);
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.arc(28, 27, 19, 0, Math.PI * 2);
  context.fillStyle = FILL[tier];
  context.fill();
  context.fillStyle = tier === "salato" ? "#fffbf4" : "#1b1611";
  context.font = `${stale ? "italic " : ""}700 14px -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const text = mobilePinLabel(label);
  context.fillText(text.amount, 28, 28, 35);
  // Preserve the original non-colour tier cue for colour-blind readers.
  context.fillStyle = "#1b1611";
  context.font = "700 11px sans-serif";
  context.fillText([GLYPH[tier], text.detail].filter(Boolean).join(" "), 28, 52);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}
