import * as THREE from "three";

import { LOGO_CENTER, type LogoPart } from "./logo";

/**
 * Extrudes one polygon of the mark into 3D.
 *
 * SVG space has Y pointing down, so every point is mirrored once here. The
 * bevel is deliberately tiny: it exists to catch a highlight along each edge,
 * not to round the silhouette off. Sharp in form.
 *
 * The result is centred on the mark's bounding box, so several parts stay in
 * register and the group can be rotated around its own middle.
 */
export function createLogoGeometry(part: LogoPart): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();

  part.points.forEach(([x, y], index) => {
    if (index === 0) shape.moveTo(x, -y);
    else shape.lineTo(x, -y);
  });
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: part.depth,
    bevelEnabled: true,
    bevelThickness: 3,
    bevelSize: 3,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
  });

  geometry.translate(-LOGO_CENTER.x, LOGO_CENTER.y, part.z - part.depth / 2);
  geometry.computeVertexNormals();

  return geometry;
}
