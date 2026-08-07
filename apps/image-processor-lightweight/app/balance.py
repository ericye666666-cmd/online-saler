from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class BalanceResult:
    jpeg: bytes
    transformations: tuple[str, ...]


def balance_garment(image_bytes: bytes) -> BalanceResult:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_UNCHANGED)
    if image is None:
        raise ValueError("Unsupported or invalid image")
    if image.ndim != 3 or image.shape[2] != 4:
        raise ValueError("Balanced main image requires a transparent PNG cutout")

    image = _limit_working_size(image, 1800)
    alpha = image[:, :, 3]
    if np.count_nonzero(alpha > 8) < image.shape[0] * image.shape[1] * 0.01:
        raise ValueError("Transparent cutout does not contain a visible garment")

    transformations: list[str] = []
    leveled, angle = _level_hem(image)
    if abs(angle) >= 0.25:
        image = leveled
        transformations.append("HEM_LEVELING")

    mask = image[:, :, 3] > 8
    bounds = _bounds(mask)
    if bounds is None:
        raise ValueError("Transparent cutout does not contain a visible garment")

    left, top, right, bottom = bounds
    subject_width = right - left + 1
    center_x = int(round((left + right) / 2))
    hooded = _looks_hooded(mask, bounds)
    shoulder_y = _shoulder_y(mask, bounds, hooded)
    torso_left, torso_right = _torso_bounds(mask, bounds, shoulder_y)
    source_for_balance = image.copy()

    left_arm = np.zeros_like(mask)
    right_arm = np.zeros_like(mask)
    left_arm[shoulder_y : bottom + 1, left:torso_left] = mask[shoulder_y : bottom + 1, left:torso_left]
    right_arm[shoulder_y : bottom + 1, torso_right + 1 : right + 1] = mask[
        shoulder_y : bottom + 1, torso_right + 1 : right + 1
    ]
    left_arm = _largest_connected_component(left_arm)
    right_arm = _largest_connected_component(right_arm)
    left_shift = _arm_row_shifts(left_arm, shoulder_y, torso_left, subject_width, -1)
    right_shift = _arm_row_shifts(right_arm, shoulder_y, torso_right, subject_width, 1)
    hood_shift = _hood_row_shifts(mask, top, shoulder_y, center_x, subject_width) if hooded else np.zeros(image.shape[0], dtype=np.float32)
    balanced = _continuous_pose_warp(
        image,
        left_shift,
        right_shift,
        hood_shift,
        torso_left,
        torso_right,
        max(4, int(subject_width * 0.1)),
    )

    if hooded and np.max(np.abs(hood_shift)) >= 1.0:
        transformations.append("HOOD_CENTERING")
    if max(np.max(np.abs(left_shift)), np.max(np.abs(right_shift))) >= 1.0:
        transformations.append("SLEEVE_ALIGNMENT")
    if not _balanced_outline_is_safe(source_for_balance, balanced):
        balanced = source_for_balance
        transformations.append("OUTLINE_SAFETY_FALLBACK")

    output = _storefront_canvas(balanced)
    ok, encoded_jpeg = cv2.imencode(
        ".jpg",
        output,
        [cv2.IMWRITE_JPEG_QUALITY, 94],
    )
    if not ok:
        raise RuntimeError("Unable to encode balanced main image")
    return BalanceResult(jpeg=encoded_jpeg.tobytes(), transformations=tuple(transformations))


def _limit_working_size(image: np.ndarray, maximum: int) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1.0, maximum / max(height, width))
    if scale == 1.0:
        return image
    return cv2.resize(image, (int(round(width * scale)), int(round(height * scale))), interpolation=cv2.INTER_AREA)


def _level_hem(image: np.ndarray) -> tuple[np.ndarray, float]:
    mask = image[:, :, 3] > 8
    bounds = _bounds(mask)
    if bounds is None:
        return image, 0.0
    left, top, right, bottom = bounds
    width = right - left + 1
    sample_left = int(round(left + width * 0.28))
    sample_right = int(round(right - width * 0.28))
    points: list[tuple[float, float]] = []
    for x in range(sample_left, sample_right + 1):
        ys = np.where(mask[:, x])[0]
        if ys.size:
            y = float(ys.max())
            if y >= top + (bottom - top) * 0.65:
                points.append((float(x), y))
    if len(points) < 12:
        return image, 0.0
    xs = np.array([point[0] for point in points], dtype=np.float32)
    ys = np.array([point[1] for point in points], dtype=np.float32)
    slope, _ = np.polyfit(xs, ys, 1)
    angle = float(np.degrees(np.arctan(slope)))
    if not np.isfinite(angle) or abs(angle) > 4.0:
        return image, 0.0
    matrix = cv2.getRotationMatrix2D(((left + right) / 2, (top + bottom) / 2), angle, 1.0)
    rotated = cv2.warpAffine(
        image,
        matrix,
        (image.shape[1], image.shape[0]),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    return rotated, angle


def _looks_hooded(mask: np.ndarray, bounds: tuple[int, int, int, int]) -> bool:
    left, top, right, bottom = bounds
    height = bottom - top + 1
    upper = _median_row_span(mask, top + int(height * 0.08), top + int(height * 0.25))
    shoulder = _median_row_span(mask, top + int(height * 0.34), top + int(height * 0.48))
    return shoulder > 0 and upper / shoulder < 0.67


def _shoulder_y(mask: np.ndarray, bounds: tuple[int, int, int, int], hooded: bool) -> int:
    _left, top, _right, bottom = bounds
    height = bottom - top + 1
    start = top + int(height * (0.12 if hooded else 0.03))
    end = top + int(height * (0.5 if hooded else 0.28))
    spans = np.array([_row_span(mask, y) for y in range(mask.shape[0])], dtype=np.float32)
    window = max(2, int(round(height * 0.025)))
    best_y = top + int(height * (0.33 if hooded else 0.13))
    best_growth = -np.inf
    for y in range(start + window, max(start + window + 1, end - window)):
        growth = float(np.mean(spans[y : y + window]) - np.mean(spans[y - window : y]))
        if growth > best_growth:
            best_growth = growth
            best_y = y
    minimum = top + int(height * (0.22 if hooded else 0.05))
    maximum = top + int(height * (0.48 if hooded else 0.30))
    return int(np.clip(best_y, minimum, maximum))


def _torso_bounds(mask: np.ndarray, bounds: tuple[int, int, int, int], shoulder_y: int) -> tuple[int, int]:
    left, top, right, bottom = bounds
    center = int(round((left + right) / 2))
    sample_bottom = top + int((bottom - top) * 0.88)
    region = mask[shoulder_y : sample_bottom + 1, left : right + 1]
    occupancy = np.mean(region, axis=0) if region.size else np.array([])
    threshold = 0.54
    relative_center = center - left
    torso_left = relative_center
    torso_right = relative_center
    while torso_left > 0 and occupancy[torso_left - 1] >= threshold:
        torso_left -= 1
    while torso_right + 1 < occupancy.size and occupancy[torso_right + 1] >= threshold:
        torso_right += 1
    subject_width = right - left + 1
    detected_width = torso_right - torso_left + 1
    if detected_width < subject_width * 0.28 or detected_width > subject_width * 0.68:
        return center - int(subject_width * 0.23), center + int(subject_width * 0.23)
    return left + torso_left, left + torso_right


def _arm_row_shifts(
    arm_mask: np.ndarray,
    shoulder_y: int,
    joint_x: int,
    subject_width: int,
    direction: int,
) -> np.ndarray:
    shifts = np.zeros(arm_mask.shape[0], dtype=np.float32)
    rows = np.where(np.any(arm_mask, axis=1))[0]
    if rows.size < 8:
        return shifts
    centroids = np.full(arm_mask.shape[0], np.nan, dtype=np.float32)
    for y in rows:
        xs = np.where(arm_mask[y])[0]
        if xs.size:
            centroids[y] = float(np.mean(xs))
    valid = np.where(np.isfinite(centroids))[0]
    interpolated = np.interp(np.arange(arm_mask.shape[0]), valid, centroids[valid])
    cuff_y = int(rows.max())
    maximum_shift = subject_width * 0.08
    for y in rows:
        progress = max(0.0, min(1.0, (y - shoulder_y) / max(1, cuff_y - shoulder_y)))
        target = joint_x + direction * subject_width * (0.035 + 0.075 * progress)
        shifts[y] = np.clip(
            (target - interpolated[y]) * _smoothstep(progress),
            -maximum_shift,
            maximum_shift,
        )
    kernel = max(3, int(rows.size * 0.06) | 1)
    return cv2.GaussianBlur(shifts.reshape(-1, 1), (1, kernel), 0).reshape(-1)


def _largest_connected_component(mask: np.ndarray) -> np.ndarray:
    if not np.any(mask):
        return np.zeros_like(mask)
    count, labels, stats, _centroids = cv2.connectedComponentsWithStats(mask.astype(np.uint8), 8)
    if count <= 1:
        return np.zeros_like(mask)
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return labels == largest


def _hood_row_shifts(
    mask: np.ndarray,
    top: int,
    shoulder_y: int,
    center_x: int,
    subject_width: int,
) -> np.ndarray:
    shifts = np.zeros(mask.shape[0], dtype=np.float32)
    for y in range(top, shoulder_y):
        xs = np.where(mask[y])[0]
        if xs.size == 0:
            continue
        progress_to_neck = (y - top) / max(1, shoulder_y - top)
        fade = 1.0 - _smoothstep(max(0.0, min(1.0, (progress_to_neck - 0.6) / 0.4)))
        shifts[y] = np.clip((center_x - float(np.mean(xs))) * fade, -subject_width * 0.08, subject_width * 0.08)
    kernel = max(3, int((shoulder_y - top) * 0.08) | 1)
    return cv2.GaussianBlur(shifts.reshape(-1, 1), (1, kernel), 0).reshape(-1)


def _continuous_pose_warp(
    image: np.ndarray,
    left_shift: np.ndarray,
    right_shift: np.ndarray,
    hood_shift: np.ndarray,
    torso_left: int,
    torso_right: int,
    blend_width: int,
) -> np.ndarray:
    height, width = image.shape[:2]
    xs = np.arange(width, dtype=np.float32)
    left_weight = np.clip((torso_left - xs) / blend_width, 0.0, 1.0)
    right_weight = np.clip((xs - torso_right) / blend_width, 0.0, 1.0)
    left_weight = left_weight * left_weight * (3.0 - 2.0 * left_weight)
    right_weight = right_weight * right_weight * (3.0 - 2.0 * right_weight)
    displacement = (
        left_shift[:, None] * left_weight[None, :]
        + right_shift[:, None] * right_weight[None, :]
        + hood_shift[:, None]
    )
    grid_x = np.broadcast_to(xs[None, :], (height, width)).copy()
    grid_y = np.broadcast_to(np.arange(height, dtype=np.float32)[:, None], (height, width)).copy()
    map_x = grid_x - displacement.astype(np.float32)
    warped = cv2.remap(
        image,
        map_x,
        grid_y,
        interpolation=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    warped[warped[:, :, 3] < 18] = 0
    return warped


def _balanced_outline_is_safe(source: np.ndarray, candidate: np.ndarray) -> bool:
    source_mask = source[:, :, 3] > 8
    candidate_mask = candidate[:, :, 3] > 8
    source_bounds = _bounds(source_mask)
    candidate_bounds = _bounds(candidate_mask)
    if source_bounds is None or candidate_bounds is None:
        return False

    source_area = int(np.count_nonzero(source_mask))
    candidate_area = int(np.count_nonzero(candidate_mask))
    if source_area == 0:
        return False
    area_ratio = candidate_area / source_area
    if area_ratio < 0.9 or area_ratio > 1.1:
        return False

    source_left, source_top, source_right, source_bottom = source_bounds
    candidate_left, candidate_top, candidate_right, candidate_bottom = candidate_bounds
    source_width = source_right - source_left + 1
    source_height = source_bottom - source_top + 1
    candidate_width = candidate_right - candidate_left + 1
    candidate_height = candidate_bottom - candidate_top + 1
    if candidate_width > source_width * 1.1 or candidate_height > source_height * 1.08:
        return False

    source_max_span = max(_row_span(source_mask, y) for y in range(source_top, source_bottom + 1))
    candidate_max_span = max(_row_span(candidate_mask, y) for y in range(candidate_top, candidate_bottom + 1))
    return candidate_max_span <= source_max_span * 1.1


def _storefront_canvas(image: np.ndarray) -> np.ndarray:
    mask = image[:, :, 3] > 8
    bounds = _bounds(mask)
    if bounds is None:
        raise ValueError("Balanced image does not contain a visible garment")
    left, top, right, bottom = bounds
    crop = image[top : bottom + 1, left : right + 1]
    height, width = crop.shape[:2]
    scale = min(1032 / width, 1032 / height)
    resized = cv2.resize(crop, (max(1, int(round(width * scale))), max(1, int(round(height * scale)))), interpolation=cv2.INTER_LANCZOS4)
    rgb = resized[:, :, :3].astype(np.float32)
    alpha = resized[:, :, 3:4].astype(np.float32) / 255.0
    white = np.full_like(rgb, 255.0)
    composited = np.clip(rgb * alpha + white * (1.0 - alpha), 0, 255).astype(np.uint8)
    canvas = np.full((1200, 1200, 3), 255, dtype=np.uint8)
    output_height, output_width = composited.shape[:2]
    x = (1200 - output_width) // 2
    y = (1200 - output_height) // 2
    canvas[y : y + output_height, x : x + output_width] = composited
    return canvas


def _bounds(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if xs.size == 0 or ys.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def _row_span(mask: np.ndarray, y: int) -> int:
    if y < 0 or y >= mask.shape[0]:
        return 0
    xs = np.where(mask[y])[0]
    return 0 if xs.size == 0 else int(xs.max() - xs.min() + 1)


def _median_row_span(mask: np.ndarray, start: int, end: int) -> float:
    spans = [_row_span(mask, y) for y in range(max(0, start), min(mask.shape[0], end + 1))]
    spans = [span for span in spans if span > 0]
    return float(np.median(spans)) if spans else 0.0


def _smoothstep(value: float) -> float:
    return value * value * (3.0 - 2.0 * value)
