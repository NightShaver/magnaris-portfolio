# Room ambience

The walkable room plays one looping track:

    public/audio/atlasaudio-ambient-574024.mp3

Source: Pixabay, track 574024 by AtlasAudio — pixabay.com/music/-574024/
Licence: Pixabay Content License. Free for commercial use, no attribution
required, redistribution of the file as a standalone audio product is not.

Swapping the track means changing `TRACK_SRC` in `lib/useRoomAmbience.ts` to
the new file name. If the file is missing the room simply stays silent: the
hook detects the failed load and hides the sound control, so nothing breaks.

## What to look for

- Ambient / drone / neoclassical pad, no drums, no melody that repeats often
  enough to be noticed. It has to survive twenty minutes of walking around.
- 2–5 minutes long, and it should loop without an audible seam. Fade the
  first and last 2 seconds into each other in Audacity if the tail clicks.
- MP3, 128 kbps mono is plenty at this volume. Keep it under ~4 MB; the file
  is fetched when the room opens, next to the 3D bundle.
- Normalise to about -18 LUFS. The player caps the element volume at 0.08
  (MAX_VOLUME in lib/useRoomAmbience.ts) and starts visitors at 70% of that,
  so a track mastered loud will still feel loud relative to the rest of the
  page. Visitors change the level with the slider in the room HUD or with
  the + and - keys, and the choice is remembered in localStorage.

## Where to get one

Free to use commercially, no attribution required:

- Pixabay Music — pixabay.com/music/search/ambient/ (Pixabay Content License)
- Uppbeat — uppbeat.io (free tier, no attribution on the "no credit" tracks)
- Free Music Archive, filtered to CC0 — freemusicarchive.org

Free with attribution — a credit line then has to appear in the imprint or
in the room HUD:

- Kevin MacLeod / incompetech.com (CC BY 4.0)
- Chosic — chosic.com/free-music/ambient/ (mixed CC BY and CC0, check per track)
- Freesound — freesound.org, filter by CC0 (field recordings, room tone)

"No copyright" is a marketing phrase, not a legal status: every track is
copyrighted, and what these sources give you is a licence. Save the licence
page or the track's licence text next to this README when you add the file,
so the permission can still be proven later.

## Attribution, if the licence needs it

Add the credit to the imprint page and, for CC BY, keep the required form:
title, author, source, licence. The HUD in `components/walkable/WalkableRoom.tsx`
has room for a small line next to the sound control.
