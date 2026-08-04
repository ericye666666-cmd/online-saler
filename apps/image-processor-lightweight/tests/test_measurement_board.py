from __future__ import annotations

import unittest

import cv2
import numpy as np

from app.measurement_board import detect_measurement_board


class MeasurementBoardTests(unittest.TestCase):
    def test_detects_all_four_outer_edges_of_a_perspective_board(self) -> None:
        image = np.full((900, 720, 3), 105, dtype=np.uint8)
        corners = np.array([[115, 35], [590, 48], [680, 870], [45, 850]], dtype=np.int32)
        cv2.fillConvexPoly(image, corners, (242, 242, 242))
        for start, end in zip(corners, np.roll(corners, -1, axis=0)):
            cv2.line(image, tuple(start), tuple(end), (45, 45, 45), 5)
        cv2.rectangle(image, (245, 230), (500, 650), (65, 65, 65), -1)
        ok, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(ok)

        result = detect_measurement_board(encoded.tobytes())

        self.assertAlmostEqual(result.top_left.x, 16.0, delta=2.5)
        self.assertAlmostEqual(result.top_right.x, 82.0, delta=2.5)
        self.assertAlmostEqual(result.bottom_right.x, 94.4, delta=2.5)
        self.assertAlmostEqual(result.bottom_left.x, 6.2, delta=2.5)
        self.assertGreaterEqual(result.confidence, 0.85)

    def test_rejects_an_incomplete_hundred_centimeter_crop(self) -> None:
        image = np.full((900, 720, 3), 100, dtype=np.uint8)
        cropped_board = np.array([[180, 80], [500, 85], [565, 835], [125, 825]], dtype=np.int32)
        cv2.fillConvexPoly(image, cropped_board, (242, 242, 242))
        for start, end in zip(cropped_board, np.roll(cropped_board, -1, axis=0)):
            cv2.line(image, tuple(start), tuple(end), (45, 45, 45), 5)
        ok, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(ok)

        with self.assertRaisesRegex(ValueError, "complete 120 x 160 cm board"):
            detect_measurement_board(encoded.tobytes())


if __name__ == "__main__":
    unittest.main()
