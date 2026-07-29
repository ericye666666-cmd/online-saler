# Online Saler Local Print Agent

This agent lets the Operations web page print product barcode labels to a local Deli DL-720C printer.

The deployment model follows the FW-ERP/YXSYSTEM local print station pattern:

```text
Operations web page
  -> http://127.0.0.1:8719/print/label
  -> Windows local print agent
  -> Deli DL-720C raw TSPL label print
```

Cloud Run never talks directly to the printer. The browser calls this local agent on the same Windows computer that has the Deli printer driver installed.

## Supported labels

- `60x40`
- `40x30`

Both layouts encode the Online Saler formal product barcode with Code 128.

## Printer

Default queue name:

```text
Deli DL-720C
```

The agent also matches common variants such as `deli-720`, `Deli_DL_720C`, and spacing/case variants.

## Start on Windows

1. Install the Deli DL-720C Windows printer driver.
2. Confirm Windows can print a test page.
3. Open PowerShell in this folder.
4. Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
```

Keep the PowerShell window open while printing.

## Quick checks

Open these URLs on the same computer:

```text
http://127.0.0.1:8719/health
http://127.0.0.1:8719/printers
```

Expected `/health` result:

```json
{
  "status": "ok",
  "mode": "local-api",
  "printer": "Deli DL-720C",
  "label_sizes": ["60x40", "40x30"]
}
```

Expected `/printers` result includes:

```json
{
  "name": "Deli DL-720C",
  "status": "available"
}
```

## Employee flow

1. Start this local print agent.
2. Open Operations.
3. Complete one product.
4. Choose label size `60x40` or `40x30`.
5. Click `Print label`.
6. Attach the printed label to the clothing item.
7. Click `Start next item`.

## Common errors

- `Start the local print agent`: this agent is not running, or port `8719` is blocked.
- `Deli 720 printer was not found`: install the Deli driver or rename/select the Windows queue.
- `Deli 720 printer is not available`: turn off `Use Printer Offline`, clear paused jobs, reconnect USB, and print a Windows test page.
- `Label barcode is missing`: generate the formal barcode first. This preserves CR-001: barcode printing happens only after human calibration.

