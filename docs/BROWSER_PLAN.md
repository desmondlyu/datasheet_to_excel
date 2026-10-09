# Browser implementation plan

1. Establish reproducible npm dependencies, relative-path Vite build, Pages workflow and small test fixtures.
2. Implement browser geometry extraction and normalized row conversion against reference cases. Preserve real merged cells, product families, table/page notes and unrecognized rows.
3. Port row comparison and XLSX export with exact column order; test changed/added/removed/duplicate keys, formula strings, blanks and units.
4. Connect the existing UI to a Web Worker and client export; add cancellation and memory reset; retain access to all source text.
5. Verify Node unit/integration tests, private reference PDF, static production build and browser smoke test. Document exact limits and Pages activation.
6. Push a feature branch and open a PR against master. Do not include the reference PDF or sample confidential source data.
