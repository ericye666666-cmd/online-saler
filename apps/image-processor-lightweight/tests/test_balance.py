from __future__ import annotations

import unittest

import cv2
import numpy as np

from app.balance import (
    _arm_row_shifts,
    _balanced_outline_is_safe,
    _largest_connected_component,
    balance_garment,
)


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

    def test_sleeve_alignment_is_horizontal_and_bounded(self) -> None:
        arm = np.zeros((500, 400), dtype=bool)
        for y in range(100, 401):
            x = 80 + (y - 100) // 5
            arm[y, x : x + 35] = True

        horizontal = _arm_row_shifts(arm, 100, 180, 300, -1)

        self.assertEqual(horizontal.shape, (500,))
        self.assertLessEqual(float(np.max(np.abs(horizontal))), 24.01)
        self.assertEqual(float(horizontal[450]), 0.0)

    def test_arm_component_excludes_detached_side_flap(self) -> None:
        candidate = np.zeros((300, 300), dtype=bool)
        candidate[40:210, 20:100] = True
        candidate[240:285, 90:105] = True

        selected = _largest_connected_component(candidate)

        self.assertTrue(selected[100, 50])
        self.assertFalse(selected[260, 95])

    def test_outline_guard_rejects_a_new_horizontal_tail(self) -> None:
        source = np.zeros((400, 400, 4), dtype=np.uint8)
        source[80:330, 90:310] = (80, 90, 100, 255)
        candidate = source.copy()
        candidate[300:303, 310:399] = (80, 90, 100, 255)

        self.assertTrue(_balanced_outline_is_safe(source, source.copy()))
        self.assertFalse(_balanced_outline_is_safe(source, candidate))


if __name__ == "__main__":
    unittest.main()
