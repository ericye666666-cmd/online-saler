# How-to-buy videos

Two short vertical (1080x1920) videos that show customers how to buy on
dloop.co.ke, for sharing on WhatsApp when someone is stuck.

- `HowToBuyReal` (~39 s): real screenshots of the live shop in a phone frame,
  with tap markers and captions. The M-Pesa PIN prompt and "Payment successful"
  screens are drawn and labelled "Illustration", because filming them would need a
  real payment.
- `HowToBuyAnimated` (~32 s): motion-graphics version of the same five steps,
  using real product photos.

This is a separate Remotion entry (`index.ts`). It is not part of the storefront
build, and the existing affiliate videos in `../root.tsx` are unaffected.

## Re-shoot the screenshots

When the shop's pages change, re-capture them (headless Chrome, fresh profile,
390x844 phone viewport). The script adds one item to a browser-only bag and fills
in a sample phone number, but **never taps the Pay button**, so nothing is reserved
and no M-Pesa prompt is sent.

```bash
cd apps/storefront/src/remotion/how-to-buy
node capture/capture.mjs public/real
cp public/real/steps.json steps.json
```

Check the captions in `real-video.tsx` still match the screens.

## Music and sounds

The soundtrack (120 BPM, Afro-pop feel) and the tap / whoosh / success sounds
are synthesised by a script, so there is no third-party audio or licence. The
WAV files are not committed; generate them before rendering:

```bash
node apps/storefront/src/remotion/how-to-buy/audio/generate-audio.mjs
```

## Render

From `apps/storefront`:

```bash
npx remotion render src/remotion/how-to-buy/index.ts HowToBuyReal out/how-to-buy-real.mp4 --public-dir=src/remotion/how-to-buy/public
npx remotion render src/remotion/how-to-buy/index.ts HowToBuyAnimated out/how-to-buy-animated.mp4 --public-dir=src/remotion/how-to-buy/public
```

On Windows add `--browser-executable="C:/Program Files/Google/Chrome/Application/chrome.exe"`
if Remotion cannot download its own headless browser.
