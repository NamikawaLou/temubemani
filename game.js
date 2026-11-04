const laneCount = 5;
const travelTime = 1.8; // ノーツが降ってくる時間（秒）
const hitWindow = 0.18; // 判定の許容時間（秒）

// 左から G、H、J、K、L
const keyMap = ["g", "h", "j", "k", "l"];
const keyCodes = ["KeyG", "KeyH", "KeyJ", "KeyK", "KeyL"];
const laneNames = ["G", "H", "J", "K", "L"];

// ===== 曲と譜面 =====
// 曲の一覧は songs.js、譜面は charts フォルダのファイルに分けている
// 譜面は tools/chart-maker.html で事前に作るので、ゲーム中に曲を解析する必要はない
const difficultyNames = ["NORMAL", "HARD", "MANIAC"];
const chartStore = {};     // 読み込んだ譜面（曲IDごと）
const chartStatus = {};    // "loading" / "loaded" / "error"

/* 譜面ファイルから呼ばれる（charts/曲ID.js の中で使う） */
function registerChart(songId, data) {
  chartStore[songId] = data;
}

/* 譜面ファイルを読み込む（ファイルを直接開いた場合でも動くよう script タグで読み込む） */
function loadChart(song) {
  if (chartStatus[song.id]) return;
  chartStatus[song.id] = "loading";

  const script = document.createElement("script");
  script.src = song.chart;
  script.onload = () => {
    chartStatus[song.id] = chartStore[song.id] ? "loaded" : "error";
    createSongList();
  };
  script.onerror = () => {
    chartStatus[song.id] = "error";
    createSongList();
  };
  document.head.appendChild(script);
}

/* 譜面データ [時刻, レーン] を、ゲームで使う形 { time, lane } に変える */
function getChartNotes(songId, difficulty) {
  const chart = chartStore[songId] && chartStore[songId][difficulty];
  if (!chart) return [];
  return chart.notes
    .map(([time, lane]) => ({ time, lane }))
    .sort((a, b) => a.time - b.time);
}

// ===== チュートリアル =====
const tutorialSong = {
  id: "tutorial",
  title: "TUTORIAL",
  tutorial: true,
  bpm: 100,
};

/* チュートリアルの流れ（メッセージとノーツ）を作る */
function buildTutorial() {
  const messages = [];
  const notes = [];
  let time = 1;

  const say = (text, lanes = []) => messages.push({ time, text, lanes });

  say("T寺へようこそ！ 上から降ってくるノーツが、下の水色の線（判定ライン）に重なった瞬間に、そのレーンのキーを押します。");
  time += 5;

  // 1レーンずつ練習
  const keyLabels = ["G（左端のターンテーブル）", "H", "J", "K", "L"];
  for (let lane = 0; lane < laneCount; lane++) {
    say(`${keyLabels[lane]} キーを押してみよう`, [lane]);
    notes.push({ time: time + 2.6, lane }, { time: time + 3.6, lane });
    time += 4.6;
  }

  // 左から順番に
  say("左から順番に G・H・J・K・L。リズムに乗って押そう", [0, 1, 2, 3, 4]);
  for (let round = 0; round < 2; round++) {
    for (let lane = 0; lane < laneCount; lane++) {
      notes.push({ time: time + 2.6 + (round * laneCount + lane) * 0.6, lane });
    }
  }
  time += 2.6 + laneCount * 2 * 0.6 + 1.2;

  // 同時押し
  say("横に並んだノーツは、2つのキーを同時に押そう");
  const pairs = [[1, 3], [0, 4], [2, 4], [0, 2], [1, 3]];
  pairs.forEach(([a, b], index) => {
    const at = time + 2.6 + index * 1.2;
    notes.push({ time: at, lane: a }, { time: at, lane: b });
  });
  time += 2.6 + pairs.length * 1.2 + 0.8;

  // 連続
  say("少し速くなるよ。続けて押してみよう");
  const pattern = [1, 2, 3, 4, 3, 2, 1, 0, 1, 3, 2, 4];
  pattern.forEach((lane, index) => {
    notes.push({ time: time + 2.6 + index * 0.4, lane });
  });
  time += 2.6 + pattern.length * 0.4 + 1;

  // まとめ
  say("判定は PERFECT・GREAT・MISS の3種類。下のゲージを80%以上にして曲を終えるとクリアです！");
  time += 6;
  say("これでチュートリアルは終わりです。曲選択画面から曲と難易度を選んで遊んでみよう！");
  time += 4;

  return { messages, notes, endTime: time };
}

const tutorialData = buildTutorial();
let tutorialStartTime = 0;
let tutorialMessageIndex = -1;

// HTML要素
const songSelectScreen = document.getElementById("songSelectScreen");
const gameScreen = document.getElementById("gameScreen");
const songListElement = document.getElementById("songList");
const currentSongTitle = document.getElementById("currentSongTitle");

const lanesElement = document.getElementById("lanes");
const labelsElement = document.getElementById("laneLabels");
const scoreElement = document.getElementById("score");
const statusElement = document.getElementById("status");
const judgmentPopup = document.getElementById("judgmentPopup");
const startButton = document.getElementById("startButton");
const backButton = document.getElementById("backButton");
const tutorialMessage = document.getElementById("tutorialMessage");

// 判定ラインのフラッシュ演出
const hitFlashElement = document.getElementById("hitFlash");
let flashCells = [];

// プレイ中のコンボ・MISS表示
const comboElement = document.getElementById("combo");
const missCountElement = document.getElementById("missCount");
const playAccuracy = document.getElementById("playAccuracy");

// リザルト画面の要素
const resultScreen = document.getElementById("resultScreen");
const resultSongTitle = document.getElementById("resultSongTitle");
const resultScore = document.getElementById("resultScore");
const resultMaxCombo = document.getElementById("resultMaxCombo");
const resultAccuracy = document.getElementById("resultAccuracy");
const resultMiss = document.getElementById("resultMiss");
const resultPerfect = document.getElementById("resultPerfect");
const resultGreat = document.getElementById("resultGreat");
const resultMissCount = document.getElementById("resultMissCount");
const retryButton = document.getElementById("retryButton");
const resultBackButton = document.getElementById("resultBackButton");

// 音量調整の要素
const volumeSlider = document.getElementById("volumeSlider");
const volumeValue = document.getElementById("volumeValue");

// ゲーム状態
let lanes = [];
let labels = [];
let notes = [];

let score = 0;        // 現在のスコア
let combo = 0;        // 現在のコンボ数
let maxCombo = 0;     // 最大コンボ数
let perfectCount = 0; // PERFECTの回数
let greatCount = 0;   // GREATの回数
let missCount = 0;    // MISSの回数

let running = false;
let animationId = null;
let selectedSong = null;
let selectedDifficulty = "NORMAL";
let currentChart = [];   // プレイ中の譜面 { time, lane } の一覧

/* 今の時刻（秒）。曲なら再生位置、チュートリアルなら開始からの経過時間 */
function getTime() {
  if (selectedSong && selectedSong.tutorial) {
    return (performance.now() - tutorialStartTime) / 1000;
  }
  return audio.currentTime;
}

// 音源
const audio = new Audio();
audio.preload = "auto";
audio.volume = Number(volumeSlider.value) / 100;

audio.addEventListener("loadedmetadata", () => {
  console.log("曲の長さ:", audio.duration, "秒");
});

// 音量表示と調整
volumeValue.textContent = `${volumeSlider.value}%`;

volumeSlider.addEventListener("input", () => {
  audio.volume = Number(volumeSlider.value) / 100;
  volumeValue.textContent = `${volumeSlider.value}%`;
});

// ===== GROOVE GAUGE・パネル表示 =====
const gaugeStart = 22;       // 開始時のゲージ（%）
const gaugeClear = 80;       // クリアライン（%）
const gaugeTotal = 260;      // 1曲を全部PERFECTで取ったときに増える量の目安
const gaugeMissDamage = 3;   // MISS 1回で減る量（%）
let gauge = gaugeStart;

const gaugeBar = document.getElementById("gaugeBar");
const gaugeValue = document.getElementById("gaugeValue");
const panelScore = document.getElementById("panelScore");
const panelMaxCombo = document.getElementById("panelMaxCombo");
const resultClear = document.getElementById("resultClear");

/* ゲージの見た目を更新（表示は2%刻み） */
function updateGauge() {
  const shown = Math.floor(gauge / 2) * 2;
  gaugeBar.style.setProperty("--gauge", `${shown}%`);
  gaugeValue.textContent = String(shown);
  gaugeBar.classList.toggle("clear", gauge >= gaugeClear);
}

/* 判定に応じてゲージを増減 */
function changeGauge(type) {
  const totalNotes = Math.max(1, currentChart.length);
  const gain = gaugeTotal / totalNotes;

  if (type === "PERFECT") {
    gauge += gain;
  } else if (type === "GREAT") {
    gauge += gain / 2;
  } else {
    gauge -= gaugeMissDamage;
  }

  gauge = Math.min(100, Math.max(2, gauge));
  updateGauge();
}

/* コンボ・MISS・正確度の表示を更新 */
function updatePlayStats() {
  comboElement.textContent = String(combo);
  missCountElement.textContent = String(missCount);

  // 下のパネルのSCOREとMAX COMBO
  panelScore.textContent = String(score).padStart(6, "0");
  panelMaxCombo.textContent = String(maxCombo);

  updateAccuracy();
}

/* プレイ中の正確度を更新 */
function updateAccuracy() {
  const totalNotes = currentChart.length;

  const accuracy = totalNotes > 0
    ? (score / (totalNotes * 1000)) * 100
    : 0;

  playAccuracy.textContent = `${accuracy.toFixed(2)}%`;
}

/* PERFECT・GREAT・MISSの判定演出を表示 */
function showJudgment(type) {
  // 直前のアニメーションをリセット
  judgmentPopup.className = "judgment-popup";

  // 同じ判定が連続してもアニメーションを再実行する
  void judgmentPopup.offsetWidth;

  judgmentPopup.textContent = type;
  judgmentPopup.classList.add(`judgment-${type.toLowerCase()}`);
  judgmentPopup.classList.add("show");
}

// プレイ開始時にスコアと判定をリセット
function resetStats() {
  score = 0;
  combo = 0;
  maxCombo = 0;
  perfectCount = 0;
  greatCount = 0;
  missCount = 0;

  scoreElement.textContent = "000000";
  updatePlayStats();

  // ゲージを開始値に戻す
  gauge = gaugeStart;
  updateGauge();
}

// 曲選択画面を生成
function createSongList() {
  songListElement.replaceChildren();

  // チュートリアル
  const tutorialButton = document.createElement("button");
  tutorialButton.type = "button";
  tutorialButton.className = "song-card tutorial-card";

  const tutorialInfo = document.createElement("span");
  tutorialInfo.className = "song-card-info";
  const tutorialTitle = document.createElement("span");
  tutorialTitle.className = "song-card-title";
  tutorialTitle.textContent = "TUTORIAL";
  const tutorialDetail = document.createElement("span");
  tutorialDetail.className = "song-card-detail";
  tutorialDetail.textContent = "はじめての方はこちら · 遊び方を練習できます";
  tutorialInfo.append(tutorialTitle, tutorialDetail);

  const tutorialIcon = document.createElement("span");
  tutorialIcon.className = "song-card-play";
  tutorialIcon.textContent = "▶";

  tutorialButton.append(tutorialInfo, tutorialIcon);
  tutorialButton.addEventListener("click", () => selectSong(tutorialSong));
  songListElement.appendChild(tutorialButton);

  // 曲
  songs.forEach((song) => {
    const entry = document.createElement("div");
    entry.className = "song-entry";

    const info = document.createElement("div");
    info.className = "song-entry-info";

    const title = document.createElement("span");
    title.className = "song-card-title";
    title.textContent = song.title;

    const detail = document.createElement("span");
    detail.className = "song-card-detail";
    const chart = chartStore[song.id];
    const bpm = song.bpm || (chart && chart.bpm);
    detail.textContent = bpm ? `BPM ${bpm} · 5 KEYS` : "5 KEYS";

    info.append(title, detail);

    const buttons = document.createElement("div");
    buttons.className = "difficulty-buttons";

    const status = chartStatus[song.id];

    difficultyNames.forEach((name) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `difficulty-button difficulty-${name.toLowerCase()}`;

      const label = document.createElement("span");
      label.className = "difficulty-name";
      label.textContent = name;

      const level = document.createElement("span");
      level.className = "difficulty-level";

      const data = chart && chart[name];
      if (data) {
        level.textContent = `Lv.${data.level}`;
        button.title = `${data.notes.length} ノーツ`;
        button.addEventListener("click", () => selectSong(song, name));
      } else {
        level.textContent = status === "loading" ? "…" : "－";
        button.disabled = true;
      }

      button.append(label, level);
      buttons.appendChild(button);
    });

    entry.append(info, buttons);

    if (status === "error") {
      const warning = document.createElement("p");
      warning.className = "song-entry-warning";
      warning.textContent = `譜面ファイル（${song.chart}）が見つかりません。tools/chart-maker.html で作成してください。`;
      entry.appendChild(warning);
    }

    songListElement.appendChild(entry);
  });
}

// 曲（と難易度）を選択してゲーム画面へ移動
function selectSong(song, difficulty = "NORMAL") {
  stopGame();

  selectedSong = song;
  selectedDifficulty = difficulty;

  if (song.tutorial) {
    currentChart = tutorialData.notes.map((note) => ({ ...note }));
    currentSongTitle.textContent = "TUTORIAL";
    startButton.textContent = "チュートリアル開始";
  } else {
    currentChart = getChartNotes(song.id, difficulty);
    currentSongTitle.textContent = `${song.title}　[${difficulty}]`;
    startButton.textContent = "ゲーム開始";

    // 選んだ曲の音源を読み込む
    audio.src = song.audio;
    audio.load();
  }

  hideTutorialMessage();

  // 曲選択画面・ゲーム画面・リザルト画面を切り替える
  songSelectScreen.hidden = true;
  gameScreen.hidden = false;
  resultScreen.hidden = true;

  resetStats();
  statusElement.textContent = "READY";
  startButton.disabled = false;

  createNotes();
}

/* チュートリアルのメッセージ表示 */
function showTutorialMessage(message) {
  tutorialMessage.textContent = message.text;
  tutorialMessage.hidden = false;

  // 押すキーを光らせる
  labels.forEach((label, index) => {
    label.classList.toggle("tutorial-target", message.lanes.includes(index));
  });
}

function hideTutorialMessage() {
  tutorialMessageIndex = -1;
  tutorialMessage.hidden = true;
  labels.forEach((label) => label.classList.remove("tutorial-target"));
}

function updateTutorialMessage(elapsed) {
  let index = -1;
  tutorialData.messages.forEach((message, i) => {
    if (elapsed >= message.time) index = i;
  });

  if (index !== tutorialMessageIndex && index >= 0) {
    tutorialMessageIndex = index;
    showTutorialMessage(tutorialData.messages[index]);
  }
}

// 5つのレーンと操作用キー表示を作る
for (let i = 0; i < laneCount; i++) {
  const lane = document.createElement("button");
  lane.type = "button";
  lane.className = "lane";
  lane.setAttribute("aria-label", `${i + 1}番レーン`);

  lane.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    hitLane(i);
  });

  lane.addEventListener("pointerup", () => releaseLane(i));
  lane.addEventListener("pointercancel", () => releaseLane(i));
  lane.addEventListener("pointerleave", () => releaseLane(i));

  lanesElement.appendChild(lane);
  lanes.push(lane);

  const label = document.createElement("div");
  label.className = "lane-key";
  label.textContent = laneNames[i];
  labelsElement.appendChild(label);
  labels.push(label);

  // レーンごとのフラッシュ表示枠
  const flash = document.createElement("div");
  flash.className = "flash-cell";
  hitFlashElement.appendChild(flash);
  flashCells.push(flash);
}

// 選択した曲の譜面からノーツを作る
function createNotes() {
  lanes.forEach((lane) => lane.replaceChildren());

  if (!selectedSong) {
    notes = [];
    return;
  }

  notes = currentChart.map((item) => {
    const element = document.createElement("div");
    element.className = "note";
    lanes[item.lane].appendChild(element);

    return {
      time: item.time,
      lane: item.lane,
      element,
      judged: false,
    };
  });
}

// ゲーム開始
async function startGame() {
  // プレイ中に押した場合は最初からやり直す
  if (!selectedSong) return;

  stopGame();
  createNotes();
  resetStats();

  statusElement.textContent = "LOADING...";
  startButton.disabled = true;

  labels.forEach((label) => label.classList.remove("pressed"));
  lanes.forEach((lane) => lane.classList.remove("active"));

  // チュートリアルは音源なしで、経過時間に合わせて進める
  if (selectedSong.tutorial) {
    hideTutorialMessage();
    tutorialStartTime = performance.now();
    running = true;
    statusElement.textContent = "TUTORIAL";
    startButton.textContent = "最初からやり直す";
    startButton.disabled = false;
    animationId = requestAnimationFrame(updateGame);
    return;
  }

  try {
    // 音源の読み込みを待つ
    if (audio.readyState < 3) {
      await new Promise((resolve, reject) => {
        const onCanPlay = () => {
          cleanup();
          resolve();
        };

        const onError = () => {
          cleanup();
          reject(new Error("音源を読み込めませんでした"));
        };

        // 成功・失敗のイベントを両方登録する
        function cleanup() {
          audio.removeEventListener("canplay", onCanPlay);
          audio.removeEventListener("error", onError);
        }

        audio.addEventListener("canplay", onCanPlay, { once: true });
        audio.addEventListener("error", onError, { once: true });
      });
    }

    // 再生位置を先頭に戻して音楽を開始
    audio.currentTime = 0;
    await audio.play();

    running = true;
    statusElement.textContent = "PLAYING";
    startButton.textContent = "もう一度プレイ";

    animationId = requestAnimationFrame(updateGame);
  } catch (error) {
    running = false;
    statusElement.textContent = "音源エラー";
    console.error(error);

    alert(
      "音源を再生できませんでした。\n" +
      "assetsフォルダ内のファイル名と、音源が正常に再生できるか確認してください。"
    );
  } finally {
    startButton.disabled = false;
  }
}

// 音楽の再生時間に合わせてノーツを移動
function updateGame() {
  if (!running) return;

  const elapsed = getTime();

  if (selectedSong.tutorial) {
    updateTutorialMessage(elapsed);
  }

  for (const note of notes) {
    if (note.judged) continue;

    const laneHeight = lanes[note.lane].clientHeight;
    const spawnTime = note.time - travelTime;
    const progress = (elapsed - spawnTime) / travelTime;

    note.element.style.top = `${progress * laneHeight}px`;

    // 判定時間を過ぎたノーツはMISS扱い
    if (elapsed > note.time + hitWindow) {
      note.judged = true;
      note.element.remove();

      combo = 0; // MISSしたらコンボをリセット
      missCount++;

      updatePlayStats();
      statusElement.textContent = "MISS";
      showJudgment("MISS");
      changeGauge("MISS");
    }
  }

  // 曲の最後まで再生されたら終了（チュートリアルは最後のメッセージの後）
  const finished = selectedSong.tutorial
    ? elapsed >= tutorialData.endTime
    : audio.ended;

  if (finished) {
    finishGame();
    return;
  }

  animationId = requestAnimationFrame(updateGame);
}

// ゲーム終了・リザルト表示
function finishGame() {
  if (!running) return;

  running = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  audio.pause();
  hideTutorialMessage();

  // 今回のプレイ結果をリザルト画面に反映
  resultSongTitle.textContent = selectedSong.tutorial
    ? "TUTORIAL"
    : `${selectedSong.title}　[${selectedDifficulty}]`;
  resultScore.textContent = String(score).padStart(6, "0");
  resultMaxCombo.textContent = String(maxCombo);

  // スコアから正確度を計算
  // PERFECT=100%、GREAT=50%、MISS=0%
  const totalNotes = currentChart.length;

  const accuracy = totalNotes > 0
    ? (score / (totalNotes * 1000)) * 100
    : 0;

  resultAccuracy.textContent = `${accuracy.toFixed(2)}%`;

  resultMiss.textContent = String(missCount);
  resultPerfect.textContent = String(perfectCount);
  resultGreat.textContent = String(greatCount);
  resultMissCount.textContent = String(missCount);

  // ゲージがクリアライン以上ならCLEAR
  // チュートリアルは必ずCOMPLETE
  const cleared = selectedSong.tutorial || gauge >= gaugeClear;
  resultClear.textContent = selectedSong.tutorial
    ? "COMPLETE"
    : cleared ? "CLEAR" : "FAILED";
  resultClear.className = cleared
    ? "result-clear is-clear"
    : "result-clear is-failed";

  gameScreen.hidden = true;
  resultScreen.hidden = false;
}

/* ノーツを取ったときのフラッシュ演出 */
function showHitFlash(laneIndex, type) {
  const cell = flashCells[laneIndex];

  // 連続で取ってもアニメーションを最初から再生する
  cell.classList.remove("flash-perfect", "flash-great");
  void cell.offsetWidth;

  cell.classList.add(type === "PERFECT" ? "flash-perfect" : "flash-great");
}

/* 指定レーンを押したときの判定 */
function hitLane(laneIndex) {
  labels[laneIndex].classList.add("pressed");
  lanes[laneIndex].classList.add("active");

  if (!running) return;

  const elapsed = getTime();

  let nearestNote = null;
  let nearestDifference = Infinity;

  // 押したレーンで最も判定時刻に近いノーツを探す
  for (const note of notes) {
    if (note.judged || note.lane !== laneIndex) continue;

    const difference = Math.abs(elapsed - note.time);

    if (difference < nearestDifference) {
      nearestDifference = difference;
      nearestNote = note;
    }
  }

  // 判定範囲内ならノーツ成功
  if (nearestNote && nearestDifference <= hitWindow) {
    nearestNote.judged = true;
    nearestNote.element.remove();

    combo++;
    maxCombo = Math.max(maxCombo, combo);

    if (nearestDifference <= 0.08) {
      perfectCount++;
      score += 1000;

      statusElement.textContent = "PERFECT!";
      showJudgment("PERFECT");
      changeGauge("PERFECT");
      showHitFlash(laneIndex, "PERFECT");
    } else {
      greatCount++;
      score += 500;

      statusElement.textContent = "GREAT!";
      showJudgment("GREAT");
      changeGauge("GREAT");
      showHitFlash(laneIndex, "GREAT");
    }

    // スコアとコンボの表示を更新
    scoreElement.textContent = String(score).padStart(6, "0");
    updatePlayStats();
  }
}

// レーンの押下表示を解除
function releaseLane(laneIndex) {
  labels[laneIndex].classList.remove("pressed");
  lanes[laneIndex].classList.remove("active");
}

// ゲームを停止して音楽を先頭に戻す
function stopGame() {
  running = false;

  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  audio.pause();
  hideTutorialMessage();

  if (audio.src) {
    audio.currentTime = 0;
  }

  labels.forEach((label) => label.classList.remove("pressed"));
  lanes.forEach((lane) => lane.classList.remove("active"));
}

// 曲選択画面に戻る
function backToSongSelect() {
  stopGame();

  gameScreen.hidden = true;
  resultScreen.hidden = true;
  songSelectScreen.hidden = false;

  statusElement.textContent = "READY";
  startButton.textContent = "ゲーム開始";
  startButton.disabled = false;
}

// キーボード操作
document.addEventListener("keydown", (event) => {
  if (event.repeat) return;

  const laneIndex = keyCodes.indexOf(event.code);
  if (laneIndex >= 0) {
    event.preventDefault();
    hitLane(laneIndex);
  }
});

document.addEventListener("keyup", (event) => {
  const laneIndex = keyCodes.indexOf(event.code);
  if (laneIndex >= 0) releaseLane(laneIndex);
});

// ウィンドウからフォーカスが外れたら押下表示を解除
window.addEventListener("blur", () => {
  labels.forEach((_, index) => releaseLane(index));
});

// 曲の再生終了
audio.addEventListener("ended", finishGame);

// ボタン操作
startButton.addEventListener("click", startGame);
backButton.addEventListener("click", backToSongSelect);

// リザルト画面からリトライ
retryButton.addEventListener("click", () => {
  resultScreen.hidden = true;
  gameScreen.hidden = false;
  startGame();
});

// リザルト画面から曲選択へ戻る
resultBackButton.addEventListener("click", backToSongSelect);

// 最初に曲一覧を表示し、各曲の譜面ファイルを読み込む
createSongList();
songs.forEach(loadChart);