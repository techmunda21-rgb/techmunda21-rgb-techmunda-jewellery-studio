// Sanity-checks every exported workflow: valid JSON, connections reference real nodes, JS code nodes parse, no secrets inlined.
import { readdirSync, readFileSync } from 'fs';
let bad = 0;
for (const f of readdirSync('workflows').filter((x) => x.endsWith('.json'))) {
  const text = readFileSync(`workflows/${f}`, 'utf8');
  const w = JSON.parse(text);
  const names = new Set(w.nodes.map((n) => n.name));
  const errs = [];
  for (const [a, o] of Object.entries(w.connections)) {
    if (!names.has(a)) errs.push(`unknown source ${a}`);
    for (const g of o.main) for (const t of g) if (!names.has(t.node)) errs.push(`unknown target ${t.node}`);
  }
  for (const n of w.nodes) if (n.parameters?.jsCode) { try { new Function('require', '$env', '$input', n.parameters.jsCode); } catch (e) { errs.push(`code error in ${n.name}: ${e.message}`); } }
  if (/sk-[A-Za-z0-9]{16,}|ya29\.|BEGIN PRIVATE KEY/.test(text)) errs.push('looks like an inlined secret');
  if (!w.nodes.some((n) => /webhook|scheduleTrigger/.test(n.type))) errs.push('no trigger');
  console.log(errs.length ? `FAIL ${f}: ${errs.join('; ')}` : `ok   ${f} (${w.nodes.length} nodes)`);
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
