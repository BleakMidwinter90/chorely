/**
 * Generates the app icons from a single vector definition.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark is the balance ring: one circle divided into unequal arcs, which is
 * the same idea the Balance screen draws as a bar. It reads at 16px, it is not
 * a literal broom, and it means something — which is more than most app icons
 * manage.
 *
 * Committed as PNGs so neither the Docker build nor CI needs an image
 * toolchain; re-run this only when the mark itself changes.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const PINE = '#2c5548';
const BONE = '#fcfbf8';

/**
 * Three arcs at 60%, 25% and 15% of the circle — a deliberately uneven split,
 * because an even one would draw as a plain ring and say nothing.
 */
const SHARES = [0.6, 0.25, 0.15];

/**
 * How much clear space to leave between arcs, in degrees of visible gap.
 *
 * This is not the same as the geometric gap. A round line cap extends the
 * stroke by half its width past each endpoint, which at this stroke weight eats
 * roughly eight degrees at each end — enough to close a naive gap completely
 * and render the mark as a plain unbroken ring.
 */
const VISIBLE_GAP_DEGREES = 11;

function polar(cx, cy, radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

function arcPath(cx, cy, radius, startDeg, endDeg) {
  const [x1, y1] = polar(cx, cy, radius, startDeg);
  const [x2, y2] = polar(cx, cy, radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * @param size    canvas size in px
 * @param padding fraction of the canvas kept clear around the mark. Maskable
 *                icons are cropped to a circle by the launcher, so they need a
 *                much larger safe area than a standard icon.
 */
function markSvg(size, { padding = 0.24, background = PINE } = {}) {
  const cx = size / 2;
  const radius = (size / 2) * (1 - padding);
  const stroke = size * 0.092;

  // Half the stroke, expressed as an angle at this radius: exactly how far a
  // round cap overshoots the path's endpoint.
  const capDegrees = ((stroke / 2 / radius) * 180) / Math.PI;
  const gap = VISIBLE_GAP_DEGREES + capDegrees * 2;

  let cursor = 0;
  const arcs = SHARES.map((share) => {
    const start = cursor + gap / 2;
    const end = cursor + share * 360 - gap / 2;
    cursor += share * 360;
    return `<path d="${arcPath(cx, cx, radius, start, end)}" fill="none" stroke="${BONE}" stroke-width="${stroke.toFixed(2)}" stroke-linecap="round" />`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${background}"/>
  ${arcs}
</svg>`;
}

const OUTPUTS = [
  { file: 'public/icons/icon-192.png', size: 192, options: {} },
  { file: 'public/icons/icon-512.png', size: 512, options: {} },
  // Maskable icons get cropped to whatever shape the launcher prefers, so the
  // mark sits well inside the 80% safe zone.
  { file: 'public/icons/maskable-512.png', size: 512, options: { padding: 0.34 } },
  { file: 'public/icons/apple-touch-icon.png', size: 180, options: { padding: 0.22 } },
  { file: 'public/icons/favicon-32.png', size: 32, options: { padding: 0.18 } },
];

await mkdir('public/icons', { recursive: true });

for (const { file, size, options } of OUTPUTS) {
  const svg = markSvg(size, options);
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(file, png);
  console.log(`${file}  ${size}×${size}  ${(png.length / 1024).toFixed(1)} kB`);
}

// Kept as a vector too, for the README and anywhere that can take an SVG.
await writeFile('public/icons/mark.svg', markSvg(512));
console.log('public/icons/mark.svg');
