# ERP source provenance

`erp_agent.py` is copied from Eric Ye's FW-ERP repository, as requested to reuse its native printer integration:

- Repository: ericye666666-cmd/YXSYSTEM
- Commit: 3fadc8968181d90804369502aa773c3dafb6002e
- Path: ops/local_print_agent/agent.py
- Original version: 0.3.0

The only transport change accepts bytes as well as ASCII strings in `_send_raw_to_windows_printer`, preserving binary TSPL BITMAP data. ERP barcode validation, templates, printer discovery and RAW spooler calls remain in the copied module. `agent.py` adds the Online Saler origin allowlist, a separate product-label contract and capability negotiation. It does not convert online product barcodes into ERP SDB or STORE_ITEM codes.

This is a bundled compatible snapshot, not a change to the ERP repository or deployment. Later ERP protocol changes must be checked before updating the snapshot.

## macOS distribution

The Mac download is the same modules with a shell launcher and no runtime: the
helper imports only the standard library, so there is nothing to freeze and no
binary to sign. `build_macos_bundle.py` produces `direct-loop-print-agent-macos.zip`
alongside the Windows one, on the same runner, and its own manifest carries a
`sourceSha256` over `agent.py`, `erp_agent.py`, `legacy_product_labels.py`,
`start_online_saler_print_agent_macos.command`, `README.md` and `SOURCE.md`, framed
the same way. Entries are written as UNIX so the launcher keeps its executable bit
through a Windows build and a Finder unzip.

macOS reaches the printer through `lp -o raw`, added in `agent.py` rather than in
the vendored ERP module: the ERP snapshot keeps its Windows-only dispatch, and
only the Online Saler product-label scope is routed by platform.

## Windows distribution

Version 1.2.0 bundles the standard-library adapter, ERP module, legacy product-label module and Python runtime into `DirectLoopPrintAgent.exe` using PyInstaller 6.16.0 on a Windows x64 GitHub Actions runner. The executable defaults to the localhost API; the existing `print-station --config ...` command remains available. The runtime binds port 8719 exclusively on Windows, reports an occupied port, and never terminates an existing helper.

The downloadable ZIP contains only the EXE, launcher BAT, README, this provenance document, and `version.json`. The separate download manifest includes the ZIP's SHA-256, byte length and source digest. `sourceSha256` is SHA-256 over the following files in exactly this order: `agent.py`, `erp_agent.py`, `legacy_product_labels.py`, `start_online_saler_print_agent_windows.bat`, `README.md`, `SOURCE.md`. Each contributes its UTF-8 basename, one NUL byte, its raw bytes, and one NUL byte. Windows checkout disables line-ending conversion so the same source digest can be verified during deployment.

Build and smoke-test scripts remain in the repository and are not required on the printing computer. CI starts the actual extracted EXE with no arguments and no Python on PATH, verifies health, printer discovery, allowed origins, and invalid-request rejection without sending a valid print request.
