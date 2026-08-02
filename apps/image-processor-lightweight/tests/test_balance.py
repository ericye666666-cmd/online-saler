from __future__ import annotations

import unittest

import cv2
import numpy as np

from app.balance import balance_garment


class BalanceGarmentTest(unittest.TestCase):
    def test_balances_a_hooded_top_without_generating_a_new_garment(self) -> None:
        image = np.zeros((800, 700, 4), dtype=np.uint8)
        color = (70, 80, 90, 255)
        cv2.rectangle(image, (230, 260), (470, 690), color, -1)
        cv2.rectangle(image, (285, 70), (415, 275), color, -1)
        left_sleeve = np.array([[230, 280], [160, 320], [95, 520], [145, 535], [250, 370]], dtype=np.int32)
        right_sleeve = np.array([[470, 280], [535, 340], [620, 620], [565, 640], [450, 370]], dtype=np.int32)
        cv2.fillPoly(image, [left_sleeve], color)
        cv2.fillPoly(image, [right_sleeve], color)
        ok, encoded = cv2.imencode(".png", image)
        self.assertTrue(ok)

        result = balance_garment(encoded.tobytes())
        output = cv2.imdecode(np.frombuffer(result.jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)

        self.assertEqual(output.shape[:2], (1200, 1200))
        self.assertIn("SLEEVE_ALIGNMENT", result.transformations)
        self.assertIn("HOOD_CENTERING", result.transformations)
        self.assertTrue(np.all(output[0, 0] >= 248))
        self.assertGreater(np.count_nonzero(np.any(output < 235, axis=2)), 100_000)


if __name__ == "__main__":
    unittest.main()
