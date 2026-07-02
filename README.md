# Betflow

Interactive betflow analysis of client betslip data, prepared as a take-home case
for Sporting Risk (Trading, Risk & Client Intelligence). Prepared by Cassio Menezes.

The deliverables are an interactive dashboard (GitHub Pages, password gated) and a
written trading/risk report (PDF, downloadable from the dashboard). Both are built
from the same pipeline so the numbers cannot diverge.

Live site: https://menezescassio.github.io/srisk-case/ (password required)

## Security model (read before contributing)

This repository is public, but it analyses real client betslip data. The rules:

1. `data/` is gitignored. Raw xlsx exports live only on the analyst's machine and
   are never committed or pushed.
2. Everything derived from client data that ships to the site is encrypted
   client-side artifacts (`*.enc`): AES-256-GCM, key derived from the access
   password via PBKDF2-SHA256 with a high iteration count and random salt; a random
   IV is stored alongside each ciphertext. Only ciphertext is committed.
3. No plaintext customer identifiers, stakes or the client's name may appear in
   committed code, fixtures, tests, screenshots, PR descriptions or commit messages.
   Tests use synthetic fixtures only.
4. Enforcement: `scripts/guard.sh` runs in CI on every push and PR, and locally as
   a pre-commit hook. Enable the hook once per clone:

   ```sh
   git config core.hooksPath .githooks
   ```

Because raw data cannot live in the repo, the encrypted payload is built locally
and the resulting ciphertext committed. Full build instructions land with the
pipeline PRs (see `PLAN.md`).

## Repository layout

- `PLAN.md`: the PR-by-PR delivery plan.
- `pipeline/`: Python ETL (parsing, dedup, normalization, aggregates, encryption).
- `site/`: Vite + React + TypeScript dashboard.
- `report/`: written report generation (weasyprint).
- `scripts/`: guard and helper scripts.
