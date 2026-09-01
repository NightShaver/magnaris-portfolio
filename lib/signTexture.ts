import * as THREE from "three";

const SIZE = 1024;

/**
 * The panel behind the contact door.
 *
 * It has to say "contact" before anyone reads a word of it, so the mail
 * pictogram carries the meaning and the type only confirms it. Canvas rather
 * than DOM, like every other label in the room: depth-tested, one texture.
 */
export function createSignTexture(
  email = "hallo@magnaris.studio",
  accent = "#0F8E91",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Backing plate with a soft accent glow behind the icon.
    const glow = ctx.createRadialGradient(
      SIZE / 2,
      SIZE * 0.38,
      20,
      SIZE / 2,
      SIZE * 0.38,
      SIZE * 0.55,
    );
    glow.addColorStop(0, "rgba(15,142,145,0.35)");
    glow.addColorStop(1, "rgba(11,15,24,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, SIZE, SIZE);

    drawEnvelope(ctx, SIZE / 2, SIZE * 0.36, 380, accent);

    ctx.textAlign = "center";

    ctx.fillStyle = accent;
    ctx.font = "500 30px ui-monospace, monospace";
    ctx.fillText("MAGNARIS / KONTAKT", SIZE / 2, SIZE * 0.63);

    ctx.fillStyle = "#F3F6F8";
    ctx.font = "600 96px Inter, system-ui, sans-serif";
    ctx.fillText("Schreib uns", SIZE / 2, SIZE * 0.72);

    ctx.fillStyle = "#C6CFDA";
    ctx.font = "400 40px ui-monospace, monospace";
    ctx.fillText(email, SIZE / 2, SIZE * 0.785);

    // Call to action, drawn as a pill so it reads as clickable.
    const pill = { width: 470, height: 92, y: SIZE * 0.83 };
    roundedRect(
      ctx,
      SIZE / 2 - pill.width / 2,
      pill.y,
      pill.width,
      pill.height,
      pill.height / 2,
    );
    ctx.fillStyle = "#F3F6F8";
    ctx.fill();

    ctx.fillStyle = "#111723";
    ctx.font = "600 38px Inter, system-ui, sans-serif";
    ctx.fillText("Projekt starten  ↗", SIZE / 2, pill.y + 60);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Line-art envelope with an open flap — the icon does the explaining. */
function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  accent: string,
) {
  const height = width * 0.68;
  const x = cx - width / 2;
  const y = cy - height / 2;

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Body
  ctx.fillStyle = "rgba(11,15,24,0.75)";
  roundedRect(ctx, x, y, width, height, 26);
  ctx.fill();

  ctx.strokeStyle = accent;
  ctx.lineWidth = 8;
  roundedRect(ctx, x, y, width, height, 26);
  ctx.stroke();

  // Flap
  ctx.beginPath();
  ctx.moveTo(x + 14, y + 22);
  ctx.lineTo(cx, y + height * 0.58);
  ctx.lineTo(x + width - 14, y + 22);
  ctx.strokeStyle = "#F3F6F8";
  ctx.lineWidth = 8;
  ctx.stroke();

  // Outgoing line, so it reads as sending rather than storing.
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.1, y + height + 46);
  ctx.lineTo(cx + width * 0.1, y + height + 46);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.restore();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
