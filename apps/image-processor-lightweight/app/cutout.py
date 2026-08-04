from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class CutoutResult:
    png: bytes
    quality_score: float
    issues: tuple[str, ...]


def remove_background(image_bytes: bytes) -> CutoutResult:
    image = _decode_image(image_bytes)
    height, width = image.shape[:2]

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB).astype(np.float32)
    border = max(8, int(min(height, width) * 0.035))
    border_pixels = np.concatenate(
        [
            lab[:border].reshape(-1, 3),
            lab[-border:].reshape(-1, 3),
            lab[:, :border].reshape(-1, 3),
            lab[:, -border:].reshape(-1, 3),
        ],
        axis=0,
    )
    background = np.median(border_pixels, axis=0)
    distance = np.linalg.norm(lab - background, axis=2)

    border_distance = np.linalg.norm(border_pixels - background, axis=1)
    threshold = float(np.clip(np.percentile(border_distance, 98) + 8.0, 14.0, 38.0))
    foreground = np.where(distance > threshold, 255, 0).astype(np.uint8)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 45, 135)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    foreground = cv2.bitwise_or(foreground, edges)

    kernel_size = max(3, int(round(min(height, width) / 220)) | 1)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, kernel, iterations=2)
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_OPEN, kernel, iterations=1)

    foreground = _keep_central_components(foreground)
    foreground = _refine_with_grabcut(image, foreground)

    return _encode_result(image, foreground)


def remove_background_guided(
    image_bytes: bytes, normalized_points: list[tuple[float, float]]
) -> CutoutResult:
    image = _decode_image(image_bytes)
    height, width = image.shape[:2]
    if len(normalized_points) < 6 or len(normalized_points) > 60:
        raise ValueError("Foreground polygon must contain between 6 and 60 points")

    points = np.array(
        [
            [
                int(round(np.clip(x, 0.0, 1.0) * (width - 1))),
                int(round(np.clip(y, 0.0, 1.0) * (height - 1))),
            ]
            for x, y in normalized_points
        ],
        dtype=np.int32,
    )
    polygon = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(polygon, [points], 255)
    polygon_area = int(np.count_nonzero(polygon))
    if polygon_area < height * width * 0.01:
        raise ValueError("Foreground polygon is too small")
    if polygon_area > height * width * 0.9:
        raise ValueError("Foreground polygon is too large")

    # The employee's polygon is a guide, not a hard crop. Give GrabCut a small
    # search band outside it and seed every narrow garment section from a local
    # erosion. A global distance percentile only seeded the torso and allowed
    # pale sleeves on a white board to be classified as background.
    search_margin = max(5, int(round(min(height, width) * 0.012)))
    seed_margin = max(2, int(round(min(height, width) * 0.004)))
    expanded = cv2.dilate(
        polygon,
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (search_margin * 2 + 1, search_margin * 2 + 1),
        ),
        iterations=1,
    )
    sure_foreground = cv2.erode(
        polygon,
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (seed_margin * 2 + 1, seed_margin * 2 + 1),
        ),
        iterations=1,
    )
    if not np.any(sure_foreground):
        raise ValueError("Foreground polygon is empty")

    mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    mask[expanded == 255] = cv2.GC_PR_BGD
    mask[polygon == 255] = cv2.GC_PR_FGD
    mask[sure_foreground == 255] = cv2.GC_FGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(
            image,
            mask,
            None,
            background_model,
            foreground_model,
            5,
            cv2.GC_INIT_WITH_MASK,
        )
    except cv2.error as error:
        raise ValueError("Unable to separate the garment inside the selected outline") from error

    foreground = np.where(
        ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)) & (expanded == 255),
        255,
        0,
    ).astype(np.uint8)
    foreground = _keep_central_components(foreground)

    retained_ratio = float(np.count_nonzero(foreground)) / float(polygon_area)
    if retained_ratio < 0.18:
        raise ValueError("Selected outline did not contain a clear garment; place points closer to its edge")
    return _encode_result(image, foreground)


def _decode_image(image_bytes: bytes) -> np.ndarray:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unsupported or invalid image")
    height, width = image.shape[:2]
    if min(height, width) < 128:
        raise ValueError("Image is too small")
    return image


def _encode_result(image: np.ndarray, foreground: np.ndarray) -> CutoutResult:
    alpha = cv2.GaussianBlur(foreground, (0, 0), sigmaX=0.8)
    rgba = cv2.cvtColor(image, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha

    ok, png = cv2.imencode(".png", rgba, [cv2.IMWRITE_PNG_COMPRESSION, 6])
    if not ok:
        raise RuntimeError("Unable to encode transparent PNG")

    score, issues = _quality(foreground, image)
    return CutoutResult(png=png.tobytes(), quality_score=score, issues=tuple(issues))


def _keep_central_components(mask: np.ndarray) -> np.ndarray:
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return mask

    height, width = mask.shape
    center = np.array([width / 2.0, height / 2.0])
    candidates: list[tuple[float, int]] = []
    minimum_area = height * width * 0.001

    for label in range(1, count):
        area = float(stats[label, cv2.CC_STAT_AREA])
        if area < minimum_area:
            continue
        distance = np.linalg.norm(centroids[label] - center) / max(height, width)
        score = area * (1.0 - min(distance, 0.8))
        candidates.append((score, label))

    if not candidates:
        return mask

    candidates.sort(reverse=True)
    selected = {label for _, label in candidates[:3]}
    return np.where(np.isin(labels, list(selected)), 255, 0).astype(np.uint8)


def _refine_with_grabcut(image: np.ndarray, initial: np.ndarray) -> np.ndarray:
    mask = np.full(initial.shape, cv2.GC_PR_BGD, dtype=np.uint8)
    mask[initial == 255] = cv2.GC_PR_FGD

    border = max(4, int(min(initial.shape) * 0.02))
    mask[:border] = cv2.GC_BGD
    mask[-border:] = cv2.GC_BGD
    mask[:, :border] = cv2.GC_BGD
    mask[:, -border:] = cv2.GC_BGD

    eroded = cv2.erode(initial, np.ones((5, 5), np.uint8), iterations=2)
    mask[eroded == 255] = cv2.GC_FGD

    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        image,
        mask,
        None,
        background_model,
        foreground_model,
        3,
        cv2.GC_INIT_WITH_MASK,
    )
    return np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0
    ).astype(np.uint8)


def _quality(mask: np.ndarray, image: np.ndarray) -> tuple[float, list[str]]:
    height, width = mask.shape
    area_ratio = float(np.count_nonzero(mask)) / float(height * width)
    issues: list[str] = []

    if area_ratio < 0.06:
        issues.append("SUBJECT_TOO_SMALL")
    if area_ratio > 0.82:
        issues.append("SUBJECT_TOO_LARGE")

    edge_pixels = np.concatenate([mask[0], mask[-1], mask[:, 0], mask[:, -1]])
    edge_ratio = float(np.count_nonzero(edge_pixels)) / float(edge_pixels.size)
    if edge_ratio > 0.04:
        issues.append("SUBJECT_TOUCHES_EDGE")

    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    minimum_component_area = max(height * width * 0.0015, np.count_nonzero(mask) * 0.015)
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
        _has_bright_secondary_component(image, labels, stats, significant_labels)
        or _has_embedded_bright_board_residue(image, mask)
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
    return round(float(np.clip(score, 0.0, 1.0)), 3), issues


def _has_bright_secondary_component(
    image: np.ndarray,
    labels: np.ndarray,
    stats: np.ndarray,
    significant_labels: list[int],
) -> bool:
    if len(significant_labels) < 2:
        return False

    primary = max(significant_labels, key=lambda label: stats[label, cv2.CC_STAT_AREA])
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
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


def _has_embedded_bright_board_residue(image: np.ndarray, mask: np.ndarray) -> bool:
    foreground = mask > 0
    foreground_pixels = int(np.count_nonzero(foreground))
    if foreground_pixels == 0:
        return False

    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
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
