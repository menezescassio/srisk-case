# Betflow

Interactive betflow analysis of client betslip data, prepared as a take-home case
for Sporting Risk (Trading, Risk & Client Intelligence). Prepared by Cassio Menezes.

Live dashboard: https://menezescassio.github.io/srisk-case/ (password required,
shared separately). The written report (PDF) downloads from the dashboard's
Findings tab and decrypts in the browser.

## What this is

Two raw betslip exports become one reconciled dataset and one consistent story:

- **Pipeline** (`pipeline/`, Python 3.12 via uv): ingest, cross-file dedup, slip
  rollup (combined legs repeat slip-level stake/GGR), EUR normalization, market
  taxonomy, timing phases, proxy CLV, sharpness watchlist, anomaly flags,
  findings narrative, QA report.
- **Dashboard** (`site/`, Vite + React + TS + ECharts): password gate, overview
  and reconciliation, betflow time series with fixture drill-down, concentration
  with Lorenz/Gini and drill to raw rows, risk watchlist and anomalies with
  evidence modals, findings layer with PDF download.
- **Report** (`report/` + `pipeline/betflow/report.py`): 4 to 5 page A4 PDF
  rendered with weasyprint from the same findings document the dashboard shows.

The same headline numbers appear identically everywhere; `make consistency`
proves it.

## Security model (read before contributing)

This repository is public, but it analyses real client betslip data. The rules:

1. `data/` is gitignored. Raw xlsx exports live only on the analyst's machine and
   are never committed or pushed.
2. Everything derived from client data that ships to the site is encrypted:
   AES-256-GCM, key derived from the access password via PBKDF2-SHA256 (600,000
   iterations, random salt), random IV per artifact, gzip inside the envelope.
   Only ciphertext (`*.enc`) is committed. A wrong password fails GCM
   authentication; nothing partial ever renders.
3. No plaintext customer identifiers, stakes or the client's name may appear in
   committed code, fixtures, tests, screenshots, PR descriptions or commit
   messages. The client's name and logo travel only inside the encrypted payload.
   Tests use synthetic fixtures only.
4. Enforcement: `scripts/guard.sh` runs in CI on every push and PR, and locally
   as a pre-commit hook. Enable the hook once per clone:

   ```sh
   git config core.hooksPath .githooks
   ```

## Rebuilding from scratch

Prerequisites: Node 20+, [uv](https://docs.astral.sh/uv/), and for the PDF
`brew install pango` (macOS). Then:

```sh
# 1. place the two raw exports in data/raw/ (never committed)
#    plus optionally the client logo as a .png in the same folder
# 2. put the access password in .env at the repo root:
#    BETFLOW_PASSWORD=...            (never committed)

make etl            # raw xlsx -> pipeline/out/ (slips, legs, recon, QA, findings)
make report         # findings -> pipeline/out/report.pdf (4-5 pages, A4)
make payload        # everything above + encrypt all artifacts into site/public/payload/
make test-pipeline  # 26 unit tests, synthetic fixtures only
make consistency    # verify identical headline numbers across all surfaces

cd site && npm ci && npm run dev    # local dashboard at localhost:5173
```

Committing the refreshed `site/public/payload/*.enc` and pushing to `main`
deploys via GitHub Actions to Pages.

## Analytical decisions (details in `PLAN.md` and the QA report)

- The two exports are adjacent betslip windows pulled 95 seconds apart; the
  later pull wins settlement conflicts on the 1,348-row seam.
- COMBINED rows are legs repeating slip-level stake/GGR; money is counted once
  per slip proxy (customer, timestamp, stake, settlement). This removes ~€112k
  of phantom turnover and is the material dedup correction.
- EUR at fixed 2026-06-23 reference rates (PEN 3.90, USD 1.138 per EUR).
- Post-lineups is a proxy: final 75 minutes before first kickoff.
- Proxy CLV is an internal price-movement measure (no odds history exists);
  every sharpness component and threshold is stated on the Risk view.

## Repository layout

- `PLAN.md`: the PR-by-PR delivery plan
- `pipeline/`: Python ETL + analytics (`betflow/` modules, `tests/`)
- `site/`: dashboard app
- `report/`: PDF template
- `scripts/`: guard, encryption, consistency check
- `.github/workflows/`: guard, pipeline tests, Pages deploy
