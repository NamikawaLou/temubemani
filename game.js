
const laneCount = 7;
const travelTime = 1.8; // ノーツが降ってくる時間（秒）
const hitWindow = 0.18; // 判定の許容時間（秒）

const keyMap = ["d", "f", "g", " ", "j", "k", "l"];
const laneNames = ["D", "F", "G", "SP", "J", "K", "L"];

// 曲ごとの譜面データ
const songs = [
  {
    id: "break-through-myself",
    title: "Break Through Myself feat. Risa Yuzuki",
    audio: "assets/Break_Through_Myself_feat.RisaYuzuki.m4a",
    difficulty: "NORMAL",
    chart: [
  { time: 2.0, lane: 3 },
  { time: 2.5, lane: 2 },
  { time: 3.0, lane: 4 },
  { time: 3.5, lane: 1 },
  { time: 4.0, lane: 5 },
  { time: 4.5, lane: 0 },
  { time: 5.0, lane: 6 },
  { time: 5.5, lane: 3 },

  // 交互に押す配置
  { time: 6.0, lane: 1 },
  { time: 6.0, lane: 5 },
  { time: 6.3, lane: 2 },
  { time: 6.6, lane: 4 },
  { time: 6.9, lane: 0 },
  { time: 7.2, lane: 6 },
  { time: 7.5, lane: 1 },
  { time: 7.8, lane: 5 },

  // 中央レーンを含む配置
  { time: 8.1, lane: 3 },
  { time: 8.4, lane: 2 },
  { time: 8.7, lane: 3 },
  { time: 9.0, lane: 4 },
  { time: 9.3, lane: 3 },
  { time: 9.6, lane: 1 },
  { time: 9.9, lane: 3 },
  { time: 10.2, lane: 5 },

  // 2レーン同時押し
  { time: 10.5, lane: 0 },
  { time: 10.5, lane: 6 },
  { time: 11.0, lane: 1 },
  { time: 11.0, lane: 5 },
  { time: 11.5, lane: 2 },
  { time: 11.5, lane: 4 },
  { time: 12.0, lane: 3 },
  { time: 12.5, lane: 0 },

  // 短い間隔の連打
  { time: 12.8, lane: 1 },
  { time: 13.1, lane: 2 },
  { time: 13.4, lane: 3 },
  { time: 13.7, lane: 4 },
  { time: 14.0, lane: 5 },
  { time: 14.3, lane: 6 },
  { time: 14.6, lane: 5 },
  { time: 14.9, lane: 4 },

  // 左右を行き来する配置
  { time: 15.2, lane: 0 },
  { time: 15.5, lane: 6 },
  { time: 15.8, lane: 1 },
  { time: 16.1, lane: 5 },
  { time: 16.4, lane: 2 },
  { time: 16.7, lane: 4 },
  { time: 17.0, lane: 3 },
  { time: 17.3, lane: 0 },

  // 同時押しと単押しの組み合わせ
  { time: 17.6, lane: 1 },
  { time: 17.6, lane: 3 },
  { time: 17.9, lane: 5 },
  { time: 18.2, lane: 2 },
  { time: 18.2, lane: 4 },
  { time: 18.5, lane: 6 },
  { time: 18.8, lane: 3 },
  { time: 19.1, lane: 1 },

  // 後半の連打
  { time: 19.4, lane: 5 },
  { time: 19.7, lane: 4 },
  { time: 20.0, lane: 3 },
  { time: 20.3, lane: 2 },
  { time: 20.6, lane: 1 },
  { time: 20.9, lane: 0 },
  { time: 21.2, lane: 6 },
  { time: 21.5, lane: 3 },

  { time: 22.0, lane: 0 },
  { time: 22.0, lane: 3 },
  { time: 22.5, lane: 2 },
  { time: 22.5, lane: 5 },
  { time: 23.0, lane: 1 },
  { time: 23.0, lane: 4 },
  { time: 23.5, lane: 3 },
  { time: 24.0, lane: 6 },
    ],
    
 },
];

/* BPM 200を基準に、曲の後半へノーツを追加 */
const beatInterval = 60 / 200;

// 7レーンを順番に移動する基本パターン
const lanePattern = [3, 2, 4, 1, 5, 0, 6, 3, 1, 5, 2, 4];

songs.forEach((song) => {
  // 既存譜面の最後のノーツ時刻を取得
  const lastTime = Math.max(
    ...song.chart.map((note) => note.time)
  );

  // 既存譜面の後ろから、曲の終盤まで追加する
  const startTime = Math.ceil(lastTime / beatInterval) + 1;
  const totalBeats = Math.floor(146 / beatInterval);

  for (let beat = startTime; beat <= totalBeats; beat++) {
    const time = Number((beat * beatInterval).toFixed(3));
    const lane = lanePattern[beat % lanePattern.length];

    song.chart.push({ time, lane });

    // 4拍ごとに同時押しを追加
    if (beat % 4 === 0) {
      const secondLane = (lane + 3) % 7;
      song.chart.push({ time, lane: secondLane });
    }
  }

  // 時刻順に並べ直す
  song.chart.sort((a, b) => a.time - b.time);
});
    
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

let score = 0;          // 現在のスコア
let combo = 0;          // 現在のコンボ数
let maxCombo = 0;       // 最大コンボ数
let perfectCount = 0;   // PERFECTの回数
let greatCount = 0;     // GREATの回数
let missCount = 0;      // MISSの回数

let running = false;
let animationId = null;
let selectedSong = null;

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


/* コンボ・MISS・正確度の表示を更新 */
function updatePlayStats() {
  comboElement.textContent = String(combo);
  missCountElement.textContent = String(missCount);

  updateAccuracy();
}


/* プレイ中の正確度を更新 */
function updateAccuracy() {
  const totalNotes = selectedSong ? selectedSong.chart.length : 0;

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
}

// 曲選択画面を生成
function createSongList() {
  songListElement.replaceChildren();

  songs.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "song-card";

    const info = document.createElement("span");
    info.className = "song-card-info";

    const title = document.createElement("span");
    title.className = "song-card-title";
    title.textContent = song.title;

    const detail = document.createElement("span");
    detail.className = "song-card-detail";
    detail.textContent = `${song.difficulty} · 7 KEYS`;

    const playIcon = document.createElement("span");
    playIcon.className = "song-card-play";
    playIcon.textContent = "▶";

    info.append(title, detail);
    button.append(info, playIcon);

    button.addEventListener("click", () => selectSong(song));
    songListElement.appendChild(button);
  });
}

// 曲を選択してゲーム画面へ移動
function selectSong(song) {
  stopGame();

  selectedSong = song;
  currentSongTitle.textContent = song.title;

  // 選んだ曲の音源を読み込む
  audio.src = song.audio;
  audio.load();

  // 曲選択画面・ゲーム画面・リザルト画面を切り替える
  songSelectScreen.hidden = true;
  gameScreen.hidden = false;
  resultScreen.hidden = true;

  resetStats();
  statusElement.textContent = "READY";
  startButton.textContent = "ゲーム開始";
  startButton.disabled = false;

  createNotes();
}

// 7つのレーンと操作用キー表示を作る
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
}

// 選択した曲の譜面からノーツを作る
function createNotes() {
  lanes.forEach((lane) => lane.replaceChildren());

  if (!selectedSong) {
    notes = [];
    return;
  }

  notes = selectedSong.chart.map((item) => {
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
  if (!selectedSong || running) return;

  stopGame();
  createNotes();
  resetStats();

  statusElement.textContent = "LOADING...";
  startButton.disabled = true;

  labels.forEach((label) => label.classList.remove("pressed"));
  lanes.forEach((lane) => lane.classList.remove("active"));

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

  const elapsed = audio.currentTime;

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
    }
  }

  // 曲の最後まで再生されたら終了
  if (audio.ended) {
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

  // 今回のプレイ結果をリザルト画面に反映
  resultSongTitle.textContent = selectedSong.title;
  resultScore.textContent = String(score).padStart(6, "0");
  resultMaxCombo.textContent = String(maxCombo);
  
  // スコアから正確度を計算（PERFECT=100%、GREAT=50%、MISS=0%）
  const totalNotes = selectedSong.chart.length;
  const accuracy = totalNotes > 0
    ? (score / (totalNotes * 1000)) * 100
    : 0;

  resultAccuracy.textContent = `${accuracy.toFixed(2)}%`;

  resultMiss.textContent = String(missCount);
  resultPerfect.textContent = String(perfectCount);
  resultGreat.textContent = String(greatCount);
  resultMissCount.textContent = String(missCount);

  gameScreen.hidden = true;
  resultScreen.hidden = false;
}

/* 指定レーンを押したときの判定 */
function hitLane(laneIndex) {
  labels[laneIndex].classList.add("pressed");
  lanes[laneIndex].classList.add("active");

  if (!running) return;

  const elapsed = audio.currentTime;

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
    } else {
      greatCount++;
      score += 500;
      statusElement.textContent = "GREAT!";
      showJudgment("GREAT");
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

  let laneIndex;

  if (event.code === "Space") {
    laneIndex = 3;
    event.preventDefault();
  } else {
    laneIndex = keyMap.indexOf(event.key.toLowerCase());
  }

  if (laneIndex >= 0) hitLane(laneIndex);
});

document.addEventListener("keyup", (event) => {
  const laneIndex = event.code === "Space"
    ? 3
    : keyMap.indexOf(event.key.toLowerCase());

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

// 最初に曲一覧を表示
createSongList();
