#!/usr/bin/env node
/**
 * Consistency pass: the same headline numbers must appear identically in
 * every surface. Compares (local plaintext, never committed):
 *   1. pipeline/out/recon.json          (QA source of truth)
 *   2. pipeline/out/findings.json       (dashboard findings + PDF source)
 *   3. pipeline/out/payload.json        (dashboard: meta.recon + raw column sums)
 * Exits 1 on any mismatch.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = (f) => JSON.parse(readFileSync(join(ROOT, 'pipeline', 'out', f), 'utf8'))

const recon = out('recon.json')
const findings = out('findings.json')
const payload = out('payload.json')

const eur = (v) => `€${Math.round(v).toLocaleString('en-US')}`
let fail = 0

function check(name, ...values) {
  const first = JSON.stringify(values[0])
  const ok = values.every((v) => JSON.stringify(v) === first)
  if (!ok) fail++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${values.map((v) => JSON.stringify(v)).join(' | ')}`)
}

const h = Object.fromEntries(findings.headline.map((k) => [k.label, k.value]))
const sum = (arr) => arr.reduce((a, b) => a + b, 0)

check('turnover', eur(recon.turnover_eur), h['Turnover'], eur(payload.meta.recon.turnover_eur), eur(sum(payload.slips.stake)))
check('ggr', eur(recon.ggr_eur), h['GGR'], eur(payload.meta.recon.ggr_eur), eur(sum(payload.slips.ggr)))
check('margin', `${recon.margin_pct.toFixed(2)}%`, h['Blended margin'], `${payload.meta.recon.margin_pct.toFixed(2)}%`,
  `${((sum(payload.slips.ggr) / sum(payload.slips.stake)) * 100).toFixed(2)}%`)
check('slips', recon.slips.toLocaleString('en-US'), h['Betslips'], payload.meta.recon.slips.toLocaleString('en-US'),
  payload.slips.ts.length.toLocaleString('en-US'))
check('customers', recon.unique_customers.toLocaleString('en-US'), h['Customers'],
  new Set(payload.slips.uid).size.toLocaleString('en-US'))
check('window', `${recon.betslip_min.slice(0, 10)} to ${recon.betslip_max.slice(0, 10)}`, h['Window'], findings.window)
check('legs/union rows', recon.union_rows, payload.meta.recon.union_rows, payload.legs.slip.length)
check('net revenue', eur(recon.net_revenue_eur), eur(payload.meta.recon.net_revenue_eur), eur(sum(payload.slips.nr)))

console.log(fail ? `\n${fail} MISMATCH(ES): surfaces disagree` : '\nall surfaces agree')
process.exit(fail ? 1 : 0)
