# ERP source provenance

`erp_agent.py` is copied from Eric Ye's FW-ERP repository, as requested to reuse its native printer integration:

- Repository: ericye666666-cmd/YXSYSTEM
- Commit: 3fadc8968181d90804369502aa773c3dafb6002e
- Path: ops/local_print_agent/agent.py
- Original version: 0.3.0

The only transport change accepts bytes as well as ASCII strings in `_send_raw_to_windows_printer`, preserving binary TSPL BITMAP data. ERP barcode validation, templates, printer discovery and RAW spooler calls remain in the copied module. `agent.py` adds the Online Saler origin allowlist, a separate product-label contract and capability negotiation. It does not convert online product barcodes into ERP SDB or STORE_ITEM codes.

This is a bundled compatible snapshot, not a change to the ERP repository or deployment. Later ERP protocol changes must be checked before updating the snapshot.
