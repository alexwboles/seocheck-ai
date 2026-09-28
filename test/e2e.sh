#!/usr/bin/env bash
# SEOCheck AI — end-to-end flows through the logic layer (Node, no DOM).
set -u
cd "$(dirname "$0")/.."

pass=0
fail=0
check() { local desc="$1"; shift; if "$@" >/dev/null 2>&1; then echo "PASS: $desc"; pass=$((pass+1)); else echo "FAIL: $desc"; fail=$((fail+1)); fi }

PRELUDE="const {AUDIT_SECTIONS}=require('./js/auditbank.js'); const L=require('./js/logic.js'); const items=AUDIT_SECTIONS.flatMap(s=>s.items.map(i=>({sectionId:s.id,...i})));"

# 1: checking only high-impact items scores higher than checking only low-impact ones
check "high-impact-only scores higher than low-impact-only" node -e "
$PRELUDE
const hi=items.filter(i=>i.impact==='high').map(i=>i.id);
const lo=items.filter(i=>i.impact==='low').map(i=>i.id);
const a=L.computeScore(hi,AUDIT_SECTIONS).score;
const b=L.computeScore(lo,AUDIT_SECTIONS).score;
if(!(a>b)) throw new Error(a+' vs '+b);
"

# 2: prioritizedFixes puts an unchecked high-impact item before an unchecked low-impact one
check "fix list orders high impact before low impact" node -e "
$PRELUDE
const fixes=L.prioritizedFixes([],AUDIT_SECTIONS);
if(fixes[0].impact!=='high') throw new Error('first fix is '+fixes[0].impact);
const firstLow=fixes.findIndex(f=>f.impact==='low');
const lastHigh=fixes.map(f=>f.impact).lastIndexOf('high');
if(!(lastHigh<firstLow)) throw new Error('ordering wrong');
"

# 3: fix list shrinks as items are checked
check "fix list shrinks as items are checked" node -e "
$PRELUDE
const all=L.prioritizedFixes([],AUDIT_SECTIONS).length;
const some=L.prioritizedFixes(items.slice(0,10).map(i=>i.id),AUDIT_SECTIONS).length;
const none=L.prioritizedFixes(items.map(i=>i.id),AUDIT_SECTIONS).length;
if(!(all===28&&some===18&&none===0)) throw new Error([all,some,none].join(','));
"

# 4: sectionProgress reports 50% for a half-done section (8-item GBP section)
check "sectionProgress 50% for half-done section" node -e "
$PRELUDE
const gbp=AUDIT_SECTIONS.find(s=>s.id==='gbp');
const half=gbp.items.slice(0,4).map(i=>i.id);
const p=L.sectionProgress(half,AUDIT_SECTIONS).find(x=>x.sectionId==='gbp');
if(p.pct!==50||p.checked!==4||p.total!==8) throw new Error(JSON.stringify(p));
"

# 5: saveAudit/loadAudits round-trips history with a fake storage object
check "saveAudit/loadAudits round-trip with fake storage" node -e "
$PRELUDE
const store={d:{},getItem(k){return this.d[k]||null},setItem(k,v){this.d[k]=String(v)},removeItem(k){delete this.d[k]}};
const L2=L;
if(L2.loadAudits(store).length!==0) throw new Error('not empty');
L2.saveAudit(store,{date:'2026-09-28',businessName:'Test Co',score:72,band:'Strong'});
L2.saveAudit(store,{date:'2026-09-29',businessName:'Test Co',score:90,band:'Excellent'});
const h=L2.loadAudits(store);
if(h.length!==2||h[0].score!==72||h[1].band!=='Excellent') throw new Error(JSON.stringify(h));
"

# 6: score band boundaries (39->Needs work, 40->Getting there, 69->Getting there, 70->Strong, 89->Strong, 90->Excellent)
check "score band boundaries correct" node -e "
$PRELUDE
const cases=[[39,'Needs work'],[40,'Getting there'],[69,'Getting there'],[70,'Strong'],[89,'Strong'],[90,'Excellent'],[100,'Excellent'],[0,'Needs work']];
for(const [score,want] of cases){
  const got=L.bandFor(score);
  if(got!==want) throw new Error(score+' -> '+got+' (want '+want+')');
}
"

# 7: unknown ids in checkedIds are ignored (no crash, no phantom points)
check "unknown checked ids are ignored" node -e "
$PRELUDE
const r=L.computeScore(['nope','alsono'],AUDIT_SECTIONS);
if(r.score!==0) throw new Error(JSON.stringify(r));
const f=L.prioritizedFixes(['nope'],AUDIT_SECTIONS);
if(f.length!==28) throw new Error('got '+f.length);
"

echo "--- e2e: $pass passed, $fail failed ---"
[ "$fail" -eq 0 ]
