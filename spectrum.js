// =========================================
// 円形オーディオスペクトラム（背景の前・ゲーム画面の後ろ）
// game.js の後に読み込む
// =========================================

// "auto"：曲を解析して動かす（使えないときはBPM連動に切り替え）
// "bpm" ：曲のBPMに合わせた動きだけを使う（一番軽い）
// "off" ：表示しない
const spectrumMode = "auto";

const spectrumBarCount = 60;   // 片側の本数（左右対称なので全体はこの2倍）
const spectrumDefaultBpm = 200;

const spectrumIntensity = 1.6; // 動きの激しさ（1で控えめ、大きいほど激しい）
const spectrumDrumPower = 0.8;   // ドラムの打撃で激しさを増やす量（0で反応しない）
const spectrumGuitarPower = 0.5; // ギターなど中音域が盛り上がったときに増やす量（0で反応しない）
const spectrumSize = 0.45;     // 円の半径（プレイフィールドの長い辺に対する割合）
const spectrumLength = 0.27;   // バーの最大の長さ（プレイフィールドの長い辺に対する割合）
const spectrumGap = 3;         // メモリの切れ目の幅（px）
const spectrumPeakFall = 1; // ピーク表示が落ちる速さ（大きいほど速く落ちる）

const spectrumCanvas = document.createElement("canvas");
spectrumCanvas.className = "spectrum-canvas";
spectrumCanvas.setAttribute("aria-hidden", "true");
document.body.prepend(spectrumCanvas);

const spectrumCtx = spectrumCanvas.getContext("2d");
const spectrumValues = new Float32Array(spectrumBarCount);
const spectrumPeaks = new Float32Array(spectrumBarCount); // 一番上で少し止まるピーク表示

let audioContext = null;
let analyser = null;
let analyserGain = null;
let frequencyData = null;
let binRanges = [];
const spectrumAverages = new Float32Array(spectrumBarCount); // 各バーの最近の平均的な大きさ
let useAnalyser = false;
let silentFrames = 0;

// ドラム・ギターの検出用
let previousData = null;   // 1フレーム前の解析結果（音の立ち上がりを調べる）
let bandBins = null;       // 各音域が何番目のデータにあたるか
let kickFluxAverage = 0;
let snareFluxAverage = 0;
let lastDrumHit = 0;
let drumBoost = 0;         // ドラムを叩いた瞬間に1になり、すぐ0に戻る
let midSmooth = 0;
let midLong = 0;
let guitarDrive = 0;       // 中音域が曲の平均より盛り上がっているほど1に近づく
let analysedFrames = 0;

// 画面サイズに合わせてキャンバスの解像度を調整
function resizeSpectrum() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  spectrumCanvas.width = Math.round(window.innerWidth * dpr);
  spectrumCanvas.height = Math.round(window.innerHeight * dpr);
  spectrumCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("resize", resizeSpectrum);
resizeSpectrum();

// 曲の解析を準備する（ボタンを押したときに1回だけ）
function setupAnalyser() {
  if (spectrumMode !== "auto" || audioContext) return;

  // ファイルを直接開いている（file://）と解析できず、音も消えてしまうため使わない
  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  try {
    audioContext = new AudioContext();

    const source = audioContext.createMediaElementSource(audio);
    source.connect(audioContext.destination); // 音はこれまで通りスピーカーへ

    // 解析用：音量スライダーで小さくなった分を補正してから解析
    analyserGain = audioContext.createGain();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;               // 低音を細かく分けて解析する
    analyser.smoothingTimeConstant = 0.5;  // 小さいほど素早く反応する
    analyser.minDecibels = -90;
    analyser.maxDecibels = -10;            // 大きな低音でも値が振り切れないようにする
    source.connect(analyserGain);
    analyserGain.connect(analyser);

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    previousData = new Uint8Array(analyser.frequencyBinCount);

    // 周波数（Hz）から何番目のデータかを求める
    const binHz = audioContext.sampleRate / analyser.fftSize;
    const toBin = (hz) => Math.max(1, Math.round(hz / binHz));
    bandBins = {
      kick: [toBin(40), toBin(120)],     // バスドラム
      snare: [toBin(2000), toBin(5000)], // スネア・シンバルのアタック
      guitar: [toBin(300), toBin(3000)], // ギターが目立つ音域
    };

    // 低音〜高音をバーに割り当てる（低音側を細かく）
    // 各バーが別々の周波数の範囲を受け持つようにして、同じ動きのバーができないようにする
    const minBin = 2;
    const maxBin = Math.floor(analyser.frequencyBinCount * 0.7);
    binRanges = [];
    let previousEnd = minBin;

    for (let i = 0; i < spectrumBarCount; i++) {
      const ratio = (i + 1) / spectrumBarCount;
      const logEnd = Math.round(minBin * Math.pow(maxBin / minBin, ratio));
      const start = previousEnd;
      const end = Math.max(start + 1, logEnd);
      binRanges.push([start, end]);
      previousEnd = end;
    }

    useAnalyser = true;
  } catch (error) {
    console.warn("スペクトラム解析を使えないため、BPM連動に切り替えます", error);
    useAnalyser = false;
  }
}

function resumeAudioContext() {
  setupAnalyser();
  if (audioContext && audioContext.state === "suspended") {
    audioContext.resume();
  }
}

startButton.addEventListener("click", resumeAudioContext);
retryButton.addEventListener("click", resumeAudioContext);

// 指定した音域の「音の立ち上がり」の強さ（前のフレームより大きくなった分の平均）
function bandFlux([start, end]) {
  let sum = 0;
  for (let bin = start; bin < end; bin++) {
    const rise = frequencyData[bin] - previousData[bin];
    if (rise > 0) sum += rise;
  }
  return sum / ((end - start) * 255);
}

// 指定した音域の音の大きさの平均
function bandLevel([start, end]) {
  let sum = 0;
  for (let bin = start; bin < end; bin++) sum += frequencyData[bin];
  return sum / ((end - start) * 255);
}

// ドラムの打撃とギターの盛り上がりを調べる
// ※楽器を聞き分けているのではなく、音域と音の立ち上がり方から推測している
function detectInstruments(now) {
  // ドラム：低音（バスドラム）か高音（スネア）が急に大きくなったら打撃とみなす
  const kickFlux = bandFlux(bandBins.kick);
  const snareFlux = bandFlux(bandBins.snare);
  kickFluxAverage += (kickFlux - kickFluxAverage) * 0.05;
  snareFluxAverage += (snareFlux - snareFluxAverage) * 0.05;

  const kickHit = kickFlux > kickFluxAverage * 2 + 0.02;
  const snareHit = snareFlux > snareFluxAverage * 2 + 0.015;

  if ((kickHit || snareHit) && now - lastDrumHit > 90) {
    drumBoost = 1;
    lastDrumHit = now;
  } else {
    drumBoost *= 0.85; // すぐに元に戻る
  }

  // ギター：中音域が、曲全体の平均よりどれだけ大きいか
  const mid = bandLevel(bandBins.guitar);
  midSmooth += (mid - midSmooth) * 0.1;    // 直近（約0.2秒）の大きさ
  // 長い時間（約15秒）の平均。曲の始めはすぐに平均がとれるよう速めに追いかける
  analysedFrames++;
  midLong += (mid - midLong) * Math.max(0.001, 1 / analysedFrames);
  const drive = Math.min(1, Math.max(0, (midSmooth - midLong * 0.9) / 0.12));
  guitarDrive += (drive - guitarDrive) * 0.08;

  previousData.set(frequencyData);
}

// 曲を解析して、各バーの高さ（0〜1）を求める
function readAnalyser(now) {
  analyserGain.gain.value = 1 / Math.max(audio.volume, 0.02);
  analyser.getByteFrequencyData(frequencyData);
  detectInstruments(now);

  // ドラムとギターに応じて、その瞬間の激しさを上げる
  const intensity = spectrumIntensity
    * (1 + drumBoost * spectrumDrumPower + guitarDrive * spectrumGuitarPower);

  let total = 0;
  for (let i = 0; i < spectrumBarCount; i++) {
    // 受け持ちの範囲で一番大きい値を使う
    const [start, end] = binRanges[i];
    let peak = 0;
    for (let bin = start; bin < end; bin++) {
      if (frequencyData[bin] > peak) peak = frequencyData[bin];
    }
    const raw = peak / 255;
    total += raw;

    // 最近の平均との差を強調する
    // 低音が鳴り続けても、わずかな強弱の変化が大きな動きとして見える
    spectrumAverages[i] += (raw - spectrumAverages[i]) * 0.03;
    const emphasized = Math.max(0, raw + (raw - spectrumAverages[i]) * 1.5);

    // 大きな音でも1で張り付かないよう、ゆるやかに上限へ近づける
    const target = 1 - Math.exp(-Math.pow(emphasized, 1.6) * intensity * 1.6);

    // 上がるときは一瞬で、下がるときは少しゆっくり
    if (target > spectrumValues[i]) {
      spectrumValues[i] = target;
    } else {
      spectrumValues[i] += (target - spectrumValues[i]) * 0.25;
    }
  }

  // 再生中なのにずっと無音なら解析できていないと判断してBPM連動へ
  if (!audio.paused && total === 0) {
    silentFrames++;
    if (silentFrames > 180) useAnalyser = false;
  } else {
    silentFrames = 0;
  }
}

// BPMに合わせて、それらしい動きを作る（解析しないので軽い）
function readBpm(time) {
  const bpm = (selectedSong && selectedSong.bpm) || spectrumDefaultBpm;
  const phase = (audio.currentTime * bpm / 60) % 1;
  const beatNumber = Math.floor(audio.currentTime * bpm / 60);
  const pulse = Math.exp(-phase * 8); // 拍の頭で鋭く強く、すぐ弱く
  drumBoost = pulse * 0.7;  // BPMモードでは拍の頭を打撃として扱う
  guitarDrive *= 0.95;

  for (let i = 0; i < spectrumBarCount; i++) {
    // 拍ごとに形が変わるように、拍番号から疑似ランダムな値を作る
    const seed = Math.sin((i + 1) * 12.9898 + beatNumber * 78.233) * 43758.5453;
    const random = seed - Math.floor(seed);

    const wave = 0.5 + 0.5 * Math.sin(i * 0.7 + time * 4);
    const lowBoost = 1.2 - (i / spectrumBarCount) * 0.6; // 低音側を大きく
    const target = (0.1 + pulse * (0.5 + random * 0.7) * wave) * lowBoost * spectrumIntensity;

    if (target > spectrumValues[i]) {
      spectrumValues[i] = Math.min(1, target);
    } else {
      spectrumValues[i] += (target - spectrumValues[i]) * 0.25;
    }
  }
}

// 停止中はゆっくり小さくする
function decaySpectrum() {
  for (let i = 0; i < spectrumBarCount; i++) {
    spectrumValues[i] *= 0.92;
  }
}

function drawSpectrum(timestamp) {
  requestAnimationFrame(drawSpectrum);
  if (spectrumMode === "off") return;

  const time = timestamp / 1000;
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (audio.paused) {
    decaySpectrum();
    drumBoost *= 0.85;
    guitarDrive *= 0.95;
  } else if (useAnalyser) {
    readAnalyser(timestamp);
  } else {
    readBpm(time);
  }

  // ゲーム画面ならプレイフィールドの中心、それ以外は画面の中心
  const playfield = document.getElementById("playfield");
  let centerX = width / 2;
  let centerY = height / 2;
  let baseSize = Math.min(width, height) * 0.6;

  if (!gameScreen.hidden && playfield) {
    const rect = playfield.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    baseSize = Math.max(rect.width, rect.height);
  }

  // 円の大きさは固定（音に合わせてふくらませない）
  const bass = (spectrumValues[0] + spectrumValues[1] + spectrumValues[2]) / 3;
  const radius = baseSize * spectrumSize;
  const maxLength = baseSize * spectrumLength;

  spectrumCtx.clearRect(0, 0, width, height);
  spectrumCtx.globalCompositeOperation = "lighter";
  spectrumCtx.lineCap = "butt"; // 角を四角にする

  // メモリ1マスの大きさ（バーの太さと同じにして正方形にする）
  const barWidth = Math.max(2, (Math.PI * radius) / spectrumBarCount * 0.45);
  const segmentSize = barWidth;
  const segmentStep = segmentSize + spectrumGap;
  const segmentCount = Math.max(1, Math.floor(maxLength / segmentStep));
  spectrumCtx.lineWidth = barWidth;

  // ピーク表示を更新（一瞬で上がり、ゆっくり落ちる）
  for (let i = 0; i < spectrumBarCount; i++) {
    spectrumPeaks[i] = Math.max(spectrumValues[i], spectrumPeaks[i] - spectrumPeakFall);
  }

  // 1マス分の線を追加する（中心からの距離 start の位置に）
  function addSegment(cos, sin, index) {
    const start = radius + index * segmentStep;
    const end = start + segmentSize;
    spectrumCtx.moveTo(centerX + cos * start, centerY + sin * start);
    spectrumCtx.lineTo(centerX + cos * end, centerY + sin * end);
  }

  // 光っているマスとピーク（左右対称に描く）
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < spectrumBarCount; i++) {
      const value = spectrumValues[i];
      const angle = -Math.PI / 2 + side * (i + 0.5) / spectrumBarCount * Math.PI;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const litCount = Math.max(1, Math.round(value * segmentCount));
      const peakIndex = Math.min(segmentCount - 1, Math.round(spectrumPeaks[i] * segmentCount));

      // 水色→紫。ギターが盛り上がるとピンク寄りに変わる
      const hue = 190 + (i / spectrumBarCount) * 100 + guitarDrive * 50;
      spectrumCtx.strokeStyle = `hsla(${hue}, 100%, ${60 + value * 25}%, ${0.4 + value * 0.6})`;
      spectrumCtx.beginPath();
      for (let n = 0; n < litCount; n++) addSegment(cos, sin, n);
      spectrumCtx.stroke();

      // ピークのマス（光っているマスより上にあるときだけ）
      if (peakIndex >= litCount) {
        spectrumCtx.strokeStyle = `hsla(${hue}, 100%, 85%, 0.9)`;
        spectrumCtx.beginPath();
        addSegment(cos, sin, peakIndex);
        spectrumCtx.stroke();
      }
    }
  }

  // 内側の細い円（太さは固定、低音で明るくなる）
  spectrumCtx.lineWidth = 2;
  // ドラムを叩いた瞬間に強く光る
  spectrumCtx.strokeStyle = `rgba(140, 234, 255, ${Math.min(1, 0.15 + bass * 0.4 + drumBoost * 0.7)})`;
  spectrumCtx.beginPath();
  spectrumCtx.arc(centerX, centerY, radius - 6, 0, Math.PI * 2);
  spectrumCtx.stroke();

  spectrumCtx.globalCompositeOperation = "source-over";
}

requestAnimationFrame(drawSpectrum);
