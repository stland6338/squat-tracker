// 純粋なロジック（DOMなし）。ブラウザとNodeの両方から読み込める。
export const LM = { shoulder: [11, 12], hip: [23, 24], knee: [25, 26], ankle: [27, 28], toe: [31, 32] };

export const DEFAULTS = {
  standKnee: 160,   // これ以上で「立っている」
  downKnee: 120,    // これ以下で「しゃがみ始め」
  goodDepthKnee: 100, // 膝角度がこれ以下なら深さOK
  parallelThigh: 20,  // 太ももの水平からの角度がこれ以下なら平行
  maxLean: 50,      // 上体の垂直からの傾き上限（度）
  kneeForwardRatio: 0.35, // 膝がつま先より前に出た量 / すね長さ の上限
};

/** 3点 a-b-c の b での角度（度） */
export function angleAt(a, b, c) {
  const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
  const d = Math.hypot(...v1) * Math.hypot(...v2);
  if (!d) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / d));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 正規化座標をピクセル比に直す（縦横比の補正） */
const px = (p, w, h) => ({ x: p.x * w, y: p.y * h, v: p.visibility ?? 1 });

/** 見えている側（左右）を選び、姿勢の数値を返す */
export function measure(landmarks, w = 1, h = 1) {
  const side = [0, 1].map((i) => {
    const pts = Object.fromEntries(Object.entries(LM).map(([k, idx]) => [k, px(landmarks[idx[i]], w, h)]));
    const vis = pts.hip.v + pts.knee.v + pts.ankle.v + pts.shoulder.v;
    return { pts, vis };
  }).sort((a, b) => b.vis - a.vis)[0];
  const { shoulder, hip, knee, ankle, toe } = side.pts;
  const kneeAngle = angleAt(hip, knee, ankle);
  const hipAngle = angleAt(shoulder, hip, knee);
  // 上体の前傾：肩→腰ベクトルの垂直からの角度
  const lean = (Math.atan2(Math.abs(shoulder.x - hip.x), Math.abs(hip.y - shoulder.y)) * 180) / Math.PI;
  // 太ももの水平からの角度（0=床と平行）
  const thigh = (Math.atan2(Math.abs(knee.y - hip.y), Math.abs(knee.x - hip.x)) * 180) / Math.PI;
  // 膝の前方移動：つま先方向にどれだけ膝がつま先を越えたか（すね長さ比）
  const dir = Math.sign(toe.x - ankle.x) || 1;
  const shin = Math.hypot(knee.x - ankle.x, knee.y - ankle.y) || 1;
  const kneeForward = ((knee.x - toe.x) * dir) / shin;
  return { kneeAngle, hipAngle, lean, thigh, kneeForward, visibility: side.vis / 4 };
}

/** 1回分の評価 */
export function judgeRep(rep, cfg = DEFAULTS) {
  const reasons = [];
  if (!(rep.minKnee <= cfg.goodDepthKnee || rep.minThigh <= cfg.parallelThigh)) reasons.push('浅い：太ももが床と平行になるまで下げよう');
  if (rep.maxLean > cfg.maxLean) reasons.push('上体が前に倒れすぎ：胸を張ろう');
  if (rep.maxKneeForward > cfg.kneeForwardRatio) reasons.push('膝が前に出すぎ：お尻を後ろに引こう');
  return { good: reasons.length === 0, reasons };
}

/** 回数カウンター（立つ→しゃがむ→立つ で1回） */
export class RepCounter {
  constructor(cfg = DEFAULTS) { this.cfg = cfg; this.reset(); }
  reset() { this.state = 'up'; this.reps = []; this.cur = null; }
  /** m = measure() の結果。1回終わったらその結果を返す */
  update(m, t = 0) {
    if (!Number.isFinite(m.kneeAngle)) return null;
    const c = this.cfg;
    if (this.state === 'up' && m.kneeAngle < c.downKnee) {
      this.state = 'down';
      this.cur = { start: t, minKnee: m.kneeAngle, minThigh: m.thigh, maxLean: m.lean, maxKneeForward: m.kneeForward };
    }
    if (this.state === 'down') {
      const r = this.cur;
      r.minKnee = Math.min(r.minKnee, m.kneeAngle);
      r.minThigh = Math.min(r.minThigh, m.thigh);
      r.maxLean = Math.max(r.maxLean, m.lean);
      r.maxKneeForward = Math.max(r.maxKneeForward, m.kneeForward);
      if (m.kneeAngle > c.standKnee) {
        this.state = 'up';
        const rep = { ...r, end: t, ...judgeRep(r, c) };
        this.reps.push(rep); this.cur = null;
        return rep;
      }
    }
    return null;
  }
  get score() {
    if (!this.reps.length) return null;
    return Math.round((100 * this.reps.filter((r) => r.good).length) / this.reps.length);
  }
}

/** 週（月曜始まり）ごとの合計 */
export function weeklyTotals(sessions) {
  const map = {};
  for (const s of sessions) {
    const d = new Date(s.date + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const w = (map[key] ||= { week: key, reps: 0, sets: 0, seconds: 0, days: 0 });
    w.reps += s.reps * s.sets; w.sets += s.sets; w.seconds += s.seconds || 0; w.days += 1;
  }
  return Object.values(map).sort((a, b) => b.week.localeCompare(a.week));
}

export const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
