from __future__ import annotations

import unittest
from io import BytesIO

import cv2
import numpy as np
from PIL import Image

from app.cutout import create_cutout


def as_png(image: np.ndarray) -> bytes:
    buffer = BytesIO()
    Image.fromarray(image.astype(np.uint8), "RGB").save(buffer, format="PNG")
    return buffer.getvalue()


class LightweightCutoutTest(unittest.TestCase):
    def test_template_difference_preserves_original_subject_pixels(self) -> None:
        board = self._board()
        source = board.copy()
        polygon = np.array([[105, 125], [295, 125], [325, 485], [75, 485]], np.int32)
        cv2.fillPoly(source, [polygon], (24, 37, 52))

        result = create_cutout(as_png(source), as_png(board))
        output = cv2.imdecode(np.frombuffer(result.png, np.uint8), cv2.IMREAD_UNCHANGED)

        self.assertEqual(output.shape[2], 4)
        self.assertGreater(output[300, 200, 3], 240)
        self.assertLess(output[10, 10, 3], 10)
        self.assertTrue(np.array_equal(output[300, 200, :3][::-1], source[300, 200]))
        self.assertGreaterEqual(result.quality_score, 0.7)
        self.assertEqual(result.method, "template-diff-grabcut")

    def test_border_model_removes_fixed_board_marks_without_template(self) -> None:
        board = self._board()
        source = board.copy()
        cv2.rectangle(source, (90, 150), (310, 470), (70, 45, 35), thickness=-1)

        result = create_cutout(as_png(source))
        output = cv2.imdecode(np.frombuffer(result.png, np.uint8), cv2.IMREAD_UNCHANGED)

        self.assertGreater(output[300, 200, 3], 240)
        self.assertLess(output[10, 10, 3], 10)
        self.assertEqual(result.method, "border-model-grabcut")

    @staticmethod
    def _board() -> np.ndarray:
        height, width = 600, 400
        board = np.full((height, width, 3), 245, np.uint8)
        for x in range(0, width, 25):
            cv2.line(board, (x, 0), (x, 30), (100, 100, 100), 1)
            cv2.line(board, (x, height - 1), (x, height - 31), (100, 100, 100), 1)
        for y in range(0, height, 25):
            cv2.line(board, (0, y), (30, y), (100, 100, 100), 1)
            cv2.line(board, (width - 1, y), (width - 31, y), (100, 100, 100), 1)
        return board


if __name__ == "__main__":
    unittest.main()
