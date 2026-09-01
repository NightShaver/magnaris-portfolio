"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ==========================================================================
   ROOM AMBIENCE
   --------------------------------------------------------------------------
   A single looping pad that fades up when the visitor enters the walkable
   room and fades back down when they leave. It is deliberately quiet: the
   track is atmosphere, not a soundtrack, so the ceiling volume sits far below
   what a music player would use.

   Three rules the browser forces on us:
     - Playback may only start from a user gesture. The room is opened by a
       click, so the first play() call still sits inside the sticky user
       activation window and is allowed. play() is awaited defensively — a
       rejected promise must not take the room down.
     - Autoplay policy varies per browser, so a rejection is treated as
       "no audio", never as an error.
     - A missing or unreadable file must degrade silently. If the track is
       gone, `available` goes false and the UI hides the control instead of
       offering a dead slider.

   Volume and mute are remembered per visitor in localStorage, because being
   surprised by sound twice is worse than being surprised once.
   ========================================================================== */

/**
 * Where the loop lives. The Pixabay file name is kept verbatim — the trailing
 * number is the track id, which is what makes the licence provable later.
 * See public/audio/README.md.
 */
const TRACK_SRC = "/audio/atlasaudio-ambient-574024.mp3";

/**
 * Ceiling of the element volume, reached when the visitor's own level sits at
 * 100%. Background presence only: at this level the loop is audible in a quiet
 * room and vanishes under anything else going on around the visitor.
 */
const MAX_VOLUME = 0.08;

/** Where a first-time visitor starts, on the 0..1 scale the UI exposes. */
const DEFAULT_LEVEL = 0.7;

/** One press of the volume keys. */
const LEVEL_STEP = 0.1;

/** Fade lengths — a slow entrance, a quicker exit, an immediate correction. */
const FADE_IN_MS = 3200;
const FADE_OUT_MS = 900;
const FADE_ADJUST_MS = 220;

const STORAGE_KEY_MUTED = "magnaris:room-ambience-muted";
const STORAGE_KEY_LEVEL = "magnaris:room-ambience-level";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export type RoomAmbience = {
  /** False while the visitor has muted the loop. */
  enabled: boolean;
  /** False when the file is missing or the browser refused to play it. */
  available: boolean;
  /** The visitor's own level, 0..1. Independent of the mute state. */
  level: number;
  /** Sets an absolute level; unmutes, because reaching for the slider is intent. */
  setLevel: (next: number) => void;
  /** Nudges the level by one step — the keyboard path under pointer lock. */
  stepLevel: (direction: 1 | -1) => void;
  toggle: () => void;
};

/**
 * Plays the ambience loop for as long as `active` is true.
 *
 * @param active   Whether the visitor is inside the room.
 * @param reduced  When true the loop never starts. Some visitors who ask for
 *                 reduced motion do so for vestibular or attention reasons,
 *                 and an unrequested drone works against both.
 */
export function useRoomAmbience(active: boolean, reduced = false): RoomAmbience {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevelState] = useState(DEFAULT_LEVEL);
  const [available, setAvailable] = useState(true);

  // Restore the previous choice before the first play, so a muted visitor
  // never hears the opening moment of the loop.
  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem(STORAGE_KEY_MUTED) === "1");
      const stored = window.localStorage.getItem(STORAGE_KEY_LEVEL);
      if (stored !== null) {
        const parsed = Number.parseFloat(stored);
        if (Number.isFinite(parsed)) setLevelState(clamp01(parsed));
      }
    } catch {
      // Storage can be blocked entirely; the defaults are fine.
    }
  }, []);

  /** Ramps the element volume and pauses once a fade to zero has landed. */
  const fadeTo = useCallback((target: number, duration: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current);

    const from = audio.volume;
    const delta = target - from;
    if (Math.abs(delta) < 0.0005) {
      audio.volume = clamp01(target);
      if (target === 0) audio.pause();
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Smoothstep: a linear ramp reads as a sudden arrival.
      const eased = t * t * (3 - 2 * t);
      audio.volume = clamp01(from + delta * eased);

      if (t < 1) {
        fadeRef.current = requestAnimationFrame(step);
        return;
      }
      fadeRef.current = null;
      if (target === 0) audio.pause();
    };

    fadeRef.current = requestAnimationFrame(step);
  }, []);

  // Create the element once, on the client only.
  useEffect(() => {
    const audio = new Audio(TRACK_SRC);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;

    /**
     * Only a genuine load failure may hide the control. Tearing the element
     * down clears its source, and an empty source fires this same error event
     * — under React's development double-invoke that teardown belongs to a
     * throwaway element, and letting it through would silence the room for a
     * file that is perfectly fine.
     */
    let disposed = false;
    audio.addEventListener("error", () => {
      if (!disposed) setAvailable(false);
    });

    audioRef.current = audio;

    return () => {
      disposed = true;
      if (fadeRef.current !== null) cancelAnimationFrame(fadeRef.current);
      fadeRef.current = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      startedRef.current = false;
    };
  }, []);

  // The actual gate: in the room, not muted, motion not suppressed.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const target = muted || reduced ? 0 : MAX_VOLUME * level;

    if (!active || target === 0) {
      fadeTo(0, FADE_OUT_MS);
      if (!active) startedRef.current = false;
      return;
    }

    // The long fade belongs to the entrance only; a level change afterwards
    // has to answer the key press immediately.
    const duration = startedRef.current ? FADE_ADJUST_MS : FADE_IN_MS;

    let cancelled = false;
    void audio
      .play()
      .then(() => {
        if (cancelled) return;
        startedRef.current = true;
        fadeTo(target, duration);
      })
      .catch(() => {
        // Autoplay refused, or the file failed to decode. Stay silent and
        // let the UI drop the control.
        if (!cancelled) setAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active, muted, reduced, level, fadeTo]);

  // Leaving the tab should not leave a drone running behind it.
  useEffect(() => {
    const onVisibility = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) {
        audio.pause();
      } else if (active && !muted && !reduced) {
        void audio.play().catch(() => undefined);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [active, muted, reduced]);

  const persist = useCallback((key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Non-fatal: the choice simply does not survive a reload.
    }
  }, []);

  const toggle = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      persist(STORAGE_KEY_MUTED, next ? "1" : "0");
      return next;
    });
  }, [persist]);

  const unmute = useCallback(() => {
    setMuted((previous) => {
      if (!previous) return previous;
      persist(STORAGE_KEY_MUTED, "0");
      return false;
    });
  }, [persist]);

  const setLevel = useCallback(
    (next: number) => {
      const value = clamp01(next);
      setLevelState(value);
      persist(STORAGE_KEY_LEVEL, value.toFixed(2));
      // Reaching for the volume is a request to hear something.
      if (value > 0) unmute();
    },
    [persist, unmute],
  );

  const stepLevel = useCallback(
    (direction: 1 | -1) => {
      setLevelState((previous) => {
        const value = clamp01(
          Math.round((previous + direction * LEVEL_STEP) * 100) / 100,
        );
        persist(STORAGE_KEY_LEVEL, value.toFixed(2));
        return value;
      });
      if (direction === 1) unmute();
    },
    [persist, unmute],
  );

  // Memoised: the object lands in the effect dependencies of the room, and a
  // fresh literal every render would re-bind its key listener every frame.
  return useMemo(
    () => ({ enabled: !muted, available, level, setLevel, stepLevel, toggle }),
    [muted, available, level, setLevel, stepLevel, toggle],
  );
}
