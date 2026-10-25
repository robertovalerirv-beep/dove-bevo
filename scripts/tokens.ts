// Design tokens (SPEC 2.10, ADR 0023): docs/brand/tokens.json → src/app/styles/tokens.css.
// Pure: the CLI (build-tokens.mjs) does the I/O. Kit names are kept; what the kit does not define
// (targets, switch, durations, fallbacks) is ours and lives in OWN below.

import { UNDO_MS } from "../src/shared/config.ts";

type Themed = { light: string; dark: string };
interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: string;
  fontWeight: number;
  letterSpacing?: string;
}
export interface BrandTokens {
  color: { tokens: { name: string; value: Themed }[] };
  type: {
    fonts: { family: string; file: string; weight: string }[];
    families: Record<string, string>;
    groups: { family: string; styles: TypeStyle[] }[];
  };
  spacing: { tokens: { name: string; value: string }[] };
  radius: { tokens: { name: string; value: string }[] };
  shadow: { tokens: { name: string; value: Themed }[] };
  border: { tokens: { name: string; value: string }[] };
}

/** Text/background pairs allowed by the notes of tokens.json; MB-03 checks them in both themes. */
export const TEXT_PAIRS: readonly [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["ink", "surface-2"],
  ["ink-muted", "bg"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-2"],
  ["on-spritz", "spritz"],
  ["spritz-text", "bg"],
  ["spritz-text", "surface"],
  ["on-affare", "affare"],
  ["on-giusto", "giusto"],
  ["on-salato", "salato"],
];
/** Non-text contrast (≥ 3:1): control borders and the focus ring on the page. */
export const UI_PAIRS: readonly [string, string][] = [
  ["ink", "bg"],
  ["ink", "surface"],
  ["focus", "bg"],
  ["focus", "surface"],
  ["map-me", "map-land"],
  ["verified", "bg"],
  ["verified", "surface"],
];

/**
 * Metric-matched local fallbacks, so swapping in the web font does not move the layout (CLS).
 * Measured from the woff2 files (head, hhea, OS/2) against Arial (xAvgCharWidth 904/2048) and
 * Courier New (1229/2048): size-adjust = avg width ratio, overrides = ascent/descent ÷ size-adjust.
 */
const FALLBACKS = [
  { family: "Bricolage Fallback", local: "Arial", size: "124%", ascent: "75%", descent: "21.8%" },
  {
    family: "Geist Mono Fallback",
    local: "Courier New",
    size: "100%",
    ascent: "100.5%",
    descent: "29.5%",
  },
];

const OWN = `  /* Ours, not in the kit (ADR 0023): targets, controls, motion, layers. */
  --target: 48px;
  --target-primary: 56px;
  --target-row: 64px;
  --tile-min-h: 88px;
  --control-sm: 24px;
  --icon-md: 24px;
  --size-legal: 11px;
  --switch-w: 48px;
  --switch-h: 28px;
  --switch-knob: 20px;
  --switch-inset: 2px;
  --sheet-max-width: 640px;
  --toast-duration: ${String(UNDO_MS / 1000)}s;
  --focus-width: 3px;
  --focus-offset: 2px;
  --press: 3px;
  --duration-tap: 120ms;
  --duration-sheet: 180ms;
  --duration-stamp: 260ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-bounce: cubic-bezier(0.3, 1.6, 0.5, 1);
  --error: var(--spritz-text);
  --shadow-sheet: 0 -2px 16px rgb(0 0 0 / 0.18);
  --color-backdrop: rgb(27 22 17 / 0.45);`;

const OWN_DARK = `  --shadow-sheet: 0 -2px 16px rgb(0 0 0 / 0.5);
  --color-backdrop: rgb(0 0 0 / 0.6);`;

const varName = (family: string) => `--font-${family}`;

export function renderTokens(t: BrandTokens): string {
  const colors = (theme: "light" | "dark", indent: string) =>
    t.color.tokens.map((c) => `${indent}--${c.name}: ${c.value[theme].toLowerCase()};`).join("\n");
  const shadows = (theme: "light" | "dark", indent: string) =>
    t.shadow.tokens.map((s) => `${indent}--${s.name}: ${s.value[theme].toLowerCase()};`).join("\n");
  const light = (name: string) => {
    const token = t.color.tokens.find((c) => c.name === name);
    if (!token) throw new Error(`missing color token ${name}`);
    return token.value.light.toLowerCase();
  };
  const plain = (list: { name: string; value: string }[]) =>
    list.map((x) => `  --${x.name}: ${x.value};`).join("\n");
  const type = t.type.groups
    .flatMap((g) =>
      g.styles.map((s) =>
        [
          `  --type-${s.name}: ${String(s.fontWeight)} ${s.fontSize}/${s.lineHeight} var(${varName(g.family)});`,
          `  --tracking-${s.name}: ${s.letterSpacing ?? "normal"};`,
          `  --size-${s.name}: ${s.fontSize};`,
        ].join("\n"),
      ),
    )
    .join("\n");
  const fallbackOf = (family: string) =>
    FALLBACKS.find((f) => f.family.split(" ")[0] === family.split(" ")[0])?.family ?? family;
  const families = Object.entries(t.type.families)
    .map(([key, stack]) => {
      const first = /^"([^"]+)"/.exec(stack)?.[1] ?? "";
      return `  ${varName(key)}: ${stack.replace(`"${first}",`, `"${first}", "${fallbackOf(first)}",`)};`;
    })
    .join("\n");
  const faces = t.type.fonts
    .map(
      (f) => `@font-face {
  font-family: "${f.family}";
  src: url("/fonts/${f.file.replace(/^fonts\//, "")}") format("woff2");
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
}`,
    )
    .join("\n");
  const fallbacks = FALLBACKS.map(
    (f) => `@font-face {
  font-family: "${f.family}";
  src: local("${f.local}");
  size-adjust: ${f.size};
  ascent-override: ${f.ascent};
  descent-override: ${f.descent};
  line-gap-override: 0%;
}`,
  ).join("\n");

  return `/* GENERATED by scripts/build-tokens.mjs from docs/brand/tokens.json: do not edit (SPEC 2.10). */
${faces}
${fallbacks}

:root {
  color-scheme: light;
${colors("light", "  ")}
${shadows("light", "  ")}

  /* Overlays on the light map keep the Bancone values in both themes until the dark map (D-27). */
  --map-pill-bg: ${light("surface")};
  --map-pill-text: ${light("ink")};
  --map-pill-border: ${light("ink")};
  --map-focus: ${light("focus")};

${families}
${type}
  --weight-regular: ${String(t.type.groups[1]?.styles[0]?.fontWeight ?? 450)};
  --weight-semibold: ${String(t.type.groups[1]?.styles[1]?.fontWeight ?? 650)};
  --weight-bold: ${String(t.type.groups[0]?.styles[0]?.fontWeight ?? 800)};

${plain(t.spacing.tokens)}
${plain(t.radius.tokens)}
${plain(t.border.tokens)}

${OWN}
}

/* Fuori orario: chosen by the hour, not by the system setting (src/shared/theme.ts, ADR 0025). */
:root[data-theme="dark"] {
  color-scheme: dark;
${colors("dark", "  ")}
${shadows("dark", "  ")}
${OWN_DARK}
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-tap: 0ms;
    --duration-sheet: 0ms;
    --duration-stamp: 0ms;
    --press: 0px;
  }
}
`;
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** Web app manifest (SPEC 7.7, MB-01): colours from the same tokens, icons from build-icons. */
export function renderManifest(tokens: BrandTokens, name: string, description: string): string {
  const color = (token: string, theme: "light" | "dark") => {
    const found = tokens.color.tokens.find((t) => t.name === token);
    if (!found) throw new Error(`token ${token} missing`);
    return found.value[theme];
  };
  return `${JSON.stringify(
    {
      name,
      short_name: name,
      description,
      lang: "it",
      start_url: "/",
      scope: "/",
      display: "standalone",
      orientation: "portrait",
      theme_color: color("spritz", "light"),
      background_color: color("bg", "light"),
      icons: [
        { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
        {
          src: "/brand/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  )}
`;
}
