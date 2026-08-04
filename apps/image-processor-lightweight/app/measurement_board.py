from __future__ import annotations

from dataclasses import dataclass
import math

import cv2
import numpy as np


@dataclass(frozen=True)
class BoardPoint:
    x: float
    y: float


@dataclass(frozen=True)
class MeasurementBoardDetection:
    top_left: BoardPoint
    top_right: BoardPoint
    bottom_right: BoardPoint
    bottom_left: BoardPoint
    confidence: float


def detect_measurement_board(image_bytes: bytes) -> MeasurementBoardDetection:
    encoded = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Image could not be decoded")

    height, width = image.shape[:2]
    if width < 480 or height < 480:
        raise ValueError("Measurement board image is too small")

    scale = min(1.0, 1600.0 / max(width, height))
    working = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale < 1 else image
    working_height, working_width = working.shape[:2]
    gray = cv2.cvtColor(working, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(gray, 50, 130)
    lines = cv2.HoughLinesP(
        edges,
        1,
        np.pi / 360,
        threshold=70,
        minLineLength=int(min(working_width, working_height) * 0.32),
        maxLineGap=int(min(working_width, working_height) * 0.12),
    )
    if lines is None:
        raise ValueError("Complete 120 x 160 cm measurement board was not found")

    candidates: dict[str, list[tuple[float, np.ndarray]]] = {
        "top": [],
        "bottom": [],
        "left": [],
        "right": [],
    }
    for raw_line in lines[:, 0]:
        x1, y1, x2, y2 = (float(value) for value in raw_line)
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)

        if abs(dx) > 1 and abs(dy / dx) <= math.tan(math.radians(12)) and length >= working_width * 0.38:
            y_at_center = y1 + dy * (working_width / 2 - x1) / dx
            if y_at_center <= working_height * 0.22:
                candidates["top"].append((length, raw_line))
            if y_at_center >= working_height * 0.75:
                candidates["bottom"].append((length, raw_line))

        if abs(dy) > 1 and abs(dx / dy) <= math.tan(math.radians(18)) and length >= working_height * 0.50:
            x_at_center = x1 + dx * (working_height / 2 - y1) / dy
            if x_at_center <= working_width * 0.38:
                candidates["left"].append((length, raw_line))
            if x_at_center >= working_width * 0.62:
                candidates["right"].append((length, raw_line))

    if any(not candidates[key] for key in candidates):
        raise ValueError("All four outer measurement board edges must be visible")

    selected = {key: max(values, key=lambda item: item[0]) for key, values in candidates.items()}
    top = selected["top"][1]
    bottom = selected["bottom"][1]
    left = selected["left"][1]
    right = selected["right"][1]
    corners = [
        _intersection(top, left),
        _intersection(top, right),
        _intersection(bottom, right),
        _intersection(bottom, left),
    ]
    if any(point is None for point in corners):
        raise ValueError("Measurement board edge intersections are invalid")

    points = [point for point in corners if point is not None]
    _validate_complete_board(points, working_width, working_height, gray)

    line_coverage = min(
        selected["top"][0] / working_width,
        selected["bottom"][0] / working_width,
        selected["left"][0] / working_height,
        selected["right"][0] / working_height,
    )
    confidence = round(max(0.75, min(0.98, 0.78 + line_coverage * 0.20)), 3)
    normalized = [
        BoardPoint(round(point[0] / working_width * 100, 2), round(point[1] / working_height * 100, 2))
        for point in points
    ]
    return MeasurementBoardDetection(
        top_left=normalized[0],
        top_right=normalized[1],
        bottom_right=normalized[2],
        bottom_left=normalized[3],
        confidence=confidence,
    )


def _intersection(first: np.ndarray, second: np.ndarray) -> tuple[float, float] | None:
    x1, y1, x2, y2 = (float(value) for value in first)
    x3, y3, x4, y4 = (float(value) for value in second)
    denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denominator) < 1e-6:
        return None
    first_cross = x1 * y2 - y1 * x2
    second_cross = x3 * y4 - y3 * x4
    return (
        (first_cross * (x3 - x4) - (x1 - x2) * second_cross) / denominator,
        (first_cross * (y3 - y4) - (y1 - y2) * second_cross) / denominator,
    )


def _validate_complete_board(
    points: list[tuple[float, float]],
    width: int,
    height: int,
    gray: np.ndarray,
) -> None:
    top_left, top_right, bottom_right, bottom_left = points
    polygon = np.array(points, dtype=np.float32)
    area_ratio = abs(cv2.contourArea(polygon)) / (width * height)
    top_y = (top_left[1] + top_right[1]) / 2
    bottom_y = (bottom_left[1] + bottom_right[1]) / 2
    left_x = (top_left[0] + bottom_left[0]) / 2
    right_x = (top_right[0] + bottom_right[0]) / 2
    top_width = math.dist(top_left, top_right)
    bottom_width = math.dist(bottom_left, bottom_right)
    left_height = math.dist(top_left, bottom_left)
    right_height = math.dist(top_right, bottom_right)

    complete = (
        area_ratio >= 0.48
        and top_y <= height * 0.16
        and bottom_y >= height * 0.84
        and left_x <= width * 0.30
        and right_x >= width * 0.70
        and min(top_width, bottom_width) >= width * 0.48
        and min(left_height, right_height) >= height * 0.72
        and all(-width * 0.05 <= x <= width * 1.05 and -height * 0.05 <= y <= height * 1.05 for x, y in points)
    )
    if not complete:
        raise ValueError("Detected ruler lines do not cover the complete 120 x 160 cm board")

    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, polygon.astype(np.int32), 255)
    board_pixels = gray[mask == 255]
    if board_pixels.size == 0 or float(np.percentile(board_pixels, 65)) < 145:
        raise ValueError("Detected frame is not a light measurement board")
