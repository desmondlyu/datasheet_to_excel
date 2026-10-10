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

## Persistent client error investigation — 2026-10-10

The live site served the updated `index-DAtIXjSG.js` bundle, so deployment of the previous compatibility change was verified. The user's continuing `undefined is not a function` error was not reproduced with the supplied private reference PDF in either Chromium or Playwright WebKit 27.2: both parsed 1,442 rows, downloaded Excel, and compared the identical files with zero changes. This does not prove compatibility with the user's exact browser/device/version.

Release `2026-10-10.2` adds diagnostics only: a visible release identifier and an expandable, local report preserving the worker exception stack, last page/table progress, worker build, and browser user agent. It does not claim to fix the unlocated error. No PDF data or report is sent to a server.

Validation: 18 Node tests passed with the private reference fixture; production build passed. A Chromium UI fault-injection check verified stack/page/build/browser details, disabled export after failure, and clearing the report on reset. The production build also passed reference parsing, Excel download, and identical-file comparison in WebKit and Chromium with Array.at/findLast disabled. The private fixture and extracted contents remain outside git.

## iPhone text-stream failure fixed — release 2026-10-10.3

The user's release .2 report identifies iPhone Chrome, text page 1/207, and PDF.js `getTextContent` at production worker line 46, column 102487. That position is the `for await` loop over its ReadableStream. Removing `ReadableStream.prototype[Symbol.asyncIterator]` from the application worker reproduces the same failure location in Chromium (`t is not async iterable`).

Replaced that convenience-method call with a small adapter over PDF.js's public `streamTextContent().getReader().read()` API. It preserves item order, styles, first non-null language, default normalization options, and the original XFA text path; it releases the reader lock in finally. No dependency upgrade or global stream patch is required.

Validation: 21 Node tests passed with the private reference PDF; production build passed. The reference regression now removes stream async iteration before parsing. Chromium and Playwright WebKit 27.2 both passed the production build with stream async iteration removed in the worker: 1,442 rows, successful Excel download, and zero changes comparing identical files. Independent review found no blocker. The user's physical iPhone was not directly tested.
