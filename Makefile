# Betflow build entry points. Raw data lives only in data/raw/ (gitignored).

.PHONY: etl test-pipeline payload site-build

etl:  ## run the ETL on local raw exports -> pipeline/out/
	cd pipeline && uv run python -m betflow.run

payload: etl  ## full rebuild: ETL + encrypt dashboard payload + sentinel
	node scripts/encrypt.mjs --in pipeline/out/payload.json --out site/public/payload/data.enc
	node scripts/encrypt.mjs --sentinel

test-pipeline:  ## pipeline unit tests (synthetic fixtures only)
	cd pipeline && uv run pytest -q

site-build:
	cd site && npm run build
