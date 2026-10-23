// §122(8) 오프라인 렌더 — Live 원본 WAV(`scripts/live-loudness-probe.mjs` 산출물)를 **앱 모듈 그대로**(loudnessNormalizer.ts · outputGain.ts) 통과시켜
// 통화 모드 최종 레벨(전체 · 말소리 시작 3초 · 최대 3초 창)과 정규화 게인 궤적을 잰다. 실 키 0 · 과금 0.
// 사용: node --experimental-strip-types scripts/loudness-offline-render.mjs <wav 폴더> <저장소 루트> [청크 샘플 수=7680] [정규화 결과 폴더]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [dir, wt, chunkArg, outDir] = process.argv.slice(2);
const ln = await import(pathToFileURL(path.join(wt, "src/lib/realtime/loudnessNormalizer.ts")).href);
const og = await import(pathToFileURL(path.join(wt, "src/lib/realtime/outputGain.ts")).href);
const CH = Number(chunkArg || 7680);
const SR = 24000;
const peak = (a) => { let p = 0; for (const v of a) p = Math.max(p, Math.abs(v)); return p; };
const win = (x, s, e) => ln.dbfs(ln.speechRms(x.subarray(Math.floor(s * SR), Math.floor(e * SR))));
// 말소리 시작점(첫 말소리 프레임)부터 잰 구간
function firstSpeech(x) { const g = 10 ** (ln.SPEECH_GATE_DBFS / 20); for (let i = 0; i + 480 <= x.length; i += 480) { let s = 0; for (let j = i; j < i + 480; j++) s += x[j] * x[j]; if (Math.sqrt(s / 480) >= g) return i / SR; } return 0; }
function maxShortTerm(x, w = 3) { let m = -Infinity; for (let s = 0; s + w <= x.length / SR; s += 0.5) m = Math.max(m, win(x, s, s + w)); return m; }
const rows = [];
if (outDir) mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(dir).filter((x) => x.endsWith(".wav")).sort()) {
  const b = readFileSync(path.join(dir, f)); const n = (b.length - 44) / 2; const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(44 + i * 2) / 32768;
  let st = ln.INITIAL_LOUDNESS_STATE; const norm = new Float32Array(n); const gains = [];
  for (let a = 0; a < n; a += CH) { const r = ln.normalizeChunk(x.subarray(a, Math.min(n, a + CH)), st); norm.set(r.out, a); st = r.state; gains.push(ln.dbfs(st.gain)); }
  const call = norm.map((v) => v * og.CALL_MODE_GAIN);
  const t0 = firstSpeech(x);
  rows.push({
    id: f.replace(".wav", ""),
    rawRms: ln.dbfs(ln.speechRms(x)), rawFirst3: win(x, t0, t0 + 3), rawMax3: maxShortTerm(x),
    callRms: ln.dbfs(ln.speechRms(call)), callFirst3: win(call, t0, t0 + 3), callMax3: maxShortTerm(call), callPeak: ln.dbfs(peak(call)),
    firstGain: gains.find((g) => g !== 0) ?? 0, maxGain: Math.max(...gains), lastGain: gains.at(-1),
  });
  if (outDir) writeFileSync(path.join(outDir, f.replace(".wav", ".norm.f32")), Buffer.from(norm.buffer));
}
const fx = (v) => (Number.isFinite(v) ? v.toFixed(2) : "-");
console.log("| 세션 | 원본 RMS | 원본 첫3초 | 원본 최대3초 | 통화 최종 RMS | 통화 첫3초 | 통화 최대3초 | 통화 꼭대기 | 첫 게인 | 최대 게인 | 마지막 게인 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of rows) console.log(`| ${r.id} | ${fx(r.rawRms)} | ${fx(r.rawFirst3)} | ${fx(r.rawMax3)} | ${fx(r.callRms)} | ${fx(r.callFirst3)} | ${fx(r.callMax3)} | ${fx(r.callPeak)} | ${fx(r.firstGain)} | ${fx(r.maxGain)} | ${fx(r.lastGain)} |`);
