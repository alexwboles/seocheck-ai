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

# 8: fix queue filters — user narrows to high-impact GBP items, then clears
check "fix filters narrow the action queue" node -e "
$PRELUDE
const all=L.prioritizedFixes([],AUDIT_SECTIONS);
const hi=L.filterFixes(all,{impact:'high'});
if(!hi.every(f=>f.impact==='high')||hi.length===0) throw new Error('impact filter');
const gbp=L.filterFixes(all,{sectionId:'gbp'});
if(!gbp.every(f=>f.sectionId==='gbp')||gbp.length===0) throw new Error('section filter');
const both=L.filterFixes(all,{impact:'high',sectionId:'gbp'});
if(!both.every(f=>f.impact==='high'&&f.sectionId==='gbp')) throw new Error('combined');
// ranks stay in priority order after filtering
for(let i=1;i<both.length;i++){ if(L.IMPACT_RANK[both[i-1].impact]>L.IMPACT_RANK[both[i].impact]) throw new Error('order broken'); }
"

# 9: item search — 'review' finds review items across sections
check "search finds items across sections" node -e "
$PRELUDE
const res=L.searchItems(AUDIT_SECTIONS,'review');
if(res.length<3) throw new Error('expected 3+ matches, got '+res.length);
if(!res.every(m=>m.item.label.toLowerCase().includes('review'))) throw new Error('non-matching result');
"

# 10: audit lifecycle with deltas — save two audits, second shows +pts
check "history deltas show score progress" node -e "
$PRELUDE
const mem={d:{},getItem(k){return this.d[k]??null},setItem(k,v){this.d[k]=v}};
const half=items.slice(0,14).map(i=>i.id);
const r1=L.computeScore(half,AUDIT_SECTIONS);
L.saveAudit(mem,{date:'2026-09-01',businessName:'Acme',score:r1.score,band:r1.band});
const all=items.map(i=>i.id);
const r2=L.computeScore(all,AUDIT_SECTIONS);
L.saveAudit(mem,{date:'2026-10-01',businessName:'Acme',score:r2.score,band:r2.band});
const h=L.historyWithDeltas(L.loadAudits(mem));
if(h.length!==2) throw new Error('want 2 audits');
if(h[0].delta!==null) throw new Error('first delta must be null');
if(h[1].delta!==(r2.score-r1.score)||h[1].delta<=0) throw new Error('want positive delta, got '+h[1].delta);
"

# 11: copy action plan — full queue renders as numbered text with impacts + effort
check "action plan text is complete and ordered" node -e "
$PRELUDE
const fixes=L.prioritizedFixes([],AUDIT_SECTIONS);
const r=L.computeScore([],AUDIT_SECTIONS);
const txt=L.actionPlanText(r,fixes,'Acme Plumbing');
const lines=txt.split('\n');
if(lines.length!==31) throw new Error('want 28 fixes + header + effort + blank, got '+lines.length);
if(lines[1].indexOf('Estimated effort:')!==0) throw new Error('effort line missing: '+lines[1]);
if(!lines[3].startsWith('1. [high impact')) throw new Error('first fix not high impact: '+lines[3]);
if(lines[3].indexOf('Half day')<0) throw new Error('first fix missing effort label: '+lines[3]);
const last=lines[lines.length-1];
if(!last.startsWith('28. [low impact')) throw new Error('last fix not low impact: '+last);
if(last.indexOf('Quick win')<0) throw new Error('last fix missing effort label: '+last);
"

# 12: search + filter + plan compose (search 'ssl', no fixes affected)
check "search composes with scoring" node -e "
$PRELUDE
const res=L.searchItems(AUDIT_SECTIONS,'ssl');
if(res.length!==1||res[0].item.id!=='web-ssl') throw new Error('ssl search: '+JSON.stringify(res.map(m=>m.item.id)));
const fixes=L.prioritizedFixes([],AUDIT_SECTIONS);
if(!fixes.some(f=>f.id==='web-ssl')) throw new Error('web-ssl missing from queue');
"
check "unknown checked ids are ignored" node -e "
$PRELUDE
const r=L.computeScore(['nope','alsono'],AUDIT_SECTIONS);
if(r.score!==0) throw new Error(JSON.stringify(r));
const f=L.prioritizedFixes(['nope'],AUDIT_SECTIONS);
if(f.length!==28) throw new Error('got '+f.length);
"

# effort + notes + re-audit diff, end to end
check "effort, work notes, and re-audit diff flow" node -e "
$PRELUDE
// First audit: only 3 quick wins done -> plan is honest about the remaining work
const done1=items.filter(i=>i.impact==='low').slice(0,3).map(i=>i.id);
const fixes1=L.prioritizedFixes(done1,AUDIT_SECTIONS);
const eff1=L.planEffort(fixes1);
if(fixes1.length!==25) throw new Error('fixes: '+fixes1.length);
if(eff1.quickWins!==3) throw new Error('quick wins left: '+eff1.quickWins);
// every fix line carries its effort chip
const plan1=L.actionPlanText(L.computeScore(done1,AUDIT_SECTIONS),fixes1,'Acme');
if(!/Estimated effort:/.test(plan1)) throw new Error('plan missing effort');
if(!/Quick win/.test(plan1)) throw new Error('plan missing quick-win label');
// Work log: owner logs what they did on two fixes
let notes={};
notes=L.addFixNote(notes,fixes1[0].id,'Called Google support, verification postcard on the way').notes;
notes=L.addFixNote(notes,fixes1[0].id,'Postcard arrived, profile verified').notes;
notes=L.addFixNote(notes,fixes1[1].id,'Uploaded 12 new photos').notes;
if(L.fixNotesFor(notes,fixes1[0].id).length!==2) throw new Error('note count');
// Second audit: the two logged fixes are now checked -> diff shows them fixed
const done2=done1.concat([fixes1[0].id,fixes1[1].id]);
const mem={}; const store={getItem:k=>mem[k]||null,setItem:(k,v)=>{mem[k]=v}};
const r1=L.computeScore(done1,AUDIT_SECTIONS), r2=L.computeScore(done2,AUDIT_SECTIONS);
L.saveAudit(store,{date:'2026-10-01',businessName:'Acme',score:r1.score,band:r1.band,checkedIds:done1});
L.saveAudit(store,{date:'2026-10-12',businessName:'Acme',score:r2.score,band:r2.band,checkedIds:done2});
const hist=L.historyWithDeltas(L.loadAudits(store));
if(hist.length!==2||hist[1].delta!==r2.score-r1.score) throw new Error('history delta');
const d=L.diffAudits(hist[0].checkedIds,hist[1].checkedIds,AUDIT_SECTIONS);
if(d.completed.length!==2) throw new Error('completed: '+JSON.stringify(d.completed));
if(d.regressed.length!==0) throw new Error('regressed: '+JSON.stringify(d.regressed));
// Effort shrinks as fixes land
const eff2=L.planEffort(L.prioritizedFixes(done2,AUDIT_SECTIONS));
if(!(eff2.totalMinutes<eff1.totalMinutes)) throw new Error('effort should shrink');
"

# N/A + what-if + reminders, end to end on the real 28-item bank
check "N/A, what-if, and re-audit reminders flow" node -e "
$PRELUDE
// Owner has no website: mark all 8 Website Basics items N/A
const web=S=>{};
const webItems=AUDIT_SECTIONS.find(s=>s.id==='website').items.map(i=>i.id);
if(webItems.length!==8) throw new Error('website section should have 8 items');
const fullMax=L.computeScore([],AUDIT_SECTIONS).maxScore;
const naMax=L.computeScore([],AUDIT_SECTIONS,webItems).maxScore;
if(!(naMax<fullMax)) throw new Error('N/A must shrink the max score');
const hi=items.filter(i=>i.impact==='high'&&webItems.indexOf(i.id)<0).map(i=>i.id);
const score=L.computeScore(hi,AUDIT_SECTIONS,webItems);
if(score.score!==score.maxScore- (naMax-score.score)) throw new Error('score math');
const fixes=L.prioritizedFixes(hi,AUDIT_SECTIONS,webItems);
if(fixes.some(f=>webItems.indexOf(f.id)>=0)) throw new Error('fixes must skip N/A items');
// What-if: the top 3 remaining fixes lift the score by exactly their weights
const top3=fixes.slice(0,3).map(f=>f.id);
const w=L.projectedScore(hi,AUDIT_SECTIONS,top3,webItems);
const expectGain=top3.reduce((s,id)=>s+items.find(i=>i.id===id).weight,0);
if(w.gain!==expectGain) throw new Error('what-if gain '+w.gain+' vs '+expectGain);
// Reminders: last audit 2026-09-01 + 30-day cadence is overdue by mid-October
const st=L.reminderStatus('2026-09-01',30,'2026-10-13');
if(st!=='overdue') throw new Error('reminder status: '+st);
if(L.nextAuditDue('2026-09-01',30)!=='2026-10-01') throw new Error('due date');
"

echo "--- e2e: $pass passed, $fail failed ---"
[ "$fail" -eq 0 ]
