import * as THREE from "three";

/* ==========================================================================
   THE INVITATION
   --------------------------------------------------------------------------
   What is written in the alcove behind the hidden wall.

   The first version was a web page: an envelope pictogram, a neon rectangle
   round the edge and a white pill that said "Projekt starten ↗". Every one of
   those is a browser convention, and none of them exists in a building. Put
   into a concrete recess at the end of a forty metre hall they read as a
   screen someone had bolted to the wall — which is exactly what the rest of
   this room spends its time not being.

   So it is signage now. Left aligned against a margin, the way a name is set
   on the front of an institution: an overline, the invitation, the address,
   and one cyan rule. No icon, because the words are not hard. No button,
   because the crosshair already says "Linksklick — Kontakt aufnehmen", and a
   drawn button on a wall you cannot press is worse than no button at all. And
   nothing about turnaround: this hall does not get to promise a reply time
   that nobody has agreed to.
   ========================================================================== */

const WIDTH = 1024;
const HEIGHT = 640;

const FONT = "Inter, system-ui, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function createSignTexture(
  email = "hallo@magnaris.studio",
  accent = "#3FE3E0",
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const ctx = canvas.getContext("2d");

  if (ctx) {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Nothing behind the type. The alcove's own coves light the concrete it
    // sits on, so a plate here would only cover that up with a darker one.
    const left = 96;
    ctx.textAlign = "left";

    ctx.fillStyle = accent;
    ctx.fillRect(left, 150, 84, 3);

    ctx.fillStyle = "rgba(190,205,218,0.9)";
    ctx.font = `500 30px ${MONO}`;
    ctx.fillText("MAGNARIS / KONTAKT", left, 130);

    ctx.fillStyle = "#F3F6F8";
    ctx.font = `600 132px ${FONT}`;
    ctx.fillText("Schreib uns", left, 300);

    ctx.fillStyle = "rgba(214,224,234,0.92)";
    ctx.font = `400 46px ${MONO}`;
    ctx.fillText(email, left, 386);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}
