import { Composition } from "remotion";
import { runThroughVariant } from "../affiliate/run-through";
import { AffiliateTikTokVideo, type AffiliateTikTokVideoProps } from "./affiliate-tiktok-video";
import { RUN_THROUGH_FPS, RunThroughVideo, runThroughDurationInFrames, type RunThroughVideoProps } from "./run-through-video";

const defaultProps: AffiliateTikTokVideoProps = {
  affiliateName: "Direct Loop Affiliate",
  collectionTitle: "Kikuyu Finds",
  qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  products: [],
};

const runThroughDefaultProps: RunThroughVideoProps = {
  categoryLabel: "T-Shirts",
  shopUrl: "dloop.co.ke",
  variant: runThroughVariant(0),
  products: [],
};

export function RemotionRoot() {
  return (
    <>
      <Composition id="AffiliateTikTokVideo" component={AffiliateTikTokVideo} durationInFrames={360} fps={30} width={1080} height={1920} defaultProps={defaultProps} />
      <Composition
        id="RunThroughVideo"
        component={RunThroughVideo}
        durationInFrames={runThroughDurationInFrames(0, runThroughDefaultProps.variant.itemFrames)}
        fps={RUN_THROUGH_FPS}
        width={1080}
        height={1920}
        defaultProps={runThroughDefaultProps}
        calculateMetadata={({ props }) => ({ durationInFrames: runThroughDurationInFrames(props.products.length, props.variant.itemFrames) })}
      />
    </>
  );
}
