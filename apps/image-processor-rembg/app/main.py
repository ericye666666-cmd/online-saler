from __future__ import annotations

import io
import os
from functools import lru_cache
from threading import Lock

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove

PROCESSOR_VERSION = "rembg-birefnet-v1"
DEFAULT_MODEL = "birefnet-general"
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))

app = FastAPI(title="Online Saler rembg BiRefNet Processor", version=PROCESSOR_VERSION)
_session_lock = Lock()


@lru_cache(maxsize=1)
def get_session():
    model_name = os.getenv("REMBG_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL
    return new_session(model_name)


def process_image(raw: bytes) -> bytes:
    try:
        with Image.open(io.BytesIO(raw)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise ValueError("Unsupported or corrupt image") from error

    with _session_lock:
        output = remove(
            raw,
            session=get_session(),
            force_return_bytes=True,
            post_process_mask=True,
        )

    if not isinstance(output, (bytes, bytearray)):
        raise RuntimeError("rembg did not return image bytes")
    return bytes(output)


@app.on_event("startup")
def preload_model() -> None:
    get_session()


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "processor": PROCESSOR_VERSION,
        "model": os.getenv("REMBG_MODEL", DEFAULT_MODEL),
    }


@app.post("/remove-background")
async def remove_background(request: Request) -> Response:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Image body is required")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds MAX_IMAGE_BYTES")

    try:
        output = await run_in_threadpool(process_image, raw)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail="Background removal failed") from error

    return Response(
        content=output,
        media_type="image/png",
        headers={
            "X-Processor-Version": PROCESSOR_VERSION,
            "X-Processor-Model": os.getenv("REMBG_MODEL", DEFAULT_MODEL),
        },
    )
