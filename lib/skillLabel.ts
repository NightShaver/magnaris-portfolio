import * as THREE from "three";

/* ==========================================================================
   THE SKILL LABEL
   --------------------------------------------------------------------------
   What appears in the air beside a planet or a node when the crosshair finds
   it: the name of the skill that body stands for.

   A textured plane, not <Html>. The same reason the wall captions are one —
   a DOM overlay cannot be depth-tested, so a label on the far podium would
   shine through the arcade, through the hidden wall and out of the building.
   A plane is geometry: it is occluded by whatever is in front of it, it takes
   the room's exposure, and it costs one draw call instead of a DOM node that
   has to be repositioned every frame.

   One texture per skill, made once and kept. Twelve short strings, redrawn
   never.
   ========================================================================== */

const HEIGHT = 128;
const PAD = 26;
const FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const CYAN = "#3FE3E0";

/** Ratio of the drawn canvas, so the plane can be sized without guessing. */
export type SkillLabel = {
  texture: THREE.CanvasTexture;
  /** Width divided by height. The mesh uses this to avoid stretching the type. */
  aspect: number;
};

/**
 * Draw one label.
 *
 * The canvas is sized to the text rather than the text fitted to the canvas:
 * "Shader & VFX" and "Asset-Pipelines (GLTF / Draco / KTX2)" are very
 * different widths, and a fixed plate would either crop the long one or leave
 * the short one floating in a field of empty pill.
 */
export function createSkillLabel(text: string): SkillLabel {
  const measure = document.createElement("canvas").getContext("2d");
  const font = `500 46px ${FONT}`;
  let width = 320;
  if (measure) {
    measure.font = font;
    width = Math.ceil(measure.measureText(text).width) + PAD * 2 + 26;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    const radius = HEIGHT / 2 - 18;
    const top = 18;
    const bottom = HEIGHT - 18;

    // The plate. Dark and mostly transparent, so it reads as a light on the
    // air rather than as a sticker hanging in the room.
    ctx.beginPath();
    ctx.moveTo(radius + 2, top);
    ctx.lineTo(width - radius - 2, top);
    ctx.arcTo(width - 2, top, width - 2, bottom, radius);
    ctx.arcTo(width - 2, bottom, width - radius - 2, bottom, radius);
    ctx.lineTo(radius + 2, bottom);
    ctx.arcTo(2, bottom, 2, top, radius);
    ctx.arcTo(2, top, radius + 2, top, radius);
    ctx.closePath();

    ctx.fillStyle = "rgba(6,10,16,0.94)";
    ctx.fill();
    ctx.strokeStyle = "rgba(63,227,224,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // The tick, same mark the lectern list uses for each entry.
    ctx.fillStyle = CYAN;
    ctx.fillRect(PAD, HEIGHT / 2 - 1, 12, 2);

    ctx.font = font;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#E8EEF4";
    ctx.fillText(text, PAD + 26, HEIGHT / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;

  return { texture, aspect: width / HEIGHT };
}
