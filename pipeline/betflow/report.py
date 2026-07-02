"""Render the written report (4 to 5 pages, A4 PDF) from findings.json.

The PDF is written to pipeline/out/ (gitignored plaintext); only its
encrypted form ships (make report handles encryption via scripts/encrypt.mjs).

Usage: uv run python -m betflow.report   (after betflow.run)
"""

from __future__ import annotations

import base64
import json

from jinja2 import Template

from .config import OUT_DIR, RAW_DIR, REPO_ROOT


def main() -> None:
    findings = json.loads((OUT_DIR / "findings.json").read_text())

    sr_logo = None
    sr_path = REPO_ROOT / "assets" / "sporting-risk-logo.jpeg"
    if sr_path.exists():
        sr_logo = base64.b64encode(sr_path.read_bytes()).decode()

    client_logo = None
    pngs = sorted(RAW_DIR.glob("*.png"))
    if pngs:
        client_logo = base64.b64encode(pngs[0].read_bytes()).decode()

    template = Template((REPO_ROOT / "report" / "template.html").read_text())
    html = template.render(f=findings, sr_logo=sr_logo, client_logo=client_logo)
    (OUT_DIR / "report.html").write_text(html)

    from weasyprint import HTML  # import here: needs pango installed

    out = OUT_DIR / "report.pdf"
    doc = HTML(string=html).render()
    doc.write_pdf(out)
    print(f"wrote {out} ({len(doc.pages)} pages)")


if __name__ == "__main__":
    main()
