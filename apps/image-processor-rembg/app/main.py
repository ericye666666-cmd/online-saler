from __future__ import annotations

import io
import os
from functools import lru_cache
from threading import Lock

import cv2
import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool
from PIL import Image, UnidentifiedImageError
from rembg import new_session, remove

PROCESSOR_VERSION = "rembg-birefnet-v3-board-quality"
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


def analyze_cutout(output: bytes) -> tuple[float, tuple[str, ...]]:
    with Image.open(io.BytesIO(output)) as image:
        rgba = image.convert("RGBA")
        pixels = np.asarray(rgba)
        alpha = pixels[:, :, 3]
        width, height = rgba.size
        mask = np.where(alpha > 16, 255, 0).astype(np.uint8)
        foreground_pixels = int(np.count_nonzero(mask))
        area_ratio = foreground_pixels / max(1, width * height)
        issues: list[str] = []

        if area_ratio < 0.06:
            issues.append("SUBJECT_TOO_SMALL")
        if area_ratio > 0.82:
            issues.append("SUBJECT_TOO_LARGE")

        edge_pixels = np.concatenate([mask[0], mask[-1], mask[:, 0], mask[:, -1]])
        edge_ratio = float(np.count_nonzero(edge_pixels)) / max(1, edge_pixels.size)
        if edge_ratio > 0.04:
            issues.append("SUBJECT_TOUCHES_EDGE")

        count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        minimum_component_area = max(width * height * 0.0015, foreground_pixels * 0.015)
        significant_labels = [
            label
            for label in range(1, count)
            if stats[label, cv2.CC_STAT_AREA] >= minimum_component_area
        ]
        component_count = len(significant_labels)
        if component_count > 6:
            issues.append("EDGE_FRAGMENTED")
        if component_count > 2:
            issues.append("MULTIPLE_FOREGROUND_COMPONENTS")
        if _has_bright_secondary_component(pixels[:, :, :3], labels, stats, significant_labels):
            issues.append("BOARD_RESIDUE_SUSPECTED")

        score = 1.0
        score -= min(abs(area_ratio - 0.34), 0.34) * 0.45
        score -= min(edge_ratio, 0.2) * 1.5
        score -= max(0, component_count - 3) * 0.04
        score -= len(issues) * 0.13
        return round(max(0.0, min(1.0, score)), 3), tuple(issues)


def _has_bright_secondary_component(
    rgb: np.ndarray,
    labels: np.ndarray,
    stats: np.ndarray,
    significant_labels: list[int],
) -> bool:
    if len(significant_labels) < 2:
        return False

    primary = max(significant_labels, key=lambda label: stats[label, cv2.CC_STAT_AREA])
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    primary_pixels = hsv[labels == primary]
    if primary_pixels.size == 0:
        return False
    primary_saturation = float(np.median(primary_pixels[:, 1]))
    primary_value = float(np.median(primary_pixels[:, 2]))
    foreground_area = sum(float(stats[label, cv2.CC_STAT_AREA]) for label in significant_labels)

    for label in significant_labels:
        if label == primary:
            continue
        area_share = float(stats[label, cv2.CC_STAT_AREA]) / max(1.0, foreground_area)
        if area_share < 0.04:
            continue
        pixels = hsv[labels == label]
        if pixels.size == 0:
            continue
        saturation = float(np.median(pixels[:, 1]))
        value = float(np.median(pixels[:, 2]))
        looks_like_board = saturation <= 42 and value >= 205
        differs_from_primary = value >= primary_value + 15 or saturation + 20 <= primary_saturation
        if looks_like_board and differs_from_primary:
            return True
    return False


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
        quality_score, quality_issues = await run_in_threadpool(analyze_cutout, output)
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
            "X-Quality-Score": str(quality_score),
            "X-Quality-Issues": ",".join(quality_issues),
        },
    )
