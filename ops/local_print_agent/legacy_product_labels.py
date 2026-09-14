"""Compatibility for existing single-product 60x40 / 40x30 clients."""
import re
BARCODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9-]{3,63}$")
DEFAULT_PRINTER_NAME = "Deli DL-720C"

def clean_text(value: object, limit: int = 32) -> str:
    text = re.sub(r"[\r\n\"]+", " ", str(value or "").strip())
    text = re.sub(r"\s+", " ", text)
    return text[:limit]


def normalize_label_payload(payload: dict) -> tuple[dict, str | None]:
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else payload
    template_size = normalize_template_size(payload.get("template_size") or label_payload.get("template_size"))
    barcode = str(label_payload.get("barcode_value") or payload.get("barcode_value") or "").strip().upper()
    if not BARCODE_RE.fullmatch(barcode):
        return {}, "Label barcode is missing or invalid."

    printer_name = str(payload.get("printer_name") or payload.get("printer") or DEFAULT_PRINTER_NAME).strip()
    return {
        "printer_name": printer_name,
        "template_size": template_size,
        "copies": max(1, min(int(payload.get("copies") or 1), 10)),
        "barcode": barcode,
        "title": clean_text(label_payload.get("title"), 34),
        "category": clean_text(label_payload.get("category"), 18),
        "color": clean_text(label_payload.get("color"), 14),
        "size": clean_text(label_payload.get("size"), 10),
        "condition": clean_text(label_payload.get("condition"), 14),
        "product_code": clean_text(label_payload.get("product_code"), 20),
    }, None


def normalize_template_size(value: object) -> str:
    raw = str(value or "").strip().lower().replace(" ", "")
    if raw in {"40x30", "4030", "40*30", "40mmx30mm"}:
        return "40x30"
    return "60x40"


def build_tspl_label(data: dict) -> str:
    if data["template_size"] == "40x30":
        return "\r\n".join(
            [
                "SIZE 40 mm,30 mm",
                "GAP 2 mm,0 mm",
                "DENSITY 8",
                "SPEED 4",
                "DIRECTION 1",
                "CLS",
                f'TEXT 20,18,"2",0,1,1,"{data["category"]} {data["color"]}"',
                f'TEXT 20,48,"2",0,1,1,"SIZE {data["size"]} {data["condition"]}"',
                f'BARCODE 20,82,"128",70,1,0,2,2,"{data["barcode"]}"',
                f'TEXT 20,160,"1",0,1,1,"{data["barcode"]}"',
                f"PRINT 1,{data['copies']}",
                "",
            ]
        )

    return "\r\n".join(
        [
            "SIZE 60 mm,40 mm",
            "GAP 2 mm,0 mm",
            "DENSITY 8",
            "SPEED 4",
            "DIRECTION 1",
            "CLS",
            f'TEXT 24,18,"2",0,1,1,"{data["title"]}"',
            f'TEXT 24,50,"2",0,1,1,"{data["category"]} / {data["color"]}"',
            f'TEXT 24,82,"2",0,1,1,"SIZE {data["size"]}  {data["condition"]}"',
            f'BARCODE 24,120,"128",82,1,0,2,2,"{data["barcode"]}"',
            f'TEXT 24,218,"1",0,1,1,"{data["barcode"]}"',
            f'TEXT 24,244,"1",0,1,1,"{data["product_code"]}"',
            f"PRINT 1,{data['copies']}",
            "",
        ]
    )
