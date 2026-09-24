/* ==========================================================================
   THE LITE TEXTURE SET
   --------------------------------------------------------------------------
   Writes a second, smaller copy of public/room/ into public/room/lite/.

   The reason is not download size. The full set is 2.9 MB over the wire, which
   a phone manages; what a phone does not manage is what those files become
   once they are decoded. A texture in GPU memory is uncompressed RGBA plus its
   mip chain, so the 481 kB hall lightmap is 22 MB resident and the set as a
   whole is about 75 MB. iOS Safari kills a tab that asks for that on top of a
   WebGL context, and the failure mode is not a slow room, it is a white page.

   Halving every dimension quarters that: about 19 MB, which fits.

   Which map gets how much is not uniform, because they are not doing the same
   job. A lightmap is a low-frequency gradient across a whole building and
   survives losing half its resolution almost invisibly. A tiling normal map
   is high-frequency by definition and goes to mush, so those are cut hardest
   and then leaned on less at runtime. The arcade's albedo is unique per column
   and carries the marble's veining, so it keeps the most.

   Run with `npm run room:lite` after every export from Blender. The output is
   committed, because the static build has no image pipeline of its own.
   ========================================================================== */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.join(HERE, "..", "public", "room");
const OUT = path.join(ROOM, "lite");

/**
 * Longest edge each kind of map is allowed on the lite tier.
 *
 * Read as a cap, not a scale: a file already under its cap is copied at its
 * own size rather than being upscaled to meet it.
 */
const CAPS = [
  [/^hall_lightmap/, 1024],
  [/_lightmap/, 512],
  [/^arcade_albedo/, 768],
  [/_normal/, 256],
  [/_rough/, 256],
  [/_diffuse/, 512],
];

/** WebP settings. Quality is a touch lower than the full set; these are seen small. */
const ENCODE = { quality: 78, effort: 5 };

function capFor(name) {
  for (const [pattern, size] of CAPS) if (pattern.test(name)) return size;
  return 512;
}

const files = (await fs.readdir(ROOM)).filter((f) => f.endsWith(".webp"));
if (!files.length) throw new Error(`Keine .webp in ${ROOM} — erst exportieren.`);

await fs.mkdir(OUT, { recursive: true });

let before = 0;
let after = 0;
let residentBefore = 0;
let residentAfter = 0;

for (const name of files.sort()) {
  const source = path.join(ROOM, name);
  const target = path.join(OUT, name);
  const cap = capFor(name);

  const image = sharp(source);
  const { width, height } = await image.metadata();
  const edge = Math.max(width, height);
  const scale = Math.min(1, cap / edge);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  await image.resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .webp(ENCODE)
    .toFile(target);

  const inBytes = (await fs.stat(source)).size;
  const outBytes = (await fs.stat(target)).size;
  before += inBytes;
  after += outBytes;
  // RGBA plus a full mip chain, which is what the GPU actually holds.
  residentBefore += width * height * 4 * (4 / 3);
  residentAfter += w * h * 4 * (4 / 3);

  console.log(
    `${name.padEnd(26)} ${String(width).padStart(4)}x${String(height).padEnd(5)}` +
      ` -> ${String(w).padStart(4)}x${String(h).padEnd(5)}` +
      ` ${(inBytes / 1024).toFixed(0).padStart(4)} kB -> ${(outBytes / 1024).toFixed(0).padStart(4)} kB`,
  );
}

const mb = (bytes) => (bytes / 1048576).toFixed(1);
console.log(
  `\n${files.length} Dateien\n` +
    `  Download  ${mb(before)} MB -> ${mb(after)} MB\n` +
    `  Im GPU-Speicher  ${mb(residentBefore)} MB -> ${mb(residentAfter)} MB`,
);
