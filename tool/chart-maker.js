// =========================================
// 譜面自動作成ツール（chart-maker.html から使う）
// 曲を解析して NORMAL / HARD / MANIAC の譜面ファイルを作る
// ゲーム本体では使わない（事前に1回だけ実行する）
// =========================================

const ChartMaker = (() => {
  const LANE_COUNT = 5;
  const FRAME_SIZE = 1024; // 解析する1区切りのサンプル数
  const HOP_SIZE = 256;    // 区切りをずらす量（小さいほど時間が細かい）
  const FIRST_NOTE_TIME = 2.0; // ノーツが落ち始めるまでの余裕（秒）

  // 難易度ごとの設定
  const DEFAULT_DIFFICULTIES = {
    NORMAL: {
      density: 2.0,      // 1秒あたりの平均ノーツ数の目安
      minInterval: 0.28, // ノーツ同士の最短間隔（秒）
      jackLimit: 0.6,    // 同じレーンを続けて押させない間隔（秒）
      chordRate: 0.04,   // 同時押しにする割合
      maxChord: 2,
      scratchRate: 0.15, // Gレーン（ターンテーブル）の使いやすさ
    },
    HARD: {
      density: 4.0,
      minInterval: 0.14,
      jackLimit: 0.3,
      chordRate: 0.1,
      maxChord: 2,
      scratchRate: 0.3,
    },
    MANIAC: {
      density: 6.5,
      minInterval: 0.07,
      jackLimit: 0.16,
      chordRate: 0.16,
      maxChord: 3,
      scratchRate: 0.4,
    },
  };

  // ---- 乱数（同じ曲なら毎回同じ譜面になるよう、曲IDから作る） ----
  function createRandom(text) {
    let seed = 2166136261;
    for (const char of text) {
      seed ^= char.charCodeAt(0);
      seed = Math.imul(seed, 16777619);
    }
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- FFT（音を周波数ごとに分ける計算） ----
  function createFft(size) {
    const levels = Math.log2(size);
    const reverse = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let x = i, r = 0;
      for (let b = 0; b < levels; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      reverse[i] = r;
    }
    const cos = new Float32Array(size / 2);
    const sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / size);
      sin[i] = Math.sin((2 * Math.PI * i) / size);
    }

    return (real, imag) => {
      for (let i = 0; i < size; i++) {
        const j = reverse[i];
        if (j > i) {
          [real[i], real[j]] = [real[j], real[i]];
          [imag[i], imag[j]] = [imag[j], imag[i]];
        }
      }
      for (let half = 1; half < size; half *= 2) {
        const step = size / (half * 2);
        for (let start = 0; start < size; start += half * 2) {
          for (let k = 0; k < half; k++) {
            const a = start + k;
            const b = a + half;
            const c = cos[k * step];
            const s = sin[k * step];
            const tr = real[b] * c + imag[b] * s;
            const ti = imag[b] * c - real[b] * s;
            real[b] = real[a] - tr;
            imag[b] = imag[a] - ti;
            real[a] += tr;
            imag[a] += ti;
          }
        }
      }
    };
  }

  // ---- 1. 音の立ち上がり（オンセット）を調べる ----
  async function analyseOnsets(samples, sampleRate, onProgress) {
    const frameCount = Math.max(0, Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE));
    const fft = createFft(FRAME_SIZE);
    const window = new Float32Array(FRAME_SIZE);
    for (let i = 0; i < FRAME_SIZE; i++) {
      window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FRAME_SIZE);
    }

    const binHz = sampleRate / FRAME_SIZE;
    const toBin = (hz) => Math.min(FRAME_SIZE / 2, Math.max(1, Math.round(hz / binHz)));
    const bands = {
      low: [toBin(30), toBin(150)],      // バスドラム・ベース
      mid: [toBin(150), toBin(2000)],    // スネア・ギター・ボーカル
      high: [toBin(2000), toBin(12000)], // ハイハット・シンバル
    };

    const low = new Float32Array(frameCount);
    const mid = new Float32Array(frameCount);
    const high = new Float32Array(frameCount);
    const energy = new Float32Array(frameCount);

    const real = new Float32Array(FRAME_SIZE);
    const imag = new Float32Array(FRAME_SIZE);
    let previous = new Float32Array(FRAME_SIZE / 2);
    let current = new Float32Array(FRAME_SIZE / 2);

    for (let f = 0; f < frameCount; f++) {
      const offset = f * HOP_SIZE;
      let sum = 0;
      for (let i = 0; i < FRAME_SIZE; i++) {
        const value = samples[offset + i];
        sum += value * value;
        real[i] = value * window[i];
        imag[i] = 0;
      }
      energy[f] = Math.sqrt(sum / FRAME_SIZE);

      fft(real, imag);
      for (let k = 0; k < FRAME_SIZE / 2; k++) {
        current[k] = Math.log1p(100 * Math.hypot(real[k], imag[k]));
      }

      // 前の区切りより大きくなった分だけを足す（音の立ち上がり）
      const flux = ([start, end]) => {
        let total = 0;
        for (let k = start; k < end; k++) {
          const rise = current[k] - previous[k];
          if (rise > 0) total += rise;
        }
        return total / (end - start);
      };
      low[f] = flux(bands.low);
      mid[f] = flux(bands.mid);
      high[f] = flux(bands.high);

      [previous, current] = [current, previous];

      if (f % 2000 === 0) {
        if (onProgress) onProgress(f / frameCount);
        await new Promise((resolve) => setTimeout(resolve, 0)); // 画面が固まらないように
      }
    }

    // 帯域ごとに大きさをそろえてから合計する
    const normalise = (array) => {
      const sorted = Array.from(array).sort((a, b) => a - b);
      const reference = sorted[Math.floor(sorted.length * 0.98)] || 1;
      for (let i = 0; i < array.length; i++) array[i] /= reference;
    };
    normalise(low);
    normalise(mid);
    normalise(high);

    const onset = new Float32Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
      onset[f] = low[f] * 1.0 + mid[f] * 0.9 + high[f] * 0.6;
    }

    // 区切りの番号を秒に変える（立ち上がりは区切りの中央付近で検出される）
    const frameToTime = (f) => (f * HOP_SIZE + FRAME_SIZE * 0.5) / sampleRate;
    const timeToFrame = (t) => Math.round((t * sampleRate - FRAME_SIZE * 0.5) / HOP_SIZE);

    return { onset, low, mid, high, energy, frameCount, frameToTime, timeToFrame };
  }

  // ---- 2. BPM を推定する ----
  function estimateBpm(analysis, sampleRate) {
    const { onset, frameCount } = analysis;
    const framesPerSecond = sampleRate / HOP_SIZE;

    // 平均を引いて、強い立ち上がりだけを残す
    let mean = 0;
    for (let i = 0; i < frameCount; i++) mean += onset[i];
    mean /= frameCount;
    const env = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) env[i] = Math.max(0, onset[i] - mean);

    // 自己相関：一定の間隔で同じような立ち上がりが繰り返されるかを調べる
    const scoreForBpm = (bpm) => {
      const lag = (60 / bpm) * framesPerSecond;
      let total = 0;
      for (const multiple of [1, 2, 4]) {
        const l = Math.round(lag * multiple);
        let sum = 0;
        for (let i = 0; i + l < frameCount; i++) sum += env[i] * env[i + l];
        total += sum / (frameCount - l) / multiple;
      }
      // よく使われるテンポ（120〜200付近）を少し優先する
      const preference = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 160) / 0.6, 2));
      return total * (0.7 + 0.3 * preference);
    };

    let bestBpm = 120;
    let bestScore = -Infinity;
    for (let bpm = 70; bpm <= 220; bpm += 0.5) {
      const score = scoreForBpm(bpm);
      if (score > bestScore) { bestScore = score; bestBpm = bpm; }
    }
    // 細かく探し直す
    for (let bpm = bestBpm - 0.5; bpm <= bestBpm + 0.5; bpm += 0.05) {
      const score = scoreForBpm(bpm);
      if (score > bestScore) { bestScore = score; bestBpm = bpm; }
    }
    return Math.round(bestBpm * 100) / 100;
  }

  // ---- 3. 1拍目の位置（オフセット）を推定する ----
  // 拍の位置に強い立ち上がりがどれだけ重なるかで、ずれの少ない位置を探す
  function combScore(analysis, bpm, phase, duration) {
    const { onset, timeToFrame } = analysis;
    const beat = 60 / bpm;
    let score = 0;
    for (let t = phase; t < duration; t += beat) {
      const f = timeToFrame(t);
      if (f >= 0 && f < onset.length) score += onset[f];
    }
    return score;
  }

  function estimateOffset(analysis, bpm, duration) {
    const beat = 60 / bpm;
    let bestOffset = 0;
    let bestScore = -Infinity;
    for (let phase = 0; phase < beat; phase += 0.002) {
      const score = combScore(analysis, bpm, phase, duration);
      if (score > bestScore) { bestScore = score; bestOffset = phase; }
    }
    return { offset: bestOffset, score: bestScore };
  }

  // BPMを細かく調整する（少しのずれでも曲の後半で大きくずれるため）
  function refineBpm(analysis, roughBpm, duration) {
    let best = { bpm: roughBpm, ...estimateOffset(analysis, roughBpm, duration) };
    for (let bpm = roughBpm - 0.6; bpm <= roughBpm + 0.6; bpm += 0.02) {
      const result = estimateOffset(analysis, bpm, duration);
      if (result.score > best.score) best = { bpm, ...result };
    }

    // 多くの曲はBPMが整数なので、整数でもほぼ同じくらい合うなら整数にする
    const rounded = Math.round(best.bpm);
    const roundedResult = estimateOffset(analysis, rounded, duration);
    if (roundedResult.score >= best.score * 0.97) {
      best = { bpm: rounded, ...roundedResult };
    }
    return { bpm: Math.round(best.bpm * 100) / 100, offset: best.offset };
  }

  // 指定した時刻付近で一番強い値
  function peakAround(array, frame, radius) {
    let peak = 0;
    for (let f = frame - radius; f <= frame + radius; f++) {
      if (f >= 0 && f < array.length && array[f] > peak) peak = array[f];
    }
    return peak;
  }

  // ---- 4. 拍に合わせた候補（グリッド）を作り、強さを付ける ----
  function buildGrid(analysis, bpm, offset, duration) {
    const { onset, low, mid, high, energy, timeToFrame } = analysis;
    const beat = 60 / bpm;
    const step = beat / 4; // 16分音符の細かさ

    // 曲の中で音が鳴っている範囲
    const sortedEnergy = Array.from(energy).sort((a, b) => a - b);
    const silence = sortedEnergy[Math.floor(sortedEnergy.length * 0.5)] * 0.15;

    const points = [];
    for (let j = 0; ; j++) {
      const time = offset + j * step;
      if (time > duration - 1) break;
      if (time < FIRST_NOTE_TIME) continue;

      const frame = timeToFrame(time);
      if (frame < 0 || frame >= onset.length) continue;
      if (peakAround(energy, frame, 4) < silence) continue; // 無音部分は飛ばす

      points.push({
        time,
        frame,
        sub: ((j % 4) + 4) % 4, // 0：表拍、2：8分の裏、1・3：16分
        strength: peakAround(onset, frame, 3),
        low: peakAround(low, frame, 3),
        mid: peakAround(mid, frame, 3),
        high: peakAround(high, frame, 3),
      });
    }

    // 静かな部分にもノーツが入るよう、周り（前後4秒）の強さと比べた値も使う
    const windowSize = Math.round(4 / step);
    const sortedAll = points.map((p) => p.strength).sort((a, b) => a - b);
    const globalReference = sortedAll[Math.floor(sortedAll.length * 0.9)] || 1;

    for (let i = 0; i < points.length; i++) {
      const nearby = [];
      for (let k = Math.max(0, i - windowSize); k <= Math.min(points.length - 1, i + windowSize); k++) {
        nearby.push(points[k].strength);
      }
      nearby.sort((a, b) => a - b);
      const localReference = nearby[Math.floor(nearby.length * 0.9)] || 1;

      const local = points[i].strength / (localReference + 1e-6);
      const global = points[i].strength / (globalReference + 1e-6);
      points[i].score = local * 0.6 + global * 0.4;
    }

    return { points, beat, step };
  }

  // ---- 5. 難易度ごとにノーツを選ぶ ----
  function pickNotes(grid, settings, activeDuration) {
    const { points, step } = grid;

    // 表拍ほど選ばれやすく、16分は選ばれにくく
    const subWeight = [1.2, 0.8, 1.0, 0.8];
    const allowedSubs = (() => {
      // 最短間隔に合わせて使う細かさを決める（4分→8分→16分）
      if (step * 4 < settings.minInterval) return [0]; // 4分でも詰まりすぎる場合
      if (step * 2 < settings.minInterval) return [0];
      if (step < settings.minInterval) return [0, 2];
      return [0, 1, 2, 3];
    })();

    const candidates = points
      .map((p, index) => ({ ...p, index, weighted: p.score * subWeight[p.sub] }))
      .filter((p) => allowedSubs.includes(p.sub) && p.score > 0.12);

    candidates.sort((a, b) => b.weighted - a.weighted);

    const target = Math.round(settings.density * activeDuration);
    const minSteps = Math.max(1, Math.round(settings.minInterval / step - 0.01));
    const taken = new Uint8Array(points.length);
    const picked = [];

    for (const candidate of candidates) {
      if (picked.length >= target) break;
      let blocked = false;
      for (let k = candidate.index - minSteps + 1; k <= candidate.index + minSteps - 1; k++) {
        if (k >= 0 && k < points.length && taken[k]) { blocked = true; break; }
      }
      if (blocked) continue;
      taken[candidate.index] = 1;
      picked.push(candidate);
    }

    picked.sort((a, b) => a.time - b.time);
    return picked;
  }

  // ---- 6. レーンを割り当てる ----
  function assignLanes(picked, settings, random) {
    const notes = [];
    const lastLaneTime = new Array(LANE_COUNT).fill(-Infinity);
    const recentUse = new Array(LANE_COUNT).fill(0); // 最近よく使ったレーン
    let previousLane = -1;

    // 強さの順位（同時押しにするかどうかの判断に使う）
    const strengths = picked.map((p) => p.score).sort((a, b) => b - a);
    const chordThreshold = strengths[Math.floor(strengths.length * settings.chordRate)] ?? Infinity;

    const chooseLane = (point, avoid) => {
      const total = point.low + point.mid + point.high + 1e-6;
      // 低い音ほど左、高い音ほど右のレーンを好む
      const position = (point.mid * 0.5 + point.high * 1.0) / total;
      const preferred = 1 + position * 3; // 1〜4（H〜L）
      const lowShare = point.low / total;

      let bestLane = 1;
      let bestCost = Infinity;
      for (let lane = 0; lane < LANE_COUNT; lane++) {
        if (avoid.includes(lane)) continue;
        let cost;
        if (lane === 0) {
          // Gレーン：低音が強い音で、たまに使う
          cost = 2.6 - lowShare * 2 - settings.scratchRate * 2;
          if (point.time - lastLaneTime[0] < Math.max(0.3, settings.jackLimit)) cost += 10;
        } else {
          cost = Math.abs(lane - preferred);
        }
        // 同じレーンを短い間隔で続けて押させない
        if (point.time - lastLaneTime[lane] < settings.jackLimit) cost += 10;
        if (lane === previousLane) cost += 1.5;
        cost += recentUse[lane] * 0.5; // 偏らないよう、よく使ったレーンは選ばれにくく
        cost += random() * 1.6; // 単調にならないよう少しばらつかせる
        if (cost < bestCost) { bestCost = cost; bestLane = lane; }
      }
      return bestLane;
    };

    for (const point of picked) {
      const lanesHere = [chooseLane(point, [])];

      // 強い音は同時押しにする（NORMALは表拍だけ）
      const isStrong = point.score >= chordThreshold;
      const chordAllowed = settings.maxChord >= 2 && (point.sub === 0 || settings.maxChord >= 3);
      if (isStrong && chordAllowed) {
        const chordSize = settings.maxChord >= 3 && random() < 0.2 ? 3 : 2;
        while (lanesHere.length < chordSize) {
          // 隣り合わないレーンを選ぶ
          const avoid = [...lanesHere];
          for (const lane of lanesHere) avoid.push(lane - 1, lane + 1);
          const free = [];
          for (let lane = 0; lane < LANE_COUNT; lane++) {
            if (!avoid.includes(lane) && point.time - lastLaneTime[lane] >= settings.jackLimit) free.push(lane);
          }
          if (free.length === 0) break;
          lanesHere.push(free[Math.floor(random() * free.length)]);
        }
      }

      for (let lane = 0; lane < LANE_COUNT; lane++) recentUse[lane] *= 0.85;
      for (const lane of lanesHere) {
        notes.push([Math.round(point.time * 1000) / 1000, lane]);
        lastLaneTime[lane] = point.time;
        recentUse[lane] += 1;
      }
      previousLane = lanesHere[0];
    }

    return notes;
  }

  // 難易度の目安（1〜12）
  function estimateLevel(notes, activeDuration) {
    if (notes.length === 0) return 1;
    const average = notes.length / activeDuration;
    let peak = 0;
    let start = 0;
    for (let end = 0; end < notes.length; end++) {
      while (notes[end][0] - notes[start][0] > 4) start++;
      peak = Math.max(peak, (end - start + 1) / 4);
    }
    return Math.min(12, Math.max(1, Math.round(average * 1.1 + peak * 0.35)));
  }

  // ---- まとめ：曲データから全難易度の譜面を作る ----
  async function generateCharts(samples, sampleRate, options = {}) {
    const { songId = "song", bpm: fixedBpm, offset: fixedOffset, difficulties = {}, onProgress } = options;
    const duration = samples.length / sampleRate;

    const analysis = await analyseOnsets(samples, sampleRate, onProgress);
    let bpm = fixedBpm;
    let offset = fixedOffset;
    if (!bpm) {
      const refined = refineBpm(analysis, estimateBpm(analysis, sampleRate), duration);
      bpm = refined.bpm;
      if (!Number.isFinite(offset)) offset = refined.offset;
    }
    if (!Number.isFinite(offset)) offset = estimateOffset(analysis, bpm, duration).offset;
    offset = Math.round(offset * 1000) / 1000;
    const grid = buildGrid(analysis, bpm, offset, duration);

    const activeDuration = grid.points.length > 0
      ? grid.points[grid.points.length - 1].time - grid.points[0].time
      : 1;

    const result = { bpm, offset, duration: Math.round(duration * 100) / 100 };

    for (const [name, defaults] of Object.entries(DEFAULT_DIFFICULTIES)) {
      const settings = { ...defaults, ...(difficulties[name] || {}) };
      const random = createRandom(`${songId}:${name}`);
      const picked = pickNotes(grid, settings, activeDuration);
      const notes = assignLanes(picked, settings, random);
      result[name] = { level: estimateLevel(notes, activeDuration), notes };
    }

    if (onProgress) onProgress(1);
    return result;
  }

  // 譜面ファイル（JavaScript）の中身を作る
  function toChartFile(songId, charts) {
    const lines = [];
    lines.push("// このファイルは tools/chart-maker.html で自動作成されました");
    lines.push(`// 作成日時：${new Date().toLocaleString("ja-JP")}`);
    lines.push(`registerChart(${JSON.stringify(songId)}, {`);
    lines.push(`  bpm: ${charts.bpm},`);
    lines.push(`  offset: ${charts.offset},`);
    lines.push(`  duration: ${charts.duration},`);
    for (const name of Object.keys(DEFAULT_DIFFICULTIES)) {
      const chart = charts[name];
      lines.push(`  ${name}: {`);
      lines.push(`    level: ${chart.level},`);
      lines.push(`    // [時刻（秒）, レーン（0:G 1:H 2:J 3:K 4:L）]`);
      lines.push(`    notes: ${JSON.stringify(chart.notes)},`);
      lines.push("  },");
    }
    lines.push("});");
    return lines.join("\n") + "\n";
  }

  return { generateCharts, toChartFile, DEFAULT_DIFFICULTIES };
})();

// Node.js でのテスト用
if (typeof module !== "undefined") module.exports = ChartMaker;
