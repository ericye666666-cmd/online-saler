# Lightweight OpenCV Cutout Service

This service removes the controlled measurement-board background without a paid API or generative image model.

## Algorithm

1. Estimate board/background colour from the image border in LAB colour space.
2. Build a foreground mask from colour distance and garment edges.
3. Remove small components and keep the central garment regions.
4. Refine the mask with OpenCV GrabCut.
5. Feather the alpha edge slightly and return a transparent PNG.
6. Return rule-based quality metadata in response headers.

## API

- `GET /health`
- `POST /remove-background`
  - body: raw JPEG, PNG or WEBP bytes
  - response: transparent PNG
  - headers: `X-Quality-Score`, `X-Quality-Issues`

## Run locally

```bash
docker build -t online-saler-lightweight-cutout apps/image-processor-lightweight
docker run --rm -p 8080:8080 online-saler-lightweight-cutout
```

Configure the main API with:

```text
BACKGROUND_REMOVAL_PROVIDER=auto
LIGHTWEIGHT_CUTOUT_SERVICE_URL=http://localhost:8080
REMBG_BIREFNET_SERVICE_URL=http://localhost:8081
```

## Guardrails

- No generative model is used.
- Original product pixels are retained; only alpha is generated.
- This first version assumes a controlled, mostly uniform measurement-board background.
- White, translucent, lace and highly reflective garments may receive a low quality score and will be routed to the BiRefNet fallback when `BACKGROUND_REMOVAL_PROVIDER=auto`.
