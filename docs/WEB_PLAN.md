# Web workbench implementation plan

Goal: reuse the desktop extraction pipeline and deliver a local browser application with normalized preview, comparison and XLSX export.

1. Extract unchanged non-Qt functions into extraction_core.py; desktop imports the same core. Verify Python compilation and unchanged function bodies.
2. Add spec_service.py: resolve actual merged cell geometry, split products and conditions, normalize frequency matrices, retain notes and unsupported raw tables. Verify reference PDF values and counts.
3. Add workbook export and product/symbol/condition-aware comparison. Test blank vs zero, duplicate identity, removed rows, formula text and export headers with unittest.
4. Add Flask upload, preview and export endpoints with temporary file cleanup, size limits and same-origin write checks. Add responsive static UI, filters, details, raw review and download.
5. Run all tests and reference-PDF integration, check JS syntax, document Windows startup, commit and push a feature branch with PR. Keep uploaded PDF out of Git.
