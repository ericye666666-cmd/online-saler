from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import cv2
import numpy as np
from PIL import Image, ImageOps

MAX_PROCESSING_SIDE = 1400


@dataclass(frozen=True)
class CutoutResult:
    png: bytes
    quality_score: float
    issues: tuple[str, ...]
    method: str


class CutoutError(ValueError):
    pass


def create_cutout(source_bytes: bytes, template_bytes: bytes | None = None) -> CutoutResult:
    source_rgb = _decode_rgb(source_bytes)
    template_rgb = _decode_rgb(template_bytes) if template_bytes else None

    processing_rgb, scale = _resize_for_processing(source_rgb)
    processing_template = None
    if template_rgb is not None:
        processing_template = cv2.resize(
            template_rgb,
            (processing_rgb.shape[1], processing_rgb.shape[0]),
            interpolation=cv2.INTER_AREA,
        )

    initial, method = _initial_mask(processing_rgb, processing_template)
    foreground = _refine_with_grabcut(processing_rgb, initial)
    foreground = _clean_components(foreground)

    if scale != 1.0:
        foreground = cv2.resize(
            foreground,
            (source_rgb.shape[1], source_rgb.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )

    quality_score, issues = _quality(foreground)
    alpha = cv2.GaussianBlur(foreground.astype(np.float32), (0, 0), 0.75)
    alpha = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)

    rgba = np.dstack((source_rgb, alpha))
    ok, encoded = cv2.imencode(
        ".png",
        cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA),
        [cv2.IMWRITE_PNG_COMPRESSION, 6],
    )
    if not ok:
        raise CutoutError("Unable to encode transparent PNG")

    return CutoutResult(
        png=encoded.tobytes(),
        quality_score=quality_score,
        issues=tuple(issues),
        method=method,
    )


def _decode_rgb(data: bytes) -> np.ndarray:
    if not data:
        raise CutoutError("Image body is empty")
    try:
        with Image.open(BytesIO(data)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            return np.asarray(image)
    except Exception as error:
        raise CutoutError("Image could not be decoded") from error


def _resize_for_processing(image: np.ndarray) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    scale = min(1.0, MAX_PROCESSING_SIDE / max(height, width))
    if scale == 1.0:
        return image, scale
    resized = cv2.resize(
        image,
        (max(1, round(width * scale)), max(1, round(height * scale))),
        interpolation=cv2.INTER_AREA,
    )
    return resized, scale


def _initial_mask(
    source_rgb: np.ndarray,
    template_rgb: np.ndarray | None,
) -> tuple[np.ndarray, str]:
    source_lab = cv2.cvtColor(source_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    height, width = source_lab.shape[:2]
    border = _border_mask(height, width, 0.08)

    if template_rgb is not None:
        template_lab = cv2.cvtColor(template_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
        difference = np.linalg.norm(source_lab - template_lab, axis=2)
        threshold = float(np.clip(np.percentile(difference[border], 98) + 6, 10, 42))
        method = "template-diff-grabcut"
    else:
        background_lab = np.median(source_lab[border], axis=0)
        difference = np.linalg.norm(source_lab - background_lab, axis=2)
        threshold = float(np.clip(np.percentile(difference[border], 92) + 8, 16, 48))
        method = "border-model-grabcut"

    mask = (difference > threshold).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    mask = cv2.morphologyEx(
        mask,
        cv2.MORPH_CLOSE,
        np.ones((7, 7), np.uint8),
        iterations=2,
    )
    return _clean_components(mask), method


def _refine_with_grabcut(source_rgb: np.ndarray, initial: np.ndarray) -> np.ndarray:
    height, width = initial.shape
    grabcut_mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)

    probable = cv2.dilate(initial, np.ones((11, 11), np.uint8), iterations=2)
    certain = cv2.erode(initial, np.ones((5, 5), np.uint8), iterations=1)
    grabcut_mask[probable > 0] = cv2.GC_PR_FGD
    grabcut_mask[certain > 0] = cv2.GC_FGD
    grabcut_mask[_border_mask(height, width, 0.025)] = cv2.GC_BGD

    if np.count_nonzero(initial) < height * width * 0.02:
        y1, y2 = int(height * 0.15), int(height * 0.88)
        x1, x2 = int(width * 0.15), int(width * 0.85)
        central = grabcut_mask[y1:y2, x1:x2]
        central[central == cv2.GC_BGD] = cv2.GC_PR_FGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            cv2.cvtColor(source_rgb, cv2.COLOR_RGB2BGR),
            grabcut_mask,
            None,
            background_model,
            foreground_model,
            4,
            cv2.GC_INIT_WITH_MASK,
        )
        refined = np.where(
            (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD),
            1,
            0,
        ).astype(np.uint8)
    except cv2.error:
        refined = initial

    refined = cv2.morphologyEx(refined, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.morphologyEx(refined, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))


def _clean_components(mask: np.ndarray) -> np.ndarray:
    height, width = mask.shape
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8),
        8,
    )
    if count <= 1:
        return mask.astype(np.uint8)

    min_area = max(20, int(height * width * 0.0006))
    image_center_x = width / 2
    image_center_y = height / 2
    kept: list[int] = []

    for component in range(1, count):
        area = int(stats[component, cv2.CC_STAT_AREA])
        center_x, center_y = centroids[component]
        normalized_distance = (
            ((center_x - image_center_x) / max(image_center_x, 1)) ** 2
            + ((center_y - image_center_y) / max(image_center_y, 1)) ** 2
        )
        near_center = normalized_distance < 0.75**2
        if area >= min_area and (near_center or area >= height * width * 0.008):
            kept.append(component)

    if not kept:
        kept = [1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))]

    return np.isin(labels, kept).astype(np.uint8)


def _quality(mask: np.ndarray) -> tuple[float, list[str]]:
    height, width = mask.shape
    area = int(np.count_nonzero(mask))
    area_ratio = area / max(height * width, 1)
    score = 1.0
    issues: list[str] = []

    if area_ratio < 0.025:
        issues.append("SUBJECT_TOO_SMALL")
        score -= 0.45
    elif area_ratio < 0.05:
        issues.append("SUBJECT_SMALL")
        score -= 0.20

    if area_ratio > 0.82:
        issues.append("SUBJECT_TOO_LARGE")
        score -= 0.40

    if area:
        border = _border_mask(height, width, 0.015)
        border_touch_ratio = np.count_nonzero(mask[border]) / area
        if border_touch_ratio > 0.008:
            issues.append("SUBJECT_TOUCHES_FRAME")
            score -= 0.20

    count, _, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        issues.append("EMPTY_MASK")
        return 0.0, issues

    component_areas = stats[1:, cv2.CC_STAT_AREA]
    significant = component_areas[component_areas > height * width * 0.0006]
    if (
        len(significant) > 4
        or int(component_areas.max()) / max(int(component_areas.sum()), 1) < 0.82
    ):
        issues.append("FRAGMENTED_MASK")
        score -= 0.20

    rows, columns = np.where(mask > 0)
    if len(columns):
        box_width = int(columns.max() - columns.min() + 1)
        box_height = int(rows.max() - rows.min() + 1)
        if box_width / width < 0.18 or box_height / height < 0.18:
            issues.append("NARROW_BOUNDING_BOX")
            score -= 0.15

    return max(0.0, min(1.0, score)), issues


def _border_mask(height: int, width: int, fraction: float) -> np.ndarray:
    vertical = max(2, int(height * fraction))
    horizontal = max(2, int(width * fraction))
    mask = np.zeros((height, width), dtype=np.uint8)
    mask[:vertical, :] = 1
    mask[-vertical:, :] = 1
    mask[:, :horizontal] = 1
    mask[:, -horizontal:] = 1
    return mask.astype(bool)
