import base64
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from types import SimpleNamespace
from unittest.mock import patch
import agent
import erp_agent as erp

class AgentTests(unittest.TestCase):
    def payload(self):
        return {"printer_name": "Deli DL-720C", "template_size": "60x40", "label_payload": {"template_scope": "online_saler_product", "barcode_value": "DLFBATCH178561817592406", "raster": {"width": 480, "height": 320, "data": base64.b64encode(bytes([0x80, 0xff, 0]) + bytes(19197)).decode()}}}
    def test_binary_label_does_not_corrupt_high_bits(self):
        normalized, error = agent.normalize_label_payload(self.payload())
        self.assertIsNone(error)
        raw = agent.build_tspl_label(normalized["label_payload"])
        self.assertIn(b"BITMAP 0,0,60,320,0,\x80\xff\0", raw)
        self.assertTrue(raw.endswith(b"\r\nPRINT 1,1\r\n"))
    def test_rejects_invalid_bitmap_and_barcode(self):
        for key, value in [("width", 800), ("height", 100), ("data", "invalid")]:
            p = self.payload(); p["label_payload"]["raster"][key] = value
            self.assertIsNotNone(agent.normalize_label_payload(p)[1])
        p = self.payload(); p["label_payload"]["barcode_value"] = 'x"\r\nPRINT 1,100'
        self.assertIsNotNone(agent.normalize_label_payload(p)[1])
    def test_erp_protocol_is_preserved(self):
        p = {"printer_name": "Deli DL-720C", "template_code": "store_prep_bale_60x40", "label_payload": {"template_code": "store_prep_bale_60x40", "barcode_value": "2000000001", "display_code": "SDB2609140026"}}
        self.assertEqual(agent.normalize_label_payload(p), agent._original_normalize(p))
        label = {"template_code": "store_prep_bale_60x40", "machine_code": "2000000001", "display_code": "SDB2609140026"}
        self.assertEqual(agent.build_tspl_label(label), agent._original_build(label))
    def test_erp_and_operations_origins_only(self):
        self.assertTrue(agent.cors_headers("https://staging.directlooperp.com"))
        self.assertTrue(agent.cors_headers("https://online-saler-operations-staging-3fkoh3sliq-bq.a.run.app"))
        self.assertTrue(agent.cors_headers("https://online-saler-operations-staging-865804815203.africa-south1.run.app"))
        self.assertFalse(agent.cors_headers("https://untrusted.example"))
        self.assertFalse(agent.cors_headers("https://online-saler-operations-staging-evil.a.run.app"))
    def test_mac_sends_the_same_bytes_through_cups(self):
        # The Mac half existed nowhere for a while: the label was built, then handed
        # to a Windows-only function that answered "run this on Windows". Whatever the
        # spooler, the printer has to receive the identical TSPL stream.
        normalized, error = agent.normalize_label_payload(self.payload())
        self.assertIsNone(error)
        expected = agent.build_tspl_label(normalized["label_payload"])
        completed = SimpleNamespace(returncode=0, stdout=b"request id is Deli_DL-720C-1", stderr=b"")
        with patch.object(agent.shutil, "which", return_value="/usr/bin/lp"),                 patch.object(erp, "_resolve_printer_name_unix", return_value=("Deli_DL-720C", None)),                 patch.object(agent.subprocess, "run", return_value=completed) as run:
            ok, message, printer, tspl = agent.print_label_cups(normalized)
        self.assertTrue(ok, message)
        self.assertEqual(printer, "Deli_DL-720C")
        self.assertEqual(tspl, expected)
        self.assertEqual(run.call_args.args[0], ["lp", "-d", "Deli_DL-720C", "-o", "raw", "-"])
        # -o raw is the whole point: any filter in the way renders a blank label.
        self.assertEqual(run.call_args.kwargs["input"], expected)

    def test_cups_failure_is_reported_rather_than_claimed_as_printed(self):
        normalized, _ = agent.normalize_label_payload(self.payload())
        refused = SimpleNamespace(returncode=1, stdout=b"", stderr=b"lp: The printer is not responding.")
        with patch.object(agent.shutil, "which", return_value="/usr/bin/lp"),                 patch.object(erp, "_resolve_printer_name_unix", return_value=("Deli_DL-720C", None)),                 patch.object(agent.subprocess, "run", return_value=refused):
            ok, message, _, _ = agent.print_label_cups(normalized)
        self.assertFalse(ok)
        self.assertIn("not responding", message)
        with patch.object(agent.shutil, "which", return_value=None):
            ok, message = agent.send_raw_to_cups_printer("Deli_DL-720C", b"x")
        self.assertFalse(ok)
        self.assertIn("lp", message)

    def test_each_operating_system_reaches_its_own_spooler(self):
        normalized, _ = agent.normalize_label_payload(self.payload())
        with patch.object(agent.platform, "system", return_value="Windows"),                 patch.object(erp, "_print_label_windows", return_value=(True, "windows", "p", b"")) as windows,                 patch.object(agent, "print_label_cups") as cups:
            agent.print_label(normalized)
            windows.assert_called_once()
            cups.assert_not_called()
        for system in ("Darwin", "Linux"):
            with patch.object(agent.platform, "system", return_value=system),                     patch.object(erp, "_print_label_windows") as windows,                     patch.object(agent, "print_label_cups", return_value=(True, "cups", "p", b"")) as cups:
                agent.print_label(normalized)
                cups.assert_called_once()
                windows.assert_not_called()

    def test_health_and_real_http_print_dispatch(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), agent.PrintAgentHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        root = "http://127.0.0.1:" + str(server.server_port)
        try:
            with urlopen(root + "/health") as response:
                self.assertIn("online_saler_raster_v1", json.load(response)["capabilities"])
            with patch.object(agent, "print_label", return_value=(True, "submitted", "Deli DL-720C", b"binary")) as submit:
                request = Request(root + "/print/label", data=json.dumps(self.payload()).encode(), headers={"Content-Type": "application/json", "Origin": "https://staging.directlooperp.com"})
                with urlopen(request) as response:
                    self.assertTrue(json.load(response)["ok"])
                submit.assert_called_once()
                self.assertEqual(len(submit.call_args.args[0]["label_payload"]["raster_bytes"]), 19200)
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == "__main__": unittest.main()
