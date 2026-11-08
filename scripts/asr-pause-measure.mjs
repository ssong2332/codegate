#!/usr/bin/env node
// 2026-11-08(관찰 e) — 16kHz mono PCM16 WAV 폴더(clipN.wav + phrases.json)의 말소리 구간 · 쉼(ms)을 잰다. 실 키 0 · 과금 0.
// 사용법: node scripts/asr-pause-measure.mjs <클립 폴더>  · 결과 해석 = docs/research/asr-digits-drop-2026-11-08.md
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
const dir = process.argv[2];
const phrases = JSON.parse(readFileSync(path.join(dir, "phrases.json"), "utf8").replace(/^\uFEFF/, ""));
for (const f of readdirSync(dir).filter((n) => /^clip\d+\.wav$/.test(n)).sort()) {
  const buf = readFileSync(path.join(dir, f));
  let off = 12, dataOff = -1, dataLen = 0;
  while (off < buf.length - 8) { const id = buf.toString("ascii", off, off + 4); const len = buf.readUInt32LE(off + 4); if (id === "data") { dataOff = off + 8; dataLen = len; break; } off += 8 + len; }
  const n = Math.floor(Math.min(dataLen, buf.length - dataOff) / 2);
  const s = new Int16Array(n); for (let i = 0; i < n; i++) s[i] = buf.readInt16LE(dataOff + i * 2);
  const FR = 160; const rms = [];
  for (let i = 0; i + FR <= n; i += FR) { let a = 0; for (let j = 0; j < FR; j++) a += (s[i + j] / 32768) ** 2; rms.push(Math.sqrt(a / FR)); }
  const max = Math.max(...rms); const th = max * 10 ** (-35 / 20);
  const segs = []; let cur = null;
  rms.forEach((r, k) => { const on = r > th; if (on && !cur) cur = { s: k }; if (!on && cur) { cur.e = k; segs.push(cur); cur = null; } });
  if (cur) { cur.e = rms.length; segs.push(cur); }
  // 60ms 미만 틈은 한 구간으로(자음 내부 틈)
  const merged = []; for (const g of segs) { const last = merged.at(-1); if (last && (g.s - last.e) * 10 < 60) last.e = g.e; else merged.push({ ...g }); }
  const idx = Number(f.match(/\d+/)[0]) - 1;
  console.log(`\n${f} "${phrases[idx]}" 길이 ${(n / 16).toFixed(0)}ms`);
  console.log("  말소리 구간(ms 길이): " + merged.map((g) => (g.e - g.s) * 10).join(" | "));
  console.log("  구간 사이 침묵(ms): " + merged.slice(1).map((g, k) => (g.s - merged[k].e) * 10).join(" | "));
}
