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

PROCESSOR_VERSION = "rembg-birefnet-v4-board-cleanup"
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
    return cleanup_measurement_board_residue(raw, bytes(output))


def cleanup_measurement_board_residue(raw: bytes, output: bytes) -> bytes:
    """Remove board-colored pixels that BiRefNet joined to a darker garment.

    BiRefNet can return one connected alpha component containing both the
    garment and the light measurement board. Connected-component quality
    checks cannot distinguish that failure from a clean one-piece garment.
    The transparent pixels still tell us what the local board color looks
    like in the source image, so use them to build a conservative background
    color model and retain only the dominant non-board subject component.
    """
    with Image.open(io.BytesIO(raw)) as source_image, Image.open(io.BytesIO(output)) as cutout_image:
        source_rgb = np.asarray(source_image.convert("RGB"))
        rgba = np.asarray(cutout_image.convert("RGBA")).copy()

    if source_rgb.shape[:2] != rgba.shape[:2]:
        return output

    height, width = rgba.shape[:2]
    alpha = rgba[:, :, 3]
    foreground = alpha > 16
    foreground_pixels = int(np.count_nonzero(foreground))
    if foreground_pixels < height * width * 0.06:
        return output

    hsv = cv2.cvtColor(source_rgb, cv2.COLOR_RGB2HSV)
    known_light_background = (
        (~foreground)
        & (hsv[:, :, 1] <= 55)
        & (hsv[:, :, 2] >= 150)
    )
    if np.count_nonzero(known_light_background) < height * width * 0.05:
        return output

    lab = cv2.cvtColor(source_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    board_color = np.median(lab[known_light_background], axis=0)
    board_distance = np.linalg.norm(lab - board_color, axis=2)
    board_like = (
        foreground
        & (board_distance <= 28.0)
        & (hsv[:, :, 1] <= 70)
        & (hsv[:, :, 2] >= 145)
    )
    board_share = float(np.count_nonzero(board_like)) / max(1, foreground_pixels)
    if board_share < 0.18:
        return output

    # Use only confidently dark or chromatic pixels as subject seeds. Using
    # every pixel that merely differs from the median board color allows ruler
    # marks and board lighting gradients to form a ring connected around the
    # garment, which recreates the exact false-positive we are removing.
    confident_subject = foreground & (
        (hsv[:, :, 2] <= 170) | (hsv[:, :, 1] >= 55)
    )
    subject_seed = np.where(confident_subject, 255, 0).astype(np.uint8)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(subject_seed, connectivity=8)
    minimum_seed_area = max(height * width * 0.004, foreground_pixels * 0.08)
    candidates: list[tuple[float, int]] = []
    image_center = np.array([width / 2.0, height / 2.0])
    total_seed_area = max(1, int(np.count_nonzero(subject_seed)))
    for label in range(1, count):
        area = float(stats[label, cv2.CC_STAT_AREA])
        if area < minimum_seed_area:
            continue
        center_distance = np.linalg.norm(centroids[label] - image_center) / max(height, width)
        candidates.append((area * (1.0 - min(center_distance, 0.75)), label))
    if not candidates:
        return output

    _, subject_label = max(candidates)
    subject_area = int(stats[subject_label, cv2.CC_STAT_AREA])
    if subject_area / total_seed_area < 0.65:
        return output

    subject = np.where(labels == subject_label, 255, 0).astype(np.uint8)
    # Recover only the anti-aliased garment edge. A wide search band keeps a
    # visible white board halo around dark clothing.
    radius = max(1, int(round(min(height, width) * 0.0015)))
    nearby = cv2.dilate(
        subject,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1)),
        iterations=1,
    )
    keep = foreground & (nearby > 0)
    kept_pixels = int(np.count_nonzero(keep))
    removed_pixels = foreground_pixels - kept_pixels
    if kept_pixels < height * width * 0.06 or removed_pixels < foreground_pixels * 0.12:
        return output

    rgba[:, :, 3] = np.where(keep, alpha, 0).astype(np.uint8)
    encoded = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(encoded, format="PNG", optimize=True)
    return encoded.getvalue()


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
        if (
            _has_bright_secondary_component(pixels[:, :, :3], labels, stats, significant_labels)
            or _has_embedded_bright_board_residue(pixels[:, :, :3], mask)
            or _has_inset_frame_residue(mask)
        ):
            issues.append("BOARD_RESIDUE_SUSPECTED")

        score = 1.0
        score -= min(abs(area_ratio - 0.34), 0.34) * 0.45
        score -= min(edge_ratio, 0.2) * 1.5
        score -= max(0, component_count - 3) * 0.04
        score -= len(issues) * 0.13
        if "BOARD_RESIDUE_SUSPECTED" in issues:
            score = min(score, 0.6)
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


def _has_embedded_bright_board_residue(rgb: np.ndarray, mask: np.ndarray) -> bool:
    """Detect a light board joined into the garment's main alpha component."""
    foreground = mask > 0
    foreground_pixels = int(np.count_nonzero(foreground))
    if foreground_pixels == 0:
        return False

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    bright_board = foreground & (hsv[:, :, 1] <= 42) & (hsv[:, :, 2] >= 205)
    dark_or_colored_subject = foreground & (
        (hsv[:, :, 2] <= 170) | (hsv[:, :, 1] >= 55)
    )
    bright_share = float(np.count_nonzero(bright_board)) / foreground_pixels
    subject_share = float(np.count_nonzero(dark_or_colored_subject)) / foreground_pixels
    bottom_start = int(round(mask.shape[0] * 0.75))
    bottom_bright_ratio = float(np.count_nonzero(bright_board[bottom_start:])) / max(
        1, bright_board[bottom_start:].size
    )
    return bright_share >= 0.18 and subject_share >= 0.16 and bottom_bright_ratio >= 0.03


def _has_inset_frame_residue(mask: np.ndarray) -> bool:
    """Catch a retained ruler/board frame even when the garment is pale."""
    foreground = mask > 0
    height, width = foreground.shape
    top_end = max(1, int(round(height * 0.12)))
    bottom_start = min(height - 1, int(round(height * 0.88)))
    left_end = max(1, int(round(width * 0.12)))
    right_start = min(width - 1, int(round(width * 0.88)))
    row_occupancy = np.mean(foreground, axis=1)
    column_occupancy = np.mean(foreground, axis=0)
    return (
        float(np.max(row_occupancy[:top_end])) >= 0.55
        and float(np.max(row_occupancy[bottom_start:])) >= 0.55
        and max(
            float(np.max(column_occupancy[:left_end])),
            float(np.max(column_occupancy[right_start:])),
        ) >= 0.40
    )


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
