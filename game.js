// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyC7ReGE08WxIWizl_LFCZfi--lX0pC9puM",
  authDomain: "fps-for.firebaseapp.com",
  projectId: "fps-for",
  storageBucket: "fps-for.firebasestorage.app",
  messagingSenderId: "1060982063527",
  appId: "1:1060982063527:web:98ea23b2569cea849ff682"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- VARIÁVEIS GLOBAIS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let playerName = "";
let gameState = 'LOGIN';

let saveData = { 
  playerName: null, uid: null, highScore: 0, totalCoins: 0, 
  magnetLevel: 0, maxHealth: 3, fireRateLevel: 0, bonusTimeLevel: 0 
};

let player, enemies, bullets, coins, currentScore, sessionCoins, lastShot = 0;
let doubleItems = []; 
let bonusTimer = 0;   

// --- SISTEMA DE LOGIN ---
async function saveInitialName() {
  const inputEl = document.getElementById('player-name-input');
  const nameInput = inputEl.value.trim();
  const btn = document.getElementById('btn-login');
  
  if (nameInput.length < 3 || nameInput.length > 15) {
    alert("Nome deve ter entre 3 e 15 caracteres!");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Conectando...";

  try {
    if (!saveData.uid) saveData.uid = "u_" + Math.random().toString(36).substr(2, 9) + Date.now();
    const nameLower = nameInput.toLowerCase();
    const userRef = db.collection("users").doc(nameLower);
    const doc = await userRef.get();

    if (doc.exists && doc.data().uid !== saveData.uid) {
      alert("Este nome já pertence a outro jogador!");
      btn.disabled = false;
      btn.textContent = "ENTRAR";
      return;
    }

    await userRef.set({ uid: saveData.uid, displayName: nameInput, lastActive: Date.now() });
    playerName = nameInput;
    saveData.playerName = playerName;
    saveToStorage();

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    gameState = 'MENU';
  } catch (error) {
    alert("Erro ao conectar.");
    btn.disabled = false;
  }
}

// --- RANKING E RESET ---
async function saveOnlineData() {
  if (!saveData.uid || !playerName) return;
  try {
    const scoreRef = db.collection("leaderboard").doc(saveData.uid);
    await scoreRef.set({
      name: playerName,
      score: saveData.highScore,
      coins: saveData.totalCoins,
      uid: saveData.uid,
      date: Date.now()
    }, { merge: true });
  } catch (e) { console.error("Erro Ranking:", e); }
}

async function resetData() {
  if (confirm("Deseja apagar tudo? Isso removerá você do Ranking Global também!")) {
    try {
      if (saveData.uid) {
        await db.collection("leaderboard").doc(saveData.uid).delete();
        if(playerName) await db.collection("users").doc(playerName.toLowerCase()).delete();
      }
      localStorage.clear();
      location.reload();
    } catch (e) { console.error("Erro ao resetar:", e); }
  }
}

async function loadLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = "Carregando...";
  try {
    const snapshot = await db.collection("leaderboard").orderBy("score", "desc").limit(10).get();
    tbody.innerHTML = "";
    let i = 1;
    snapshot.forEach(doc => {
      const data = doc.data();
      tbody.innerHTML += `<tr><td>${i}º</td><td>${data.name}</td><td>${data.score}</td></tr>`;
      i++;
    });
  } catch (e) { tbody.innerHTML = "Erro ao carregar."; }
}

// --- PERSISTÊNCIA ---
const loadData = () => {
  const saved = localStorage.getItem('fpsForAllData');
  if (saved) {
    saveData = { ...saveData, ...JSON.parse(saved) };
    if (saveData.playerName && saveData.uid) {
      playerName = saveData.playerName;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('menu-screen').classList.remove('hidden');
      gameState = 'MENU';
    }
  }
  updateMenuUI();
};

const saveToStorage = () => {
  localStorage.setItem('fpsForAllData', JSON.stringify(saveData));
  updateMenuUI();
};

function changeName() {
  if(confirm("Deseja trocar de nome?")) {
    saveData.playerName = null;
    saveToStorage();
    location.reload();
  }
}

function toggleScreen(screenId) {
  document.querySelectorAll('.overlay-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(screenId).classList.remove('hidden');
}

// --- UI E LOJA ---
function updateMenuUI() {
  // Exibe o nome do jogador abaixo do título MENU
  const nameDisplay = document.getElementById('display-player-name');
  if (nameDisplay) nameDisplay.textContent = `Olá, ${playerName || 'Jogador'}`;

  document.getElementById('menu-stats').textContent = `Recorde: ${saveData.highScore} | Moedas: ${saveData.totalCoins}`;
  document.getElementById('shop-coins-val').textContent = saveData.totalCoins;
  
  const magnetCost = 100 + (saveData.magnetLevel * 200);
  const fireCost = 150 + (saveData.fireRateLevel * 250);
  const healthReq = 500 + ((saveData.maxHealth - 3) * 1000);
  const bonusTimeCost = 200 + (saveData.bonusTimeLevel * 300);

  document.getElementById('magnet-status').textContent = `Nível: ${saveData.magnetLevel}`;
  document.getElementById('fire-status').textContent = `Nível: ${saveData.fireRateLevel}/10`;
  document.getElementById('health-status').textContent = `Máximo: ${saveData.maxHealth}/50`;
  document.getElementById('bonus-time-status').textContent = `Nível: ${saveData.bonusTimeLevel}`;

  document.getElementById('btn-buy-magnet').textContent = `Upar (${magnetCost})`;
  const btnFire = document.getElementById('btn-buy-fire');
  if(saveData.fireRateLevel >= 10) { btnFire.textContent = "MAX"; btnFire.disabled = true; }
  else { btnFire.textContent = `Upar (${fireCost})`; btnFire.disabled = false; }

  const btnHealth = document.getElementById('btn-buy-health');
  if(saveData.maxHealth >= 50) { btnHealth.textContent = "MAX"; btnHealth.disabled = true; }
  else { btnHealth.textContent = `Upar (${healthReq} Recorde)`; btnHealth.disabled = false; }
  document.getElementById('btn-buy-bonus-time').textContent = `Upar (${bonusTimeCost})`;
}

// Funções de Compra da Loja
function buyMagnet() {
  const cost = 100 + (saveData.magnetLevel * 200);
  if (saveData.totalCoins >= cost) { saveData.totalCoins -= cost; saveData.magnetLevel++; saveToStorage(); }
}
function buyFireRate() {
  const cost = 150 + (saveData.fireRateLevel * 250);
  if (saveData.totalCoins >= cost && saveData.fireRateLevel < 10) { saveData.totalCoins -= cost; saveData.fireRateLevel++; saveToStorage(); }
}
function buyHealthUpgrade() {
  const req = 500 + ((saveData.maxHealth - 3) * 1000);
  if (saveData.highScore >= req && saveData.maxHealth < 50) { saveData.maxHealth++; saveToStorage(); }
}
function buyBonusTime() {
  const cost = 200 + (saveData.bonusTimeLevel * 300);
  if (saveData.totalCoins >= cost) { saveData.totalCoins -= cost; saveData.bonusTimeLevel++; saveToStorage(); }
}

// --- MECÂNICAS ---
function initVariables() {
  player = {
    x: canvas.width/2, y: canvas.height/2, radius: 20, color: '#3498db', speed: 5.5,
    health: saveData.maxHealth, maxHealth: saveData.maxHealth,
    invincible: false, invTimer: 0
  };
  enemies = []; bullets = []; coins = []; doubleItems = [];
  currentScore = 0; sessionCoins = 0; lastShot = Date.now(); bonusTimer = 0;
  updateHUD();
}

function startGame() {
  initVariables();
  gameState = 'PLAYING';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('ui-hud').classList.remove('hidden');
  document.getElementById('pause-btn').classList.remove('hidden');
  document.getElementById('joysticks').classList.remove('hidden');
}

function pauseGame() {
  if(gameState === 'PLAYING') {
    gameState = 'PAUSED';
    document.getElementById('pause-screen').classList.remove('hidden');
  }
}

function resumeGame() {
  gameState = 'PLAYING';
  document.getElementById('pause-screen').classList.add('hidden');
}

// TELA DE GAME OVER
async function triggerGameOver() {
  gameState = 'GAMEOVER';
  saveData.totalCoins += sessionCoins;
  let isNewRecord = false;
  if (currentScore > saveData.highScore) {
    saveData.highScore = currentScore;
    isNewRecord = true;
  }
  saveToStorage();

  const statsDiv = document.getElementById('gameover-stats');
  statsDiv.innerHTML = `
    <p>Pontuação Final: <strong>${currentScore}</strong> ${isNewRecord ? '<br><span style="color: #f1c40f;">(NOVO RECORDE!)</span>' : ''}</p>
    <p>Moedas nesta partida: <strong>${sessionCoins}</strong></p>
    <p id="save-status" style="font-size: 0.8rem; color: #bdc3c7;">Sincronizando com o ranking...</p>
  `;

  document.getElementById('ui-hud').classList.add('hidden');
  document.getElementById('pause-btn').classList.add('hidden');
  document.getElementById('joysticks').classList.add('hidden');
  document.getElementById('gameover-screen').classList.remove('hidden');

  await saveOnlineData();
  const status = document.getElementById('save-status');
  if(status) { status.textContent = "✓ Pontuação Sincronizada!"; status.style.color = "#2ecc71"; }
}

function quitGame() {
  if(confirm("Deseja sair? Seu progresso atual será salvo.")) triggerGameOver();
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
        const dist = Math.sqrt(dx*dx+dy*dy), max = 45;
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
        joy.active = false; joy.x = 0; joy.y = 0;
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
  const b = document.getElementById('bonus-display');
  if(bonusTimer > 0) { b.style.display='block'; b.textContent=`X2 ATIVO: ${Math.ceil(bonusTimer/60)}s`; }
  else b.style.display='none';
}

// --- LOOP PRINCIPAL ---
function update() {
  if (gameState === 'PLAYING') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Movimento Player
    if (moveJoy.active) { player.x += (moveJoy.x/45)*player.speed; player.y += (moveJoy.y/45)*player.speed; }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    
    if (player.invincible) { player.invTimer--; if (player.invTimer <= 0) player.invincible = false; }
    if(bonusTimer > 0) { bonusTimer--; if(bonusTimer % 60 === 0) updateHUD(); }

    // Mecânica de Tiro
    const now = Date.now();
    let fr = 150 - (saveData.fireRateLevel * 12); 
    if (shootJoy.active && (Math.abs(shootJoy.x) > 5 || Math.abs(shootJoy.y) > 5)) {
      if (now - lastShot > fr) {
        const a = Math.atan2(shootJoy.y, shootJoy.x);
        bullets.push({x: player.x, y: player.y, dx: Math.cos(a)*13, dy: Math.sin(a)*13, radius: 5, color: '#fff'});
        lastShot = now;
      }
    }
    bullets.forEach((b, bi) => {
      b.x += b.dx; b.y += b.dy;
      if(b.x < -10 || b.x > canvas.width + 10 || b.y < -10 || b.y > canvas.height + 10) bullets.splice(bi, 1);
    });

    // Inimigos e Colisões
    enemies.forEach((e, ei) => {
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      e.x += Math.cos(a)*e.speed; e.y += Math.sin(a)*e.speed;
      
      // Colisão Inimigo x Player
      if(Math.hypot(player.x-e.x, player.y-e.y) < player.radius+e.radius && !player.invincible) {
        player.health--; player.invincible = true; player.invTimer = 60; updateHUD();
        enemies.splice(ei, 1); 
        if(player.health <= 0) triggerGameOver();
      }

      // Colisão Inimigo x Tiro
      bullets.forEach((b, bi) => {
        if(Math.hypot(b.x-e.x, b.y-e.y) < b.radius+e.radius) {
          currentScore += 10; updateHUD();
          if(Math.random() < 0.3) coins.push({x: e.x, y: e.y, radius: 8, color: '#f1c40f'});
          enemies.splice(ei, 1); bullets.splice(bi, 1);
        }
      });
    });

    // Moedas e Ímã
    coins.forEach((c, ci) => {
      const d = Math.hypot(player.x-c.x, player.y-c.y);
      if(saveData.magnetLevel > 0 && d < 50 + (saveData.magnetLevel * 45)) {
        const a = Math.atan2(player.y-c.y, player.x-c.x);
        c.x += Math.cos(a)*9; c.y += Math.sin(a)*9;
      }
      if(d < player.radius + c.radius) { sessionCoins += (bonusTimer > 0 ? 2 : 1); updateHUD(); coins.splice(ci, 1); }
    });

    // Itens X2
    doubleItems.forEach((item, ii) => {
      item.life--; if(item.life <= 0) doubleItems.splice(ii, 1);
      if(Math.hypot(player.x - item.x, player.y - item.y) < player.radius + item.radius) {
        bonusTimer = 600 + (saveData.bonusTimeLevel * 180); doubleItems.splice(ii, 1); updateHUD();
      }
    });

    // SISTEMA DE SPAWN (Fiel ao seu original)
    if (Math.random() < (0.02 + Math.min(currentScore/10000, 0.04))) {
      enemies.push({
          x: Math.random()*canvas.width, 
          y: -30, 
          radius: 15, 
          color: '#e74c3c', 
          speed: 2 + Math.random() + Math.min(currentScore/2000, 2)
      });
    }
    if (Math.random() < 0.0015) spawnItemPack(20);
    if (Math.random() < 0.001) doubleItems.push({ 
        x: 50 + Math.random() * (canvas.width - 100), 
        y: 50 + Math.random() * (canvas.height - 100), 
        radius: 18, color: '#2ecc71', life: 600 
    });
    
    // Desenho
    enemies.forEach(e => drawCirc(e));
    bullets.forEach(b => drawCirc(b));
    coins.forEach(c => drawCirc(c));
    doubleItems.forEach(item => { ctx.shadowBlur = 10; ctx.shadowColor = item.color; drawCirc(item); ctx.shadowBlur = 0; });
    if(!player.invincible || player.invTimer % 10 < 5) drawCirc(player);
  }
  requestAnimationFrame(update);
}

function drawCirc(o) { ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI*2); ctx.fillStyle = o.color; ctx.fill(); ctx.closePath(); }
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
loadData();
update();
