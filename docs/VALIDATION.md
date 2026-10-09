# Validation — 2026-10-09

## Verified

- 19 unittest cases pass with the privately supplied RW Rev D3 PDF enabled via SPEC_REFERENCE_PDF.
- Reference conversion: 1,442 normalized rows across seven products: 140 DC, 1,253 AC, 49 Other.
- Four unnormalized source tables remain in Review. Comparing the same file includes four review tables from each input, eight in total.
- Each of the seven products has 20 DC rows.
- HTTP endpoint integration through Flask test client: upload identical new/old PDFs; all 1,442 rows unchanged; no false changes.
- Filtered XLSX export for W25Q32RW/DC contains 20 data rows, exact requested headers and four worksheets. Changes sheet is empty for identical inputs.
- A second browser session cannot download the first session's result.
- Python compilation, JavaScript syntax and git diff whitespace checks pass.
- AST comparison against the original master confirms 44 original extraction/helper definitions and the original desktop GUI class are unchanged.
- Independent code review identified product-family omissions and AC classification errors. All were corrected with regression coverage; no remaining major findings were reported on the follow-up review.

## Limitations

- Full browser interaction and visual QA were not completed: Chromium was unavailable and its download failed in the execution environment. No browser-pass claim is made.
- Original Qt desktop window was not launched. Its class and shared core definitions were structurally verified, not GUI-tested.
- Reference-PDF tests are skipped unless SPEC_REFERENCE_PDF is set; the PDF itself is not committed.
- The normalized row count is not a guarantee that every arbitrary PDF can be fully converted. Source and Review retain material for manual verification.
- This is a localhost application, not a deployed public web service.
