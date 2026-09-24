/* ==========================================================================
   WHAT THE VISITOR IS POINTING AT
   --------------------------------------------------------------------------
   One shape, two ways of arriving at it.

   On a pointer device it comes from the centre of the view: the crosshair is
   the cursor, GazePicker casts a ray down the camera's axis six frames out of
   every six, and what it hits becomes this. On a touch device it comes from a
   tap, cast through the point the thumb actually landed on.

   It lives in lib/ rather than beside either picker because both of them
   produce it and the room's shell consumes it. Defining it next to one of the
   two would make the other import its sibling, and the touch player is imported
   by the shell — which is how a type ends up in a cycle.
   ========================================================================== */

export type AimTarget = {
  label: string;
  /** External case link, opened in a new tab. */
  url?: string;
  /** In-page action instead of a link. */
  action?: "contact";
  /**
   * A skill on one of the founder exhibits: "art:2", "dev:5".
   *
   * Aimed at rather than clicked. A planet is not a link — looking at it is
   * the whole interaction, and what it returns is its name in the air beside
   * it. The key is also what tells the label which body to hang from.
   */
  skill?: string;
};
