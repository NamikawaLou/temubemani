// =========================================
// 曲の一覧
// 曲を追加するときは、下の例をコピーして書き足す
// =========================================
// id    ：英小文字・数字・ハイフンだけ。譜面ファイル名と同じにする
// title ：曲選択画面に表示する曲名
// audio ：音源ファイルの場所
// chart ：譜面ファイルの場所（tools/chart-maker.html で作る）
// bpm   ：曲のBPM（スペクトラムのBPMモードでも使う）

const songs = [
  {
    id: "break-through-myself",
    title: "Break Through Myself feat. Risa Yuzuki",
    audio: "assets/Break_Through_Myself_feat.RisaYuzuki.m4a",
    chart: "charts/break-through-myself.js",
    bpm: 200,
  },

  // ↓ 2曲目以降の例（先頭の // を消して、内容を書き換える）
  // {
  //   id: "song-2",
  //   title: "2曲目の曲名",
  //   audio: "assets/song-2.m4a",
  //   chart: "charts/song-2.js",
  //   bpm: 150,
  // },

   {
     id: "end-time",
     title: "End Time - Cres.",
     audio: "assets/End_Time.mp3",
     chart: "charts/end-time.js",
     bpm: 180,
   },

      {
     id: "resurrection-spell",
     title: "Resurrection Spell(原曲:月まで届け、不死の煙) - ZUN remixed by LeaF",
     audio: "assets/Resurrection_Spell.mp3",
     chart: "charts/resurrection-spell.js",
     bpm: 180,
   },

      {
     id: "arianrhod",
     title: "Arianrhod(原曲:月時計 ～ ルナ・ダイアル) - ZUN remixed by LeaF",
     audio: "assets/Arianrhod.mp3",
     chart: "charts/arianrhod.js",
     bpm: 165,
   },

      {
     id: "body-f10ating-in-the-zero-gravity-space",
     title: "Body F10ating in the Zero Gravity Space - Camellia",
     audio: "assets/Body_F10ating_in_the_Zero_Gravity_Space.mp3",
     chart: "charts/body-f10ating-in-the-zero-gravity-space.js",
     bpm: 170,
   },

];
