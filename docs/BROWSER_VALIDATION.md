# Browser version validation

Validated 2026-10-09 against the private reference PDF supplied for this project. PDF files and generated workbooks are not committed.

- Full reference suite: 13 passed, no failures or skips.
- Without the private PDF: 11 public tests, 2 reference tests skipped.
- Production Vite build passed. Large PDF/Excel dependency chunks are expected; ExcelJS loads only on export.
- Output: 1,442 specification rows; 7 products; 20 DC rows per product. Three nonempty unsupported tables retained for review.
- Tests cover exact column order, numeric/blank/zero cells, formula-looking text, ambiguous old candidates, symbol-less rows and unsupported-only selections.
- Reference assertions cover read-current splits, 2Gb capacitance/current, program/erase limits, Factory Mode voltage notes and frequency matrices.

## Production browser verification

Re-ran after restoring files from an interrupted workspace. Served dist with a plain static HTTP server under /datasheet_to_excel/. Chromium 153.0.8010.0 with Playwright passed:
- Parsing all 1,442 rows.
- Filtering W25Q32RW DC to 20 rows and downloading an XLSX with 21 rows including its header.
- Identical-file comparison: all 1,442 unchanged, zero changed/added/removed.
- Cancellation, file/result reset and 390px mobile layout without document-level overflow.
- No page errors; all captured network requests were local static GET requests. No PDF upload or external runtime API requests.

The headless environment lacks CJK fonts, so Chinese glyph rendering was not visually validated. Safari, Firefox and low-memory mobile devices have not been tested.

## Review

Independent review in the preceding session found three issues, all fixed and retained after restoration: uncovered symbol-less rows now reach Review, ambiguous old values survive in details/Changes, and unsupported-only selections keep original source content. Follow-up review reported no remaining blocker.

## Deployment

The workflow builds PRs and deploys only master. Repository Pages source must be set to GitHub Actions by an administrator. Successful local validation does not mean the public site is live.

## Compatibility fix, 2026-10-10

A missing Array.findLast failed in application text grouping; missing Array.at also failed inside the pinned PDF.js worker during full-browser emulation. Replaced application calls with basic indexing/reverse iteration. Added narrowly imported core-js array compatibility modules and loaded PDF.js's WorkerMessageHandler in the application worker, so the parser uses the same compatibility support without spawning an additional worker.

- Full reference suite after the fix: 16 passed, no skips or failures.
- Production Vite build passed.
- Production browser test disabled Array.findLast and Array.at before the application worker imported its modules. It parsed 1,442 rows, downloaded Excel, and compared identical PDFs with zero changed/added/removed rows. No page errors.
- Independent review found no blocker. This is feature-removal emulation in Chromium, not an assertion that every Safari version was tested.
