from __future__ import annotations

import json

from fastapi import FastAPI, Header, HTTPException, Request, Response

from .balance import balance_garment
from .cutout import remove_background, remove_background_guided

app = FastAPI(title="Online Saler Lightweight Image Processor", version="2.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "processor": "lightweight-opencv", "version": "v2.1"}


@app.post("/remove-background")
async def cutout(
    request: Request,
    content_type: str | None = Header(default=None),
    x_filename: str | None = Header(default=None),
) -> Response:
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG and WEBP are supported")

    body = await request.body()
    if not body or len(body) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be between 1 byte and 12 MB")

    try:
        result = remove_background(body)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Cutout processing failed") from error

    return Response(
        content=result.png,
        media_type="image/png",
        headers={
            "X-Processor": "lightweight-opencv",
            "X-Processor-Version": "v1.0",
            "X-Quality-Score": str(result.quality_score),
            "X-Quality-Issues": ",".join(result.issues),
            "X-Source-Filename": x_filename or "unknown",
        },
    )


@app.post("/remove-background-guided")
async def guided_cutout(
    request: Request,
    content_type: str | None = Header(default=None),
    x_filename: str | None = Header(default=None),
    x_foreground_polygon: str | None = Header(default=None),
) -> Response:
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG and WEBP are supported")
    body = await request.body()
    if not body or len(body) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be between 1 byte and 12 MB")

    try:
        raw_points = json.loads(x_foreground_polygon or "[]")
        points = [(float(point["x"]), float(point["y"])) for point in raw_points]
    except (TypeError, ValueError, KeyError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Foreground polygon is invalid") from error

    try:
        result = remove_background_guided(body, points)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Guided cutout processing failed") from error

    return Response(
        content=result.png,
        media_type="image/png",
        headers={
            "X-Processor": "manual-guided-grabcut",
            "X-Processor-Version": "guided-grabcut-v2",
            "X-Quality-Score": str(result.quality_score),
            "X-Quality-Issues": ",".join(result.issues),
            "X-Source-Filename": x_filename or "unknown",
        },
    )


@app.post("/balance-garment")
async def balanced_main_image(
    request: Request,
    content_type: str | None = Header(default=None),
    x_filename: str | None = Header(default=None),
) -> Response:
    if content_type != "image/png":
        raise HTTPException(status_code=415, detail="Balanced main image requires a transparent PNG cutout")

    body = await request.body()
    if not body or len(body) > 16 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be between 1 byte and 16 MB")

    try:
        result = balance_garment(body)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Garment balancing failed") from error

    return Response(
        content=result.jpeg,
        media_type="image/jpeg",
        headers={
            "X-Processor": "lightweight-opencv",
            "X-Processor-Version": "opencv-balance-v4",
            "X-Balance-Transforms": ",".join(result.transformations),
            "X-Source-Filename": x_filename or "unknown",
        },
    )
