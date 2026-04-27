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

// --- SISTEMA DE ÁUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgMusic = new Audio();
bgMusic.loop = true;
bgMusic.volume = 0.4;
bgMusic.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"; 

function playShootSound() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.1);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.1);
}

// --- VARIÁVEIS GLOBAIS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let playerName = "";
let gameState = 'LOGIN';
let currentWave = 1;

let saveData = { 
  playerName: null, 
  uid: null, 
  highScore: 0, 
  totalCoins: 0, 
  magnetLevel: 0, 
  maxHealth: 3, 
  fireRateLevel: 0, 
  bonusTimeLevel: 0,
  damageLevel: 1, 
  unlockedSkins: ['#3498db'], 
  currentSkin: '#3498db' 
};

let player, enemies = [], bullets = [], coins = [], doubleItems = [], currentScore = 0, sessionCoins = 0, lastShot = 0, bonusTimer = 0;

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

// --- LOGIN E FIREBASE (RESTALRADO COMPLETO) ---
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
    bgMusic.play().catch(e => console.log("Áudio aguardando interação"));
  } catch (error) {
    console.error(error);
    alert("Erro ao conectar.");
    btn.disabled = false;
  }
}

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

// --- UI E LOJA (RESTAURADO) ---
function updateMenuUI() {
  const nameDisplay = document.getElementById('display-player-name');
  if (nameDisplay) nameDisplay.textContent = `COMANDANTE: ${playerName || 'Jogador'}`;

  document.getElementById('menu-stats').textContent = `Recorde: ${saveData.highScore} | Créditos: ${saveData.totalCoins}`;
  document.getElementById('shop-coins-val').textContent = saveData.totalCoins;
  
  document.getElementById('magnet-status').textContent = `Ímã Nível: ${saveData.magnetLevel}`;
  document.getElementById('fire-status').textContent = `Nível: ${saveData.fireRateLevel}/10`;
  document.getElementById('health-status').textContent = `Máximo: ${saveData.maxHealth}/50`;
  document.getElementById('damage-status').textContent = `Dano: ${saveData.damageLevel}`;

  document.getElementById('btn-buy-magnet').textContent = `Upar (${100 + (saveData.magnetLevel * 200)})`;
  document.getElementById('btn-buy-damage').textContent = `Upar (${saveData.damageLevel * 500})`;
  
  const btnFire = document.getElementById('btn-buy-fire');
  if(saveData.fireRateLevel >= 10) { 
    btnFire.textContent = "MAX"; 
    btnFire.disabled = true; 
  } else { 
    btnFire.textContent = `Upar (${150 + (saveData.fireRateLevel * 250)})`; 
    btnFire.disabled = false; 
  }

  document.querySelectorAll('.skin-dot').forEach(dot => {
    dot.classList.remove('active');
    const color = dot.style.backgroundColor;
    if (rgbToHex(color) === saveData.currentSkin || color === saveData.currentSkin) {
      dot.classList.add('active');
    }
  });
}

function rgbToHex(rgb) {
  if (!rgb || rgb.startsWith('#')) return rgb;
  const parts = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!parts) return rgb;
  const hex = (x) => ("0" + parseInt(x).toString(16)).slice(-2);
  return "#" + hex(parts[1]) + hex(parts[2]) + hex(parts[3]);
}

function setSkin(color) {
  if (saveData.unlockedSkins.includes(color)) {
    saveData.currentSkin = color;
    saveToStorage();
  }
}

function buySkin(color, cost) {
  if (saveData.unlockedSkins.includes(color)) return setSkin(color);
  if (saveData.totalCoins >= cost) {
    saveData.totalCoins -= cost;
    saveData.unlockedSkins.push(color);
    saveData.currentSkin = color;
    saveToStorage();
  } else alert("Créditos insuficientes!");
}

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
function buyDamage() {
  const cost = saveData.damageLevel * 500;
  if (saveData.totalCoins >= cost) { saveData.totalCoins -= cost; saveData.damageLevel++; saveToStorage(); }
}

// --- CONTROLES JOYS ---
const moveJoy = { active: false, id: 'move-joystick', x: 0, y: 0, originX: 0, originY: 0, identifier: null };
const shootJoy = { active: false, id: 'shoot-joystick', x: 0, y: 0, originX: 0, originY: 0, identifier: null };

function setupJoy(joy) {
  const el = document.getElementById(joy.id);
  if(!el) return;
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

// --- MECÂNICAS DE JOGO ---
function initVariables() {
  resize(); // Garante o tamanho correto do canvas antes de criar o player
  player = {
    x: canvas.width/2, y: canvas.height/2, radius: 20, 
    color: saveData.currentSkin || '#3498db', speed: 5.5,
    health: saveData.maxHealth, maxHealth: saveData.maxHealth,
    invincible: false, invTimer: 0
  };
  enemies = []; bullets = []; coins = []; doubleItems = [];
  currentScore = 0; sessionCoins = 0; lastShot = Date.now(); bonusTimer = 0; currentWave = 1;
}

function startGame() {
  initVariables();
  gameState = 'PLAYING';
  document.querySelectorAll('.overlay-screen').forEach(s => s.classList.add('hidden'));
  document.getElementById('ui-hud').classList.remove('hidden');
  document.getElementById('pause-btn').classList.remove('hidden');
  document.getElementById('joysticks').classList.remove('hidden');
  bgMusic.play().catch(() => {});
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

function spawnEnemy() {
  const waveFactor = currentWave * 0.15;
  const type = Math.random();
  let enemy = {
    x: Math.random() * canvas.width, y: -30, radius: 15,
    speed: 2 + Math.random() + waveFactor,
    hp: 1 + Math.floor(currentWave / 3),
    color: '#e74c3c'
  };
  if (type < 0.15) { enemy.color = '#f1c40f'; enemy.speed *= 1.7; enemy.radius = 12; }
  else if (type > 0.9) { enemy.color = '#9b59b6'; enemy.hp *= 3; enemy.radius = 25; enemy.speed *= 0.7; }
  enemies.push(enemy);
}

// --- LOOP PRINCIPAL ---
function update() {
  if (gameState === 'PLAYING') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    currentWave = Math.floor(currentScore / 1000) + 1;

    // Movimento do Player
    if (moveJoy.active) { player.x += (moveJoy.x/45)*player.speed; player.y += (moveJoy.y/45)*player.speed; }
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    
    if (player.invincible) { player.invTimer--; if (player.invTimer <= 0) player.invincible = false; }
    if (bonusTimer > 0) bonusTimer--;

    // Lógica de Tiro
    const now = Date.now();
    let fr = 150 - (saveData.fireRateLevel * 12); 
    if (shootJoy.active && (Math.abs(shootJoy.x) > 5 || Math.abs(shootJoy.y) > 5)) {
      if (now - lastShot > fr) {
        const a = Math.atan2(shootJoy.y, shootJoy.x);
        bullets.push({x: player.x, y: player.y, dx: Math.cos(a)*13, dy: Math.sin(a)*13, radius: 5, color: '#fff'});
        playShootSound(); lastShot = now;
      }
    }

    // Gerenciamento de Spawns
    if (Math.random() < (0.02 + (currentWave * 0.005))) spawnEnemy();
    if (Math.random() < 0.0015) spawnItemPack(20);
    if (Math.random() < 0.001) doubleItems.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, radius: 18, color: '#2ecc71', life: 600 });

    // Atualização e Desenho de Entidades
    bullets.forEach((b, bi) => {
      b.x += b.dx; b.y += b.dy;
      if(b.x < -10 || b.x > canvas.width + 10 || b.y < -10 || b.y > canvas.height + 10) bullets.splice(bi, 1);
      drawCirc(b);
    });

    enemies.forEach((e, ei) => {
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      e.x += Math.cos(a)*e.speed; e.y += Math.sin(a)*e.speed;
      
      // Colisão Inimigo x Player
      if(Math.hypot(player.x-e.x, player.y-e.y) < player.radius+e.radius && !player.invincible) {
        player.health--; player.invincible = true; player.invTimer = 60;
        if(player.health <= 0) triggerGameOver();
      }

      // Colisão Tiro x Inimigo
      bullets.forEach((b, bi) => {
        if(Math.hypot(b.x-e.x, b.y-e.y) < b.radius+e.radius) {
          e.hp -= saveData.damageLevel;
          bullets.splice(bi, 1);
          if(e.hp <= 0) {
            currentScore += 10 * currentWave;
            if(Math.random() < 0.3) coins.push({x: e.x, y: e.y, radius: 8, color: '#f1c40f'});
            enemies.splice(ei, 1);
          }
        }
      });
      drawCirc(e);
    });

    // Lógica de Moedas e Ímã
    coins.forEach((c, ci) => {
      const d = Math.hypot(player.x-c.x, player.y-c.y);
      if(saveData.magnetLevel > 0 && d < 100 + (saveData.magnetLevel * 40)) {
        const a = Math.atan2(player.y-c.y, player.x-c.x);
        c.x += Math.cos(a)*9; c.y += Math.sin(a)*9;
      }
      if(d < player.radius + c.radius) { sessionCoins += (bonusTimer > 0 ? 2 : 1); coins.splice(ci, 1); }
      drawCirc(c);
    });

    // Itens de Bônus (X2)
    doubleItems.forEach((item, ii) => {
      item.life--; if(item.life <= 0) doubleItems.splice(ii, 1);
      if(Math.hypot(player.x - item.x, player.y - item.y) < player.radius + item.radius) {
        bonusTimer = 600; doubleItems.splice(ii, 1);
      }
      ctx.shadowBlur = 15; ctx.shadowColor = item.color;
      drawCirc(item);
      ctx.shadowBlur = 0;
    });

    // Desenho do Jogador (Player)
    if(!player.invincible || player.invTimer % 10 < 5) {
      ctx.save();
      ctx.shadowBlur = 15; ctx.shadowColor = player.color;
      drawCirc(player);
      ctx.beginPath(); ctx.arc(player.x, player.y, player.radius/2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
      ctx.restore();
    }

    updateHUD();
  }
  requestAnimationFrame(update);
}

// AUXILIARES
function updateHUD() {
  document.getElementById('wave-display').textContent = `WAVE ${currentWave}`;
  document.getElementById('health-display').textContent = `INTEGRIDADE: ${Math.max(0, Math.floor((player.health/player.maxHealth)*100))}%`;
  document.getElementById('score-display').textContent = `SCORE: ${currentScore}`;
  document.getElementById('coins-display').textContent = `CRÉDITOS: ${sessionCoins}`;
  document.getElementById('bonus-display').style.display = bonusTimer > 0 ? 'block' : 'none';
}

function drawCirc(o) { ctx.beginPath(); ctx.arc(o.x, o.y, o.radius, 0, Math.PI*2); ctx.fillStyle = o.color; ctx.fill(); ctx.closePath(); }
function toggleScreen(id) { document.querySelectorAll('.overlay-screen').forEach(s => s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); updateMenuUI(); }
function pauseGame() { gameState = 'PAUSED'; document.getElementById('pause-screen').classList.remove('hidden'); bgMusic.pause(); }
function resumeGame() { gameState = 'PLAYING'; document.getElementById('pause-screen').classList.add('hidden'); bgMusic.play(); }

async function triggerGameOver() {
  gameState = 'GAMEOVER'; bgMusic.pause();
  saveData.totalCoins += sessionCoins;
  if (currentScore > saveData.highScore) saveData.highScore = currentScore;
  saveToStorage();
  document.getElementById('gameover-stats').innerHTML = `Pontuação: ${currentScore}<br>Moedas: ${sessionCoins}`;
  document.getElementById('gameover-screen').classList.remove('hidden');
  await saveOnlineData();
}

function changeName() { if(confirm("Isso irá resetar seu login local. Continuar?")) { localStorage.clear(); location.reload(); } }

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if(player) {
    player.x = Math.min(player.x, canvas.width);
    player.y = Math.min(player.y, canvas.height);
  }
}

window.addEventListener('resize', resize);
resize(); loadData(); update();
