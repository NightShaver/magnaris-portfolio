import * as THREE from "three";

import { UPCOMING, type CaseStudy } from "./site";

const WIDTH = 1024;
const HEIGHT = 640;

/**
 * The plate a case is shown on in the WebGL hover effect.
 *
 * Every plate carries the same branded furniture — ghost index, client name,
 * discipline line, frame — so the section reads as one system instead of a
 * pile of screenshots. The capture is the background of that layout, painted
 * in as soon as it decodes; until then the same layout sits on a brand
 * gradient, which is also what a missing or broken file falls back to.
 */
export type CasePlate = {
  texture: THREE.CanvasTexture;
  /** Repaints the plate with the decoded capture behind the furniture. */
  paint: (image: HTMLImageElement) => void;
};

function accentOf(index: number) {
  return index % 2 === 0 ? "#0F8E91" : "#6F63C7";
}

function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  index: number,
  image?: HTMLImageElement,
) {
  ctx.fillStyle = "#0B0F18";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (image) {
    // Cover fit, top-aligned: a site's hero is the part worth showing.
    const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    ctx.drawImage(image, (WIDTH - drawWidth) / 2, 0, drawWidth, drawHeight);

    // Scrim so the type stays readable over any screenshot.
    const scrim = ctx.createLinearGradient(0, HEIGHT, WIDTH * 0.75, 0);
    scrim.addColorStop(0, "rgba(11,15,24,0.94)");
    scrim.addColorStop(0.45, "rgba(11,15,24,0.62)");
    scrim.addColorStop(1, "rgba(11,15,24,0.12)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }

  const wash = ctx.createLinearGradient(0, HEIGHT, WIDTH, 0);
  wash.addColorStop(0, "rgba(15,142,145,0.55)");
  wash.addColorStop(0.5, "rgba(29,38,54,0.25)");
  wash.addColorStop(1, "rgba(111,99,199,0.55)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = "rgba(243,246,248,0.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(WIDTH, y + 0.5);
    ctx.stroke();
  }

  ctx.fillStyle = accentOf(index);
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(WIDTH * 0.62, HEIGHT * 0.08);
  ctx.lineTo(WIDTH * 0.94, HEIGHT * 0.08);
  ctx.lineTo(WIDTH * 0.7, HEIGHT * 0.62);
  ctx.lineTo(WIDTH * 0.6, HEIGHT * 0.38);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawFurniture(
  ctx: CanvasRenderingContext2D,
  entry: CaseStudy,
  index: number,
) {
  const accent = accentOf(index);

  // Ghost index, top left.
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.2;
  ctx.font = "600 200px Inter, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(entry.index, 56, 210);
  ctx.globalAlpha = 1;

  // Client and discipline line, bottom left.
  ctx.fillStyle = "#F3F6F8";
  ctx.font = "600 84px Inter, system-ui, sans-serif";
  ctx.fillText(entry.client.toUpperCase(), 60, HEIGHT - 116);

  ctx.fillStyle = "#8D98A6";
  ctx.font = "400 26px ui-monospace, monospace";
  ctx.fillText(
    `${entry.index} · ${entry.disciplines.join(" / ")} · ${entry.year}`,
    62,
    HEIGHT - 68,
  );

  // Accent rule above the type block.
  ctx.fillStyle = accent;
  ctx.fillRect(60, HEIGHT - 178, 120, 3);

  // Frame.
  ctx.strokeStyle = "rgba(243,246,248,0.28)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);
}

export function createCasePlate(entry: CaseStudy, index: number): CasePlate {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");

  const render = (image?: HTMLImageElement) => {
    if (!ctx) return;
    drawBackdrop(ctx, index, image);
    drawFurniture(ctx, entry, index);
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

const CAPTION = { width: 1024, height: 240 };

/**
 * Wall label under an exhibit, drawn to a canvas.
 *
 * These used to be <Html> elements. DOM in a 3D scene cannot be depth-tested,
 * so the captions showed through the walls from the entrance tunnel — and one
 * DOM node per case does not scale to a wall of thirty. A texture does both.
 */
export function createCaptionTexture(
  entry: CaseStudy,
  index: number,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CAPTION.width;
  canvas.height = CAPTION.height;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, CAPTION.width, CAPTION.height);
    ctx.textAlign = "center";

    ctx.fillStyle = accentOf(index);
    ctx.font = "500 30px ui-monospace, monospace";
    ctx.fillText(
      `${entry.index} / ${entry.disciplines.join(" · ")} / ${entry.year}`,
      CAPTION.width / 2,
      54,
    );

    ctx.fillStyle = "#F3F6F8";
    ctx.font = "600 66px Inter, system-ui, sans-serif";
    ctx.fillText(entry.client, CAPTION.width / 2, 132);

    ctx.fillStyle = "#8D98A6";
    ctx.font = "400 34px Inter, system-ui, sans-serif";
    ctx.fillText(entry.title, CAPTION.width / 2, 188);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}


/**
 * The plate for a slot that has no case yet.
 *
 * The hall is laid out in bays, so the published work never fills it exactly.
 * Leaving those walls bare made the gallery stop mid-sentence; a dashed, empty
 * passe-partout with the slot number reads as a hanging that is still to come,
 * which is what it is. Deliberately quieter than a real plate: no accent
 * colour, dimmer type, so the eye still goes to the finished work first.
 */
export function createPlaceholderPlate(slot: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.fillStyle = "#0B0F18";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The same 64px grid the case plates fall back to, kept fainter.
    ctx.strokeStyle = "rgba(243,246,248,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= WIDTH; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= HEIGHT; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(WIDTH, y + 0.5);
      ctx.stroke();
    }

    // Ghost slot number, top left, where a case plate carries its index.
    ctx.fillStyle = "rgba(141,152,166,0.16)";
    ctx.font = "600 200px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(slot, 56, 210);

    // Dashed mount: the visual shorthand for a reserved hanging.
    ctx.strokeStyle = "rgba(243,246,248,0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 16]);
    ctx.strokeRect(60, 60, WIDTH - 120, HEIGHT - 120);
    ctx.setLineDash([]);

    ctx.textAlign = "center";

    ctx.fillStyle = "#C6CFDA";
    ctx.font = "500 74px ui-monospace, monospace";
    ctx.letterSpacing = "16px";
    ctx.fillText(UPCOMING.headline, WIDTH / 2, HEIGHT / 2 + 6);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = "rgba(141,152,166,0.5)";
    ctx.fillRect(WIDTH / 2 - 70, HEIGHT / 2 + 46, 140, 2);

    ctx.fillStyle = "#6B7686";
    ctx.font = "400 28px ui-monospace, monospace";
    ctx.fillText(UPCOMING.note, WIDTH / 2, HEIGHT / 2 + 106);

    // Outer frame, matching the case plates.
    ctx.strokeStyle = "rgba(243,246,248,0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, WIDTH - 48, HEIGHT - 48);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Wall label for an empty slot — same layout as a case caption, dimmed. */
export function createPlaceholderCaption(slot: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CAPTION.width;
  canvas.height = CAPTION.height;

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, CAPTION.width, CAPTION.height);
    ctx.textAlign = "center";

    ctx.fillStyle = "#5C6875";
    ctx.font = "500 30px ui-monospace, monospace";
    ctx.fillText(`${slot} / ${UPCOMING.status}`, CAPTION.width / 2, 54);

    ctx.fillStyle = "#A9B4C0";
    ctx.font = "600 66px Inter, system-ui, sans-serif";
    ctx.fillText(UPCOMING.title, CAPTION.width / 2, 132);

    ctx.fillStyle = "#5C6875";
    ctx.font = "400 34px Inter, system-ui, sans-serif";
    ctx.fillText(UPCOMING.note, CAPTION.width / 2, 188);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
