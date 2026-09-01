import * as THREE from "three";

import type { Member } from "./site";

const WIDTH = 900;
const HEIGHT = 1200;

/**
 * The founder panels on the end wall of the walkable room.
 *
 * Same idea as the case plates: the layout is drawn to a canvas, and a real
 * portrait — `/team/<slug>.jpg`, 3:4 — is painted in behind it when one
 * exists. Without a photo the panel still reads as a finished exhibit rather
 * than an empty frame.
 */
export type PortraitPanel = {
  texture: THREE.CanvasTexture;
  paint: (image: HTMLImageElement) => void;
};

export function createPortraitPanel(member: Member): PortraitPanel {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");
  const accent = member.accent === "teal" ? "#0F8E91" : "#6F63C7";

  const render = (image?: HTMLImageElement) => {
    if (!ctx) return;

    ctx.fillStyle = "#0B0F18";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (image) {
      const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      ctx.drawImage(image, (WIDTH - drawWidth) / 2, 0, drawWidth, drawHeight);
    } else {
      // Placeholder: a soft accent light where a head would be.
      const glow = ctx.createRadialGradient(
        WIDTH / 2,
        HEIGHT * 0.34,
        30,
        WIDTH / 2,
        HEIGHT * 0.34,
        WIDTH * 0.62,
      );
      glow.addColorStop(0, `${accent}66`);
      glow.addColorStop(1, "rgba(11,15,24,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(141,152,166,0.22)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT * 0.33, 150, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT * 0.74, 285, Math.PI, Math.PI * 2);
      ctx.stroke();
    }

    // Scrim over the lower two thirds so the type always holds.
    const scrim = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT * 0.22);
    scrim.addColorStop(0, "rgba(11,15,24,0.97)");
    scrim.addColorStop(0.55, "rgba(11,15,24,0.82)");
    scrim.addColorStop(1, "rgba(11,15,24,0)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = "left";

    ctx.fillStyle = accent;
    ctx.font = "500 26px ui-monospace, monospace";
    ctx.fillText(member.role.toUpperCase(), 64, HEIGHT * 0.5);

    // The name is set to fit the panel: long titles shrink rather than run
    // off the edge, and only stop shrinking at a readable floor.
    ctx.fillStyle = "#F3F6F8";
    fitText(ctx, member.name, WIDTH - 128, 74, 44, "600", "Inter, system-ui, sans-serif");
    ctx.fillText(member.name, 62, HEIGHT * 0.565);

    ctx.fillStyle = "#8D98A6";
    ctx.font = "400 27px Inter, system-ui, sans-serif";
    wrap(ctx, member.detail, 64, HEIGHT * 0.615, WIDTH - 128, 36);

    ctx.fillStyle = accent;
    ctx.fillRect(64, HEIGHT * 0.665, 96, 3);

    member.skills.forEach((skill, index) => {
      const y = HEIGHT * 0.71 + index * 52;

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(72, y - 9, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#C6CFDA";
      ctx.font = "400 27px ui-monospace, monospace";
      ctx.fillText(skill, 98, y);
    });

    ctx.strokeStyle = "rgba(243,246,248,0.25)";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, WIDTH - 52, HEIGHT - 52);
  };

  render();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return {
    texture,
    paint: (image: HTMLImageElement) => {
      render(image);
      texture.needsUpdate = true;
    },
  };
}

/** Shrinks the font until the text fits `maxWidth`, down to `minSize`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: string,
  family: string,
) {
  let size = startSize;

  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size > minSize);

  ctx.font = `${weight} ${minSize}px ${family}`;
  return minSize;
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  let cursor = y;

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
      return;
    }
    line = candidate;
  });

  if (line) ctx.fillText(line, x, cursor);
}
