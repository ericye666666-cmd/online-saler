from __future__ import annotations

from fastapi import FastAPI, Header, HTTPException, Request, Response

from .cutout import remove_background

app = FastAPI(title="Online Saler Lightweight Cutout", version="1.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "processor": "lightweight-opencv", "version": "v1.0"}


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
