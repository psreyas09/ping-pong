// === Settings ===
const BASE_WIDTH = 700, BASE_HEIGHT = 420;
const PADDLE_WIDTH = 16, PADDLE_HEIGHT = 100, PADDLE_RADIUS = 16;
const BALL_RADIUS = 15;
const PLAYER_X = 22;
const AI_X = BASE_WIDTH - PADDLE_WIDTH - 22;
const AI_COLOR = "#f0f";
const PLAYER_COLOR = "#0ff";
const TRAIL_COLOR = "#11fff750";
const MIDLINE_COLOR = "#0ff7";
const SHADOW_COLOR = "#0ff";
const BG_GRADIENTS = [
    ["#0ff8", "#232960", "#f0f8"],
    ["#fa00ff77", "#0ff8", "#222a"],
    ["#00ffe0", "#181f2a", "#ff00c8"],
];
const MAX_SCORE = 7;
const AI_SPEED = 4.2;
const BALL_BASE_SPEED = 6;
const SOUND_VOLUME = 0.28;

const canvas = document.getElementById('pong');
const ctx = canvas.getContext('2d');
let cw = BASE_WIDTH, ch = BASE_HEIGHT;

// Sound elements
const hitSound = document.getElementById("hitSound");
const wallSound = document.getElementById("wallSound");
const scoreSound = document.getElementById("scoreSound");
[hitSound, wallSound, scoreSound].forEach(a => a.volume = SOUND_VOLUME);

// Game state
let playerY, aiY, ballX, ballY, ballSpeedX, ballSpeedY, playerScore, aiScore;
let running = false, waiting = true, winner = "";
let flashScore = 0, flashAlpha = 0;
let ballTrail = [];
let lastTouchY = null;

// Responsive resize
function resizeCanvas() {
    // Keep aspect ratio
    const w = window.innerWidth * 0.98;
    const h = window.innerHeight * 0.70;
    let scale = Math.min(w / BASE_WIDTH, h / BASE_HEIGHT, 1);
    cw = BASE_WIDTH * scale;
    ch = BASE_HEIGHT * scale;
    canvas.width = cw;
    canvas.height = ch;
}
window.addEventListener("resize", resizeCanvas);

// Utils for scaling to canvas size
function sx(x) { return x * cw / BASE_WIDTH; }
function sy(y) { return y * ch / BASE_HEIGHT; }

// Background animation
let bgTime = 0, gradIdx = 0;
function drawBackground() {
    bgTime += 0.005;
    // Animated gradient
    gradIdx = Math.floor(bgTime) % BG_GRADIENTS.length;
    let nextGradIdx = (gradIdx+1) % BG_GRADIENTS.length;
    let t = bgTime % 1;
    let grad = ctx.createLinearGradient(
        0, 0,
        cw, ch * (0.6 + 0.4 * Math.sin(bgTime/2))
    );
    for (let i=0; i<3; ++i) {
        let from = hexToRgbA(BG_GRADIENTS[gradIdx][i], 1-t);
        let to   = hexToRgbA(BG_GRADIENTS[nextGradIdx][i], t);
        grad.addColorStop(i/2, blendColors(from, to, t));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,cw,ch);

    // Center dashed line
    ctx.save();
    ctx.setLineDash([sx(18), sx(18)]);
    ctx.strokeStyle = MIDLINE_COLOR;
    ctx.lineWidth = sx(4);
    ctx.globalAlpha = 0.42 + 0.18 * Math.sin(bgTime*2);
    ctx.beginPath();
    ctx.moveTo(cw/2, 0);
    ctx.lineTo(cw/2, ch);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
}

// Helper for blending two rgba strings
function hexToRgbA(hex, alpha=1) {
    // Accepts #f0f, #ff00ff, #ff00ff88
    let h = hex.replace('#','');
    if (h.length === 3) h = h.split('').map(x=>x+x).join('');
    let bigint = parseInt(h.substring(0,6), 16);
    let r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
    let a = (h.length === 8) ? parseInt(h.substring(6,8),16)/255 : alpha;
    return `rgba(${r},${g},${b},${a})`;
}
function blendColors(a, b, t) {
    a = a.match(/\d+(\.\d+)?/g).map(Number);
    b = b.match(/\d+(\.\d+)?/g).map(Number);
    return `rgba(${Math.round(a[0] + (b[0]-a[0])*t)},${Math.round(a[1] + (b[1]-a[1])*t)},${Math.round(a[2] + (b[2]-a[2])*t)},${(a[3] + (b[3]-a[3])*t).toFixed(2)})`;
}

// Drawing
function drawPaddle(x, y, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = sx(18);
    ctx.beginPath();
    ctx.roundRect(sx(x), sy(y), sx(PADDLE_WIDTH), sy(PADDLE_HEIGHT), sx(PADDLE_RADIUS));
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.restore();
}
function drawBall(x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx(x), sy(y), sx(BALL_RADIUS), 0, Math.PI*2);
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = sx(16);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
}
function drawTrail() {
    for (let i=0; i<ballTrail.length; i++) {
        let t = i / ballTrail.length;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sx(ballTrail[i][0]), sy(ballTrail[i][1]), sx(BALL_RADIUS)*(0.45+0.38*t), 0, Math.PI*2);
        ctx.globalAlpha = 0.23 * (1-t);
        ctx.fillStyle = TRAIL_COLOR;
        ctx.shadowColor = "#0ff";
        ctx.shadowBlur = sx(8 * (1-t));
        ctx.fill();
        ctx.restore();
    }
}
function drawScore() {
    ctx.save();
    ctx.font = `bold ${sx(38)}px 'Segoe UI', Arial`;
    ctx.textAlign = "center";
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = sx(13);
    // Score flash effect
    ctx.globalAlpha = 1 - flashAlpha;
    ctx.fillStyle = "#fff";
    ctx.fillText(playerScore, cw/4, sy(54));
    ctx.fillText(aiScore, cw*3/4, sy(54));
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = flashScore < 0 ? "#f0f" : "#0ff";
    ctx.fillText(flashScore<0?aiScore:playerScore, flashScore<0?cw*3/4:cw/4, sy(54));
    ctx.restore();
}

function drawStartScreen() {
    ctx.save();
    ctx.font = `bold ${sx(48)}px 'Segoe UI', Arial`;
    ctx.textAlign = "center";
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = sx(30);
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = "#fff";
    ctx.fillText("PONG", cw/2, ch/2 - sy(44));
    ctx.font = `bold ${sx(24)}px 'Segoe UI', Arial`;
    ctx.shadowBlur = sx(10);
    ctx.globalAlpha = 0.88;
    ctx.fillText("Move your paddle with mouse or touch", cw/2, ch/2 + sy(2));
    ctx.globalAlpha = 0.78;
    ctx.fillText("Click or tap to start", cw/2, ch/2 + sy(40));
    ctx.restore();
}

function drawWinScreen() {
    ctx.save();
    ctx.font = `bold ${sx(38)}px 'Segoe UI', Arial`;
    ctx.textAlign = "center";
    ctx.shadowColor = "#0ff";
    ctx.shadowBlur = sx(16);
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = winner === "player" ? PLAYER_COLOR : AI_COLOR;
    ctx.fillText(winner === "player" ? "You Win!" : "AI Wins!", cw/2, ch/2 - sy(16));
    ctx.font = `bold ${sx(22)}px 'Segoe UI', Arial`;
    ctx.globalAlpha = 0.89;
    ctx.fillStyle = "#fff";
    ctx.fillText("Click or tap to play again", cw/2, ch/2 + sy(28));
    ctx.restore();
}

// Game logic
function resetBall(toAI=1) {
    ballX = BASE_WIDTH/2;
    ballY = BASE_HEIGHT/2;
    let angle = (Math.random()*0.6-0.3)+ (toAI<0?Math.PI:0);
    let speed = BALL_BASE_SPEED + Math.random()*2;
    ballSpeedX = speed * Math.cos(angle) * toAI;
    ballSpeedY = speed * Math.sin(angle);
    ballTrail = [];
}
function resetGame() {
    playerY = (BASE_HEIGHT - PADDLE_HEIGHT) / 2;
    aiY = (BASE_HEIGHT - PADDLE_HEIGHT) / 2;
    playerScore = 0;
    aiScore = 0;
    running = false;
    waiting = true;
    winner = "";
    flashScore = 0;
    flashAlpha = 0;
    resetBall(Math.random()>0.5?1:-1);
}
function startGame() {
    running = true;
    waiting = false;
    winner = "";
    flashScore = 0;
    flashAlpha = 0;
    resetBall(Math.random()>0.5?1:-1);
}

function update() {
    if (!running) return;
    // Ball move
    ballX += ballSpeedX;
    ballY += ballSpeedY;

    // Add to trail
    ballTrail.unshift([ballX, ballY]);
    if (ballTrail.length > 14) ballTrail.pop();

    // Wall collision
    if (ballY - BALL_RADIUS <= 0 || ballY + BALL_RADIUS >= BASE_HEIGHT) {
        ballSpeedY *= -1;
        wallSound.currentTime = 0; wallSound.play();
        if (ballY - BALL_RADIUS <= 0) ballY = BALL_RADIUS;
        if (ballY + BALL_RADIUS >= BASE_HEIGHT) ballY = BASE_HEIGHT - BALL_RADIUS;
    }

    // Player paddle collision
    if (
        ballX - BALL_RADIUS <= PLAYER_X + PADDLE_WIDTH &&
        ballY + BALL_RADIUS >= playerY &&
        ballY - BALL_RADIUS <= playerY + PADDLE_HEIGHT
    ) {
        ballSpeedX = Math.abs(ballSpeedX) * 1.022;
        let collidePoint = (ballY - (playerY + PADDLE_HEIGHT/2)) / (PADDLE_HEIGHT/2);
        ballSpeedY = collidePoint * 7.8 + Math.random()*0.7-0.35;
        hitSound.currentTime = 0; hitSound.play();
        ballX = PLAYER_X + PADDLE_WIDTH + BALL_RADIUS + 0.1;
    }

    // AI paddle collision
    if (
        ballX + BALL_RADIUS >= AI_X &&
        ballY + BALL_RADIUS >= aiY &&
        ballY - BALL_RADIUS <= aiY + PADDLE_HEIGHT
    ) {
        ballSpeedX = -Math.abs(ballSpeedX) * 1.022;
        let collidePoint = (ballY - (aiY + PADDLE_HEIGHT/2)) / (PADDLE_HEIGHT/2);
        ballSpeedY = collidePoint * 7.8 + Math.random()*0.7-0.35;
        hitSound.currentTime = 0; hitSound.play();
        ballX = AI_X - BALL_RADIUS - 0.1;
    }

    // Score
    if (ballX < 0) {
        aiScore++;
        flashScore = -1; flashAlpha = 1;
        scoreSound.currentTime = 0; scoreSound.play();
        if (aiScore >= MAX_SCORE) {
            winner = "ai";
            running = false;
            setTimeout(()=>{waiting=true;}, 800);
        }
        resetBall(-1);
    } else if (ballX > BASE_WIDTH) {
        playerScore++;
        flashScore = 1; flashAlpha = 1;
        scoreSound.currentTime = 0; scoreSound.play();
        if (playerScore >= MAX_SCORE) {
            winner = "player";
            running = false;
            setTimeout(()=>{waiting=true;}, 800);
        }
        resetBall(1);
    }

    // AI paddle movement
    let aiCenter = aiY + PADDLE_HEIGHT/2;
    if (ballY < aiCenter - 14) aiY -= AI_SPEED;
    else if (ballY > aiCenter + 14) aiY += AI_SPEED;
    // Clamp AI
    aiY = Math.max(0, Math.min(aiY, BASE_HEIGHT - PADDLE_HEIGHT));
    // Clamp player
    playerY = Math.max(0, Math.min(playerY, BASE_HEIGHT - PADDLE_HEIGHT));
}

function animate() {
    resizeCanvas();
    drawBackground();
    drawTrail();
    drawPaddle(PLAYER_X, playerY, PLAYER_COLOR);
    drawPaddle(AI_X, aiY, AI_COLOR);
    drawBall(ballX, ballY);
    if (flashAlpha > 0) flashAlpha -= 0.07;
    drawScore();
    if (waiting && !running) {
        if (winner) drawWinScreen();
        else drawStartScreen();
    }
    update();
    requestAnimationFrame(animate);
}

// Mouse and touch controls
canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    let mouseY = (e.clientY - rect.top) * BASE_HEIGHT / ch;
    playerY = mouseY - PADDLE_HEIGHT / 2;
});
canvas.addEventListener('mousedown', function() {
    if (waiting) {
        if (winner) resetGame();
        startGame();
    }
    canvas.focus();
});
canvas.addEventListener('touchstart', function(e){
    if (waiting) {
        if (winner) resetGame();
        startGame();
    }
    if (e.touches.length) {
        const rect = canvas.getBoundingClientRect();
        let y = (e.touches[0].clientY - rect.top) * BASE_HEIGHT / ch;
        lastTouchY = y - PADDLE_HEIGHT / 2;
        playerY = lastTouchY;
    }
}, {passive:false});
canvas.addEventListener('touchmove', function(e){
    if (e.touches.length) {
        const rect = canvas.getBoundingClientRect();
        let y = (e.touches[0].clientY - rect.top) * BASE_HEIGHT / ch;
        playerY = y - PADDLE_HEIGHT / 2;
        lastTouchY = playerY;
    }
}, {passive:false});
canvas.addEventListener('touchend', function(e){
    lastTouchY = null;
}, {passive:false});

// Keyboard restart
window.addEventListener('keydown', function(e){
    if ((e.key === ' ' || e.key.toLowerCase() === 'r') && waiting) {
        if (winner) resetGame();
        startGame();
    }
});

// Initialize and run
function init() {
    resetGame();
    resizeCanvas();
    animate();
}
init();