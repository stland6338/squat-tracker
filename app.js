import { measure, RepCounter, DEFAULTS, weeklyTotals, fmtTime } from './logic.js';

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const $ = (s) => document.querySelector(s);
const today = () => new Date().toLocaleDateString('sv-SE');

// ---- 保存 ----
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
let settings = { restSec: 90, depthKnee: DEFAULTS.goodDepthKnee, maxLean: DEFAULTS.maxLean, sound: true, ...store.get('settings', {}) };
const cfg = () => ({ ...DEFAULTS, goodDepthKnee: settings.depthKnee, maxLean: settings.maxLean });

// ---- タブ ----
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('nav button, .tab').forEach((e) => e.classList.remove('active'));
  b.classList.add('active'); $('#tab-' + b.dataset.tab).classList.add('active');
  if (b.dataset.tab === 'body') renderBody();
});

// ---- 音 ----
let actx;
function beep(freq = 880, ms = 120) {
  if (!settings.sound) return;
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  const o = actx.createOscillator(), g = actx.createGain();
  o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
  g.gain.setValueAtTime(0.2, actx.currentTime); o.start(); o.stop(actx.currentTime + ms / 1000);
}

// ---- カメラと姿勢推定 ----
let landmarker, stream, running = false, facing = 'user';
const video = $('#video'), canvas = $('#overlay'), ctx = canvas.getContext('2d');
let counter = new RepCounter(cfg());
let setActive = false, setStart = 0;
const sessionSets = []; // {reps, good, seconds}

async function loadModel() {
  if (landmarker) return;
  $('#camerr').textContent = '判定用モデルを読み込み中…（初回は数十秒かかることがあります）';
  const { FilesetResolver, PoseLandmarker } = await import(MP + '/vision_bundle.mjs');
  const files = await FilesetResolver.forVisionTasks(MP + '/wasm');
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numPoses: 1 });
  try { landmarker = await PoseLandmarker.createFromOptions(files, opts('GPU')); }
  catch { landmarker = await PoseLandmarker.createFromOptions(files, opts('CPU')); }
  $('#camerr').textContent = '';
}

async function startCamera() {
  $('#camerr').textContent = '';
  if (!navigator.mediaDevices?.getUserMedia) { $('#camerr').textContent = 'このページではカメラが使えません（https で開いてください）。'; return; }
  try {
    facing = $('#facing').value;
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false });
    video.srcObject = stream; await video.play();
    video.classList.toggle('mirror', facing === 'user'); canvas.classList.toggle('mirror', facing === 'user');
    $('#setup').hidden = true; $('#live').hidden = false;
    await loadModel();
    running = true; requestAnimationFrame(loop);
  } catch (e) { $('#camerr').textContent = 'カメラを起動できませんでした：' + e.message + '（設定 > Safari > カメラ を「許可」にしてください）'; }
}
function stopCamera() {
  running = false; stream?.getTracks().forEach((t) => t.stop()); stream = null;
  $('#live').hidden = true; $('#setup').hidden = false; if (setActive) endSet();
}

const SKELETON = [[11, 23], [23, 25], [25, 27], [27, 31], [12, 24], [24, 26], [26, 28], [28, 32], [11, 12], [23, 24]];
let lastT = -1;
function loop() {
  if (!running) return;
  const t = performance.now();
  if (video.readyState >= 2 && t !== lastT) {
    lastT = t;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const res = landmarker.detectForVideo(video, t);
    const lm = res.landmarks?.[0];
    if (lm) {
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 6;
      for (const [a, b] of SKELETON) { ctx.beginPath(); ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height); ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height); ctx.stroke(); }
      const m = measure(lm, canvas.width, canvas.height);
      $('#angles').textContent = `膝 ${m.kneeAngle.toFixed(0)}° ／ 前傾 ${m.lean.toFixed(0)}° ／ 太もも ${m.thigh.toFixed(0)}° ／ 見え方 ${(m.visibility * 100).toFixed(0)}%`;
      if (m.visibility < 0.5) feedback('全身が映るように離れてください', '');
      else if (setActive) {
        const rep = counter.update(m, t);
        if (rep) onRep(rep);
        else if (counter.state === 'down') feedback(m.kneeAngle <= cfg().goodDepthKnee || m.thigh <= cfg().parallelThigh ? 'OK！上がろう' : 'もう少し下げて', '');
      } else feedback('「セット開始」を押してください', '');
    } else feedback('人が映っていません', '');
  }
  if (setActive) $('#settime').textContent = fmtTime((Date.now() - setStart) / 1000);
  requestAnimationFrame(loop);
}
function feedback(text, cls) { const f = $('#feedback'); f.textContent = text; f.className = cls; }
function onRep(rep) {
  const n = counter.reps.length;
  $('#count').textContent = n;
  feedback(rep.good ? `${n}回目 よい！` : `${n}回目 ${rep.reasons[0]}`, rep.good ? 'good' : 'bad');
  beep(rep.good ? 880 : 300, rep.good ? 120 : 250);
  const li = document.createElement('li');
  li.className = rep.good ? 'ok' : 'ng';
  li.textContent = rep.good ? `よい（膝${rep.minKnee.toFixed(0)}°）` : `要改善：${rep.reasons.join('／')}`;
  $('#replist').appendChild(li);
}

function startSet() {
  counter = new RepCounter(cfg()); setActive = true; setStart = Date.now();
  $('#count').textContent = '0'; $('#replist').innerHTML = ''; $('#setbtn').textContent = 'セット終了';
  stopRest(); beep(660);
}
function endSet() {
  setActive = false; $('#setbtn').textContent = 'セット開始';
  const seconds = Math.round((Date.now() - setStart) / 1000);
  if (counter.reps.length) sessionSets.push({ reps: counter.reps.length, good: counter.reps.filter((r) => r.good).length, seconds });
  renderSession(); startRest();
}
$('#setbtn').onclick = () => (setActive ? endSet() : startSet());
$('#start').onclick = startCamera;
$('#stopcam').onclick = stopCamera;
$('#switchcam').onclick = () => { $('#facing').value = facing === 'user' ? 'environment' : 'user'; stream?.getTracks().forEach((t) => t.stop()); running = false; startCamera(); };

// ---- 休憩タイマー ----
let restTimer;
function startRest() {
  let left = settings.restSec; $('#rest').hidden = false; $('#resttime').textContent = fmtTime(left);
  clearInterval(restTimer);
  restTimer = setInterval(() => {
    left--; $('#resttime').textContent = fmtTime(Math.max(0, left));
    if (left <= 3 && left > 0) beep(500, 80);
    if (left <= 0) { beep(1000, 400); stopRest(); feedback('休憩終わり！次のセットへ', 'good'); }
  }, 1000);
}
function stopRest() { clearInterval(restTimer); $('#rest').hidden = true; }
$('#skiprest').onclick = stopRest;

function renderSession() {
  if (!sessionSets.length) { $('#sessionSummary').textContent = 'まだセットはありません'; return; }
  $('#sessionSummary').innerHTML = sessionSets.map((s, i) => `${i + 1}セット目：${s.reps}回（よい ${s.good}回）${fmtTime(s.seconds)}`).join('<br>');
}
$('#saveSession').onclick = () => {
  if (!sessionSets.length) return alert('まだセットがありません');
  const reps = Math.round(sessionSets.reduce((a, s) => a + s.reps, 0) / sessionSets.length);
  const total = sessionSets.reduce((a, s) => a + s.reps, 0), good = sessionSets.reduce((a, s) => a + s.good, 0);
  addSession({ date: today(), reps, sets: sessionSets.length, seconds: sessionSets.reduce((a, s) => a + s.seconds, 0), score: Math.round((100 * good) / total), source: 'カメラ' });
  sessionSets.length = 0; renderSession(); alert('保存しました');
};

// ---- 記録 ----
function addSession(s) { const all = store.get('sessions', []); all.push({ id: Date.now(), ...s }); store.set('sessions', all); renderLog(); }
$('#manual').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  addSession({ date: f.get('date'), reps: +f.get('reps'), sets: +f.get('sets'), seconds: Math.round(+f.get('minutes') * 60), score: f.get('score') === '' ? null : +f.get('score'), source: '手入力' });
};
function renderLog() {
  const all = store.get('sessions', []).sort((a, b) => b.date.localeCompare(a.date));
  $('#history').innerHTML = '<tr><th>日付</th><th>回数×セット</th><th>時間</th><th>スコア</th><th></th></tr>' +
    all.map((s) => `<tr><td>${s.date}</td><td>${s.reps}×${s.sets}</td><td>${fmtTime(s.seconds || 0)}</td><td>${s.score ?? '-'}</td><td><button data-del="${s.id}">削除</button></td></tr>`).join('');
  $('#weekly').innerHTML = '<tr><th>週（月曜〜）</th><th>合計回数</th><th>セット</th><th>日数</th><th>時間</th></tr>' +
    weeklyTotals(all).map((w) => `<tr><td>${w.week}</td><td>${w.reps}</td><td>${w.sets}</td><td>${w.days}</td><td>${fmtTime(w.seconds)}</td></tr>`).join('');
}
$('#history').onclick = (e) => {
  const id = +e.target.dataset.del; if (!id || !confirm('この記録を削除しますか？')) return;
  store.set('sessions', store.get('sessions', []).filter((s) => s.id !== id)); renderLog();
};

// ---- 体重・ウエスト ----
$('#bodyform').onsubmit = (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  const rec = { date: f.get('date'), weight: f.get('weight') ? +f.get('weight') : null, waist: f.get('waist') ? +f.get('waist') : null };
  store.set('body', [...store.get('body', []).filter((b) => b.date !== rec.date), rec]); renderBody();
};
function chart(cv, pts, unit) {
  const dpr = devicePixelRatio || 1, W = cv.clientWidth || 300, H = cv.clientHeight || 180;
  cv.width = W * dpr; cv.height = H * dpr; const c = cv.getContext('2d'); c.scale(dpr, dpr); c.clearRect(0, 0, W, H);
  c.font = '12px sans-serif'; c.fillStyle = '#666';
  if (pts.length < 2) { c.fillText('2日分以上記録するとグラフが出ます', 10, H / 2); return; }
  const ys = pts.map((p) => p.v), min = Math.min(...ys) - 0.5, max = Math.max(...ys) + 0.5, L = 40, B = 20;
  const X = (i) => L + (i * (W - L - 10)) / (pts.length - 1), Y = (v) => 10 + ((max - v) * (H - B - 10)) / (max - min);
  c.fillText(max.toFixed(1), 2, 16); c.fillText(min.toFixed(1), 2, H - B);
  c.fillText(pts[0].d.slice(5), L, H - 4); c.fillText(pts.at(-1).d.slice(5), W - 45, H - 4);
  c.strokeStyle = '#0f766e'; c.lineWidth = 2; c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(X(i), Y(p.v)) : c.moveTo(X(i), Y(p.v)))); c.stroke();
  c.fillStyle = '#0f766e'; pts.forEach((p, i) => { c.beginPath(); c.arc(X(i), Y(p.v), 3, 0, 7); c.fill(); });
}
function renderBody() {
  const b = store.get('body', []).sort((x, y) => x.date.localeCompare(y.date));
  chart($('#wchart'), b.filter((r) => r.weight).map((r) => ({ d: r.date, v: r.weight })), 'kg');
  chart($('#cchart'), b.filter((r) => r.waist).map((r) => ({ d: r.date, v: r.waist })), 'cm');
  $('#bodyhist').innerHTML = '<tr><th>日付</th><th>体重</th><th>ウエスト</th></tr>' +
    [...b].reverse().map((r) => `<tr><td>${r.date}</td><td>${r.weight ?? '-'} kg</td><td>${r.waist ?? '-'} cm</td></tr>`).join('');
}

// ---- 設定・データ ----
function loadSettingsForm() { $('#restSec').value = settings.restSec; $('#depthKnee').value = settings.depthKnee; $('#maxLean').value = settings.maxLean; $('#sound').checked = settings.sound; }
$('#saveSettings').onclick = () => {
  settings = { restSec: +$('#restSec').value || 90, depthKnee: +$('#depthKnee').value || 100, maxLean: +$('#maxLean').value || 50, sound: $('#sound').checked };
  store.set('settings', settings); beep(); alert('保存しました');
};
$('#export').onclick = () => {
  const blob = new Blob([JSON.stringify({ sessions: store.get('sessions', []), body: store.get('body', []), settings }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `squat-${today()}.json` }); a.click();
};
$('#import').onchange = async (e) => {
  try { const d = JSON.parse(await e.target.files[0].text()); if (d.sessions) store.set('sessions', d.sessions); if (d.body) store.set('body', d.body); renderLog(); renderBody(); alert('読み込みました'); }
  catch { alert('読み込めませんでした'); }
};
$('#wipe').onclick = () => { if (confirm('すべての記録を削除します。よろしいですか？')) { localStorage.removeItem('sessions'); localStorage.removeItem('body'); renderLog(); renderBody(); } };

document.querySelectorAll('input[type=date]').forEach((i) => (i.value = today()));
loadSettingsForm(); renderLog(); renderSession();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');
