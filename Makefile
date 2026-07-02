# Betflow build entry points. Raw data lives only in data/raw/ (gitignored).

.PHONY: etl test-pipeline payload site-build

etl:  ## run the ETL on local raw exports -> pipeline/out/
	cd pipeline && uv run python -m betflow.run

test-pipeline:  ## pipeline unit tests (synthetic fixtures only)
	cd pipeline && uv run pytest -q

site-build:
	cd site && npm run build
