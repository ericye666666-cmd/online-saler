# Direct Loop / ERP Deli DL-720C print helper — v1.2.0

## Windows setup

1. Keep the existing Deli DL-720C Windows driver and 60×40 mm label roll used by ERP (2 mm gap, 203 dpi).
2. Download the Windows helper from the Operations label-print dialog. Right-click the ZIP and choose **Extract All**, then open the extracted `DirectLoopPrintAgent` folder.
3. Double-click `start_online_saler_print_agent_windows.bat` (or `DirectLoopPrintAgent.exe`). The app is ready to run on 64-bit Windows 10/11. It includes its runtime: no Python, package installation, administrator access, or internet connection is required to start the helper.
4. Keep that window open. In Operations click **检测**. Allow local-network access if Chrome/Edge asks.
5. Print one label, check that its barcode scans to the displayed product barcode and that the size / shelf location match. Attach it and click **确认当前标签已贴好**. Then print the remaining labels and confirm attachment.

Keep the existing Deli Windows printer driver installed. The same helper supports ERP and Online Saler on port 8719. If an older helper is running, close its window before starting this version. If this version is already running, the new window says so and the existing helper continues working. The launcher never stops another process. See SOURCE.md for the ERP source version.

## macOS setup

The Mac download is source, not an application: the helper is standard-library
Python and runs on the `python3` (3.9) that the Command Line Tools install.
Verified end to end on a MacBook with a DL-720C on 2026-09-25.

1. Download the Mac helper from the Operations label-print dialog and double-click the ZIP to unzip it. Delete older `DirectLoopPrintAgent N` folders first so the path below is the right one.
2. Start it from Terminal and leave that window open while printing:
   ```
   cd ~/Downloads/DirectLoopPrintAgent && python3 agent.py
   ```
   It prints `Running on http://127.0.0.1:8719`. Typing into or dropping files on that window stops it.
   - Double-clicking `start_online_saler_print_agent_macos.command` does the same, but macOS Gatekeeper blocks the downloaded script ("Apple could not verify…"); the Terminal command above avoids that.
   - If `python3` is missing, macOS offers to install the Command Line Tools (or run `xcode-select --install`). Accept, wait for it to finish, and run the command again.
3. Create the print queue once (below), then in Operations click **检测 / Detect**. Allow local-network access if the browser asks.

### The print queue the Mac needs

macOS reaches the printer through CUPS, and the helper sends the label with
`lp -o raw`, which skips every filter and puts the TSPL bytes on the wire
unchanged. No Deli macOS driver is required, but a queue pointed at the printer
is. With the DL-720C plugged in and switched on, run this once in a second
Terminal window (it asks for the Mac's login password):

```
URI=$(lpinfo -v | awk '/usb:\/\//{print $2; exit}'); echo "$URI"; sudo lpadmin -p Deli_DL-720C -E -v "$URI" -m drv:///sample.drv/generic.ppd; cupsenable Deli_DL-720C; cupsaccept Deli_DL-720C; lpstat -a
```

The last line must read `Deli_DL-720C accepting requests`. macOS refuses
`-m raw` ("Raw queues are no longer supported"), so the queue uses the generic
driver; with `-o raw` that driver never renders anything. The deprecation
warning it prints is harmless. The queue name may not contain spaces, which is
why it reads `Deli_DL-720C`; Operations matches that to `Deli DL-720C` on its own.

Print a test label straight from Terminal to separate printer problems from
browser problems:

```
printf 'SIZE 60 mm,40 mm\r\nGAP 2 mm,0 mm\r\nCLS\r\nTEXT 40,60,"3",0,1,1,"MAC TEST OK"\r\nPRINT 1\r\n' | lp -d Deli_DL-720C -o raw
```

If `lpinfo -v` shows no `usb://` line, the Mac cannot see the printer at all.
Check with `ioreg -p IOUSB -l -w0 | grep -E '"USB Product Name"|"USB Vendor Name"'`:
the DL-720C reports itself as `USB Printer` from `Barcode Printer Co.,Ltd.`. If
nothing but Apple's own devices is listed, the USB-C hub or cable is not
connected; reseat it or try the other side of the Mac.

## Product labels

The preview and native output share a 480×320 monochrome raster. This preserves Chinese names and prints Code 128 bars without browser page scaling. The local helper sends TSPL BITMAP bytes through the same Windows RAW spooler path as ERP. Browser page printing is not used.

Print requests submit one copy of an existing product barcode. Submission does not mark a label as attached or publish inventory. The separate human confirmation records completion. Reprint keeps the same barcode. A batch stops at the first error; labels already accepted in that dialog are excluded from “remaining”. The current browser tab preserves submitted and uncertain results across dialog reopen/refresh. Uncertain requests are excluded from automatic remaining-label printing. Check physical labels before explicit reprint. A new browser tab does not know previous unconfirmed print submissions.

Either operating system prints the identical raster: the label is built in the browser and the helper only chooses the last hop, the Windows RAW spooler or `lp -o raw`. Print-station mode (`print-station --config ...`) and the ERP's own label templates remain Windows-only.

Only use a 60×40 mm roll. A 300 dpi device or different media size needs a separate template and is not covered by this 720/203 dpi template.

## Diagnostics

- `/health` must report `online_saler_raster_v1`. An older helper must be replaced before Online Saler printing.
- `/printers` must list the actual Windows queue as available.
- Disconnected: start the helper on the same computer as the browser and printer, allow local network access, then detect again.
- Port busy: close the old helper; the launcher does not kill processes automatically.
- Submission timed out: a label may already have printed. Check the printer before explicitly reprinting.
- Missing/offline printer: check the driver, USB, paper and paused jobs. On a Mac, `lpstat -a` must list the queue and `cupsenable` it if it is paused.

Software verification cannot establish actual paper feed, ink contrast or scanner readability. Validate the first physical label on the customer's printer before running the full batch.
