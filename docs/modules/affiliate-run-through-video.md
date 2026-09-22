# Affiliate run-through videos (TikTok 过款视频)

Affiliate Center → **TikTok video**. One button makes a silent 1080×1920 MP4 an
affiliate posts on TikTok, adding music there.

## What is in a video

- 8 pieces, 1.2 s each, after a 1 s cover and before a 1.5 s end card: about
  12 s, short enough that most viewers watch to the end.
- Only pieces a shopper can buy now (published, priced, inventory `AVAILABLE`)
  that have a ready `FRONT_MAIN` display image. Images go through `/framed` so
  every piece sits the same size.
- The cover keeps everything inside the middle 3:4 of the frame, which is all
  TikTok's profile grid shows, and shows four pieces large.
- Each piece carries its number (`No. 03 / 08`), price and size. The caption
  asks viewers to comment the number; the affiliate replies with that piece's
  tracked link from the list under the video.

## Even exposure

`RunThroughVideoItem` records which pieces each video showed. A new video takes
the pieces shown least across all affiliates, then least by this affiliate,
then newest; remaining ties are random. Pieces therefore take turns, and two
affiliates on the same day get different pieces in a different order, so TikTok
does not see one video posted many times. Failed renders do not count.

## Code

- Selection and caption: `apps/storefront/src/affiliate/run-through.ts`
- Database: `apps/storefront/src/affiliate/run-through-service.ts`
- Routes: `apps/storefront/src/app/api/affiliate/run-through-video/`
  (`GET` categories, `POST` pick pieces, `POST /[id]` render)
- Template: `apps/storefront/src/remotion/run-through-video.tsx`
- Page: `apps/storefront/src/app/seller/run-through-videos.tsx`
