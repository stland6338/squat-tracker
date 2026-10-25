import assert from 'node:assert/strict';
import { angleAt, measure, RepCounter, weeklyTotals, judgeRep, fmtTime } from './logic.js';
const near = (a, b, e = 0.5) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
near(angleAt({x:0,y:-1},{x:0,y:0},{x:0,y:1}), 180);
near(angleAt({x:1,y:0},{x:0,y:0},{x:0,y:1}), 90);
// 横向き（右向き）の人体を膝角度 k から合成
function pose(k, { lean = 10, kneeFwd = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }));
  const ankle = { x: 0.5, y: 0.9 }, shin = 0.2, th = 0.2;
  const sh = (180 - k) / 2 * Math.PI / 180; // すねと太ももで半分ずつ曲げる
  const knee = { x: ankle.x + Math.sin(sh) * shin + kneeFwd, y: ankle.y - Math.cos(sh) * shin };
  const ta = Math.atan2(ankle.y - knee.y, ankle.x - knee.x), kr = k * Math.PI / 180;
  const cand = [ta + kr, ta - kr].map(t => ({ x: knee.x + Math.cos(t) * th, y: knee.y + Math.sin(t) * th }));
  const hip = cand.sort((p, q) => p.x - q.x)[0];
  const L = lean * Math.PI / 180;
  const shoulder = { x: hip.x + Math.sin(L) * 0.3, y: hip.y - Math.cos(L) * 0.3 };
  const toe = { x: ankle.x + 0.08, y: 0.9 };
  for (const [i, p] of [[12, shoulder], [24, hip], [26, knee], [28, ankle], [32, toe]]) lm[i] = { ...p, visibility: 0.99 };
  return lm;
}
for (const k of [170, 140, 90, 70]) near(measure(pose(k)).kneeAngle, k, 1);
near(measure(pose(170, { lean: 30 })).lean, 30, 1);
// 良い3回 + 浅い1回 + 前傾1回
const c = new RepCounter(); let t = 0;
const run = (minK, opt) => { for (let k = 175; k >= minK; k -= 5) c.update(measure(pose(k, opt)), t++); for (let k = minK; k <= 175; k += 5) c.update(measure(pose(k, opt)), t++); };
run(85); run(85); run(85); run(115); run(85, { lean: 60 });
assert.equal(c.reps.length, 5);
assert.deepEqual(c.reps.map(r => r.good), [true, true, true, false, false]);
assert.match(c.reps[3].reasons[0], /浅い/);
assert.match(c.reps[4].reasons.join(), /前に倒れ/);
assert.equal(c.score, 60);
// ノイズ（閾値付近の揺れ）で二重カウントしない
const c2 = new RepCounter(); for (const k of [170,118,125,117,130,118,165,158,166]) c2.update(measure(pose(k)));
assert.equal(c2.reps.length, 1);
// しゃがみ切らない揺れはカウントしない
const c3 = new RepCounter(); for (const k of [170,130,165,125,170]) c3.update(measure(pose(k)));
assert.equal(c3.reps.length, 0);
assert.equal(judgeRep({minKnee:90,minThigh:30,maxLean:20,maxKneeForward:0.6}).reasons[0].includes('膝'), true);
const w = weeklyTotals([{date:'2026-10-26',reps:10,sets:3,seconds:60},{date:'2026-10-28',reps:12,sets:3,seconds:60},{date:'2026-10-25',reps:10,sets:2}]);
assert.equal(w[0].week,'2026-10-26'); assert.equal(w[0].reps,66); assert.equal(w[1].week,'2026-10-19');
assert.equal(fmtTime(75),'1:15');
console.log('all tests passed');
