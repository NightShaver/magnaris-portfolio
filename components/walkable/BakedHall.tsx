"use client";

import { useEffect, useMemo, useRef } from "react";
import { Environment, Lightformer, useGLTF, useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { BRAND_COLORS } from "@/components/hero/HeroScene";
import manifest from "@/public/room/room.json";
import { asset } from "@/lib/assetPath";
import { usePrefersReducedMotion } from "@/lib/useReducedMotion";
import { FRAME, NAVE_HALF_WIDTH, ROOM, SECTION } from "@/lib/roomLayout";
import {
  type RoomQuality,
  type RoomTier,
  useRoomQuality,
} from "@/lib/roomQuality";

/* ==========================================================================
   THE BAKED ROOM
   --------------------------------------------------------------------------
   The gallery is no longer built in this file. It is modelled, lit and baked
   in Blender by blender/01..08, and what arrives here is a Draco-compressed
   glTF, two lightmaps and a manifest — about 1.3 MB for a 40 m hall and
   everything standing in it.

   What that buys: real architecture (side aisles, an arcade, a clerestory),
   real furniture (chamfered edges, scanned walnut, cast concrete), bounced
   light, contact shadows under every bench and a cove wash, none of which a
   browser can afford to compute per frame. What it costs: the room is fixed.
   Moving a bench means opening Blender and re-baking, which is exactly the
   trade a gallery should make and a configurator should not.

   Nothing here is retyped from Blender. Colours, tiling, roughness ranges,
   normal strengths and the lightmaps' exposure factors all come out of
   room.json, which 08_export.py writes by reading the materials it just built.

   TWO MESHES, TWO LIGHTMAPS

   The hall is 7300 m² across 168 faces; the fittings are 91 m² across ten
   thousand. Sharing one atlas would have the hall's texel density paying for a
   bench's, so each gets its own — 2048 for the building at 16 px/m, 1024 for
   the furniture at 44. The manifest says which mesh takes which.

   HOW THE LIGHTING WORKS AT RUNTIME

   The glTF carries two UV channels: channel 0 is a world-scale cube projection
   (one metre = one UV unit) that the tiling marble, walnut and concrete ride
   on, and channel 1 is a packed atlas holding the bake. glTF has no lightmap
   slot, so three.js has to be told: `texture.channel = 1` on the lightmap, and
   every material gets it. The bakes were normalised into 0-1 to survive an
   8-bit file, so lightMapIntensity multiplies them back out.
   ========================================================================== */

export const HALL_URL = asset(`/room/${manifest.mesh}`);

/**
 * Where the Draco decoder lives.
 *
 * Self-hosted out of public/draco/, not drei's default Google CDN. This site
 * is a static export that can be dropped on any file host; it has no business
 * phoning out to a third party to decompress its own furniture.
 */
const DRACO_PATH = asset("/draco/");

/**
 * Every texture the room needs, flattened into one record for useTexture.
 *
 * Built per tier rather than once, because the lite tier loads the same names
 * out of public/room/lite/ at half the resolution. The record is memoised by
 * directory: useTexture keys its cache on the object it is handed, so a fresh
 * record every render would suspend forever.
 */
const URL_SETS = new Map<string, Record<string, string>>();

function textureUrls(dir: string): Record<string, string> {
  const cached = URL_SETS.get(dir);
  if (cached) return cached;

  const urls: Record<string, string> = {};
  for (const entry of manifest.meshes) {
    urls[`lightmap:${entry.name}`] = asset(`/room/${dir}${entry.lightmap.texture}`);
    // The arcade carries its colour the same way it carries its light: baked
    // into its own unwrap. Its marble is procedural and glTF cannot express a
    // procedural, so the only route into the browser is an image — and since
    // every column is unwrapped uniquely, that image has no tiling, no repeat
    // and no seam.
    const albedo = (entry as { albedo?: { texture: string } }).albedo;
    if (albedo) {
      urls[`albedo:${entry.name}`] = asset(`/room/${dir}${albedo.texture}`);
    }
  }
  for (const [setName, maps] of Object.entries(manifest.textures)) {
    urls[`${setName}:map`] = asset(`/room/${dir}${maps.map}`);
    urls[`${setName}:roughnessMap`] = asset(`/room/${dir}${maps.roughnessMap}`);
    urls[`${setName}:normalMap`] = asset(`/room/${dir}${maps.normalMap}`);
  }

  URL_SETS.set(dir, urls);
  return urls;
}

/**
 * How much of the environment the room's own surfaces are allowed to take.
 *
 * Deliberately low, and it applies to the baked meshes alone: three.js has no
 * way to say "specular only", so an environment map bright enough to fill an
 * unbaked prop also pours diffuse light onto every baked wall. At 0.35 the
 * aisle wall went flat — lit head-on by a panel standing where the pictures
 * are, with the bake's own gradient buried underneath it.
 *
 * So the room takes a sixth of the environment, which is enough for the sheen
 * on the marble and not enough to argue with the bake, while anything still
 * built at runtime keeps the default and gets its fill from the same map.
 */
const ENV_INTENSITY = 0.16;

/**
 * What an unbaked surface takes from the environment on the lite tier.
 *
 * On the full tier those surfaces are modelled by seven runtime lights and the
 * environment is only their fill, so it sits at 1. On lite the lights are gone
 * and one dim directional is all that is left, so the environment has to carry
 * the level instead of topping it up — otherwise the wall blocks, the two
 * sculptures and the mark read as silhouettes against a room that is lit.
 *
 * It is safe to push here and nowhere else, because it reaches exactly the
 * surfaces that have no lightmap. Everything baked is pinned to zero on this
 * tier and cannot be brightened by it.
 */
const UNBAKED_FILL = 2.3;

/* --------------------------------------------------------------------------
   room.json shapes. TypeScript widens the union over the materials array, so
   the two kinds are named here and the manifest is asserted into them once
   rather than narrowed at every use.
   -------------------------------------------------------------------------- */
/**
 * The cyan, and how it crosses over.
 *
 * Blender measures emission in watts per square metre. three.js multiplies an
 * emissive colour by a scalar and hands the result to the tone mapper. Those
 * are not the same quantity and there is no correct conversion between them,
 * so the strength travels as it was authored and EMISSIVE_SCALE decides what a
 * watt is worth under this exposure — one number to turn, in one place,
 * instead of eight materials to re-grade in Blender every time the look moves.
 */
type Emissive = {
  emissive?: string;
  emissiveStrength?: number;
};

type TexturedMaterial = Emissive & {
  name: string;
  mesh: string;
  kind: "textured";
  texture: string;
  tile: number;
  color: string;
  roughness: [number, number];
  normalStrength?: number;
  metalness: number;
};

type FlatMaterial = Emissive & {
  name: string;
  mesh: string;
  kind: "flat";
  color: string;
  roughness: number;
  metalness: number;
};

type BakedMaterial = Emissive & {
  name: string;
  mesh: string;
  kind: "baked";
  color: string;
  roughness: number;
  metalness?: number;
};

type RoomMaterial = TexturedMaterial | FlatMaterial | BakedMaterial;

const MATERIALS = manifest.materials as unknown as RoomMaterial[];

export type HallAnchor = {
  /** "slot.01" … "slot.08", the empty's name in Blender. */
  name: string;
  /** 1-based index parsed out of the name. */
  index: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
};

export type Hall = {
  /**
   * Which tier this hall was built for.
   *
   * Carried on the hall itself so a consumer can tell without asking the store
   * a second time, and so a component that has a hall in hand cannot disagree
   * with the materials it is looking at.
   */
  tier: RoomTier;
  scene: THREE.Group;
  anchors: HallAnchor[];
  /** Every material the room is built from, for the reflection probe. */
  materials: THREE.MeshStandardMaterial[];
  /**
   * The animation clips Blender authored, by name.
   *
   * Two of them, and they are played in opposite ways. `HiddenWall` is never
   * "played" at all: its time is written from how close the visitor is
   * standing, so the mechanism runs backwards on the way out at exactly the
   * pace it ran forwards. `Idle` loops and is never touched again.
   */
  clips: Map<string, THREE.AnimationClip>;
  /** The objects those clips move, by their Blender name. */
  runtime: Map<string, THREE.Object3D>;
  /**
   * One mixer for both clips.
   *
   * Two mixers on one root would work — the clips touch disjoint objects — but
   * they would each keep their own bindings to the same nodes, and whichever
   * ran second would win on any node they ever came to share. One mixer, one
   * component advancing it, and the wall's scrubber only writes a time.
   */
  mixer: THREE.AnimationMixer;
};

type TextureSet = Record<string, THREE.Texture>;

/**
 * What reading the glTF found, keyed by the scene.
 *
 * Split from the materials, and the reason is a bug that only appears when the
 * tier changes: the anchors, the runtime objects and the clips are found by
 * name, and by the time a second tier is built those names have been changed.
 * TeamExhibits renames the twelve skill bodies to "aim-target" so the picker can
 * raycast against them, the hidden wall does the same with its sign — all of it
 * reversible, all of it invisible until something looks the room up by name a
 * second time and finds twelve nodes missing.
 *
 * Which is also the honest structure. A lightmap's resolution has nothing to do
 * with where the hanging anchors are.
 */
const surveyed = new WeakMap<THREE.Group, Survey>();

/** The materials, keyed by scene and tier. */
const dressed = new WeakMap<THREE.Group, Map<RoomTier, Dressing>>();

type Survey = Pick<Hall, "anchors" | "clips" | "runtime" | "mixer">;
type Dressing = { materials: THREE.MeshStandardMaterial[]; byName: Map<string, THREE.MeshStandardMaterial> };

function configure(texture: THREE.Texture, anisotropy: number) {
  // glTF UVs have their origin at the top left. Textures loaded outside the
  // glTF do not, and a lightmap that is upside down is a very confusing bug.
  texture.flipY = false;
  texture.anisotropy = anisotropy;
  return texture;
}

function tiled(
  source: THREE.Texture,
  repeat: number,
  colorSpace: THREE.ColorSpace,
  anisotropy: number,
) {
  const texture = configure(source.clone(), anisotropy);
  texture.colorSpace = colorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Watts to emissiveIntensity.
 *
 * Tuned against the hairline joints, which are the hardest case: six
 * millimetres wide, authored at nine watts, and they have to read as light
 * spilling out of a slot rather than as a drawn line. At 1.0 they blew into a
 * white bar that lit nothing; at 0.34 the joint clips just past white in the
 * middle and falls off along its length, which is what a real slot does.
 */
const EMISSIVE_SCALE = 0.34;

function withEmission(
  material: THREE.MeshStandardMaterial,
  spec: RoomMaterial,
) {
  if (!spec.emissive) return material;
  material.emissive = new THREE.Color(spec.emissive);
  material.emissiveIntensity = (spec.emissiveStrength ?? 1) * EMISSIVE_SCALE;
  return material;
}

function buildMaterial(
  spec: RoomMaterial,
  textures: TextureSet,
  anisotropy: number,
  quality: RoomQuality,
) {
  if (spec.kind === "baked") {
    // Colour and light on the same channel, both unique, nothing tiled. The
    // colour is already in the image, so the tint stays white.
    const map = configure(textures[`albedo:${spec.mesh}`], anisotropy);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.channel = 1;
    return withEmission(new THREE.MeshStandardMaterial({
      name: spec.name,
      color: new THREE.Color(spec.color),
      map,
      roughness: spec.roughness,
      metalness: spec.metalness ?? 0,
    }), spec);
  }

  if (spec.kind === "flat") {
    return withEmission(new THREE.MeshStandardMaterial({
      name: spec.name,
      color: new THREE.Color(spec.color),
      roughness: spec.roughness,
      metalness: spec.metalness,
    }), spec);
  }

  // UV0 is metres, so this is repeats per metre.
  const repeat = 1 / spec.tile;
  const set = spec.texture;

  const material = new THREE.MeshStandardMaterial({
    name: spec.name,
    color: new THREE.Color(spec.color),
    map: tiled(textures[`${set}:map`], repeat, THREE.SRGBColorSpace, anisotropy),
    // The roughness map is a texture fetch on every fragment of every wall,
    // and the lite tier is drawing a 488 px wide picture of a forty metre
    // hall. It goes, and the scalar underneath it carries the surface: that
    // number is a real value out of the same scan, so what is lost is the
    // variation and not the level.
    //
    // The normal map stays. Without it the marble is a flat grey field and the
    // fluting on the columns disappears, which is the difference between a
    // photograph of stone and a stone-coloured rectangle.
    roughnessMap: quality.roughnessMaps
      ? tiled(textures[`${set}:roughnessMap`], repeat, THREE.NoColorSpace, anisotropy)
      : null,
    normalMap: quality.normalMaps
      ? tiled(textures[`${set}:normalMap`], repeat, THREE.NoColorSpace, anisotropy)
      : null,
    metalness: spec.metalness,
    // Blender remapped the scanned roughness into [min, max]; three multiplies
    // the map instead of remapping it, so the top of the range is the factor
    // and the scan's own variation rides underneath it.
    //
    // With no map to multiply, the top of the range on its own would read as
    // the whole surface at its roughest, so without one the middle is taken.
    roughness: quality.roughnessMaps
      ? spec.roughness[1]
      : (spec.roughness[0] + spec.roughness[1]) / 2,
  });
  const strength = spec.normalStrength ?? 0.5;
  material.normalScale.set(strength, strength);
  return withEmission(material, spec);
}

function dress(
  textures: TextureSet,
  anisotropy: number,
  quality: RoomQuality,
): Dressing {
  const lightMaps = new Map<string, THREE.Texture>();
  for (const entry of manifest.meshes) {
    const lightMap = configure(textures[`lightmap:${entry.name}`], anisotropy);
    lightMap.colorSpace = THREE.SRGBColorSpace;
    lightMap.wrapS = lightMap.wrapT = THREE.ClampToEdgeWrapping;
    // The atlas lives on the second UV channel. Without this line three
    // samples the cube projection instead and the room is lit by a smear.
    lightMap.channel = entry.lightmap.uv;
    lightMaps.set(entry.name, lightMap);
  }

  const byName = new Map<string, THREE.MeshStandardMaterial>();
  for (const spec of MATERIALS) {
    const material = buildMaterial(spec, textures, anisotropy, quality);
    const lightMap = lightMaps.get(spec.mesh);
    const intensity = manifest.meshes.find((m) => m.name === spec.mesh)
      ?.lightmap.intensity;
    if (lightMap && intensity !== undefined) {
      material.lightMap = lightMap;
      material.lightMapIntensity = intensity;
    }
    // The sixth applies to baked surfaces only, which is what the comment on
    // ENV_INTENSITY has always said and what the code did not do: everything
    // got it, including the sculptures and the wall blocks, which have no
    // lightmap and nothing else to light them. Those keep the full map.
    //
    // On the lite tier there is no probe, and the number here is not what
    // decides the matter: see HallEnvironmentBinding below. A material with no
    // envMap of its own falls back to scene.environment, and that path is
    // scaled by scene.environmentIntensity rather than by this field — so a
    // zero written here is silently ignored. The binding component gives every
    // unbaked surface an explicit map instead, which is what makes this number
    // mean something again.
    material.envMapIntensity = quality.probe
      ? lightMap
        ? ENV_INTENSITY
        : 1
      : lightMap
        ? 0
        : UNBAKED_FILL;
    byName.set(spec.name, material);
  }

  return { materials: [...byName.values()], byName };
}

/**
 * Read the glTF: where things are, what moves, and what the clips are called.
 *
 * Runs once per scene, before anything has had a chance to rename a node.
 */
function survey(scene: THREE.Group, animations: THREE.AnimationClip[]): Survey {
  const existing = surveyed.get(scene);
  if (existing) return existing;

  // See `yawOnLoad` in room.json: the export negates depth, so the room arrives
  // back to front. Turning it here rather than in Blender keeps the glTF honest
  // about its own axes.
  //
  // It has to happen before the anchors are read, and that is not a style
  // point: an anchor is decomposed out of its world matrix, and a world matrix
  // computed before this line puts all eight hanging slots on the wrong side of
  // the hall.
  scene.rotation.y = manifest.yawOnLoad;
  scene.updateMatrixWorld(true);

  // The empties are called "slot.01" in Blender and in room.json, and they do
  // not arrive under that name: GLTFLoader runs every node name through
  // PropertyBinding.sanitizeNodeName, which strips the characters the
  // animation system reserves — the dot among them. So "slot.01" turns up as
  // "slot01", and a pattern written against the authored name silently matches
  // nothing at all.
  const anchors: HallAnchor[] = [];
  scene.traverse((object) => {
    const match = /^slot[._]?(\d+)$/.exec(object.name);
    if (!match) return;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    object.matrixWorld.decompose(position, quaternion, scale);
    anchors.push({
      name: object.name,
      index: Number(match[1]),
      position,
      quaternion,
    });
  });
  anchors.sort((a, b) => a.index - b.index);

  // A mismatch here means the glTF and the manifest have drifted apart, which
  // is the one failure this whole pipeline is built to make impossible. Say so
  // rather than letting the exhibits read past the end of the array.
  if (anchors.length !== manifest.anchors.length) {
    console.error(
      `[BakedHall] ${manifest.anchors.length} Anker erwartet, ` +
        `${anchors.length} im glTF gefunden. public/room/ neu exportieren.`,
    );
  }

  const clips = new Map(animations.map((clip) => [clip.name, clip]));
  for (const entry of manifest.runtime.clips) {
    if (!clips.has(entry.name)) {
      console.error(
        `[BakedHall] Clip "${entry.name}" fehlt im glTF. ` +
          "08_export.py mit export_animations neu laufen lassen.",
      );
    }
  }

  // GLTFLoader sanitises node names the same way it sanitises the names in an
  // animation track, so a lookup by the authored name is safe for everything
  // 05_exhibits builds — none of those names carry a dot. The anchors do, and
  // that is why they are matched by pattern a few lines up instead.
  const runtime = new Map<string, THREE.Object3D>();
  for (const entry of manifest.runtime.objects) {
    const object = scene.getObjectByName(entry.name);
    if (object) runtime.set(entry.name, object);
  }

  const found: Survey = {
    anchors,
    clips,
    runtime,
    mixer: new THREE.AnimationMixer(scene),
  };
  surveyed.set(scene, found);
  return found;
}

/**
 * The room, dressed for one tier.
 *
 * Both halves are cached, so the second component to ask for the hall gets the
 * first one's work, and switching tier rebuilds the materials without reading
 * the scene graph again.
 */
function prepare(
  scene: THREE.Group,
  textures: TextureSet,
  anisotropy: number,
  animations: THREE.AnimationClip[],
  quality: RoomQuality,
): Hall {
  const found = survey(scene, animations);

  let byTier = dressed.get(scene);
  if (!byTier) {
    byTier = new Map();
    dressed.set(scene, byTier);
  }
  let dressing = byTier.get(quality.tier);
  if (!dressing) {
    dressing = dress(textures, anisotropy, quality);
    byTier.set(quality.tier, dressing);
  }

  // Re-run on every tier, because this is what puts the new materials on the
  // meshes. Matching is by the material's own name, which buildMaterial copies
  // from the manifest, so a mesh already carrying a lite material is found
  // again when the full one is put back.
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.Material;
    const built = dressing.byName.get(source.name);
    if (built) mesh.material = built;
    // Everything that casts a shadow in this room already did so in Cycles.
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  });

  return {
    tier: quality.tier,
    scene,
    materials: dressing.materials,
    ...found,
  };
}

/**
 * The room, its materials and its hanging anchors.
 *
 * Safe to call from more than one component: the heavy work happens once per
 * loaded scene and every later caller gets the same object back.
 */
export function useHall(): Hall {
  const quality = useRoomQuality();
  const { scene, animations } = useGLTF(HALL_URL, DRACO_PATH) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const textures = useTexture(
    textureUrls(quality.textureDir),
  ) as unknown as TextureSet;
  const anisotropy = useThree((state) =>
    state.gl.capabilities.getMaxAnisotropy(),
  );

  // Eight on both tiers, and the lite tier is not allowed to economise here.
  //
  // It was four lower for one build, on the reasoning that anisotropic
  // filtering is a per-sample cost on the largest surfaces in the room. It is,
  // and those surfaces are the floor and the nave ceiling seen at a grazing
  // angle down forty metres — which is not a detail question but a correctness
  // one, because what they carry is a lightmap, and a lightmap is an atlas.
  //
  // Fewer taps means the hardware picks a higher mip level to cover the same
  // stretched footprint, and a higher mip level in an atlas is charts averaged
  // with their neighbours. The dark floor took its brightness from whatever
  // was packed next to it and came out a flat, pale grey with the bake's whole
  // gradient gone. Eight taps is what stops that, and it is cheap compared to
  // the lightmap being wrong.
  return useMemo(
    () => prepare(scene, textures, Math.min(8, anisotropy), animations, quality),
    [scene, textures, anisotropy, animations, quality],
  );
}

export function BakedHall() {
  const { scene } = useHall();
  return <primitive object={scene} />;
}

/**
 * The only thing that advances time in the hall.
 *
 * Two clips ride this mixer and they are driven in opposite ways. `Idle` is
 * started here and then left alone forever: ten seconds of the two sculptures
 * turning, authored to end on the frame it starts so the repeat has no seam.
 * `HiddenWall` is played by nobody — it sits paused while the wall component
 * writes its `time` from the visitor's distance — and it is evaluated by the
 * same update call, which is exactly why there is one mixer and not two.
 *
 * Reduced motion stops the idle loop rather than speeding through it. A
 * sculpture holding still is a sculpture; a sculpture snapping between poses
 * is the thing the preference exists to prevent.
 */
export function HallMotion() {
  const hall = useHall();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const clip = hall.clips.get("Idle");
    if (!clip) return undefined;
    const action = hall.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    action.paused = reduced;
    return () => {
      action.stop();
    };
  }, [hall, reduced]);

  useFrame((_, delta) => {
    hall.mixer.update(Math.min(delta, 0.05));
  });

  return null;
}

/**
 * How much of the room the polished stone reflects back.
 *
 * One probe cannot be right everywhere. It is a single cube render from one
 * point in the nave, so a reflection is only correctly placed for a viewer
 * standing where the probe stood; step away and the columns in the floor drift
 * out from under the columns above it. At full strength that parallax is the
 * first thing the eye catches and the floor stops reading as a floor.
 *
 * So it is dialled back to a sheen. Enough that polished stone looks polished,
 * not so much that it claims to be a mirror it cannot be.
 */
const PROBE_INTENSITY = 0.4;

/**
 * Where the probe stands.
 *
 * Not at the origin, which is the first place anyone puts it and the one place
 * it cannot go: the plinth is there, and a cube camera 2.6 m up inside it
 * photographs the underside of the mark from ten centimetres away. Every
 * polished surface in the hall then reflects a black blob.
 *
 * Six metres down the nave instead — clear of the plinth, clear of the benches
 * at z = 8.5 and z = 0, and with both arcades and four pictures in view. One
 * probe for a 40 m hall is a compromise on parallax, and still a far better
 * one than a reflection of panels that are not in the room.
 */
const PROBE_POSITION: [number, number, number] = [0, 2.6, 6];
/**
 * 512 rather than 256. PMREMGenerator spreads the cube across roughness mips,
 * and the floor sits at about 0.11 effective roughness — sharp enough that the
 * mip it lands on is near the top of the chain. At 256 the case plates, which
 * are the brightest and smallest things in the room, smeared into the general
 * glow instead of reflecting as plates. Six faces, once, at load.
 */
const PROBE_RESOLUTION = 512;

/**
 * Which frame to capture on.
 *
 * Late enough that the case plates have decoded and uploaded. They are the
 * brightest things in the building and the entire reason the floor is
 * polished; capturing before they arrive gives a hall whose pictures are black
 * rectangles, which is worse than not reflecting them at all.
 */
const PROBE_FRAME = 30;

/**
 * A reflection of the actual room, rendered once.
 *
 * The polished marble was reflecting an environment map built by hand to
 * approximate the hall — a band where the cove is, a panel where the pictures
 * are. It is a decent approximation of the light and a poor one of the room:
 * the floor mirrored a smooth gradient where it should mirror an arcade, and
 * the pictures, which are the brightest things in the building and the whole
 * reason the floor is polished, did not appear in it at all.
 *
 * So the room photographs itself. One cube render from the middle of the nave,
 * run through PMREMGenerator so the roughness of each surface picks the right
 * blur, and handed to the baked materials as their own envMap. It costs six
 * frames once, and nothing afterwards — the hall does not move.
 *
 * The result is assigned per material rather than to scene.environment, which
 * stays the hand-built fill: the benches are in the probe, so lighting them
 * with it would be circular, and the plinth and the doors need an ambient that
 * does not depend on where the probe happened to stand.
 */
export function RoomProbe() {
  const { materials } = useHall();
  const quality = useRoomQuality();
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const frames = useRef(0);

  useFrame(() => {
    // Not on lite. Six 512 faces and a PMREM pass is a stall a phone shows,
    // and what it buys is a sheen at 0.4 strength whose parallax is only
    // correct for a viewer standing where the probe stood — which a
    // station-bound visitor never is.
    if (!quality.probe) return;
    frames.current += 1;
    if (frames.current !== PROBE_FRAME) return;

    const target = new THREE.WebGLCubeRenderTarget(PROBE_RESOLUTION, {
      type: THREE.HalfFloatType,
    });
    const camera = new THREE.CubeCamera(0.3, 140, target);
    camera.position.set(...PROBE_POSITION);
    scene.add(camera);

    // Nothing in the capture may already be reflecting a probe, or each
    // rebuild would fold the previous one into the next.
    const restore = materials.map((material) => material.envMap);
    for (const material of materials) material.envMap = null;
    camera.update(gl, scene);
    scene.remove(camera);
    materials.forEach((material, index) => {
      material.envMap = restore[index];
    });

    const pmrem = new THREE.PMREMGenerator(gl);
    const environment = pmrem.fromCubemap(target.texture);
    pmrem.dispose();
    target.dispose();

    for (const material of materials) {
      material.envMap = environment.texture;
      material.envMapIntensity = PROBE_INTENSITY;
      material.needsUpdate = true;
    }
  });

  return null;
}

/**
 * Hand the environment out by name instead of letting it in through the back.
 *
 * <Environment> sets scene.environment, and three.js uses that for any material
 * that has no envMap of its own. What it does *not* do on that path is honour
 * material.envMapIntensity: the scene fallback is scaled by
 * scene.environmentIntensity, a single global number. So a baked wall written
 * to zero here took the full hand-built fill anyway, and the whole hall — the
 * floor and the nave ceiling worst of all, because they are the largest
 * surfaces and the ones seen at a grazing angle — came out evenly lit and pale,
 * with the bake's gradient buried underneath it. On the full tier the probe
 * hides the problem by giving every material an explicit map; on lite there is
 * no probe, and the problem is the whole picture.
 *
 * So the fallback is switched off and the map is assigned by hand, to exactly
 * the surfaces that should have it: everything with no lightmap. That is the
 * six wall blocks at each end, the two sculptures, the planets and the mark —
 * the things that move, and therefore the things Cycles could not bake. A baked
 * surface gets no environment at all, which is both correct and cheaper: with
 * no envMap the shader compiled for it has no image-based lighting in it.
 *
 * Runs on a few early frames rather than once, because the materials it is
 * looking for do not all exist yet on the first: TeamExhibits swaps its planet
 * materials in after the glTF is in the scene.
 */
const BINDING_FRAMES = new Set([4, 20, 60, 140]);

export function HallEnvironmentBinding() {
  const quality = useRoomQuality();
  const scene = useThree((state) => state.scene);
  const frames = useRef(0);
  const touched = useRef<THREE.MeshStandardMaterial[]>([]);

  // The fallback itself is switched off by <HallEnvironment>, which owns the
  // <Environment> and therefore owns scene.environmentIntensity. What is left
  // here is undoing the assignments on the way out, so switching tier on the
  // review page does not leave the full tier's materials holding a map the
  // lite tier gave them.
  useEffect(() => {
    if (quality.probe) return undefined;
    const bound = touched;
    return () => {
      for (const material of bound.current) {
        material.envMap = null;
        material.needsUpdate = true;
      }
      bound.current = [];
    };
  }, [quality.probe]);

  useFrame(() => {
    if (quality.probe) return;
    frames.current += 1;
    if (!BINDING_FRAMES.has(frames.current)) return;
    if (!scene.environment) return;

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const entry of list) {
        const material = entry as THREE.MeshStandardMaterial;
        if (!material || !("envMapIntensity" in material)) continue;
        // Baked surfaces carry their light in the atlas and take nothing here.
        if (material.lightMap) continue;
        if (material.envMap === scene.environment) continue;
        material.envMap = scene.environment;
        material.envMapIntensity = UNBAKED_FILL;
        material.needsUpdate = true;
        touched.current.push(material);
      }
    });
  });

  return null;
}

/**
 * The reflection the marble sees.
 *
 * Not a light source: every bounce in this room is already in the lightmaps,
 * and an environment bright enough to light it a second time puts a floor
 * under the bake's darks and flattens the whole thing back into the grey box
 * it replaced. It is built to match what the bake put there, so the polished
 * floor mirrors the hall it is standing in rather than some other, brighter
 * one — a long cool band overhead where the cove runs, a warm wall on each
 * side where the pictures hang, and the two brand colours at the two ends of
 * the axis, exactly once each.
 *
 * It also does the fill for everything that is not baked: the plinth, the
 * doors, the picture plates.
 */
export function HallEnvironment() {
  const quality = useRoomQuality();

  return (
    <Environment
      resolution={128}
      /*
        Zero on the lite tier, and that is the switch that makes the whole
        scheme work. scene.environment reaches every material that has no
        envMap of its own, and on that path three scales it by this single
        number rather than by each material's envMapIntensity — so with it at
        one, a baked wall written to zero took the full fill anyway and the
        hall came out evenly lit and pale. Off here, handed out by name in
        HallEnvironmentBinding.

        It is set through the prop rather than on the scene, because
        <Environment> writes scene.environmentIntensity from it on every mount
        and would overwrite anything assigned beside it.
      */
      environmentIntensity={quality.probe ? 1 : 0}
    >
      <Lightformer
        form="rect"
        intensity={1.1}
        color="#dce6f2"
        position={[0, SECTION.naveHeight - 0.4, 0]}
        scale={[NAVE_HALF_WIDTH * 2, ROOM.depth, 1]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      {[-1, 1].map((side) => (
        <Lightformer
          key={`env-wall-${side}`}
          form="rect"
          intensity={0.85}
          color="#fff2e0"
          position={[side * (ROOM.width / 2 - 1), FRAME.centreY, 0]}
          scale={[FRAME.height, ROOM.depth * 0.8, 1]}
          rotation={[0, (side * -Math.PI) / 2, 0]}
        />
      ))}
      {/* The two brand colours, high and dim.
          At 0.55 and at eye height the petrol one raked the length of the
          polished floor and put a second, brighter accent in the hall than the
          one Blender baked onto the end wall. The accent belongs to the wall;
          what reaches the floor should be a suggestion of it. */}
      <Lightformer
        form="rect"
        intensity={0.22}
        color={BRAND_COLORS.teal}
        position={[0, SECTION.naveHeight - 2, -ROOM.depth / 2]}
        scale={[ROOM.width * 0.4, 2.5, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.22}
        color={BRAND_COLORS.violet}
        position={[0, SECTION.naveHeight - 2, ROOM.depth / 2]}
        scale={[ROOM.width * 0.4, 2.5, 1]}
        rotation={[0, Math.PI, 0]}
      />
    </Environment>
  );
}

// Both halves of the room start downloading as soon as this module is
// imported, which is when the visitor clicks "Raum betreten" and well before
// the canvas needs them. The mesh alone is not enough: a hall with no lightmap
// suspends just as hard as a hall with no mesh.
useGLTF.preload(HALL_URL, DRACO_PATH);

// The textures start downloading too, and which set is not a detail: the full
// one is 2.4 MB and the lite one is 0.5 MB, and a phone that fetched the wrong
// one would have paid for the whole difference before the room opened.
//
// The tier is not resolved yet — it is decided in an effect, and this runs when
// the module is imported — so the same signal it will use is read directly. A
// coarse pointer is a touch device, and a touch device gets the tour and the
// lite tier. The case this gets wrong is a low-memory desktop, which preloads
// the full set and is then handed lite: a wasted download on the one kind of
// machine that can afford one.
const COARSE =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

useTexture.preload(Object.values(textureUrls(COARSE ? "lite/" : "")));
