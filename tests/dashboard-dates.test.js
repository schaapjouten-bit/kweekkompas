const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app-v132.js'),'utf8');
const start=source.indexOf('function classifyDashboardReminders(');
const code=source.slice(start);
const context={};vm.createContext(context);vm.runInContext(code,context);
test('17 april is achterstallig op 2 oktober, weekgrenzen en done gelden zonder mutatie',()=>{
  const reminders=[{id:'old',date:'2026-04-17'},{id:'yesterday',date:'2026-10-01'},{id:'today',date:'2026-10-02'},{id:'sunday',date:'2026-10-04'},{id:'monday',date:'2026-10-05'},{id:'done',date:'2026-04-17',done:true},{id:'invalid',date:'2026-04-31'}];
  const before=JSON.stringify(reminders);
  const groups=context.classifyDashboardReminders(reminders,new Date(2026,9,2,12));
  assert.deepEqual(Array.from(groups.overdue,r=>r.id),['old','yesterday']);
  assert.deepEqual(Array.from(groups.current,r=>r.id),['today','sunday']);
  assert.deepEqual(Array.from(groups.future,r=>r.id),['monday']);
  assert.equal(JSON.stringify(reminders),before);
});
test('jaarwisseling gebruikt lokale datum en volgende maandag als exclusieve grens',()=>{
 const g=context.classifyDashboardReminders([{date:'2026-12-30'},{date:'2026-12-31'},{date:'2027-01-03'},{date:'2027-01-04'}],new Date(2026,11,31,0,1));
 assert.equal(g.todayKey,'2026-12-31');assert.equal(g.weekEndKey,'2027-01-04');
 assert.equal(g.overdue.length,1);assert.equal(g.current.length,2);assert.equal(g.future.length,1);
});
