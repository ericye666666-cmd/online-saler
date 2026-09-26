import { Composition } from "remotion";
import { ANIMATED_DURATION, HowToBuyAnimated } from "./animated-video";
import { HowToBuyReal, REAL_DURATION } from "./real-video";
import { FPS } from "./shared";

export function HowToBuyRoot() {
  return (
    <>
      <Composition id="HowToBuyReal" component={HowToBuyReal} durationInFrames={REAL_DURATION} fps={FPS} width={1080} height={1920} />
      <Composition id="HowToBuyAnimated" component={HowToBuyAnimated} durationInFrames={ANIMATED_DURATION} fps={FPS} width={1080} height={1920} />
    </>
  );
}
