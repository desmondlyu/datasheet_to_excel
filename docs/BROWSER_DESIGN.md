# Pure browser / GitHub Pages design

## Goal
Open a GitHub Pages URL, select PDF files, preview normalized specs, compare versions and download XLSX without starting Python or sending files to a server. Keep existing columns, product/condition expansion, blanks, original expressions and provenance.

## Architecture
- PDF.js reads local ArrayBuffers, text coordinates and table ruling lines. A dedicated application worker performs extraction away from UI interactions.
- Geometry-based table reconstruction identifies merged cells and resolves specifications; matrix tables expand interface/opcode/dummy/address conditions. Unsupported or incomplete tables appear in Review with original text.
- Pure JavaScript comparison and ExcelJS export run locally. No conversion API, analytics, CDN runtime scripts, remote fonts or uploaded data. Dependencies are version-locked and bundled with the deployed static files.
- Preserve original Python/Flask files as optional legacy reference; the default website has no Python dependency.
- Vite builds relative asset URLs into dist. GitHub Actions builds/tests on PRs and publishes only master using Pages actions. Pages must have GitHub Actions selected as its publishing source.

## UI
Preserve blue-gray workbench layout, source/old-source controls, optional page selection, filters, details and all/filtered export. Add cancel/reset and honest per-page progress. Clearly label browser-local processing and OCR limitation. Reject empty, encrypted/unsupported, oversized files with actionable messages. Never report partial extraction as complete; retained source/review material must be accessible.

## Validation
Use Node's test runner for pure transformations and XLSX readback; run reference PDF privately, never commit the PDF or extracted source content. Verify 7 products, 140 DC rows, branch-specific timings, frequency matrices, same-file comparison, numeric zero vs blank and local-only frontend. Build must work under a project subpath. Browser QA covers upload/preview/search/export/reset and verifies no file content leaves the browser when available.
