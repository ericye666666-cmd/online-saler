from __future__ import annotations

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response

from .cutout import CutoutError, create_cutout

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(title="Online Saler Lightweight Cutout", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"service": "lightweight-cutout", "status": "ok", "version": "1.0.0"}


@app.post("/remove-background")
async def remove_background(
    image_file: UploadFile = File(...),
    background_template: UploadFile | None = File(default=None),
) -> Response:
    source = await _read_image(image_file, required=True)
    template = await _read_image(background_template, required=False)

    try:
        result = create_cutout(source, template)
    except CutoutError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    return Response(
        content=result.png,
        media_type="image/png",
        headers={
            "X-Cutout-Method": result.method,
            "X-Cutout-Quality-Score": f"{result.quality_score:.3f}",
            "X-Cutout-Quality-Issues": ",".join(result.issues),
        },
    )


async def _read_image(file: UploadFile | None, required: bool) -> bytes | None:
    if file is None:
        if required:
            raise HTTPException(status_code=400, detail="image_file is required")
        return None

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG and WEBP images are supported")

    body = await file.read(MAX_UPLOAD_BYTES + 1)
    if not body:
        raise HTTPException(status_code=400, detail="Image body is empty")
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image must not exceed 15 MB")
    return body
