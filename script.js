const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const hpEl = document.getElementById('hp');
const noticeEl = document.getElementById('notice');

const groundY = 440;
const tileSize = 48;
const keys = {};

const state = {
  width: canvas.width,
  height: canvas.height,
  lastTime: 0,
  distance: 0,
  score: 0,
  best: Number(localStorage.getItem('side-runner-best') || 0),
  enemyTimer: 0,
  gameOver: false,
  started: true,
};

const player = {
  x: 120,
  y: groundY - 40,
  w: 32,
  h: 40,
  vx: 0,
  vy: 0,
  speed: 5.5,
  jumpPower: 14,
  onGround: true,
  hp: 5,
  facing: 1,
  shootCooldown: 0,
};

const bullets = [];
const enemies = [];
const particles = [];

function resetGame() {
  state.distance = 0;
  state.score = 0;
  state.enemyTimer = 0;
  state.gameOver = false;
  state.started = true;

  player.x = 120;
  player.y = groundY - player.h;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.hp = 5;
  player.facing = 1;
  player.shootCooldown = 0;

  bullets.length = 0;
  enemies.length = 0;
  particles.length = 0;

  noticeEl.textContent = 'Move: A / D or ← / →   Jump: W / ↑ / Space   Shoot: J / K';
  updateHud();
}

function updateHud() {
  scoreEl.textContent = Math.floor(state.score);
  bestEl.textContent = Math.floor(state.best);
  hpEl.textContent = `${player.hp} / 5`;
}

function spawnEnemy() {
  const type = Math.random() < 0.75 ? 'walker' : 'flyer';
  const width = type === 'walker' ? 36 : 26;
  const height = type === 'walker' ? 32 : 26;

  enemies.push({
    type,
    x: state.width + 40,
    y: type === 'walker' ? groundY - height : groundY - 90 - Math.random() * 90,
    w: width,
    h: height,
    vx: type === 'walker' ? -3.4 : -2.1,
    hp: type === 'walker' ? 2 : 1,
    bob: Math.random() * Math.PI * 2,
  });
}

function shoot() {
  if (player.shootCooldown > 0 || state.gameOver) return;

  const bulletSpeed = 9;
  bullets.push({
    x: player.x + player.w / 2 + player.facing * 18,
    y: player.y + player.h / 2 - 4,
    r: 5,
    vx: bulletSpeed * player.facing,
    life: 70,
  });

  player.shootCooldown = 190;
}

function addParticles(x, y, color) {
  for (let i = 0; i < 10; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      r: 2 + Math.random() * 3,
      color,
      life: 30 + Math.random() * 18,
    });
  }
}

function handleInput() {
  if (keys.ArrowLeft || keys.KeyA) {
    player.vx = -player.speed;
    player.facing = -1;
  } else if (keys.ArrowRight || keys.KeyD) {
    player.vx = player.speed;
    player.facing = 1;
  } else {
    player.vx *= 0.73;
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }

  if ((keys.ArrowUp || keys.KeyW || keys.Space) && player.onGround) {
    player.vy = -player.jumpPower;
    player.onGround = false;
  }

  if ((keys.KeyJ || keys.KeyK) && !keys.lockShoot) {
    shoot();
    keys.lockShoot = true;
  }
}

function update(delta) {
  if (state.gameOver) {
    if (keys.Enter) {
      resetGame();
    }
    return;
  }

  state.distance += 2.5 * delta;
  state.score += 0.25 * delta;
  state.enemyTimer -= delta;
  player.shootCooldown = Math.max(0, player.shootCooldown - delta * 16.7);

  handleInput();

  player.vy += 0.65 * delta;
  player.x += player.vx * delta;
  player.y += player.vy * delta;

  if (player.y + player.h >= groundY) {
    player.y = groundY - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  player.x = Math.max(20, Math.min(state.width - player.w - 20, player.x));

  if (state.enemyTimer <= 0) {
    spawnEnemy();
    state.enemyTimer = 60 + Math.random() * 40;
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.x += bullet.vx * delta;
    bullet.life -= delta;

    if (bullet.life <= 0 || bullet.x < -20 || bullet.x > state.width + 20) {
      bullets.splice(i, 1);
      continue;
    }

    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      const bx = bullet.x;
      const by = bullet.y;
      const hitX = bx + bullet.r > enemy.x && bx - bullet.r < enemy.x + enemy.w;
      const hitY = by + bullet.r > enemy.y && by - bullet.r < enemy.y + enemy.h;

      if (hitX && hitY) {
        bullets.splice(i, 1);
        enemy.hp -= 1;
        addParticles(bullet.x, bullet.y, '#fbbf24');

        if (enemy.hp <= 0) {
          enemies.splice(j, 1);
          state.score += 25;
          addParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#38bdf8');
        }
        break;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    enemy.x += enemy.vx * delta;
    if (enemy.type === 'flyer') {
      enemy.y += Math.sin((state.distance + enemy.bob) * 0.1) * 0.5;
    }

    const hit =
      player.x < enemy.x + enemy.w &&
      player.x + player.w > enemy.x &&
      player.y < enemy.y + enemy.h &&
      player.y + player.h > enemy.y;

    if (hit) {
      enemies.splice(i, 1);
      player.hp -= 1;
      player.x -= 30 * player.facing;
      addParticles(player.x + player.w / 2, player.y + player.h / 2, '#f87171');

      if (player.hp <= 0) {
        state.gameOver = true;
        state.best = Math.max(state.best, state.score);
        localStorage.setItem('side-runner-best', Math.floor(state.best));
        noticeEl.textContent = `Game Over! Press Enter to retry. Final score: ${Math.floor(state.score)}`;
      } else {
        noticeEl.textContent = 'Hit! Keep going!';
      }
      updateHud();
      break;
    }

    if (enemy.x + enemy.w < -80) {
      enemies.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.life -= delta;
    if (p.life <= 0) particles.splice(i, 1);
  }

  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('side-runner-best', Math.floor(state.best));
  }

  updateHud();
}

function drawBackground() {
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(0, 0, state.width, state.height);

  const offset = (state.distance * 0.5) % state.width;
  ctx.fillStyle = '#93c5fd';
  for (let x = -offset; x < state.width + 100; x += 120) {
    ctx.beginPath();
    ctx.moveTo(x, state.height);
    ctx.lineTo(x + 55, 250);
    ctx.lineTo(x + 110, state.height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#86efac';
  for (let x = -offset * 1.8; x < state.width + 120; x += 180) {
    ctx.beginPath();
    ctx.moveTo(x, state.height);
    ctx.lineTo(x + 80, 180);
    ctx.lineTo(x + 160, state.height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround() {
  ctx.fillStyle = '#166534';
  ctx.fillRect(0, groundY, state.width, state.height - groundY);

  ctx.fillStyle = '#14532d';
  for (let x = -((state.distance * 2) % tileSize); x < state.width + tileSize; x += tileSize) {
    ctx.fillRect(x, groundY, tileSize - 2, 16);
  }
}

function drawPlayer() {
  ctx.fillStyle = '#f97316';
  ctx.fillRect(player.x, player.y, player.w, player.h);

  const gunX = player.x + player.w / 2 + player.facing * 16;
  const gunY = player.y + 16;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(gunX, gunY, 12, 6);

  ctx.fillStyle = '#111827';
  ctx.fillRect(player.x + 8, player.y + 10, 6, 6);
  ctx.fillRect(player.x + player.w - 14, player.y + 10, 6, 6);
}

function drawEnemy(enemy) {
  ctx.fillStyle = enemy.type === 'walker' ? '#ef4444' : '#a855f7';
  ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
}

function drawBullet(bullet) {
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(bullet.x, bullet.y, bullet.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life / 40);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.clearRect(0, 0, state.width, state.height);
  drawBackground();
  drawGround();

  for (const bullet of bullets) drawBullet(bullet);
  for (const enemy of enemies) drawEnemy(enemy);
  drawPlayer();
  drawParticles();

  if (state.gameOver) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
    ctx.fillRect(0, 0, state.width, state.height);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', state.width / 2, state.height / 2 - 10);
    ctx.font = '20px sans-serif';
    ctx.fillText('Press Enter to restart', state.width / 2, state.height / 2 + 28);
  }
}

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - state.lastTime) / 16.666, 2.2) || 1;
  state.lastTime = timestamp;
  update(delta);
  draw();
  requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;

  if (event.code === 'Space') {
    event.preventDefault();
  }

  if (event.code === 'KeyJ' || event.code === 'KeyK') {
    keys.lockShoot = false;
  }

  if (event.code === 'Enter' && state.gameOver) {
    resetGame();
  }
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
  if (event.code === 'KeyJ' || event.code === 'KeyK') {
    keys.lockShoot = false;
  }
});

resetGame();
requestAnimationFrame(gameLoop);
