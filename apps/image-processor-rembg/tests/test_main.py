from __future__ import annotations

import io
import unittest

import numpy as np
from PIL import Image

from app.main import analyze_cutout


def png_with_components(components: list[tuple[int, int, int, int, tuple[int, int, int]]]) -> bytes:
    pixels = np.zeros((400, 300, 4), dtype=np.uint8)
    for left, top, right, bottom, color in components:
        pixels[top:bottom, left:right, :3] = color
        pixels[top:bottom, left:right, 3] = 255
    output = io.BytesIO()
    Image.fromarray(pixels, mode="RGBA").save(output, format="PNG")
    return output.getvalue()


class AnalyzeCutoutTests(unittest.TestCase):
    def test_blocks_measurement_board_fragments_around_a_dark_garment(self) -> None:
        output = png_with_components([
            (90, 50, 210, 245, (35, 35, 35)),
            (20, 285, 125, 380, (245, 245, 245)),
            (175, 285, 280, 380, (245, 245, 245)),
        ])

        score, issues = analyze_cutout(output)

        self.assertIn("MULTIPLE_FOREGROUND_COMPONENTS", issues)
        self.assertIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertLess(score, 0.75)

    def test_accepts_one_centered_light_garment(self) -> None:
        output = png_with_components([(80, 50, 220, 350, (230, 230, 230))])

        score, issues = analyze_cutout(output)

        self.assertNotIn("MULTIPLE_FOREGROUND_COMPONENTS", issues)
        self.assertNotIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertGreaterEqual(score, 0.75)


if __name__ == "__main__":
    unittest.main()
