#!/usr/bin/env bash
# SEOCheck AI — smoke tests. File existence, JS syntax, bank invariants, basic scoring.
set -u
cd "$(dirname "$0")/.."

pass=0
fail=0
check() { local desc="$1"; shift; if "$@" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1)); else echo "FAIL: $desc"; fail=$((fail+1)); fi }

# 1-4: each file exists
check "index.html exists" test -f index.html
check "css/style.css exists" test -f css/style.css
check "js/auditbank.js exists" test -f js/auditbank.js
check "js/logic.js exists" test -f js/logic.js
check "js/app.js exists" test -f js/app.js

# 5-7: node --check on each js file
check "node --check js/auditbank.js" node --check js/auditbank.js
check "node --check js/logic.js" node --check js/logic.js
check "node --check js/app.js" node --check js/app.js

# 8: bank has exactly 28 items
check "bank has exactly 28 items" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const n=AUDIT_SECTIONS.reduce((s,x)=>s+x.items.length,0);
if(n!==28) throw new Error('got '+n);
"

# 9: weights sum to exactly 100
check "weights sum to exactly 100" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const sum=AUDIT_SECTIONS.reduce((s,x)=>s+x.items.reduce((a,i)=>a+i.weight,0),0);
if(sum!==100) throw new Error('got '+sum);
"

# 10: every item has id/label/tip/impact/weight and impact is valid
check "every item has id/label/tip/impact/weight" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
for(const s of AUDIT_SECTIONS){
  if(!s.id||!s.title) throw new Error('bad section');
  for(const i of s.items){
    if(!i.id||!i.label||!i.tip) throw new Error('missing field in '+JSON.stringify(i));
    if(!['high','medium','low'].includes(i.impact)) throw new Error('bad impact '+i.id);
    if(!Number.isInteger(i.weight)||i.weight<1) throw new Error('bad weight '+i.id);
  }
}
"

# 11: all item ids are unique
check "all item ids unique" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const ids=AUDIT_SECTIONS.flatMap(s=>s.items.map(i=>i.id));
if(new Set(ids).size!==ids.length) throw new Error('duplicate ids');
"

# 12: computeScore(all checked) == 100
check "computeScore(all checked) == 100" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const L=require('./js/logic.js');
const ids=AUDIT_SECTIONS.flatMap(s=>s.items.map(i=>i.id));
const r=L.computeScore(ids,AUDIT_SECTIONS);
if(r.score!==100||r.maxScore!==100||r.band!=='Excellent') throw new Error(JSON.stringify(r));
"

# 13: computeScore(none) == 0
check "computeScore(none) == 0" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const L=require('./js/logic.js');
const r=L.computeScore([],AUDIT_SECTIONS);
if(r.score!==0||r.band!=='Needs work') throw new Error(JSON.stringify(r));
"

echo "--- smoke: $pass passed, $fail failed ---"
[ "$fail" -eq 0 ]
