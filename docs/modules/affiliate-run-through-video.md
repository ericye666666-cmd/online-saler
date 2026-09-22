# Affiliate run-through videos (TikTok 过款视频)

Affiliate Center → **TikTok videos**. Silent 1080×1920 MP4s an
affiliate posts on TikTok, adding music there.

## What is in a video

- One category per video, pieces ordered by size. 6–9 pieces at 1.0–1.4 s each,
  after a 1 s cover and before a 1.5 s end card: 8–15 s, short enough that
  most viewers watch to the end.
- Only pieces a shopper can buy now (published, priced, inventory `AVAILABLE`)
  that have a ready `FRONT_MAIN` display image. Images go through `/framed` so
  every piece sits the same size.
- The cover keeps everything inside the middle 3:4 of the frame, which is all
  TikTok's profile grid shows: the category, the sizes in the video as chips,
  and four pieces spanning those sizes, each labelled with size and price.
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

## Daily videos

Every active affiliate gets 3 videos per Nairobi day (`RUN_THROUGH_DAILY_VIDEOS`),
each a different category. Categories rotate by the affiliate's place in the
team and move one step per day, so the team covers every category daily.

Cloud Scheduler job `render-affiliate-videos-production` (set up by
`scripts/gcloud/configure-production-scheduler.sh` during the production
deploy) calls `POST /api/internal/run-through-videos` every 3 minutes. Each
call plans any missing daily videos, then renders and stores one in the
`PRODUCT_IMAGE_BUCKET` bucket; 90 videos finish by about 04:30. A render is
claimed with `renderStartedAt` so overlapping calls never take the same video.
Daily videos not rendered on their day are marked failed and stop counting as
shown. When an affiliate opens the page first, their day is planned on the
spot and any video can be rendered with "Make it now".

Posting is not confirmed; the page only records when a video is downloaded.

## Variety

A video's seed (`runThroughVariant`) sets its cover layout (grid, one large
and three small, or a list), background tone, transition (slide, fade, zoom,
cut), time per piece (1.0–1.4 s), number of pieces (6–9) and whether sizes
run up or down. With different pieces as well, videos posted by different
affiliates do not match one another.
