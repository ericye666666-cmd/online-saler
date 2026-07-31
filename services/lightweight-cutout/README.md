# Lightweight Cutout Service

A CPU-only, non-generative background-removal service for the fixed clothing measurement board.

## Processing

1. Decode the original JPEG, PNG or WEBP and apply EXIF orientation.
2. Estimate the board background from the image border, or compare against an optional empty-board template.
3. Remove thin board marks and isolated components.
4. Refine the foreground mask with OpenCV GrabCut.
5. Apply the mask as an alpha channel to the original RGB pixels.
6. Return a transparent PNG and simple quality headers.

The service never redraws the garment. It changes only the alpha channel.

## API

```text
GET /health
POST /remove-background
```

`POST /remove-background` uses multipart form data:

- `image_file`: required original product image.
- `background_template`: optional empty-board image with matching framing.

Response headers:

- `X-Cutout-Method`
- `X-Cutout-Quality-Score`
- `X-Cutout-Quality-Issues`

## Local run

```bash
python -m pip install -r services/lightweight-cutout/requirements.txt
uvicorn app.main:app --app-dir services/lightweight-cutout --host 0.0.0.0 --port 8080
```

## Tests

```bash
PYTHONPATH=services/lightweight-cutout \
python -m unittest discover -s services/lightweight-cutout/tests -p 'test_*.py'
```

## Limits

The lightweight engine is expected to work best with a fixed matte board, centered garments and consistent lighting. White garments, transparent materials, lace, fur and severe shadows should later fall back to the rembg + BiRefNet engine.
