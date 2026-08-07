import { Composition } from "remotion";
import { AffiliateTikTokVideo, type AffiliateTikTokVideoProps } from "./affiliate-tiktok-video";

const defaultProps: AffiliateTikTokVideoProps = {
  affiliateName: "Direct Loop Affiliate",
  collectionTitle: "Kikuyu Finds",
  qrDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  products: [],
};

export function RemotionRoot() {
  return <Composition id="AffiliateTikTokVideo" component={AffiliateTikTokVideo} durationInFrames={360} fps={30} width={1080} height={1920} defaultProps={defaultProps} />;
}
