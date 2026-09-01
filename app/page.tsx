import { Hero } from "@/components/hero/Hero";
import { Manifesto } from "@/components/sections/Manifesto";
import { Services } from "@/components/sections/Services";
import { Cases } from "@/components/sections/Cases";
import { Process } from "@/components/sections/Process";
import { StudioContact } from "@/components/sections/StudioContact";
import { WalkableRoomMount } from "@/components/walkable/WalkableRoomMount";

export default function HomePage() {
  return (
    <>
      {/* ACT I — the claim, and proof that we render in realtime. */}
      <Hero />

      {/* ACT II — the pause. One sentence about how we work. */}
      <Manifesto />

      {/* ACT III — pinned sequence: WEB / SPACE / SYSTEM / RUN. */}
      <Services />

      {/* ACT IV — the work, with the plate distorting under the cursor. */}
      <Cases />

      {/* ACT V — how a project actually runs. */}
      <Process />

      {/* ACT VI — who we are, and the single next step. */}
      <StudioContact />

      {/* Overlay, opened by any [data-walkable-trigger] element. The bundle
          is fetched on that first click, never before. */}
      <WalkableRoomMount />
    </>
  );
}
