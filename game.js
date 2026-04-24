const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

let gameState = 'MENU';
let saveData = { 
  highScore: 0, 
  totalCoins: 0, 
  magnetLevel: 0, 
  maxHealth: 3, 
  fireRateLevel: 0,
  bonusTimeLevel: 0 
};

// --- RESPONSIVIDADE ---
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if(player) {
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
  }
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 200));

// --- SALVAMENTO ---
const loadData = () => {
  const saved = localStorage.getItem('fpsForAllData');
  if (saved) saveData = { ...saveData, ...JSON.parse(saved) };
  updateMenuUI();
};

const saveToStorage = () => {
  localStorage.setItem('fpsForAllData', JSON.stringify(saveData));
  updateMenuUI();
};

let player, enemies, bullets, coins, currentScore, sessionCoins, lastShot = 0;
let doubleItems = []; 
let bonusTimer = 0;   

function initVariables() {
  player = {
    x: canvas.width/2, y: canvas.height/2, 
    radius: 20, color: '#3498db', speed: 5.5,
    health: saveData.maxHealth, 
    maxHealth: saveData.maxHealth,
    invincible: false, 
    invTimer: 0
  };
  enemies = []; bullets = []; coins = []; doubleItems = [];
  currentScore = 0; sessionCoins = 0; lastShot = Date.now(); bonusTimer = 0;
  updateHUD();
}

function toggleScreen(screenId) {
  document.querySelectorAll('.overlay-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
  updateMenuUI();
}

function updateMenuUI() {
  document.getElementById('menu-stats').textContent = `Recorde: ${saveData.highScore} | Total Moedas: ${saveData.totalCoins}`;
  document.getElementById('shop-coins-val').textContent = saveData.totalCoins;
  
  const magnetCost = 100 + (saveData.magnetLevel * 200);
  const fireCost = 150 + (saveData.fireRateLevel * 250);
  const healthReq = 500 + ((saveData.maxHealth - 3) * 1000);
  const bonusTimeCost = 200 + (saveData.bonusTimeLevel * 300);

  document.getElementById('magnet-status').textContent = `Nível: ${saveData.magnetLevel}`;
  document.getElementById('fire-status').textContent = `Nível: ${saveData.fireRateLevel} / 10`;
  document.getElementById('health-status').textContent = `Máximo: ${saveData.maxHealth} / 50`;
  document.getElementById('bonus-time-status').textContent = `Nível: ${saveData.bonusTimeLevel}`;

  document.getElementById('btn-buy-magnet').textContent = `Upar (${magnetCost} Moedas)`;
  
  const btnFire = document.getElementById('btn-buy-fire');
  if(saveData.fireRateLevel >= 10) { btnFire.textContent = "MAX"; btnFire.disabled = true; }
  else { btnFire.textContent = `Upar (${fireCost} Moedas)`; btnFire.disabled = false; }

  const btnHealth = document.getElementById('btn-buy-health');
  if(saveData.maxHealth >= 50) { btnHealth.textContent = "MAX"; btnHealth.disabled = true; }
  else { btnHealth.textContent = `Upar (${healthReq} Score)`; btnHealth.disabled = false; }

  document.getElementById('btn-buy-bonus-time').textContent = `Upar (${bonusTimeCost} Moedas)`;
}

// --- LOGICA DA LOJA ---
function buyMagnet() {
  const cost = 100 + (saveData.magnetLevel * 200);
  if (saveData.totalCoins >= cost) { saveData.totalCoins -= cost; saveData.magnetLevel++; saveToStorage(); }
}
function buyFireRate() {
  const cost = 150 + (saveData.fireRateLevel * 250);
  if (saveData.totalCoins >= cost && saveData.fireRateLevel < 10) { 
    saveData.totalCoins -= cost; saveData.fireRateLevel++; saveToStorage(); 
  }
}
function buyHealthUpgrade() {
  const req = 500 + ((saveData.maxHealth - 3) * 1000);
  if (saveData.highScore >= req && saveData.maxHealth < 50) { saveData.maxHealth++; saveToStorage(); }
}
function buyBonusTime() {
  const cost = 200 + (saveData.bonusTimeLevel * 300);
  if (saveData.totalCoins >= cost) { saveData.totalCoins -= cost; saveData.bonusTimeLevel++; saveToStorage(); }
}

// --- FUNÇÕES DE JOGO ---
function startGame() {
  initVariables();
  gameState = 'PLAYING';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('ui-hud').classList.remove('hidden');
  document.getElementById('pause-btn').classList.remove('hidden');
  document.getElementById('joysticks').classList.remove('hidden');
}

function pauseGame() { if(gameState === 'PLAYING') { gameState = 'PAUSED'; document.getElementById('pause-screen').classList.remove('hidden'); } }
function resumeGame() { gameState = 'PLAYING'; document.getElementById('pause-screen').classList.add('hidden'); }
function quitGame() {
  saveData.totalCoins += sessionCoins;
  if (currentScore > saveData.highScore) saveData.highScore = currentScore;
  saveToStorage();
  location.reload();
}
function resetData() { if(confirm("Apagar tudo?")) { localStorage.clear(); location.reload(); } }

// --- CONTROLES (JOYSTICKS) ---
const moveJoy = { active: false, id: 'move-joystick', x: 0, y: 0, originX: 0, originY: 0, identifier: null };
const shootJoy = { active: false, id: 'shoot-joystick', x: 0, y: 0, originX: 0, originY: 0, identifier: null };

function setupJoy(joy) {
  const el = document.getElementById(joy.id);
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    joy.active = true; joy.identifier = t.identifier;
    const r = el.getBoundingClientRect();
    joy.originX = r.left + r.width/2; joy.originY = r.top + r.height/2;
  }, {passive: false});
  window.addEventListener('touchmove', e => {
    for (let t of e.changedTouches) {
      if (joy.active && t.identifier === joy.identifier) {
        const dx = t.clientX - joy.originX, dy = t.clientY - joy.originY;
        const dist = Math.sqrt(dx*dx+dy*dy), max = 50;
        const ang = Math.atan2(dy, dx);
        if (dist > max) { joy.x = Math.cos(ang)*max; joy.y = Math.sin(ang)*max; }
        else { joy.x = dx; joy.y = dy; }
        el.querySelector('.inner').style.transform = `translate(calc(-50% + ${joy.x}px), calc(-50% + ${joy.y}px))`;
      }
    }
  }, {passive: false});
  window.addEventListener('touchend', e => {
    for (let t of e.changedTouches) {
      if (t.identifier === joy.identifier) {
        joy.active = false; joy.identifier = null; joy.x = 0; joy.y = 0;
        el.querySelector('.inner').style.transform = 'translate(-50%,-50%)';
      }
    }
  });
}
setupJoy(moveJoy); setupJoy(shootJoy);

function updateHUD() {
  document.getElementById('health-display').textContent = `Vida: ${player.health}`;
  document.getElementById('score-display').textContent = `Score: ${currentScore}`;
  document.getElementById('coins-display').textContent = `Moedas: ${sessionCoins}`;
  const bonusDiv = document.getElementById('bonus-display');
  if(bonusTimer > 0) {
    bonusDiv.style.display = 'block';
    bonusDiv.textContent = `X2 COINS: ${Math.ceil(bonusTimer / 60)}s`;
  } else { bonusDiv.style.display = 'none'; }
}

function spawnItemPack(amount) {
  const centerX = 50 + Math.random() * (canvas.width - 100);
  const centerY = 50 + Math.random() * (canvas.height - 100);
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 40; 
    coins.push({ x: centerX + Math.cos(angle) * dist, y: centerY + Math.sin(angle) * dist, radius: 8, color: '#f1c40f' });
  }
}

function spawnDoubleItem() {
  doubleItems.push({ x: 50 + Math.random() * (canvas.width - 100), y: 50 + Math.random() * (canvas.height - 100), radius: 18, color: '#2ecc71', life: 600 });
}

// --- LOOP PRINCIPAL ---
function update() {
  if (gameState === 'PLAYING') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Movimentação do Jogador
    if (moveJoy.active) {
      player.x += (moveJoy.x/50)*player.speed;
      player.y += (moveJoy.y/50)*player.speed;
    }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));

    // Lógica de Invencibilidade e Bônus
    if (player.invincible) { player.invTimer--; if (player.invTimer <= 0) player.invincible = false; }
    if(bonusTimer > 0) { bonusTimer--; if(bonusTimer % 60 === 0) updateHUD(); }

    // Lógica de Tiro (Cadência baseada no Nível)
    const now = Date.now();
    let currentFireRate = 150 - (saveData.fireRateLevel * 12); 
    if (shootJoy.active && (Math.abs(shootJoy.x) > 10 || Math.abs(shootJoy.y) > 10)) {
      if (now - lastShot > currentFireRate) {
        const a = Math.atan2(shootJoy.y, shootJoy.x);
        bullets.push({x: player.x, y: player.y, dx: Math.cos(a)*13, dy: Math.sin(a)*13, radius: 5, color: '#fff'});
        lastShot = now;
      }
    }

    bullets.forEach((b, bi) => {
      b.x += b.dx; b.y += b.dy;
      if(b.x < -10 || b.x > canvas.width + 10 || b.y < -10 || b.y > canvas.height + 10) bullets.splice(bi, 1);
    });

    // Inimigos e COLISÃO DE DANO (Original preservada)
    enemies.forEach((e, ei) => {
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      e.x += Math.cos(a)*e.speed; e.y += Math.sin(a)*e.speed;
      
      // Se tocar no player e não estiver invencível
      if(Math.hypot(player.x-e.x, player.y-e.y) < player.radius+e.radius && !player.invincible) {
        player.health--; 
        player.invincible = true; 
        player.invTimer = 60; // 1 segundo de piscar
        enemies.splice(ei, 1); 
        updateHUD();
        if(player.health <= 0) quitGame();
      }
      
      // Se for atingido por um tiro
      bullets.forEach((b, bi) => {
        if(Math.hypot(b.x-e.x, b.y-e.y) < b.radius+e.radius) {
          currentScore += 10; 
          updateHUD();
          if(Math.random() < 0.3) coins.push({x: e.x, y: e.y, radius: 8, color: '#f1c40f'});
          enemies.splice(ei, 1); bullets.splice(bi, 1);
        }
      });
    });

    // Coleta de Moedas e Ímã
    coins.forEach((c, ci) => {
      const dist = Math.hypot(player.x-c.x, player.y-c.y);
      const magnetRange = 50 + (saveData.magnetLevel * 45);
      if(saveData.magnetLevel > 0 && dist < magnetRange) {
        const a = Math.atan2(player.y-c.y, player.x-c.x);
        c.x += Math.cos(a)*9; c.y += Math.sin(a)*9;
      }
      if(dist < player.radius + c.radius) { 
        sessionCoins += (bonusTimer > 0 ? 2 : 1); 
        updateHUD(); 
        coins.splice(ci, 1); 
      }
    });

    // Item Duplicador (Tempo afetado pelo Upgrade)
    doubleItems.forEach((item, ii) => {
      item.life--;
      if(item.life <= 0) doubleItems.splice(ii, 1);
      if(Math.hypot(player.x - item.x, player.y - item.y) < player.radius + item.radius) {
        const duration = 600 + (saveData.bonusTimeLevel * 180); // 10s base + 3s por nível
        bonusTimer = duration; 
        doubleItems.splice(ii, 1); 
        updateHUD();
      }
    });

    // Spawns
    if (Math.random() < (0.02 + Math.min(currentScore/10000, 0.04))) {
      const speedBase = 2 + Math.random() + Math.min(currentScore/2000, 2);
      enemies.push({x: Math.random()*canvas.width, y: -30, radius: 15, color: '#e74c3c', speed: speedBase});
    }
    if (Math.random() < 0.0015) { spawnItemPack(25); }
    if (Math.random() < 0.001) { spawnDoubleItem(); }

    // --- DESENHO ---
    enemies.forEach(e => drawCirc(e));
    bullets.forEach(b => drawCirc(b));
    coins.forEach(c => drawCirc(c));
    doubleItems.forEach(item => {
      ctx.shadowBlur = 15; ctx.shadowColor = item.color;
      drawCirc(item); ctx.shadowBlur = 0;
    });
    
    // Efeito Visual de Dano (Piscar)
    if(!player.invincible || player.invTimer % 10 < 5) drawCirc(player);
  }
  requestAnimationFrame(update);
}

function drawCirc(o) { ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI*2); ctx.fillStyle = o.color; ctx.fill(); ctx.closePath(); }

resizeCanvas();
loadData();
update();
