# Betflow: delivery plan

Take-home case for Sporting Risk. One client's betslip-level data (two overlapping
Excel exports, roughly 167k rows combined, World Cup dominated) becomes: an
interactive, password-gated Betflow dashboard on GitHub Pages, plus a 4 to 5 page
written trading/risk report (PDF), generated from the same pipeline so both always
show the same numbers. The client is referred to as "the client" in every committed
file; its name appears only inside encrypted artifacts.

Delivery is a sequence of 10 small PRs, each independently reviewable and shippable.
Review mode agreed with Cassio: PRs merge automatically once CI is green; full
review happens at the end.

## Architecture

- `pipeline/` (Python 3.12, uv): reads `data/raw/*.xlsx` (local only, gitignored),
  produces plaintext intermediates in `pipeline/out/` (gitignored), then precomputed
  aggregates plus a compact betslip-level detail table, encrypted into
  `site/public/payload/*.enc` (committed).
- `site/` (Vite + React + TypeScript + ECharts): static dashboard deployed to GitHub
  Pages via Actions. A password gate derives an AES-256-GCM key from the password via
  PBKDF2-SHA256 (600,000 iterations, random 16-byte salt, random 12-byte IV per
  artifact) and decrypts the payload in the browser. Wrong password = nothing renders.
- `report/`: HTML/CSS report template rendered to PDF with weasyprint, from the same
  aggregate JSON the dashboard uses. The PDF is encrypted (`report.pdf.enc`) and the
  dashboard's download button decrypts it with the session password.
- No backend. All drill-down happens client-side over the decrypted detail table
  (typed arrays in memory; the deduped dataset at roughly 91k rows compresses well
  and does not need DuckDB-WASM; will revisit in PR 4 if size proves otherwise).

## Analytical decisions (locked in PR 3, documented in the QA report and the PDF)

- **Dedup and reconciliation first.** The two exports overlap by roughly 75.5k
  identical rows. Strategy: exact row-hash over all data columns, per-file multiset
  with occurrence index, union keeps the maximum multiplicity per file (so a genuine
  repeated bet inside one file survives, but the cross-file overlap counts once).
  A before/after reconciliation table (rows, turnover, GGR, blended margin per file
  vs deduped union) ships in the dashboard and the report.
- **Currency normalization** to EUR. PEN and USD converted at fixed ECB reference
  rates with the rate date stated. Null currency codes resolved by management unit
  geography where unambiguous, otherwise flagged and reported.
- **SIMPLE vs COMBINED.** COMBINED rows are legs of multiples. Legs are grouped into
  slip proxies by (Uid, betslip timestamp); turnover/GGR counting rules per slip are
  decided from the data in PR 3 (checking whether stake repeats per leg) and applied
  consistently everywhere.
- **Timing phases** per betslip relative to event kickoff (all UTC): early pre-match
  (more than 24h before), day-of pre-match (24h to 75min), post-lineups proxy (final
  75min; stated as an assumption since no lineup timestamps exist), in-play (after
  kickoff), plus a suspect-timestamp flag. Exact thresholds finalized in PR 3.
- **Price movement proxy.** Only struck prices exist, so closing-price comparison is
  proxied: last struck price per selection pre-kickoff acts as the reference, and
  proxy CLV per bet is struck price vs that reference. Declared loudly as an
  internal proxy, not true CLV.
- **Claim tone**: evidence-forward and measured. Watchlist entries say "merits
  trader review" with the evidence attached; no verdicts about customers.

## PR sequence

### PR 1: Plan and security rails (this PR)
- **Goal**: publish this plan; make it impossible to leak client data from day one.
- **Files**: `PLAN.md`, `.gitignore` (already the first commit on main), `README.md`
  stub with the security model, `scripts/guard.sh`, `.githooks/pre-commit`,
  `.github/workflows/guard.yml`, `.env.example`.
- **Acceptance**: guard CI green; guard demonstrably fails on a staged xlsx and on a
  file containing the client's name (verified locally before opening the PR).
- **Verify**: read the security model in README; confirm no xlsx, PDF or client name
  anywhere in the tree.

### PR 2: Scaffold, password gate, Pages deploy
- **Goal**: a live, gated hello-world at the production URL; deploy pipeline proven.
- **Files**: `site/` scaffold (Vite + React + TS, ECharts installed), `site/src/lib/crypto.ts`
  (PBKDF2 + AES-GCM decrypt), gate screen validating the password against an
  encrypted sentinel artifact, `.github/workflows/deploy.yml` (build + Pages),
  `assets/` Sporting Risk logo wired into the gate.
- **Acceptance**: Pages deploy green; wrong password rejected; correct password shows
  the shell placeholder. Sentinel built by a committed script from `.env` (untracked).
- **Verify**: open the live URL on desktop and phone, try wrong then right password.

### PR 3: ETL pipeline
- **Goal**: one command turns the two raw exports into a clean, deduped, normalized,
  phase-classified dataset with a QA report; every analytical decision above
  implemented and documented.
- **Files**: `pipeline/` (uv project): `ingest.py`, `dedup.py`, `normalize.py`
  (currency, market-template mapping, option strings), `phases.py`, `qa.py`,
  `Makefile` target `make etl`; tests with synthetic fixtures under `pipeline/tests/`.
- **Acceptance**: `make etl` runs end-to-end locally; reconciliation table produced;
  tests pass in CI without any client data (synthetic fixtures only).
- **Verify**: run `make etl`, read `pipeline/out/qa_report.md` (local only), check the
  reconciliation numbers feel right against the raw files.

### PR 4: Aggregates and encrypted payload
- **Goal**: everything the dashboard needs, precomputed, encrypted, committed.
- **Files**: `pipeline/aggregate.py`, `pipeline/encrypt.py`, `make payload` one-shot
  (etl + aggregate + encrypt), `site/public/payload/*.enc` (ciphertext only),
  payload loader in `site/src/lib/payload.ts`.
- **Acceptance**: payload decrypts in the browser with the real password; total
  encrypted payload within a sensible budget (target under ~6 MB); guard confirms
  only `.enc` files under the payload dir.
- **Verify**: live site loads data after password entry; numbers match `make etl` output.

### PR 5: Dashboard shell, overview, reconciliation view
- **Goal**: the dashboard skeleton a trader lands on: KPI header (deduped turnover,
  GGR, margin, slips, customers, date range), global filters (competition, market,
  bet type, unit, phase, currency), and the dedup before/after reconciliation view.
- **Files**: `site/src/` app shell, routing, filter state, KPI components,
  reconciliation table view; client branding rendered from the encrypted payload.
- **Acceptance**: KPIs match pipeline QA output exactly; filters propagate to a
  shared state consumed by all later views.
- **Verify**: headline numbers on the live site vs QA report.

### PR 6: Betflow time-series views
- **Goal**: how activity develops over time: turnover, bet count, average stake,
  unique customers; split by competition, market group, timing phase; World Cup
  fixture drill-down (per-fixture betflow around kickoff).
- **Files**: `site/src/views/timeseries/*`, aggregate extensions in `pipeline/aggregate.py`.
- **Acceptance**: daily series totals reconcile to headline turnover; fixture
  drill-down reachable from the series.
- **Verify**: spot-check two fixtures against the raw data locally.

### PR 7: Concentration and drill-down views
- **Goal**: where the money concentrates: share of turnover by market, team, player,
  selection, line, bet type, management unit and Uid; Pareto and Gini-style views;
  top-N tables that drill to underlying betslip rows.
- **Files**: `site/src/views/concentration/*`, detail-table query helpers.
- **Acceptance**: every top-N row expands to raw rows whose sum matches the row.
- **Verify**: drill three random entries and check sums.

### PR 8: Price proxy, sharpness watchlist, anomalies
- **Goal**: the risk layer. Struck-price-over-time per selection with proxy CLV;
  per-Uid sharpness score (proxy CLV, timing, stake sizing, market focus, GGR
  contribution, win-rate proxy) with a transparent formula; anomaly flags (turnover
  spikes vs baseline, repeated cross-Uid support for one selection, price drift,
  single-selection exposure, structurally negative-margin pockets). Every flag links
  to its rows.
- **Files**: `pipeline/sharpness.py`, `pipeline/anomalies.py`, `site/src/views/risk/*`.
- **Acceptance**: each watchlist entry shows its evidence inline; proxy limitations
  stated on the view itself; rules are transparent (no black boxes).
- **Verify**: pick two watchlist Uids and confirm the evidence reads fairly.

### PR 9: Findings layer and PDF report
- **Goal**: the story. In-dashboard findings written in plain trading language, and
  the 4 to 5 page PDF (weasyprint) built from the same aggregates: assumptions,
  limitations, data-quality decisions, commercial read, "What I'd do next", signed
  "Prepared by Cassio Menezes". Download button decrypts `report.pdf.enc`.
- **Files**: `report/` (template, build script, `make report`), findings content
  module, download wiring.
- **Acceptance**: PDF numbers identical to dashboard; PDF is 4 to 5 pages; encrypted
  download works with the session password.
- **Verify**: read the PDF end to end; check the signature line and page count.

### PR 10: Polish and consistency pass
- **Goal**: ship quality. Mobile pass, loading states, lazy-loading heavy views,
  cross-check that the same headline numbers (unique betslips, deduped turnover,
  GGR, margin, date range, top findings) appear identically in dashboard, findings
  layer and PDF; final README.
- **Files**: touch-ups across `site/`, `README.md` final, consistency checklist in
  the PR description.
- **Acceptance**: consistency checklist all green, listed in the PR description with
  the headline numbers (aggregate-level only, no customer identifiers).
- **Verify**: the final walkthrough; this is the end-review entry point.

## Risks and mitigations

- **Payload size**: if the detail table exceeds the budget, fall back to
  aggregate-only drill-down for long-tail dimensions and keep row-level drill for
  top-N entities only (flagged to Cassio before cutting anything).
- **weasyprint system deps**: needs a local pango install; if that fails on this
  machine, fall back to reportlab (decision flagged in PR 9).
- **Combined-leg ambiguity**: no betslip id exists, so slip grouping is a proxy;
  treated as a stated limitation, with sensitivity shown in the QA report.
- **Anything impossible today** gets flagged to Cassio explicitly; no view is
  silently dropped.
