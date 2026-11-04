// =========================================
// 背景の疑似3D立方体アニメーション
// （動く背景の前・スペクトラムの後ろ）
// spectrum.js の後に読み込む
// =========================================

const cubeCount = 18;      // 立方体の数
const cubeSizeMin = 40;    // 立方体の大きさの最小値（一辺の半分の長さ）
const cubeSizeMax = 220;   // 立方体の大きさの最大値
const cubeSpeed = 1;       // 手前に近づいてくる速さ（0で止まる）
const cubeOpacity = 1;     // 全体の濃さ（0〜1）

const cubeNear = 700;      // これより手前に来たら奥に戻す
const cubeFar = 3200;      // 一番奥の距離

const cubeCanvas = document.createElement("canvas");
cubeCanvas.className = "cube-canvas";
cubeCanvas.setAttribute("aria-hidden", "true");
document.body.prepend(cubeCanvas);

const cubeCtx = cubeCanvas.getContext("2d");
const cubeReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 立方体の8つの角と6つの面
const cubeVertices = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
const cubeFaces = [
  [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
  [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5],
];

let cubes = [];
let cubeWidth = 0;
let cubeHeight = 0;
let cubeFocal = 1;
let lastCubeTime = 0;

function resizeCubes() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  cubeWidth = window.innerWidth;
  cubeHeight = window.innerHeight;
  cubeCanvas.width = Math.round(cubeWidth * dpr);
  cubeCanvas.height = Math.round(cubeHeight * dpr);
  cubeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cubeFocal = Math.min(cubeWidth, cubeHeight) * 0.9; // 遠近感の強さ
}

// 立方体を1つ作る（z：奥行き）
function createCube(z) {
  // 画面に映る範囲より少し広めにばらまく
  const spreadX = (cubeWidth / 2) * (z / cubeFocal) * 1.3;
  const spreadY = (cubeHeight / 2) * (z / cubeFocal) * 1.3;

  return {
    x: (Math.random() * 2 - 1) * spreadX,
    y: (Math.random() * 2 - 1) * spreadY,
    z,
    // 最小〜最大の間でランダム（小さいものが多めに出るようにしている）
    size: cubeSizeMin + (cubeSizeMax - cubeSizeMin) * Math.pow(Math.random(), 1.5),
    rotX: Math.random() * Math.PI * 2,
    rotY: Math.random() * Math.PI * 2,
    rotZ: Math.random() * Math.PI * 2,
    spinX: (Math.random() - 0.5) * 0.8,
    spinY: (Math.random() - 0.5) * 0.8,
    spinZ: (Math.random() - 0.5) * 0.4,
    hue: 190 + Math.random() * 100, // 水色〜紫
  };
}

function initCubes() {
  cubes = Array.from({ length: cubeCount }, () =>
    createCube(cubeNear + Math.random() * (cubeFar - cubeNear))
  );
}

window.addEventListener("resize", resizeCubes);
resizeCubes();
initCubes();

// 角の座標を回転させる
function rotatePoint([x, y, z], cube) {
  const cx = Math.cos(cube.rotX), sx = Math.sin(cube.rotX);
  const cy = Math.cos(cube.rotY), sy = Math.sin(cube.rotY);
  const cz = Math.cos(cube.rotZ), sz = Math.sin(cube.rotZ);

  let y1 = y * cx - z * sx;
  let z1 = y * sx + z * cx;
  let x2 = x * cy + z1 * sy;
  let z2 = -x * sy + z1 * cy;
  let x3 = x2 * cz - y1 * sz;
  let y3 = x2 * sz + y1 * cz;

  return [x3, y3, z2];
}

function drawCubes(timestamp) {
  requestAnimationFrame(drawCubes);

  const dt = Math.min(0.05, (timestamp - lastCubeTime) / 1000 || 0);
  lastCubeTime = timestamp;
  const motion = cubeReduceMotion ? 0 : 1;

  // スペクトラムのドラム検出があれば、叩いた瞬間に少し明るくする
  const glow = typeof drumBoost === "number" ? drumBoost : 0;

  cubeCtx.clearRect(0, 0, cubeWidth, cubeHeight);

  const centerX = cubeWidth / 2;
  const centerY = cubeHeight / 2;

  // 動かす
  for (const cube of cubes) {
    cube.z -= 140 * cubeSpeed * motion * dt;
    cube.rotX += cube.spinX * motion * dt;
    cube.rotY += cube.spinY * motion * dt;
    cube.rotZ += cube.spinZ * motion * dt;

    if (cube.z < cubeNear) {
      Object.assign(cube, createCube(cubeFar));
    }
  }

  // 奥のものから順に描く
  cubes.sort((a, b) => b.z - a.z);

  cubeCtx.lineJoin = "round";

  for (const cube of cubes) {
    // 奥ではふわっと現れ、手前に来すぎたら消える
    const farFade = Math.min(1, (cubeFar - cube.z) / (cubeFar * 0.35));
    const nearFade = Math.min(1, (cube.z - cubeNear) / 600);
    const alpha = Math.max(0, farFade * nearFade) * cubeOpacity;
    if (alpha <= 0.01) continue;

    // 8つの角を回転・移動させる
    const points = cubeVertices.map((vertex) => {
      const [rx, ry, rz] = rotatePoint(vertex, cube);
      return [cube.x + rx * cube.size, cube.y + ry * cube.size, cube.z + rz * cube.size];
    });

    // 画面上の位置に変換（遠いほど中心に寄って小さくなる）
    const projected = points.map(([x, y, z]) => [
      centerX + (x * cubeFocal) / z,
      centerY + (y * cubeFocal) / z,
    ]);

    const scale = cubeFocal / cube.z;
    cubeCtx.lineWidth = Math.max(0.8, 1.6 * scale);

    for (const face of cubeFaces) {
      // 面の中心と向き（立方体の中心から面の中心への向き）
      let fx = 0, fy = 0, fz = 0;
      for (const index of face) {
        fx += points[index][0];
        fy += points[index][1];
        fz += points[index][2];
      }
      fx /= 4; fy /= 4; fz /= 4;

      const nx = fx - cube.x;
      const ny = fy - cube.y;
      const nz = fz - cube.z;

      // こちらを向いている面だけ描く（裏側の面は描かない）
      if (nx * fx + ny * fy + nz * fz >= 0) continue;

      // 面の向きで明るさを変えて立体感を出す
      const length = Math.hypot(nx, ny, nz);
      const light = 0.4 + 0.6 * Math.max(0, (-nx * 0.3 - ny * 0.5 - nz * 0.8) / length);

      cubeCtx.beginPath();
      face.forEach((index, n) => {
        const [px, py] = projected[index];
        if (n === 0) cubeCtx.moveTo(px, py);
        else cubeCtx.lineTo(px, py);
      });
      cubeCtx.closePath();

      cubeCtx.fillStyle = `hsla(${cube.hue}, 90%, ${30 + light * 30}%, ${alpha * 0.08 * light})`;
      cubeCtx.fill();

      cubeCtx.strokeStyle = `hsla(${cube.hue}, 100%, ${60 + glow * 20}%, ${alpha * (0.3 + glow * 0.35)})`;
      cubeCtx.stroke();
    }
  }
}

requestAnimationFrame(drawCubes);
