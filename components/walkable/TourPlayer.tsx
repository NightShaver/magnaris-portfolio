"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { BRAND_COLORS } from "@/components/hero/HeroScene";
import { useHall } from "@/components/walkable/BakedHall";
import type { AimTarget } from "@/lib/aimTarget";
import { ROOM, SECTION } from "@/lib/roomLayout";
import { useRoomQuality } from "@/lib/roomQuality";
import {
  type Station,
  STATIONS,
  isCramped,
  standingDistance,
} from "@/lib/tourStations";

/* ==========================================================================
   THE TOUR — how the room is visited without a mouse
   --------------------------------------------------------------------------
   Pointer lock does not exist on iOS Safari and needs a real mouse on Android,
   so on a touch device there is no mouse look and therefore no walking: a
   visitor with an on-screen stick and no way to turn is stuck facing one
   direction. The room used to say so and refuse to open.

   What replaces it is not a worse version of walking. It is the thing walking
   was for. A gallery visit is standing in front of one work at a time, so the
   phone gets the standing: thirteen places in lib/tourStations, a tap to move
   between them, and a drag to look around from where you are.

   Three consequences, all of them good on a phone:

     - Nothing moves unless the visitor moves it. Parked in front of a picture
       the room is a still image, which is why the render loop can drop to a
       heartbeat and the phone stops getting warm. FrameCadence below does that.
     - The camera is never inside the architecture, so there is no collision to
       run and no chance of ending up in a wall.
     - Distance is derived, not authored. A station says what it is about and
       how wide that is; how far back to stand comes out of the live aspect
       ratio, so the same painting is framed the same on a phone held upright
       and one held sideways.
   ========================================================================== */

/** Where the arrival flight begins, and how long it takes. Matches Player. */
const INTRO = {
  from: ROOM.depth / 2 + 7.5,
  duration: 2.8,
};

/**
 * Radians of rotation per pixel of drag.
 *
 * A full swipe across a 390 point screen turns the visitor about 100 degrees,
 * which is the figure that made a room feel like a room rather than a turret:
 * at half of it, looking from one wall of the nave to the other took three
 * swipes, and at twice it a thumb resting on the glass overshot the picture.
 */
const LOOK_SPEED = 0.0045;

/** How far up and down the view may tilt. */
const PITCH_LIMIT = (52 * Math.PI) / 180;

/**
 * How quickly the camera catches up with the drag, and with a new station.
 *
 * The look is smoothed rather than applied directly, and the reason is the
 * frame rate: at 30 fps a finger moving across the glass delivers its
 * displacement in half as many, twice as large steps, and a camera that
 * applies each one exactly reads as stuttering even though nothing is dropped.
 */
const LOOK_RESPONSE = 16;

/** Seconds a move between two stations takes. */
const GLIDE = 0.85;

/**
 * Vertical field of view, by orientation.
 *
 * Two numbers rather than one because the room is mostly 5.14 m wide pictures
 * and a phone is 390 points across. Held upright, a 55 degree vertical view is
 * 27 degrees horizontally, and a painting that wide would need eleven metres of
 * aisle that this building does not have. Widening the vertical brings the
 * horizontal with it: at 78 the visitor sees about nine tenths of a work from
 * the far end of the aisle, and the distortion that buys is at the top and
 * bottom of a portrait screen, where the room is floor and ceiling.
 *
 * Held sideways nothing needs widening, so it is not widened.
 */
const FOV_PORTRAIT = 78;
const FOV_LANDSCAPE = 55;

export function fovFor(aspect: number) {
  return aspect < 1 ? FOV_PORTRAIT : FOV_LANDSCAPE;
}

/* --------------------------------------------------------------------------
   The stations, with the picture ones moved to where the pictures are.
   -------------------------------------------------------------------------- */
/**
 * STATIONS as authored, with every wall station's position replaced by the
 * anchor its frame hangs on.
 *
 * lib/tourStations explains why this is necessary: the room arrives mirrored in
 * x relative to the layout module, so a station built from the layout stands in
 * front of the case next door. The anchors are the same ones <Exhibits> hangs
 * the frames on, and they are walked in the same order, so station i and frame i
 * are the same slot by construction.
 *
 * The approach direction comes from the anchor's own forward axis rather than
 * from a sign, which is also what the frames' standoff uses — an angled wall
 * would need no new code here either.
 */
function useResolvedStations(): Station[] {
  const { anchors } = useHall();

  return useMemo(() => {
    const forward = new THREE.Vector3();
    let wall = 0;

    return STATIONS.map((station) => {
      if (station.kind !== "wall") return station;
      const anchor = anchors[wall];
      wall += 1;
      if (!anchor) return station;

      forward.set(0, 0, 1).applyQuaternion(anchor.quaternion);
      const length = Math.hypot(forward.x, forward.z) || 1;

      return {
        ...station,
        target: [anchor.position.x, anchor.position.y, anchor.position.z] as [
          number,
          number,
          number,
        ],
        approach: [forward.x / length, forward.z / length] as [number, number],
      };
    });
  }, [anchors]);
}

/* --------------------------------------------------------------------------
   Where a station puts the camera.
   -------------------------------------------------------------------------- */
function placement(
  station: Station,
  fov: number,
  aspect: number,
  out: { position: THREE.Vector3; target: THREE.Vector3 },
) {
  const distance = standingDistance(station, fov, aspect);
  const [tx, ty, tz] = station.target;
  const [ax, az] = station.approach;

  out.target.set(tx, ty, tz);
  out.position.set(
    tx + ax * distance,
    station.eye ?? ROOM.eyeHeight,
    tz + az * distance,
  );
  return distance;
}

export type TourStatus = {
  /** True while anything is moving: the flight, a glide, a drag. */
  busy: boolean;
  /** True when the station cannot show its subject at this aspect ratio. */
  cramped: boolean;
  /** True once the arrival flight has handed over. */
  arrived: boolean;
};

/* --------------------------------------------------------------------------
   TourPlayer
   -------------------------------------------------------------------------- */
export function TourPlayer({
  index,
  started,
  progress,
  status,
  onStation,
  onPick,
  onArrived,
}: {
  /** Which station the visitor is at, or heading to. */
  index: number;
  /** The flight only starts once the visitor has asked to enter. */
  started: boolean;
  /** Shared with EntryGate, which parts the portal from this value. */
  progress: React.RefObject<number>;
  /** Written every frame; read by FrameCadence and the HUD without re-rendering. */
  status: React.RefObject<TourStatus>;
  /** A floor marker was tapped. */
  onStation: (index: number) => void;
  /** Something with a label was tapped. */
  onPick: (target: AimTarget | null) => void;
  onArrived: () => void;
}) {
  const { camera, scene, gl, size } = useThree();
  const stations = useResolvedStations();

  /** Where the look is being dragged to, and where it currently is. */
  const wanted = useRef({ yaw: 0, pitch: 0 });
  const shown = useRef({ yaw: 0, pitch: 0 });

  /** The glide: from one placement to the next over GLIDE seconds. */
  const from = useMemo(
    () => ({ position: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  );
  const to = useMemo(
    () => ({ position: new THREE.Vector3(), target: new THREE.Vector3() }),
    [],
  );
  const here = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const basis = useMemo(() => new THREE.Euler(0, 0, 0, "YXZ"), []);
  const offset = useMemo(() => new THREE.Quaternion(), []);
  const glide = useRef(1);
  const dragging = useRef(false);
  const settled = useRef(0);
  /**
   * When the arrival flight started, on the wall clock.
   *
   * The flight is timed from this rather than from accumulated frame deltas,
   * and the difference only shows on a slow device — which is exactly where it
   * matters. Every integration in this room clamps its delta so that a long
   * stall cannot teleport anything, and the cost of that clamp is that a
   * device rendering at ten frames a second advances the flight at a third of
   * real time. The movement is worth clamping; a three second shot that
   * becomes nine is not. So the flight asks the clock how long it has been
   * going, and a slow phone simply sees fewer frames of it.
   */
  const flightStart = useRef(0);

  const aspect = size.width / Math.max(1, size.height);
  const fov = fovFor(aspect);

  /* ---- The camera's own lens follows the orientation of the device. */
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.fov === fov) return;
    perspective.fov = fov;
    perspective.updateProjectionMatrix();
  }, [camera, fov]);

  /* ---- Arm the flight whenever the visitor enters, however they left. */
  useEffect(() => {
    if (!started) return;
    progress.current = 0;
    glide.current = 1;
    flightStart.current = performance.now();
    camera.position.set(0, 2, INTRO.from);
  }, [started, progress, camera]);

  /* ---- A new station starts a glide from wherever the camera actually is. */
  useEffect(() => {
    const station = stations[index];
    if (!station) return;

    from.position.copy(camera.position);
    // The point currently being looked at, at the distance of the next one, so
    // the two ends of the interpolation are comparable and the turn is short.
    camera.getWorldDirection(look);
    placement(station, fov, aspect, to);
    from.target
      .copy(camera.position)
      .addScaledVector(look, camera.position.distanceTo(to.target));

    // Straight to it before the hand-over: the flight ends at station zero and
    // must not also glide there.
    glide.current = progress.current >= 1 ? 0 : 1;
    wanted.current.yaw = 0;
    wanted.current.pitch = 0;
    shown.current.yaw = 0;
    shown.current.pitch = 0;
    settled.current = 0;
  }, [index, stations, camera, from, to, look, fov, aspect, progress]);

  /* ---- The pointer stream: drag to look, tap to act.
         Bound to the canvas element rather than through the R3F event system,
         because a drag has to keep being reported after the finger has left
         whatever object it started on. */
  useEffect(() => {
    const element = gl.domElement;
    let id: number | null = null;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;
    let startedAt = 0;
    let moved = 0;

    const down = (event: PointerEvent) => {
      if (id !== null) return;
      id = event.pointerId;
      // Capture keeps the drag reported after the finger has left the element,
      // and it is a convenience rather than a requirement: it throws if the
      // pointer is not currently active, which is the case for a synthesised
      // event and for some pens. Losing it costs a drag that ends early at the
      // edge of the screen; letting it throw costs the whole look control.
      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // No capture, still a drag.
      }
      lastX = startX = event.clientX;
      lastY = startY = event.clientY;
      startedAt = performance.now();
      moved = 0;
      dragging.current = true;
    };

    const move = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      moved += Math.abs(dx) + Math.abs(dy);

      wanted.current.yaw -= dx * LOOK_SPEED;
      wanted.current.pitch = THREE.MathUtils.clamp(
        wanted.current.pitch - dy * LOOK_SPEED,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    };

    const up = (event: PointerEvent) => {
      if (event.pointerId !== id) return;
      id = null;
      dragging.current = false;
      try {
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Never captured it in the first place.
      }

      // A tap, not a drag: short, and the finger stayed put. Twelve pixels is
      // about the wobble a thumb adds to a deliberate tap on glass.
      const quick = performance.now() - startedAt < 400;
      const still = moved < 12 &&
        Math.abs(event.clientX - startX) < 12 &&
        Math.abs(event.clientY - startY) < 12;
      if (!quick || !still) return;

      const rect = element.getBoundingClientRect();
      tap(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const tap = (x: number, y: number) => {
      pointer.set(x, y);
      raycaster.setFromCamera(pointer, camera);
      raycaster.far = 40;

      // Markers first and on their own ray, so a picture hanging behind a
      // marker does not swallow a tap meant for the floor.
      const markers = scene.getObjectsByProperty("name", "station-marker");
      const onMarker = markers.length
        ? raycaster.intersectObjects(markers, false)[0]
        : undefined;

      const plates = scene.getObjectsByProperty("name", "aim-target");
      const onPlate = plates.length
        ? raycaster.intersectObjects(plates, false)[0]
        : undefined;

      // Whichever is actually in front. A marker on the floor of the next bay
      // is behind the picture above it from most angles and in front of it from
      // none, so the comparison has to be by distance rather than by priority.
      const takeMarker =
        onMarker && (!onPlate || onMarker.distance <= onPlate.distance);

      if (takeMarker) {
        const target = onMarker.object.userData.station;
        if (typeof target === "number") onStation(target);
        return;
      }

      if (!onPlate) return;
      const data = onPlate.object.userData as Partial<AimTarget>;
      // A hit with no label is a blocker, same rule as the crosshair on the
      // desktop: it is in the way and has nothing to say. The world at the
      // centre of the Technical Art podium is one, and it has to be, or a ray
      // goes straight through it and names a moon on the far side.
      onPick(data.label ? (data as AimTarget) : null);
    };

    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };
  }, [gl, camera, scene, onStation, onPick]);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05);
    const station = stations[index];
    if (!station) return;

    const flying = progress.current < 1;

    if (!started) {
      camera.position.set(0, 2, INTRO.from);
      return;
    }

    /* ---- The arrival. Straight down the axis and through the portal, which
           opens from this same value. */
    if (flying) {
      progress.current = Math.min(
        1,
        (performance.now() - flightStart.current) / (INTRO.duration * 1000),
      );
      const eased = 1 - Math.pow(1 - progress.current, 3);
      placement(station, fov, aspect, to);
      camera.position.set(
        THREE.MathUtils.lerp(0, to.position.x, eased),
        THREE.MathUtils.lerp(2, to.position.y, eased),
        THREE.MathUtils.lerp(INTRO.from, to.position.z, eased),
      );
      look.copy(to.target);
      look.z = THREE.MathUtils.lerp(-ROOM.depth / 2, to.target.z, eased);
      camera.lookAt(look);
      // Finished, not starting a glide: the flight has already put the camera
      // at the station. Arming one here would send it back to where the flight
      // began and fly it in a second time, because `from` was captured when
      // this component mounted and the camera has moved 35 m since.
      if (progress.current >= 1) {
        glide.current = 1;
        onArrived();
      }
      status.current = { busy: true, cramped: false, arrived: false };
      return;
    }

    /* ---- The glide, and then the drag on top of wherever it landed. */
    if (glide.current < 1) {
      glide.current = Math.min(1, glide.current + delta / GLIDE);
    }
    const t = glide.current;
    // Smoothstep rather than a cubic out: a move between two standing points
    // should leave slowly as well as arrive slowly, or it reads as a shove.
    const eased = t * t * (3 - 2 * t);

    // Recomputed every frame, so rotating the device re-frames the station the
    // visitor is already standing at instead of leaving them at the old
    // distance until they move.
    placement(station, fov, aspect, to);
    here.lerpVectors(from.position, to.position, eased);
    look.lerpVectors(from.target, to.target, eased);

    camera.position.copy(here);
    camera.lookAt(look);

    // The drag is applied as an offset on the station's own orientation rather
    // than as the orientation itself, which is what keeps a station pointing at
    // its subject: let go of everything and the camera is still square to the
    // picture, with no snap back.
    shown.current.yaw = THREE.MathUtils.lerp(
      shown.current.yaw,
      wanted.current.yaw,
      1 - Math.exp(-LOOK_RESPONSE * delta),
    );
    shown.current.pitch = THREE.MathUtils.lerp(
      shown.current.pitch,
      wanted.current.pitch,
      1 - Math.exp(-LOOK_RESPONSE * delta),
    );
    basis.set(shown.current.pitch, shown.current.yaw, 0);
    camera.quaternion.multiply(offset.setFromEuler(basis));

    /* ---- What the frame loop and the HUD need to know.
           `settled` is the grace period after arriving: the case captures and
           the wall mechanism both keep moving for a moment after the camera has
           stopped, and a loop that went to sleep the instant the glide ended
           would freeze them half way. */
    if (t >= 1) settled.current += delta;
    else settled.current = 0;

    const moves =
      station.kind === "exhibit" ||
      station.kind === "mark" ||
      station.kind === "contact";

    status.current = {
      busy: t < 1 || dragging.current || moves || settled.current < 2.5,
      cramped: isCramped(station, fov, aspect),
      arrived: true,
    };
  });

  return null;
}

/* --------------------------------------------------------------------------
   StationMarkers — where else you can stand.
   -------------------------------------------------------------------------- */
/**
 * A ring on the floor at every station, and it is there to be tapped.
 *
 * The HUD has arrows that walk the tour in order, and those are the reliable
 * path — a thumb finds a button at the bottom of the screen without aiming. The
 * rings are the other thing: they say the room has places in it and lets a
 * visitor choose one directly, which is what a gallery floor plan is for.
 *
 * Flat, unlit and unfogged. They are wayfinding paint, not an object in the
 * room, and painted lines on a floor do not take the light.
 */
export function StationMarkers({
  index,
  visible,
}: {
  index: number;
  visible: boolean;
}) {
  const { size } = useThree();
  const quality = useRoomQuality();
  const stations = useResolvedStations();
  const aspect = size.width / Math.max(1, size.height);
  const fov = fovFor(aspect);

  /**
   * The standing points, at the aspect ratio the camera currently has.
   *
   * Recomputed when the device is rotated, because the station distances are:
   * a marker left where portrait put it would be a metre and a half behind the
   * place landscape actually stands.
   */
  const spots = useMemo(() => {
    const out = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    return stations.map((station) => {
      placement(station, fov, aspect, out);
      return out.position.clone();
    });
  }, [stations, fov, aspect]);

  if (!visible) return null;

  return (
    <group>
      {spots.map((spot, i) =>
        // Not the one being stood on. A disc under the visitor's own feet is
        // never seen and always in the way of a tap meant for the floor behind
        // it.
        i === index ? null : (
          <mesh
            key={stations[i].id}
            name="station-marker"
            userData={{ station: i }}
            position={[spot.x, 0.015, spot.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={2}
          >
            {/* A disc rather than a ring, because it is a tap target first: a
                thumb has to be able to miss the middle by a centimetre. */}
            <circleGeometry args={[0.44, 20]} />
            <meshBasicMaterial
              color={BRAND_COLORS.teal}
              transparent
              opacity={0.2}
              depthWrite={false}
              toneMapped={false}
              fog={quality.tier === "full"}
            />
          </mesh>
        ),
      )}
    </group>
  );
}

/* --------------------------------------------------------------------------
   FrameCadence — how often the room is drawn.
   -------------------------------------------------------------------------- */
/**
 * The render loop, taken off the browser's hands.
 *
 * With `frameloop="never"` on the <Canvas>, react-three-fiber draws only when
 * `advance` is called, and this is the only thing that calls it. That buys two
 * things a phone needs and a desktop does not:
 *
 *   - A ceiling. A handheld device that holds 60 fps holds it by spending its
 *     thermal budget, and then throttles the whole chip. 30 is a cap, not a
 *     capability: the room could draw faster and is not asked to.
 *   - A floor. Parked in front of a picture, nothing in the room moves. The
 *     loop drops to a few frames a second — enough that a texture arriving late
 *     still appears, cheap enough that the phone cools down while its owner
 *     reads a caption.
 *
 * The one rule that matters: the busy flag is written by whoever is animating,
 * and it is written generously. A frame drawn that did not need to be is
 * invisible; a frame skipped that was needed is a frozen room.
 */
export function FrameCadence({
  status,
  onRate,
}: {
  status: React.RefObject<TourStatus>;
  /**
   * How fast the room is actually drawing, reported about once a second.
   *
   * Optional, and only wired up when the HUD is showing the readout: this is
   * the one number that cannot be measured anywhere but on the device itself. A
   * desktop browser in a test harness renders the room in software at whatever
   * rate its timer fires, which says nothing at all about a phone.
   */
  onRate?: (fps: number) => void;
}) {
  const advance = useThree((state) => state.advance);
  const quality = useRoomQuality();

  useEffect(() => {
    const cap = quality.fpsCap || 60;
    /** Heartbeat while nothing is happening. */
    const idle = 5;

    let frame = 0;
    let last = 0;
    let drawn = 0;
    let since = 0;
    /**
     * When this loop started, so the first frame is not enormous.
     *
     * react-three-fiber derives the delta by subtracting its own clock from
     * whatever is passed here, and that clock is set to zero when the frameloop
     * becomes "never". Passing the page's own timeline would therefore make the
     * first frame as long as the visitor took to press the button — fifteen
     * seconds is a normal figure — and every integration in the room would take
     * one step of that size before the second frame corrected it.
     */
    let origin = 0;

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      const hz = status.current?.busy ? cap : idle;
      // A millisecond of slack, or a 30 Hz cap on a 60 Hz display lands just
      // past its own budget every other frame and delivers 20.
      if (now - last < 1000 / hz - 1.2) return;
      last = now;
      if (!origin) origin = now;
      // Seconds, not milliseconds.
      //
      // In frameloop="never" react-three-fiber does not read the clock: it
      // takes this argument as the elapsed time and derives the frame delta
      // from it, `delta = timestamp - clock.elapsedTime`. Handed
      // performance.now() it therefore sees every frame as sixteen *seconds*
      // long. Everything in the room that clamps its delta shrugged that off;
      // the mark on the plinth, which does not, turned seventeen times a
      // second until the loop dropped to its idle rate and the spin aliased
      // into a blur. That was the thing on the phone that looked broken.
      advance((now - origin) / 1000);

      if (!onRate) return;
      drawn += 1;
      if (!since) since = now;
      if (now - since >= 1000) {
        onRate(Math.round((drawn * 1000) / (now - since)));
        drawn = 0;
        since = now;
      }
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [advance, quality.fpsCap, status, onRate]);

  return null;
}

/* --------------------------------------------------------------------------
   LiteFill — the second of the lite tier's two lights.
   -------------------------------------------------------------------------- */
/**
 * The far end of the hall, where three of the thirteen stations are.
 *
 * Everything that moves in this building carries no lightmap, because a
 * lightmap is baked for something standing still: the six blocks in each end
 * wall, the two sculptures on their podiums, the mark on its plinth. On the
 * full tier each of those has a light of its own, seven in all, and three.js
 * compiles the scene's light count into every material's shader — so all seven
 * are evaluated on every fragment of every wall in the building, forty metres
 * from the nearest of them. On a phone drawing the hall at 488 pixels across,
 * that is the most expensive thing in the frame and almost none of it lands
 * anywhere the visitor is looking.
 *
 * The lite tier keeps two. The mark's own spot, over in MarkPlinth, and this
 * one: a single wide spot from the nave ceiling covering the contact wall and
 * both founder podiums at once, in place of the four that used to.
 *
 * Both are spots with a short throw and a steep decay, and that is the whole
 * point of the shape. The first attempt was one directional light, which has
 * no falloff at all: bright enough to model a concrete block, it also added
 * that much to every baked wall and to the entire floor, which faces straight
 * up into it. The hall came out evenly lit and flat, which is precisely what
 * 512 samples of Cycles were spent not being.
 *
 * Mounted unconditionally and never unmounted. Adding or removing a light
 * recompiles every material in the room, which on a phone is a few hundred
 * milliseconds of stall, so the light count here is a constant and a station
 * that needs less simply gets the same two.
 */
export function LiteFill() {
  const aim = useMemo(() => new THREE.Object3D(), []);
  const far = -ROOM.depth / 2;

  return (
    <>
      {/* Aimed at the wall rather than at either podium: the two sculptures
          stand 4.85 m either side of the centre line and 1.7 m off the wall, so
          a cone wide enough to reach the wall behind them has already reached
          them. */}
      <primitive object={aim} position={[0, 1.7, far + 0.6]} />
      <spotLight
        position={[0, SECTION.naveHeight - 1.4, far + 7.5]}
        target={aim}
        angle={0.72}
        penumbra={1}
        intensity={260}
        distance={18}
        decay={1.7}
        color="#cfe0ea"
      />

      {/* No ambient, and nothing global. An ambient light would lift the
          blacks the bake spent 512 samples earning, and it is a worse version
          of the environment map — which fills from every direction at once, is
          already resident, and on this tier hands the unbaked surfaces more
          than twice what the baked ones get. See UNBAKED_FILL in BakedHall. */}
    </>
  );
}
