# Betflow build entry points. Raw data lives only in data/raw/ (gitignored).

.PHONY: etl test-pipeline payload site-build

etl:  ## run the ETL on local raw exports -> pipeline/out/
	cd pipeline && uv run python -m betflow.run

payload: etl report  ## full rebuild: ETL + report + encrypt all artifacts
	node scripts/encrypt.mjs --in pipeline/out/payload.json --out site/public/payload/data.enc
	node scripts/encrypt.mjs --in pipeline/out/report.pdf --out site/public/payload/report.pdf.enc
	node scripts/encrypt.mjs --sentinel

report:  ## render the written report PDF (needs `brew install pango`)
	cd pipeline && DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib uv run python -m betflow.report

test-pipeline:  ## pipeline unit tests (synthetic fixtures only)
	cd pipeline && uv run pytest -q

site-build:
	cd site && npm run build
