# rembg + BiRefNet image processor

Self-hosted high-quality background-removal service for garment images.

## Runtime

- FastAPI
- rembg CPU runtime
- `birefnet-general` by default
- one model session per container
- transparent PNG output

## Endpoints

- `GET /health`
- `POST /remove-background` with raw image bytes

## Environment

```text
REMBG_MODEL=birefnet-general
MAX_IMAGE_BYTES=20971520
PORT=8080
```

The Docker image downloads the default model during image build so Cloud Run startup does not depend on a model download.

## Main API configuration

```text
BACKGROUND_REMOVAL_PROVIDER=auto
LIGHTWEIGHT_CUTOUT_SERVICE_URL=https://<lightweight-service-url>
REMBG_BIREFNET_SERVICE_URL=https://<service-url>
```

This service only generates an alpha mask and applies it to the original image pixels. It does not use image generation.
