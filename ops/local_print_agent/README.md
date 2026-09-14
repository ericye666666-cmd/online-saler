# Direct Loop / ERP shared Deli DL-720C print helper

## Windows setup

1. Keep the existing Deli DL-720C Windows driver and 60×40 mm label roll used by ERP (2 mm gap, 203 dpi).
2. Download the helper from the Operations label-print dialog, extract the ZIP, and close the old ERP helper window. Only one helper can use port 8719.
3. Double-click `start_online_saler_print_agent_windows.bat`. If Python is missing, the launcher uses Windows Package Manager to install Python 3.12 for the current user. No extra Python packages are required.
4. Keep that window open. In Operations click **检测**. Allow local-network access if Chrome/Edge asks.
5. Print one label, check that its barcode scans to the displayed product barcode and that the size / shelf location match. Attach it and click **确认当前标签已贴好**. Then print the remaining labels and confirm attachment.

The helper supports the copied ERP label protocols as well as Online Saler on the same port. No ERP database or inventory settings change. See SOURCE.md for the exact source version.

## Product labels

The preview and native output share a 480×320 monochrome raster. This preserves Chinese names and prints Code 128 bars without browser page scaling. The local helper sends TSPL BITMAP bytes through the same Windows RAW spooler path as ERP. Browser page printing is not used.

Print requests submit one copy of an existing product barcode. Submission does not mark a label as attached or publish inventory. The separate human confirmation records completion. Reprint keeps the same barcode. A batch stops at the first error; labels already accepted in that dialog are excluded from “remaining”. The current browser tab preserves submitted and uncertain results across dialog reopen/refresh. Uncertain requests are excluded from automatic remaining-label printing. Check physical labels before explicit reprint. A new browser tab does not know previous unconfirmed print submissions.

Only use a 60×40 mm roll. A 300 dpi device or different media size needs a separate template and is not covered by this 720/203 dpi template.

## Diagnostics

- `/health` must report `online_saler_raster_v1`. An older helper must be replaced before Online Saler printing.
- `/printers` must list the actual Windows queue as available.
- Disconnected: start the helper on the same Windows computer as the browser and printer, allow local network access, then detect again.
- Port busy: close the old helper; the launcher does not kill processes automatically.
- Submission timed out: a label may already have printed. Check the printer before explicitly reprinting.
- Missing/offline printer: check the Windows driver, USB, paper and paused jobs.

Software verification cannot establish actual paper feed, ink contrast or scanner readability. Validate the first physical label on the customer's printer before running the full batch.
