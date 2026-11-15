const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const noticeEl = document.getElementById('notice');
const trackLengthEl = document.getElementById('trackLength');
const topSpeedEl = document.getElementById('topSpeed');
const rideScoreEl = document.getElementById('rideScore');
const rideButton = document.getElementById('rideButton');
const addPieceButton = document.getElementById('addPieceButton');
const undoButton = document.getElementById('undoButton');
const resetButton = document.getElementById('resetButton');
const audioToggleEl = document.getElementById('audioToggle');
const pieceButtons = [...document.querySelectorAll('[data-piece]')];

const groundY = 450;
const startX = 64;
const startY = 380;
const segmentWidth = 68;
const maxSegments = 12;
const minTrackY = 178;
const maxTrackY = 408;
const samplesPerSegment = 32;
const sceneryDuration = 48;
const sceneryPalettes = [
  { sky: '#8ed8ee', far: '#8fc8e8', near: '#89c791', ground: '#66a875' },
  { sky: '#f5b5a8', far: '#d9a8d1', near: '#e8b47d', ground: '#8abf8d' },
  { sky: '#253d76', far: '#485780', near: '#667f9c', ground: '#365e62' },
  { sky: '#ffe099', far: '#ffb56b', near: '#f28c54', ground: '#91b567' },
];
const pieceNames = {
  flat: '直線',
  climb: '上り坂',
  drop: '下り坂',
  hill: '山',
  valley: '谷',
  curveLeft: '左カーブ',
  curveRight: '右カーブ',
  loop: 'ループ',
};
const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const state = {
  elapsed: 0,
  lastTime: 0,
  riding: false,
  rideDistance: 0,
  rideSpeed: 0,
  rideMaxSpeed: 0,
  rideScore: null,
  selectedPiece: 'flat',
};

const segments = ['flat', 'flat', 'flat'];
let trackData;
let audioContext = null;
let masterGain = null;
let bgmTimer = null;
let bgmStep = 0;
let bgmPhrase = 0;
let drumNoiseBuffer = null;
let audioEnabled = true;

const bgmNotes = [392, 440, 523, 587, 523, 440, 392, 330];
const boleroRhythm = [1, 0.32, 0.58, 0.32, 0.82, 0.32, 0.58, 0.32];

function getSegmentGeometry(type, y0, x0, z0) {
  const x1 = x0 + segmentWidth;
  let y1 = y0;
  let controlY = y0;
  let z1 = z0;
  let controlZ = z0;
  const loop = type === 'loop';

  if (type === 'climb') {
    y1 = Math.max(minTrackY, y0 - 48);
    controlY = y0 - 34;
  } else if (type === 'drop') {
    y1 = Math.min(maxTrackY, y0 + 48);
    controlY = y0 + 34;
  } else if (type === 'hill') {
    controlY = y0 - 68;
  } else if (type === 'valley') {
    controlY = y0 + 68;
  } else if (type === 'curveLeft') {
    z1 = z0 - 64;
    controlZ = z0 - 64;
  } else if (type === 'curveRight') {
    z1 = z0 + 64;
    controlZ = z0 + 64;
  }

  return {
    x0,
    y0,
    x1,
    y1,
    z0,
    z1,
    loop,
    loopRadius: 38,
    controlX: (x0 + x1) / 2,
    controlY: Math.max(minTrackY - 38, Math.min(maxTrackY + 38, controlY)),
    controlZ,
  };
}

function rebuildTrack() {
  const points = [{ x: startX, y: startY, z: 0, distance: 0 }];
  const geometries = [];
  let x = startX;
  let y = startY;
  let z = 0;
  let length = 0;
  let minY = y;
  let maxY = y;

  segments.forEach((type) => {
    const geometry = getSegmentGeometry(type, y, x, z);
    geometries.push(geometry);
    for (let step = 1; step <= samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const inverse = 1 - t;
      let point;
      if (geometry.loop) {
        const centerX = geometry.x0 + segmentWidth / 2;
        const radius = geometry.loopRadius;
        if (t < 0.2) {
          const entry = t / 0.2;
          point = { x: geometry.x0 + (centerX - geometry.x0) * entry, y: geometry.y0, z: geometry.z0 };
        } else if (t <= 0.8) {
          const angle = ((t - 0.2) / 0.6) * Math.PI * 2;
          point = {
            x: centerX + radius * Math.sin(angle),
            y: geometry.y0 - radius * (1 - Math.cos(angle)),
            z: geometry.z0,
          };
        } else {
          const exit = (t - 0.8) / 0.2;
          point = { x: centerX + (geometry.x1 - centerX) * exit, y: geometry.y0, z: geometry.z0 };
        }
      } else {
        const smooth = t * t * (3 - 2 * t);
        point = {
          x: inverse * inverse * geometry.x0 + 2 * inverse * t * geometry.controlX + t * t * geometry.x1,
          y: inverse * inverse * geometry.y0 + 2 * inverse * t * geometry.controlY + t * t * geometry.y1,
          z: geometry.z0 + (geometry.z1 - geometry.z0) * smooth,
        };
      }
      const previous = points[points.length - 1];
      length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
      points.push({ ...point, distance: length });
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
    x = geometry.x1;
    y = geometry.y1;
    z = geometry.z1;
  });

  const padding = 44;
  const minLayoutX = Math.min(...points.map((point) => point.x + point.z * 0.7));
  const maxLayoutX = Math.max(...points.map((point) => point.x + point.z * 0.7));
  const layoutScale = (canvas.width - padding * 2) / Math.max(1, maxLayoutX - minLayoutX);
  const layoutOffset = padding - minLayoutX * layoutScale;
  points.forEach((point) => {
    point.screenX = (point.x + point.z * 0.7) * layoutScale + layoutOffset;
  });
  trackData = {
    points,
    geometries,
    length,
    minY,
    maxY,
    layoutScale,
    layoutOffset,
  };
  updateHud();
}

function getBuilderX(x, z) {
  return x * trackData.layoutScale + z * 0.7 * trackData.layoutScale + trackData.layoutOffset;
}

function updateHud() {
  trackLengthEl.textContent = `${Math.round(trackData.length / 8)} m`;
  topSpeedEl.textContent = `${Math.round(state.rideMaxSpeed * 8)} km/h`;
  rideScoreEl.textContent = state.rideScore === null ? '-' : state.rideScore;
}

function getSceneryPalette() {
  const scene = state.elapsed / sceneryDuration;
  const sceneIndex = Math.floor(scene);
  const current = sceneryPalettes[sceneIndex % sceneryPalettes.length];
  const next = sceneryPalettes[(sceneIndex + 1) % sceneryPalettes.length];
  const fraction = scene % 1;
  const progress = fraction * fraction * (3 - 2 * fraction);

  return Object.fromEntries(
    Object.keys(current).map((key) => {
      const start = Number.parseInt(current[key].slice(1), 16);
      const end = Number.parseInt(next[key].slice(1), 16);
      const channels = [16, 8, 0].map((shift) => {
        const from = (start >> shift) & 255;
        const to = (end >> shift) & 255;
        return Math.round(from + (to - from) * progress);
      });
      return [key, `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`];
    }),
  );
}

function playTone(frequency, duration, type, volume, slideTo, startDelay = 0) {
  if (!audioContext || !audioEnabled) return;

  const startTime = audioContext.currentTime + startDelay;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, startTime + duration);
  }
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

function playDrum(volume) {
  if (!audioContext || !audioEnabled) return;

  if (!drumNoiseBuffer) {
    drumNoiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.12, audioContext.sampleRate);
    const noise = drumNoiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = Math.random() * 2 - 1;
    }
  }

  const startTime = audioContext.currentTime;
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  noise.buffer = drumNoiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1900, startTime);
  filter.Q.setValueAtTime(0.8, startTime);
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  noise.start(startTime);
  noise.stop(startTime + 0.12);
}

function playBgmStep() {
  const intensity = Math.min(0.9, 0.38 + bgmPhrase * 0.06);
  const rhythmIndex = bgmStep % boleroRhythm.length;
  const rhythmAccent = boleroRhythm[rhythmIndex];
  playDrum(0.025 * intensity * rhythmAccent);
  if (rhythmIndex === 0 || rhythmIndex === 4) {
    playTone(110, 0.16, 'triangle', 0.045 * intensity * rhythmAccent, 55);
  }

  if (bgmStep % 2 === 0) {
    const note = bgmNotes[Math.floor(bgmStep / 2)];
    const instrument = bgmPhrase < 2 ? 'triangle' : bgmPhrase < 5 ? 'sawtooth' : 'square';
    playTone(note, 0.62, instrument, 0.035 * intensity);
    if (bgmPhrase >= 3 && bgmStep % 4 === 0) {
      playTone(note * 2, 0.42, 'triangle', 0.018 * intensity);
    }
    if (bgmStep % 8 === 0) {
      playTone(note / 2, 0.7, 'triangle', 0.025 * intensity);
    }
  }

  bgmStep = (bgmStep + 1) % 16;
  if (bgmStep === 0) bgmPhrase++;
}

function startBgm() {
  if (!audioEnabled || !audioContext || bgmTimer || state.riding) return;
  playBgmStep();
  bgmTimer = window.setInterval(playBgmStep, 375);
}

function stopBgm() {
  if (bgmTimer) {
    window.clearInterval(bgmTimer);
    bgmTimer = null;
  }
}

function startAudio() {
  if (!audioEnabled || !AudioContextClass) return;

  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioContext.destination);
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch((error) => {
      console.error('音声を再開できませんでした。', error);
    });
  }
  startBgm();
}

function setAudioEnabled(enabled) {
  audioEnabled = enabled;
  audioToggleEl.textContent = `音声: ${audioEnabled ? 'ON' : 'OFF'}`;
  audioToggleEl.setAttribute('aria-pressed', String(audioEnabled));

  if (audioEnabled) {
    startAudio();
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(0.35, audioContext.currentTime, 0.02);
    }
  } else {
    stopBgm();
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.02);
    }
  }
}

function getTrackPoint(distance) {
  const points = trackData.points;
  if (distance >= trackData.length) {
    const last = points[points.length - 1];
    const before = points[points.length - 2];
    return {
      ...last,
      angle: Math.atan2(last.y - before.y, last.x - before.x),
      yaw: Math.atan2(last.z - before.z, last.x - before.x),
    };
  }

  let index = 0;
  while (index < points.length - 2 && points[index + 1].distance < distance) index++;
  const start = points[index];
  const end = points[index + 1];
  const span = end.distance - start.distance || 1;
  const amount = (distance - start.distance) / span;
  return {
    x: start.x + (end.x - start.x) * amount,
    y: start.y + (end.y - start.y) * amount,
    z: start.z + (end.z - start.z) * amount,
    angle: Math.atan2(end.y - start.y, end.x - start.x),
    yaw: Math.atan2(end.z - start.z, end.x - start.x),
  };
}

function setEditingEnabled(enabled) {
  pieceButtons.forEach((button) => {
    button.disabled = !enabled;
  });
  addPieceButton.disabled = !enabled;
  undoButton.disabled = !enabled || segments.length <= 3;
  resetButton.disabled = !enabled;
  rideButton.disabled = !enabled;
  rideButton.textContent = enabled ? '試運転する' : '走行中...';
}

function addTrackPiece() {
  if (state.riding) return;
  startAudio();
  if (segments.length >= maxSegments) {
    noticeEl.textContent = 'この画面に置ける線路は最大12個です。';
    return;
  }

  const previousY = trackData.geometries.length
    ? trackData.geometries[trackData.geometries.length - 1].y1
    : startY;
  const previousGeometry = trackData.geometries[trackData.geometries.length - 1];
  const previousX = previousGeometry ? previousGeometry.x1 : startX;
  const previousZ = previousGeometry ? previousGeometry.z1 : 0;
  const geometry = getSegmentGeometry(state.selectedPiece, previousY, previousX, previousZ);
  if (geometry.y1 === previousY && (state.selectedPiece === 'climb' || state.selectedPiece === 'drop')) {
    noticeEl.textContent = '線路の高さが限界です。別のパーツを選んでください。';
    return;
  }

  segments.push(state.selectedPiece);
  state.rideScore = null;
  rebuildTrack();
  updateActionButtons();
  noticeEl.textContent = `${pieceNames[state.selectedPiece]}を追加しました。`;
  playTone(520, 0.09, 'triangle', 0.08, 760);
}

function updateActionButtons() {
  addPieceButton.disabled = state.riding;
  undoButton.disabled = state.riding || segments.length <= 3;
  resetButton.disabled = state.riding;
  pieceButtons.forEach((button) => {
    button.disabled = state.riding;
  });
}

function undoTrackPiece() {
  if (state.riding || segments.length <= 3) return;
  startAudio();
  segments.pop();
  state.rideScore = null;
  rebuildTrack();
  updateActionButtons();
  noticeEl.textContent = '最後の線路を取り消しました。';
}

function resetTrack() {
  if (state.riding) return;
  startAudio();
  segments.splice(0, segments.length, 'flat', 'flat', 'flat');
  state.rideScore = null;
  state.rideMaxSpeed = 0;
  rebuildTrack();
  updateActionButtons();
  noticeEl.textContent = 'コースを作り直しました。パーツを追加してみよう！';
}

function startRide() {
  if (state.riding) return;
  startAudio();
  state.riding = true;
  state.rideDistance = 0;
  state.rideSpeed = 5;
  state.rideMaxSpeed = state.rideSpeed;
  state.rideScore = null;
  setEditingEnabled(false);
  noticeEl.textContent = '出発進行！トロッコからの景色を楽しもう。';
  updateHud();
  playTone(440, 0.16, 'triangle', 0.1, 660);
}

function finishRide() {
  state.riding = false;
  const curveCount = segments.filter((type) => type === 'hill' || type === 'valley').length;
  const heightRange = trackData.maxY - trackData.minY;
  state.rideScore = Math.round(trackData.length / 4 + state.rideMaxSpeed * 8 + curveCount * 18 + heightRange * 0.25);
  setEditingEnabled(true);
  noticeEl.textContent = `試運転完了！ライド評価 ${state.rideScore} 点！`;
  playTone(660, 0.16, 'triangle', 0.1);
  playTone(880, 0.24, 'triangle', 0.1, null, 0.18);
  startBgm();
  updateHud();
}

function update(delta) {
  state.elapsed += delta / 60;

  if (!state.riding) return;

  const current = getTrackPoint(state.rideDistance);
  const ahead = getTrackPoint(Math.min(trackData.length, state.rideDistance + 8));
  const slope = (ahead.y - current.y) / 8;
  state.rideSpeed = Math.max(2.4, Math.min(11.5, state.rideSpeed + slope * 0.07 * delta - 0.002 * delta));
  state.rideMaxSpeed = Math.max(state.rideMaxSpeed, state.rideSpeed);
  state.rideDistance += state.rideSpeed * delta;

  if (state.rideDistance >= trackData.length) {
    state.rideDistance = trackData.length;
    finishRide();
  }
  updateHud();
}

function drawCloud(x, y, scale) {
  ctx.beginPath();
  ctx.ellipse(x, y, 24 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 19 * scale, y - 7 * scale, 18 * scale, 15 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 38 * scale, y, 24 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground() {
  const scenery = getSceneryPalette();
  ctx.fillStyle = scenery.sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.arc(790, 92, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 270 - state.elapsed * (8 + i * 2)) % (canvas.width + 140) + canvas.width + 140) % (canvas.width + 140) - 70;
    drawCloud(x, 90 + (i % 2) * 55, 0.75 + (i % 3) * 0.12);
  }

  ctx.fillStyle = scenery.far;
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(130, 205);
  ctx.lineTo(285, 355);
  ctx.lineTo(425, 225);
  ctx.lineTo(620, 365);
  ctx.lineTo(790, 215);
  ctx.lineTo(960, 355);
  ctx.lineTo(960, groundY);
  ctx.lineTo(0, groundY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = scenery.near;
  ctx.beginPath();
  ctx.moveTo(0, 392);
  ctx.quadraticCurveTo(170, 300, 330, 390);
  ctx.quadraticCurveTo(520, 325, 700, 392);
  ctx.quadraticCurveTo(850, 330, 960, 390);
  ctx.lineTo(960, groundY);
  ctx.lineTo(0, groundY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = scenery.ground;
  ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
}

function drawTrack() {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let index = 0; index < trackData.points.length; index += samplesPerSegment * 2) {
    const point = trackData.points[index];
    if (point && point.y < groundY - 12) {
      ctx.strokeStyle = '#46535b';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(point.screenX, point.y + 5);
      ctx.lineTo(point.screenX, groundY);
      ctx.stroke();
      ctx.strokeStyle = '#a8b8bf';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(point.screenX, point.y + 8);
      ctx.lineTo(point.screenX, groundY);
      ctx.stroke();

      const next = trackData.points[Math.min(trackData.points.length - 1, index + samplesPerSegment * 2)];
      if (next && next.y < groundY - 12) {
        ctx.strokeStyle = '#35434b';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(point.screenX - 18, groundY - 25);
        ctx.lineTo(next.screenX + 18, next.y + 14);
        ctx.stroke();
      }
    }
  }

  const railLines = [-1, 1].map((side) => trackData.points.map((point, index) => {
    const previous = trackData.points[Math.max(0, index - 1)];
    const next = trackData.points[Math.min(trackData.points.length - 1, index + 1)];
    const dx = next.screenX - previous.screenX;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.screenX - (dy / length) * side * 3.5,
      y: point.y + (dx / length) * side * 3.5,
    };
  }));

  const spine = trackData.points.map((point, index) => {
    const previous = trackData.points[Math.max(0, index - 1)];
    const next = trackData.points[Math.min(trackData.points.length - 1, index + 1)];
    const dx = next.screenX - previous.screenX;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: point.screenX - (dy / length) * 13,
      y: point.y + (dx / length) * 13,
    };
  });
  for (const [color, width] of [['#29373f', 11], ['#697980', 6], ['#c5d0d2', 1.5]]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(spine[0].x, spine[0].y);
    for (let index = 1; index < spine.length; index++) {
      ctx.lineTo(spine[index].x, spine[index].y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < trackData.points.length; i += 4) {
    const previous = trackData.points[Math.max(0, i - 1)];
    const next = trackData.points[Math.min(trackData.points.length - 1, i + 1)];
    const point = trackData.points[i];
    const dx = next.screenX - previous.screenX;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    const normalX = -dy / length;
    const normalY = dx / length;

    ctx.strokeStyle = '#303d44';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(point.screenX - normalX * 15, point.y - normalY * 15);
    ctx.lineTo(point.screenX + normalX * 15, point.y + normalY * 15);
    ctx.stroke();
    ctx.strokeStyle = '#a4b0b4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(point.screenX - normalX * 13, point.y - normalY * 13);
    ctx.lineTo(point.screenX + normalX * 13, point.y + normalY * 13);
    ctx.stroke();
  }

  for (const rail of railLines) {
    for (const [color, width] of [['#1f2c33', 10], ['#53636b', 7], ['#b2bec2', 4], ['#f3f6f4', 1.5]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(rail[0].x, rail[0].y);
      for (let index = 1; index < rail.length; index++) {
        ctx.lineTo(rail[index].x, rail[index].y);
      }
      ctx.stroke();
    }
  }

  for (let i = 0; i < trackData.points.length; i += 4) {
    for (const rail of railLines) {
      const position = rail[i];
      ctx.fillStyle = '#26343c';
      ctx.beginPath();
      ctx.arc(position.x, position.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#edf2f2';
      ctx.beginPath();
      ctx.arc(position.x - 0.6, position.y - 0.6, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRideView() {
  const scenery = getSceneryPalette();
  const camera = getTrackPoint(state.rideDistance);
  const horizon = 205 + Math.max(-1.2, Math.min(1.2, camera.angle)) * 55;
  const focalLength = 250;
  const lookAhead = Math.min(620, trackData.length - state.rideDistance);
  const roadSamples = [];

  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, scenery.sky);
  sky.addColorStop(0.58, '#d7eff4');
  sky.addColorStop(1, scenery.near);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff2a8';
  ctx.beginPath();
  ctx.arc(790, 92, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.68)';
  for (let i = 0; i < 4; i++) {
    const x = ((i * 270 - state.elapsed * (8 + i * 2)) % (canvas.width + 140) + canvas.width + 140) % (canvas.width + 140) - 70;
    drawCloud(x, 90 + (i % 2) * 55, 0.75 + (i % 3) * 0.12);
  }

  ctx.fillStyle = scenery.far;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 82);
  ctx.lineTo(120, horizon - 24);
  ctx.lineTo(270, horizon + 78);
  ctx.lineTo(420, horizon - 40);
  ctx.lineTo(610, horizon + 72);
  ctx.lineTo(790, horizon - 20);
  ctx.lineTo(canvas.width, horizon + 76);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = scenery.ground;
  ctx.beginPath();
  ctx.moveTo(0, horizon + 82);
  ctx.lineTo(canvas.width, horizon + 82);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  const project = (distanceAhead) => {
    const distance = state.rideDistance + distanceAhead;
    const point = getTrackPoint(distance);
    const scale = focalLength / (focalLength + distanceAhead);
    const deltaX = point.x - camera.x;
    const deltaZ = point.z - camera.z;
    const lateral = -Math.sin(camera.yaw) * deltaX + Math.cos(camera.yaw) * deltaZ;
    return {
      x: canvas.width / 2 + lateral * scale * 2.8,
      y: horizon + 300 * scale + (point.y - camera.y) * scale * 1.8,
      scale,
      halfWidth: 450 * scale,
    };
  };

  for (let distance = 0; distance <= lookAhead; distance += 8) {
    roadSamples.push({ distance, ...project(distance) });
  }

  if (roadSamples.length > 1) {
    ctx.strokeStyle = 'rgba(57, 67, 74, 0.8)';
    for (let distance = 56; distance <= lookAhead; distance += 56) {
      const point = project(distance);
      const worldPoint = getTrackPoint(state.rideDistance + distance);
      if (worldPoint.y >= groundY - 12) continue;

      const groundPoint = horizon + 300 * point.scale + (groundY - camera.y) * point.scale * 1.8;
      const railOffset = point.halfWidth * 0.64;
      ctx.lineWidth = Math.max(1, point.scale * 5);
      for (const side of [-1, 1]) {
        const x = point.x + railOffset * side;
        ctx.beginPath();
        ctx.moveTo(x, point.y);
        ctx.lineTo(x, groundPoint);
        ctx.stroke();
      }
    }

    for (const [color, widthScale, yOffset] of [
      ['#1d282e', 14, 18],
      ['#64737a', 9, 18],
      ['#d3dcde', 2, 17],
    ]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, roadSamples[0].scale * widthScale);
      ctx.beginPath();
      roadSamples.forEach((point, index) => {
        const x = point.x;
        const y = point.y + point.scale * yOffset;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    for (let distance = 0; distance <= lookAhead; distance += 24) {
      const point = project(distance);
      const railHalfWidth = point.halfWidth * 0.64;
      const spineY = point.y + point.scale * 18;

      ctx.strokeStyle = '#303d44';
      ctx.lineWidth = Math.max(2, point.scale * 5);
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(point.x, spineY);
        ctx.lineTo(point.x + railHalfWidth * side * 0.82, point.y + point.scale * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = '#303a40';
      ctx.lineWidth = Math.max(2, point.scale * 18);
      ctx.beginPath();
      ctx.moveTo(point.x - railHalfWidth * 1.12, point.y);
      ctx.lineTo(point.x + railHalfWidth * 1.12, point.y);
      ctx.stroke();
      ctx.strokeStyle = '#859398';
      ctx.lineWidth = Math.max(1, point.scale * 10);
      ctx.beginPath();
      ctx.moveTo(point.x - railHalfWidth * 1.1, point.y - point.scale * 2);
      ctx.lineTo(point.x + railHalfWidth * 1.1, point.y - point.scale * 2);
      ctx.stroke();

      ctx.fillStyle = '#17232a';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(point.x + railHalfWidth * side, point.y - point.scale * 4, Math.max(0.7, point.scale * 2.2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let index = 0; index < roadSamples.length - 1; index++) {
        const from = roadSamples[index];
        const to = roadSamples[index + 1];
        const fromX = from.x + from.halfWidth * 0.64 * side;
        const toX = to.x + to.halfWidth * 0.64 * side;
        for (const [color, widthScale, yOffset] of [
          ['#19242a', 15, 0],
          ['#536169', 11, -1],
          ['#aab7bb', 7, -2],
          ['#f4f7f5', 2, -3],
        ]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, (from.scale + to.scale) * widthScale);
          ctx.beginPath();
          ctx.moveTo(fromX, from.y + yOffset * from.scale);
          ctx.lineTo(toX, to.y + yOffset * to.scale);
          ctx.stroke();
        }
      }
    }
  }

  const vignette = ctx.createRadialGradient(
    canvas.width / 2, canvas.height * 0.45, canvas.height * 0.2,
    canvas.width / 2, canvas.height * 0.45, canvas.width * 0.72,
  );
  vignette.addColorStop(0, 'rgba(13, 30, 42, 0)');
  vignette.addColorStop(1, 'rgba(13, 30, 42, 0.28)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#27343d';
  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  ctx.lineTo(0, canvas.height - 46);
  ctx.lineTo(110, canvas.height - 18);
  ctx.lineTo(270, canvas.height);
  ctx.lineTo(canvas.width - 270, canvas.height);
  ctx.lineTo(canvas.width - 110, canvas.height - 18);
  ctx.lineTo(canvas.width, canvas.height - 46);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#e76f51';
  ctx.beginPath();
  ctx.moveTo(365, canvas.height);
  ctx.lineTo(405, canvas.height - 30);
  ctx.lineTo(555, canvas.height - 30);
  ctx.lineTo(595, canvas.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#293740';
  ctx.fillRect(0, 0, canvas.width, 7);
}

function drawPreview() {
  if (state.riding || segments.length >= maxSegments) return;
  const last = trackData.geometries[trackData.geometries.length - 1];
  const preview = getSegmentGeometry(state.selectedPiece, last.y1, last.x1, last.z1);

  ctx.save();
  ctx.setLineDash([8, 7]);
  ctx.strokeStyle = 'rgba(17, 100, 125, 0.55)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(getBuilderX(preview.x0, preview.z0), preview.y0);
  if (preview.loop) {
    ctx.lineTo(getBuilderX(preview.x0 + segmentWidth / 2, preview.z0), preview.y0);
    for (let step = 1; step <= 24; step++) {
      const angle = (step / 24) * Math.PI * 2;
      ctx.lineTo(
        getBuilderX(preview.x0 + segmentWidth / 2 + preview.loopRadius * Math.sin(angle), preview.z0),
        preview.y0 - preview.loopRadius * (1 - Math.cos(angle)),
      );
    }
    ctx.lineTo(getBuilderX(preview.x1, preview.z1), preview.y1);
  } else {
    ctx.quadraticCurveTo(
      getBuilderX(preview.controlX, preview.controlZ),
      preview.controlY,
      getBuilderX(preview.x1, preview.z1),
      preview.y1,
    );
  }
  ctx.stroke();
  ctx.restore();
}

function drawCoaster() {
  if (!state.riding) return;
  const point = getTrackPoint(state.rideDistance);

  ctx.save();
  ctx.translate(point.x, point.y - 13);
  ctx.rotate(point.angle);
  ctx.fillStyle = '#e76f51';
  ctx.fillRect(-18, -13, 36, 16);
  ctx.fillStyle = '#fff3d4';
  ctx.fillRect(-13, -10, 10, 7);
  ctx.fillRect(2, -10, 10, 7);
  ctx.fillStyle = '#213547';
  for (const x of [-11, 11]) {
    ctx.beginPath();
    ctx.arc(x, 5, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (state.riding) {
    drawRideView();
  } else {
    drawBackground();
    drawTrack();
    drawPreview();
  }
}

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - state.lastTime) / 16.666, 2.2) || 1;
  state.lastTime = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(gameLoop);
}

pieceButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (state.riding) return;
    startAudio();
    state.selectedPiece = button.dataset.piece;
    pieceButtons.forEach((pieceButton) => {
      const selected = pieceButton === button;
      pieceButton.classList.toggle('selected', selected);
      pieceButton.setAttribute('aria-pressed', String(selected));
    });
    noticeEl.textContent = `${pieceNames[state.selectedPiece]}を選択中。クリックして線路を追加しよう！`;
  });
});

addPieceButton.addEventListener('click', addTrackPiece);
undoButton.addEventListener('click', undoTrackPiece);
resetButton.addEventListener('click', resetTrack);
rideButton.addEventListener('click', startRide);
audioToggleEl.addEventListener('click', () => {
  setAudioEnabled(!audioEnabled);
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') {
    if (!event.repeat) setAudioEnabled(!audioEnabled);
    return;
  }
  startAudio();
});

if (!AudioContextClass) {
  audioToggleEl.disabled = true;
  audioToggleEl.textContent = '音声: 非対応';
  audioToggleEl.setAttribute('aria-pressed', 'false');
}

rebuildTrack();
updateActionButtons();
requestAnimationFrame(gameLoop);
