# Direct Loop / ERP Deli DL-720C print helper — v1.1.0

## Windows setup

1. Keep the existing Deli DL-720C Windows driver and 60×40 mm label roll used by ERP (2 mm gap, 203 dpi).
2. Download the Windows helper from the Operations label-print dialog. Right-click the ZIP and choose **Extract All**, then open the extracted `DirectLoopPrintAgent` folder.
3. Double-click `start_online_saler_print_agent_windows.bat` (or `DirectLoopPrintAgent.exe`). The app is ready to run on 64-bit Windows 10/11. It includes its runtime: no Python, package installation, administrator access, or internet connection is required to start the helper.
4. Keep that window open. In Operations click **检测**. Allow local-network access if Chrome/Edge asks.
5. Print one label, check that its barcode scans to the displayed product barcode and that the size / shelf location match. Attach it and click **确认当前标签已贴好**. Then print the remaining labels and confirm attachment.

Keep the existing Deli Windows printer driver installed. The same helper supports ERP and Online Saler on port 8719. If an older helper is running, close its window before starting this version. If this version is already running, the new window says so and the existing helper continues working. The launcher never stops another process. See SOURCE.md for the ERP source version.

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
