#!/usr/bin/env node
// Builds ccar-f/themes.css and keeps the stylesheets themeable. Run from the repository root:
//   node ccar-f/tools/build-themes.js          # tokenize new colors, regenerate themes.css
//   node ccar-f/tools/build-themes.js --check  # fail if a stylesheet has a raw color or themes.css is stale
//
// How it works: every color literal in a CSS declaration becomes var(--c-<rrggbb[aa]>), named after
// its original value. The default (dark) theme maps each token back to that value, so the default
// look is unchanged. The other themes are derived per color in OKLCH (perceptual lightness, chroma,
// hue): Light inverts lightness, High contrast pushes surfaces to black and text and lines to bright,
// Sepia is Light with warm, low-chroma neutrals. To add a theme, add an entry to THEMES. To reuse this
// for another site, change FILES and OUT.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const FILES = ["styles.css", "exam.css", "editorial-theme.css", "mobile-layout.css"];
const OUT = "themes.css";

// ---- Color math: sRGB <-> OKLab/OKLCH ----
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgbToOklch([r, g, b]) {
  [r, g, b] = [r, g, b].map(v => toLin(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function oklchToRgbRaw([L, C, H]) {
  const A = C * Math.cos(H * Math.PI / 180), B = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// Reduce chroma until the color fits in sRGB.
function oklchToRgb([L, C, H]) {
  L = Math.min(1, Math.max(0, L));
  let lo = 0, hi = C, rgb = oklchToRgbRaw([L, C, H]);
  const ok = (v) => v.every(x => x >= -1e-4 && x <= 1 + 1e-4);
  if (!ok(rgb)) { for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (ok(oklchToRgbRaw([L, mid, H]))) lo = mid; else hi = mid; } rgb = oklchToRgbRaw([L, lo, H]); }
  return rgb.map(v => Math.round(Math.min(1, Math.max(0, toGam(Math.min(1, Math.max(0, v))))) * 255));
}

// ---- Parsing ----
const COLOR = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3,4}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*(?:\d*\.?\d+)\s*)?\)/g;
function parse(lit) {
  if (lit[0] === "#") {
    let h = lit.slice(1);
    if (h.length <= 4) h = [...h].map(c => c + c).join("");
    const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return {rgb: n, a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1};
  }
  const v = lit.match(/[\d.]+/g).map(Number);
  return {rgb: v.slice(0, 3), a: v.length > 3 ? v[3] : 1};
}
const hex2 = (n) => n.toString(16).padStart(2, "0");
const tokenOf = ({rgb, a}) => "--c-" + rgb.map(hex2).join("") + (a < 1 ? hex2(Math.round(a * 255)) : "");
function fromToken(tok) {
  const h = tok.slice(4);
  return {rgb: [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)), a: h.length === 8 ? Math.round(parseInt(h.slice(6, 8), 16) / 255 * 1000) / 1000 : 1};
}
const css = ({rgb, a}) => a < 1 ? `rgba(${rgb.join(",")},${+a.toFixed(3)})` : "#" + rgb.map(hex2).join("");

// Replace color literals inside declaration values only, never in selectors.
function tokenize(text) {
  return text.replace(/([{;]\s*)([-\w]+)(\s*:\s*)([^;{}]*)/g, (all, pre, prop, colon, value) => {
    if (prop.startsWith("--c-")) return all;
    return pre + prop + colon + value.replace(COLOR, (lit) => `var(${tokenOf(parse(lit))})`);
  });
}

// ---- Themes ----
const isShadow = ({rgb, a}) => a < 1 && rgb.every(v => v <= 8);
const THEMES = {
  light: {label: "Light", scheme: "light", map(c) {
    if (isShadow(c)) return {rgb: c.rgb, a: Math.round(c.a * 0.35 * 1000) / 1000};
    const [L, C, H] = rgbToOklch(c.rgb);
    return {rgb: oklchToRgb([Math.min(0.985, Math.max(0.16, 1.055 - L * 0.98)), C * (L > 0.6 ? 1.05 : 0.9), H]), a: c.a};
  }},
  contrast: {label: "High contrast", scheme: "dark", map(c) {
    if (isShadow(c)) return {rgb: c.rgb, a: Math.min(1, c.a * 1.2)};
    const [L, C, H] = rgbToOklch(c.rgb);
    const L2 = L < 0.26 ? L * 0.3 : L < 0.52 ? 0.7 : Math.max(0.9, L);
    return {rgb: oklchToRgb([L2, L < 0.26 ? C * 0.4 : C * 1.15, H]), a: c.a < 1 ? Math.min(1, c.a * 1.4) : 1};
  }},
  sepia: {label: "Sepia", scheme: "light", map(c) {
    if (isShadow(c)) return {rgb: [60, 40, 20], a: Math.round(c.a * 0.3 * 1000) / 1000};
    const [L, C, H] = rgbToOklch(c.rgb);
    const L2 = Math.min(0.955, Math.max(0.2, 1.0 - L * 0.95));
    // Neutrals turn warm paper/ink; saturated accents keep their hue but sit in the same warm range.
    const neutral = C < 0.04;
    return {rgb: oklchToRgb([L2, neutral ? 0.025 + C * 0.3 : C * 0.85, neutral ? 75 : H]), a: c.a};
  }},
};

function main() {
  const check = process.argv.includes("--check");
  const tokens = new Set(), problems = [];
  for (const f of FILES) {
    const p = path.join(ROOT, f), text = fs.readFileSync(p, "utf8");
    const out = tokenize(text);
    for (const m of out.matchAll(/var\((--c-[0-9a-f]{6,8})\)/g)) tokens.add(m[1]);
    if (out !== text) { if (check) problems.push(`${f} has raw color values; run node ccar-f/tools/build-themes.js`); else fs.writeFileSync(p, out); }
  }
  const sorted = [...tokens].sort();
  const block = (sel, fn) => `${sel}{\n${sorted.map(t => `  ${t}:${css(fn(fromToken(t)))};`).join("\n")}\n}`;
  const parts = [
    "/* Generated by ccar-f/tools/build-themes.js. Do not edit by hand; edit the stylesheets or THEMES and re-run. */",
    "/* Default: the original dark palette. Each token is named after its default color. */",
    block(":root", c => c),
    ":root{color-scheme:dark}",
  ];
  for (const [name, t] of Object.entries(THEMES)) {
    parts.push(`/* ${t.label} */`, block(`:root[data-theme="${name}"]`, t.map), `:root[data-theme="${name}"]{color-scheme:${t.scheme}}`);
  }
  // "System" follows the operating system: light when it prefers light, otherwise the default.
  parts.push("/* System: follow the operating system */", "@media (prefers-color-scheme: light){", block(`:root[data-theme="system"]`, THEMES.light.map), `:root[data-theme="system"]{color-scheme:light}`, "}");
  const text = parts.join("\n") + "\n";
  const outPath = path.join(ROOT, OUT);
  if (check) {
    if (!fs.existsSync(outPath) || fs.readFileSync(outPath, "utf8") !== text) problems.push(`${OUT} is out of date; run node ccar-f/tools/build-themes.js`);
    if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
    console.log(`Themes up to date: ${sorted.length} color tokens, ${Object.keys(THEMES).length + 1} themes plus System.`);
    return;
  }
  fs.writeFileSync(outPath, text);
  console.log(`Wrote ${OUT}: ${sorted.length} color tokens, ${Object.keys(THEMES).length + 1} themes plus System.`);
}

if (require.main === module) main();
module.exports = { rgbToOklch, oklchToRgb, THEMES, tokenize };
