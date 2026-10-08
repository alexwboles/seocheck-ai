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

# 14: new element ids wired in index.html
check "index.html has new UI hooks" node -e "
const fs=require('fs'); const h=fs.readFileSync('index.html','utf8');
for(const id of ['itemSearch','searchNote','fixImpactFilter','fixSectionFilter','copyPlanBtn','printBtn'])
  if(!h.includes('id=\"'+id+'\"')) throw new Error('missing '+id);
"

# 15: no rounded rectangles (no-radius rule: circles/dial SVG only, 0 elsewhere)
check "no rounded rectangles in css" node -e "
const fs=require('fs'); const css=fs.readFileSync('css/style.css','utf8');
const bad=[...css.matchAll(/border-radius:\s*([^;}]+)/g)]
  .map(m=>m[1].trim()).filter(v=>!/^(0|50%|var\(--radius\))$/.test(v));
if(bad.length) throw new Error(JSON.stringify(bad));
"

# 16: filterFixes narrows by impact and section
check "filterFixes filters by impact + section" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const L=require('./js/logic.js');
const all=L.prioritizedFixes([],AUDIT_SECTIONS);
const hi=L.filterFixes(all,{impact:'high'});
if(!hi.length||!hi.every(f=>f.impact==='high')) throw new Error('impact filter');
const sec=L.filterFixes(all,{sectionId:'gbp'});
if(!sec.length||!sec.every(f=>f.sectionId==='gbp')) throw new Error('section filter');
const both=L.filterFixes(all,{impact:'low',sectionId:'gbp'});
if(!both.every(f=>f.impact==='low'&&f.sectionId==='gbp')) throw new Error('combined filter');
if(L.filterFixes(all,{}).length!==all.length) throw new Error('empty opts should be identity');
"

# 17: searchItems finds items by label
check "searchItems finds matching audit items" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const L=require('./js/logic.js');
const res=L.searchItems(AUDIT_SECTIONS,'google');
if(!res.length) throw new Error('no matches');
if(!res.every(m=>m.item.label.toLowerCase().includes('google')&&m.sectionTitle)) throw new Error('bad match shape');
if(L.searchItems(AUDIT_SECTIONS,'zzz-no-match').length!==0) throw new Error('should be empty');
if(L.searchItems(AUDIT_SECTIONS,'').length!==0) throw new Error('empty query should be empty');
"

# 18: historyWithDeltas annotates score changes
check "historyWithDeltas annotates score changes" node -e "
const L=require('./js/logic.js');
const h=L.historyWithDeltas([
  {date:'2026-09-01',score:40,band:'Getting there'},
  {date:'2026-10-01',score:55,band:'Getting there'},
  {date:'2026-10-07',score:50,band:'Getting there'}
]);
if(h[0].delta!==null) throw new Error('first should be null');
if(h[1].delta!==15) throw new Error('want +15, got '+h[1].delta);
if(h[2].delta!==-5) throw new Error('want -5, got '+h[2].delta);
if(h.length!==3||h[0].score!==40) throw new Error('input mutated');
"

# 19: actionPlanText formats the copy/paste plan
check "actionPlanText formats plan text" node -e "
const {AUDIT_SECTIONS}=require('./js/auditbank.js');
const L=require('./js/logic.js');
const r=L.computeScore([],AUDIT_SECTIONS);
const fixes=L.prioritizedFixes([],AUDIT_SECTIONS);
const txt=L.actionPlanText(r,fixes,'Sunny Side Plumbing');
const lines=txt.split('\n');
if(lines[0].indexOf('Sunny Side Plumbing')!==0) throw new Error('missing business name');
if(lines[0].indexOf('0/100')<0) throw new Error('missing score');
if(lines.length!==fixes.length+2) throw new Error('want header+blank+fixes, got '+lines.length);
if(!lines[2].match(/^\d+\. \[high impact\]/)) throw new Error('bad fix line: '+lines[2]);
const done=L.actionPlanText({score:100,band:'Excellent'},[],'');
if(done.indexOf('nothing left to fix')<0) throw new Error('empty-plan message missing');
"

echo "--- smoke: $pass passed, $fail failed ---"
[ "$fail" -eq 0 ]
