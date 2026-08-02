from __future__ import annotations

import unittest

import cv2
import numpy as np

from app.cutout import remove_background_guided


class GuidedCutoutTests(unittest.TestCase):
    def test_polygon_excludes_measurement_board_frame(self) -> None:
        image = np.full((420, 320, 3), 245, dtype=np.uint8)
        cv2.rectangle(image, (3, 3), (316, 416), (70, 70, 70), 8)
        cv2.rectangle(image, (96, 110), (224, 315), (125, 125, 125), -1)
        cv2.rectangle(image, (45, 130), (105, 175), (125, 125, 125), -1)
        cv2.rectangle(image, (215, 130), (275, 175), (125, 125, 125), -1)
        ok, encoded = cv2.imencode(".jpg", image)
        self.assertTrue(ok)

        points = [
            (0.30, 0.25),
            (0.70, 0.25),
            (0.88, 0.31),
            (0.88, 0.44),
            (0.70, 0.44),
            (0.70, 0.78),
            (0.30, 0.78),
            (0.30, 0.44),
            (0.12, 0.44),
            (0.12, 0.31),
        ]
        result = remove_background_guided(encoded.tobytes(), points)
        decoded = cv2.imdecode(np.frombuffer(result.png, dtype=np.uint8), cv2.IMREAD_UNCHANGED)

        self.assertEqual(decoded.shape[2], 4)
        self.assertEqual(int(decoded[4, 4, 3]), 0)
        self.assertGreater(int(decoded[200, 160, 3]), 200)
        self.assertNotIn("SUBJECT_TOUCHES_EDGE", result.issues)

    def test_requires_enough_outline_points(self) -> None:
        image = np.full((256, 256, 3), 255, dtype=np.uint8)
        ok, encoded = cv2.imencode(".png", image)
        self.assertTrue(ok)
        with self.assertRaisesRegex(ValueError, "between 6 and 60"):
            remove_background_guided(encoded.tobytes(), [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8)])


if __name__ == "__main__":
    unittest.main()
