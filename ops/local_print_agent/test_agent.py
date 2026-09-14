import base64
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
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
    def test_health_and_real_http_print_dispatch(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), agent.PrintAgentHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        root = "http://127.0.0.1:" + str(server.server_port)
        try:
            with urlopen(root + "/health") as response:
                self.assertIn("online_saler_raster_v1", json.load(response)["capabilities"])
            with patch.object(erp, "_print_label_windows", return_value=(True, "submitted", "Deli DL-720C", b"binary")) as submit:
                request = Request(root + "/print/label", data=json.dumps(self.payload()).encode(), headers={"Content-Type": "application/json", "Origin": "https://staging.directlooperp.com"})
                with urlopen(request) as response:
                    self.assertTrue(json.load(response)["ok"])
                submit.assert_called_once()
                self.assertEqual(len(submit.call_args.args[0]["label_payload"]["raster_bytes"]), 19200)
        finally:
            server.shutdown(); server.server_close(); thread.join()

if __name__ == "__main__": unittest.main()
