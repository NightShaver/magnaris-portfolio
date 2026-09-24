import * as THREE from "three";

import type { Member } from "./site";

/* ==========================================================================
   THE READING PLATES
   --------------------------------------------------------------------------
   What a founder's skills look like on the lectern in front of their podium.

   This replaced a portrait panel on the end wall, and the change of format is
   the change of idea. A portrait is 3:4 and hangs at eye level, so it competes
   with the pictures in the aisles; a museum label is wide, waist high and
   angled up at the reader, so it explains the thing on the podium instead of
   being another thing to look at.

   Drawn to a canvas rather than shipped as an image: the text comes out of
   lib/site.ts, and a label baked into a PNG is a label that goes stale the
   first time somebody edits a skill and does not open Photoshop.

   The plate is modelled in Blender at 0.72 x 0.4 m and carries a 0..1 unwrap,
   so this canvas has to hold that ratio or the type arrives stretched.
   ========================================================================== */

const WIDTH = 1152;
const HEIGHT = 640;

/** Cyan. The same accent the podium's light channel and the wall joints use. */
const CYAN = "#3FE3E0";
const INK = "#060a10";

const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

/**
 * Break a line to fit, and give up gracefully rather than overflowing.
 * Returns the lines that fit within `maxLines`; the last one is ellipsised.
 */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (lines.length < maxLines && line) lines.push(line);

  const last = lines.length - 1;
  while (last >= 0 && ctx.measureText(lines[last]).width > maxWidth) {
    lines[last] = `${lines[last].slice(0, -2)}…`;
  }
  return lines;
}

/**
 * One lectern plate.
 *
 * Returns the texture and nothing else: unlike the case plates there is no
 * image to wait for, so there is nothing to repaint later.
 */
export function createSkillPlate(member: Member): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const pad = 62;

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // A cold gradient from the top left, so the plate reads as lit by the
    // podium's own channel rather than as a flat sticker.
    const sheen = ctx.createLinearGradient(0, 0, WIDTH * 0.8, HEIGHT);
    sheen.addColorStop(0, "rgba(63,227,224,0.10)");
    sheen.addColorStop(0.55, "rgba(63,227,224,0.02)");
    sheen.addColorStop(1, "rgba(6,10,16,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The one cyan element: a rule down the left, the way the joints run.
    ctx.fillStyle = CYAN;
    ctx.fillRect(pad, pad, 4, HEIGHT - pad * 2);

    const left = pad + 34;
    const column = WIDTH - left - pad;

    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "#E8EEF4";
    ctx.font = `600 76px ${FONT}`;
    ctx.fillText(member.name, left, pad + 76);

    ctx.fillStyle = "rgba(160,176,192,0.9)";
    ctx.font = `400 34px ${FONT}`;
    ctx.fillText(member.role.toUpperCase(), left, pad + 128);

    ctx.strokeStyle = "rgba(141,152,166,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left, pad + 166);
    ctx.lineTo(WIDTH - pad, pad + 166);
    ctx.stroke();

    ctx.fillStyle = "rgba(196,208,220,0.82)";
    ctx.font = `400 31px ${FONT}`;
    let y = pad + 222;
    for (const line of wrap(ctx, member.detail, column, 2)) {
      ctx.fillText(line, left, y);
      y += 44;
    }

    /**
     * The skills, one per line with a cyan tick.
     *
     * One column, not two. Two fitted the shape of the plate and not the
     * length of the content: "Asset-Pipelines (GLTF / Draco / KTX2)" is
     * thirty-seven characters, which at a readable size does not go in half of
     * 1152 pixels, so the longest and most specific entry on the plate was the
     * one that got an ellipsis. Down the full width every line fits whole.
     *
     * Anchored to the bottom rather than flowed on from the line above, which
     * keeps the layout honest when one founder has a one line detail and the
     * other has two: flowed, the short one left a third of the plate empty and
     * read as a label somebody forgot to finish.
     *
     * Six entries. A seventh would land on the bottom edge, so the list is cut
     * rather than shrunk — a label that has to be squinted at says less than
     * one that says less.
     */
    const rowHeight = 44;
    const usable = WIDTH - left - pad - 30;
    const lastRow = HEIGHT - pad - 12;
    ctx.font = `400 30px ${FONT}`;
    member.skills.slice(0, 6).forEach((skill, index) => {
      const baseline = lastRow - (5 - index) * rowHeight;

      ctx.fillStyle = CYAN;
      ctx.fillRect(left, baseline - 10, 12, 2);

      ctx.fillStyle = "rgba(223,231,240,0.92)";
      const [line] = wrap(ctx, skill, usable, 1);
      ctx.fillText(line ?? skill, left + 28, baseline);
    });
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  /**
   * flipY stays at its default, and the default is the right answer here.
   *
   * Every other texture in this room is loaded next to a glTF and gets
   * flipY = false to match the glTF UV origin — see configure() in
   * BakedHall.tsx. This one does not, and the reason is that it is not a
   * loaded image: a canvas is drawn top down, the plate's unwrap runs bottom
   * up, and flipY is exactly the knob for that. Forcing it to false put the
   * founder's name along the bottom edge of the lectern with every line above
   * it in reverse order — readable, upside down, and wrong.
   */
  texture.needsUpdate = true;
  return texture;
}
