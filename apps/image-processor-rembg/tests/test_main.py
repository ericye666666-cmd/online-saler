from __future__ import annotations

import io
import importlib.util
import sys
import types
import unittest

import numpy as np
from PIL import Image

if importlib.util.find_spec("rembg") is None:
    rembg_stub = types.ModuleType("rembg")
    rembg_stub.new_session = lambda model_name: model_name
    rembg_stub.remove = lambda *_args, **_kwargs: b""
    sys.modules["rembg"] = rembg_stub

from app.main import (
    ProcessedCutout,
    analyze_cutout,
    choose_preferred_cutout,
    cleanup_measurement_board_residue,
    repair_small_internal_alpha_holes,
    retain_dominant_high_confidence_component,
)


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

    def test_blocks_bright_board_joined_to_dark_garment_as_one_component(self) -> None:
        output = png_with_components([
            (90, 50, 210, 250, (35, 35, 35)),
            (70, 245, 230, 390, (220, 220, 220)),
        ])

        score, issues = analyze_cutout(output)

        self.assertIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertLess(score, 0.75)

    def test_cleans_board_colored_region_joined_to_dark_garment(self) -> None:
        source = np.full((400, 300, 3), 220, dtype=np.uint8)
        source[50:250, 90:210] = (35, 35, 35)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[50:250, 90:210, :3] = (35, 35, 35)
        output[50:250, 90:210, 3] = 255
        output[245:390, 70:230, :3] = (220, 220, 220)
        output[245:390, 70:230, 3] = 255
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        cleaned = cleanup_measurement_board_residue(source_buffer.getvalue(), output_buffer.getvalue())
        cleaned_alpha = np.asarray(Image.open(io.BytesIO(cleaned)).convert("RGBA"))[:, :, 3]
        score, issues = analyze_cutout(cleaned)

        self.assertGreater(int(cleaned_alpha[150, 150]), 240)
        self.assertEqual(int(cleaned_alpha[350, 150]), 0)
        self.assertNotIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertGreaterEqual(score, 0.75)

    def test_cleans_thin_board_sliver_but_preserves_a_light_label(self) -> None:
        source = np.full((400, 300, 3), 220, dtype=np.uint8)
        source[60:330, 70:230] = (45, 45, 45)
        source[80:115, 140:165] = (220, 220, 220)
        source[150:230, 68:70] = (220, 220, 220)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[60:330, 70:230, :3] = source[60:330, 70:230]
        output[60:330, 70:230, 3] = 255
        output[80:115, 140:165, :3] = (220, 220, 220)
        output[150:230, 68:70, :3] = (220, 220, 220)
        output[150:230, 68:70, 3] = 255
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        cleaned = cleanup_measurement_board_residue(source_buffer.getvalue(), output_buffer.getvalue())
        cleaned_alpha = np.asarray(Image.open(io.BytesIO(cleaned)).convert("RGBA"))[:, :, 3]

        self.assertEqual(int(cleaned_alpha[190, 69]), 0)
        self.assertEqual(int(cleaned_alpha[95, 150]), 255)

    def test_repairs_small_enclosed_mask_dropouts_using_original_pixels(self) -> None:
        source = np.full((400, 300, 3), 235, dtype=np.uint8)
        source[60:340, 70:230] = (42, 48, 56)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[60:340, 70:230, :3] = source[60:340, 70:230]
        output[60:340, 70:230, 3] = 255
        output[180:188, 145:154, 3] = 0
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        repaired = repair_small_internal_alpha_holes(source_buffer.getvalue(), output_buffer.getvalue())
        repaired_pixels = np.asarray(Image.open(io.BytesIO(repaired)).convert("RGBA"))

        self.assertEqual(int(repaired_pixels[184, 149, 3]), 255)
        self.assertTupleEqual(tuple(repaired_pixels[184, 149, :3]), (42, 48, 56))

    def test_preserves_large_or_edge_connected_transparent_openings(self) -> None:
        source = np.full((400, 300, 3), 45, dtype=np.uint8)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[40:360, 50:250, :3] = source[40:360, 50:250]
        output[40:360, 50:250, 3] = 255
        output[70:120, 125:175, 3] = 0
        output[250:400, 145:155, 3] = 0
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        repaired = repair_small_internal_alpha_holes(source_buffer.getvalue(), output_buffer.getvalue())
        repaired_alpha = np.asarray(Image.open(io.BytesIO(repaired)).convert("RGBA"))[:, :, 3]

        self.assertEqual(int(repaired_alpha[95, 150]), 0)
        self.assertEqual(int(repaired_alpha[300, 150]), 0)

    def test_repairs_a_narrow_edge_connected_dropout_when_source_confirms_garment(self) -> None:
        source = np.full((400, 300, 3), 230, dtype=np.uint8)
        source[60:340, 70:230] = (45, 52, 62)
        source[180, 80] = (210, 210, 210)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[60:340, 70:230, :3] = source[60:340, 70:230]
        output[60:340, 70:230, 3] = 255
        output[175:185, 60:95, 3] = 0
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        repaired = repair_small_internal_alpha_holes(source_buffer.getvalue(), output_buffer.getvalue())
        repaired_alpha = np.asarray(Image.open(io.BytesIO(repaired)).convert("RGBA"))[:, :, 3]

        self.assertEqual(int(repaired_alpha[180, 80]), 255)
        self.assertEqual(int(repaired_alpha[180, 65]), 0)

    def test_does_not_restore_a_dark_board_mark_near_the_garment(self) -> None:
        source = np.full((400, 300, 3), 230, dtype=np.uint8)
        source[60:340, 90:230] = (45, 52, 62)
        source[194:206, 80:84] = (35, 35, 35)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        output[60:340, 90:230, :3] = source[60:340, 90:230]
        output[60:340, 90:230, 3] = 255
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        repaired = repair_small_internal_alpha_holes(source_buffer.getvalue(), output_buffer.getvalue())
        repaired_alpha = np.asarray(Image.open(io.BytesIO(repaired)).convert("RGBA"))[:, :, 3]

        self.assertEqual(int(repaired_alpha[200, 82]), 0)

    def test_does_not_restore_light_board_visible_between_dark_pant_legs(self) -> None:
        source = np.full((400, 300, 3), 235, dtype=np.uint8)
        source[40:120, 70:230] = (45, 50, 58)
        source[120:360, 70:145] = (45, 50, 58)
        source[120:360, 155:230] = (45, 50, 58)
        source[120:250, 145:155] = (205, 185, 150)
        source_buffer = io.BytesIO()
        Image.fromarray(source, mode="RGB").save(source_buffer, format="PNG")

        output = np.zeros((400, 300, 4), dtype=np.uint8)
        garment = np.all(source == (45, 50, 58), axis=2)
        output[garment, :3] = source[garment]
        output[garment, 3] = 255
        output_buffer = io.BytesIO()
        Image.fromarray(output, mode="RGBA").save(output_buffer, format="PNG")

        repaired = repair_small_internal_alpha_holes(source_buffer.getvalue(), output_buffer.getvalue())
        repaired_alpha = np.asarray(Image.open(io.BytesIO(repaired)).convert("RGBA"))[:, :, 3]

        self.assertEqual(int(repaired_alpha[130, 150]), 0)

    def test_blocks_an_inset_measurement_board_frame(self) -> None:
        pixels = np.zeros((400, 300, 4), dtype=np.uint8)
        pixels[20:30, 20:280, :3] = (220, 220, 220)
        pixels[370:380, 20:280, :3] = (220, 220, 220)
        pixels[20:380, 20:30, :3] = (220, 220, 220)
        pixels[20:380, 270:280, :3] = (220, 220, 220)
        pixels[20:30, 20:280, 3] = 255
        pixels[370:380, 20:280, 3] = 255
        pixels[20:380, 20:30, 3] = 255
        pixels[20:380, 270:280, 3] = 255
        pixels[70:330, 85:215, :3] = (225, 225, 225)
        pixels[70:330, 85:215, 3] = 255
        output = io.BytesIO()
        Image.fromarray(pixels, mode="RGBA").save(output, format="PNG")

        score, issues = analyze_cutout(output.getvalue())

        self.assertIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertLess(score, 0.75)

    def test_blocks_a_large_hollow_partial_measurement_board(self) -> None:
        pixels = np.zeros((400, 300, 4), dtype=np.uint8)
        pixels[10:55, 25:275, :3] = (225, 225, 225)
        pixels[10:380, 25:65, :3] = (225, 225, 225)
        pixels[10:380, 235:275, :3] = (225, 225, 225)
        pixels[330:380, 25:120, :3] = (225, 225, 225)
        pixels[330:380, 180:275, :3] = (225, 225, 225)
        pixels[10:55, 25:275, 3] = 255
        pixels[10:380, 25:65, 3] = 255
        pixels[10:380, 235:275, 3] = 255
        pixels[330:380, 25:120, 3] = 255
        pixels[330:380, 180:275, 3] = 255
        pixels[70:260, 85:215, :3] = (235, 235, 235)
        pixels[70:260, 85:215, 3] = 255
        output = io.BytesIO()
        Image.fromarray(pixels, mode="RGBA").save(output, format="PNG")

        score, issues = analyze_cutout(output.getvalue())

        self.assertIn("BOARD_RESIDUE_SUSPECTED", issues)
        self.assertLess(score, 0.75)

    def test_blocks_a_top_ruler_strip_when_the_garment_is_missing(self) -> None:
        output = png_with_components([(20, 20, 280, 70, (225, 225, 225))])

        score, issues = analyze_cutout(output)

        self.assertIn("SUBJECT_OFF_CENTER", issues)
        self.assertLess(score, 0.75)

    def test_prefers_clean_clothing_fallback_over_invalid_primary(self) -> None:
        primary = ProcessedCutout(
            b"primary",
            "birefnet-general",
            0.6,
            ("SUBJECT_OFF_CENTER",),
        )
        fallback = ProcessedCutout(
            b"fallback",
            "isnet-general-use",
            0.84,
            (),
        )

        selected = choose_preferred_cutout(primary, fallback)

        self.assertEqual(selected.model, "isnet-general-use")
        self.assertEqual(selected.output, b"fallback")

    def test_keeps_centered_soft_subject_and_removes_board_frame(self) -> None:
        alpha = np.zeros((400, 300), dtype=np.uint8)
        alpha[20:28, 20:280] = 220
        alpha[372:380, 20:280] = 220
        alpha[20:380, 20:28] = 220
        alpha[20:380, 272:280] = 220
        alpha[70:350, 85:215] = 240
        alpha[68:352, 83:217] = np.maximum(alpha[68:352, 83:217], 72)

        recovered = retain_dominant_high_confidence_component(alpha)

        self.assertEqual(int(recovered[24, 150]), 0)
        self.assertEqual(int(recovered[200, 24]), 0)
        self.assertEqual(int(recovered[200, 150]), 240)
        self.assertEqual(int(recovered[68, 150]), 72)


if __name__ == "__main__":
    unittest.main()
