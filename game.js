/**
 * ゆかりんぱっくんゲーム
 * - 左右移動でアイテムをキャッチ
 * - 毒キノコを避ける
 * - レベルアップで難易度上昇
 */

// --- アセット設定 ---
const ASSETS = {
    player: {
        idle: 'characters/normal.png',
        eat: 'characters/eating.png',
        happy: 'characters/happy.png',
        damage: 'characters/damage.png', // 毒を食べた時
        miss: 'characters/tired.png' // 落とした時（※今回は不要かも）
    },
    // ファイル名が数字でわかりにくいので、ディレクトリを読み込んで配列にするのが理想だが
    // ここでは静的に定義する（list_dirの結果より）
    foods: [
        'tottorifood/22688827.png',
        'tottorifood/25697136.png',
        'tottorifood/2633445.png',
        'tottorifood/27188544.png',
        'tottorifood/470916.png'
    ],
    poison: 'tottorifood/mushroom_poison.png'
};

// --- ゲーム定数 ---
const GAME_CONFIG = {
    playerYRatio: 0.85, // 画面下からの位置 (0~1)
    playerWidthRatio: 0.25, // 画面幅に対するプレイヤー幅
    foodSizeRatio: 0.12, // 画面幅に対する食べ物サイズ
    baseGravity: 0.15, // 基本重力 (当初0.3から緩和)
    spawnInterval: 120, // フレーム数 (当初60から緩和)
    levelStep: 5, // 何個食べたらレベルアップか
    maxLives: 3
};

// --- グローバル変数 ---
let canvas, ctx;
let lastTime = 0;
let animationFrameId;
let score = 0;
let level = 1;
let eatenCount = 0;
let isGameOver = false;
let isPlaying = false;

// プレイヤー状態
const player = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    vx: 0,
    targetX: 0,
    state: 'idle', // idle, eat, damage
    stateTimer: 0,
    images: {},
    currentImage: null
};

let items = []; // 落下物
let imagesLoaded = 0;
let totalImages = 0;

// --- 初期化 ---
window.onload = () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // SDK初期化
    if (typeof GameParkSDK !== 'undefined') {
        GameParkSDK.renderStatusBar('#game-status-bar');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 入力イベント
    setupInputs();

    // 画像ロード
    loadImages();

    // ボタンイベント
    document.getElementById('start-btn').addEventListener('click', startGame);
    document.getElementById('retry-btn').addEventListener('click', startGame);
};

function resizeCanvas() {
    canvas.width = document.getElementById('game-container').offsetWidth;
    canvas.height = document.getElementById('game-container').offsetHeight;

    // プレイヤーサイズ再計算
    player.width = canvas.width * GAME_CONFIG.playerWidthRatio;
    // アスペクト比維持（仮に1:1とするが、画像ロード後に調整可能）
    player.height = player.width;
    player.y = canvas.height * GAME_CONFIG.playerYRatio;

    // アスペクト比調整
    if (player.images.idle) {
        player.height = player.width * (player.images.idle.height / player.images.idle.width);
    }
}

function loadImages() {
    const imagePaths = [
        ...Object.values(ASSETS.player),
        ...ASSETS.foods,
        ASSETS.poison
    ];
    totalImages = imagePaths.length;

    imagePaths.forEach(path => {
        const img = new Image();
        img.src = path;
        img.onload = () => {
            imagesLoaded++;
            if (imagesLoaded === totalImages) {
                console.log('All images loaded');
                // プレイヤー画像のセットアップ
                player.images.idle = getImage(ASSETS.player.idle);
                player.images.eat = getImage(ASSETS.player.eat);
                player.images.happy = getImage(ASSETS.player.happy);
                player.images.damage = getImage(ASSETS.player.damage);
                player.currentImage = player.images.idle;
                resizeCanvas(); // 画像サイズが確定したので再計算
            }
        };
    });
}

function getImage(src) {
    // 簡易キャッシュ的な検索（今回はDOMから探すわけではないので、srcで突合するのは難しいが
    // ここでは単純に new Image したものを使う前提で実装記述を省略。
    // 実際には loadImages で作成したオブジェクトを保持する必要がある。
    // 簡略化のため、ここでは「srcパス」をキーにしてImageオブジェクトを返すヘルパーがあると便利だが、
    // 今回は単純に src属性でマッチングする。
    // (非効率だが、アセット数が少ないのでOK)
    return document.querySelector(`img[src="${src}"]`) || (function () {
        const i = new Image(); i.src = src; return i;
    })();
}

// --- 入力処理 ---
function setupInputs() {
    // マウス/タッチ移動
    const handleMove = (e) => {
        if (!isPlaying) return;
        const rect = canvas.getBoundingClientRect();
        let clientX = e.clientX;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
        }

        // プレイヤーの中心が指の位置に来るように
        const x = clientX - rect.left;
        player.targetX = x - player.width / 2;

        // 画面外制限
        if (player.targetX < 0) player.targetX = 0;
        if (player.targetX > canvas.width - player.width) player.targetX = canvas.width - player.width;
    };

    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleMove(e); }, { passive: false });
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleMove(e); }, { passive: false });

    // クリック/タップでスタート（まだ始まってない場合）
    // canvas.addEventListener('click', ...); // 今回はボタンスタート
}


// --- ゲームループ ---
function startGame() {
    score = 0;
    level = 1;
    eatenCount = 0;
    items = [];
    isGameOver = false;
    isPlaying = true;

    player.x = (canvas.width - player.width) / 2;
    player.targetX = player.x;
    player.state = 'idle';

    document.getElementById('score-val').textContent = score;
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');

    lastTime = performance.now();
    cancelAnimationFrame(animationFrameId);
    gameLoop(lastTime);
}

function gameLoop(timestamp) {
    if (!isPlaying) return;

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    draw();

    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- 更新処理 ---
function update(deltaTime) {
    // 1. プレイヤー移動 (イージング)
    player.x += (player.targetX - player.x) * 0.2;

    // 2. プレイヤー状態管理
    if (player.stateTimer > 0) {
        player.stateTimer -= deltaTime;
        if (player.stateTimer <= 0) {
            player.state = 'idle';
            player.currentImage = player.images.idle;
        }
    }

    // 3. アイテム生成
    // Level 1の間は、画面上にアイテムが1つでもあれば次は出さない (1つ食べたら次が来る)
    if (level === 1 && items.length > 0) {
        return;
    }

    // レベルに応じて生成間隔を短く (減少率を緩やかに)
    const currentSpawnInterval = Math.max(30, GAME_CONFIG.spawnInterval - (level * 5));
    if (Math.random() * currentSpawnInterval < 1) { // 簡易的なランダムスポーン
        spawnItem();
    }

    // 4. アイテム移動 & 当たり判定
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];

        // 落下
        item.y += item.vy * (deltaTime / 16);
        item.rotation += item.vr;

        // 当たり判定 (円形判定)
        const itemCX = item.x + item.size / 2;
        const itemCY = item.y + item.size / 2;

        // プレイヤーの当たり判定（中心付近）
        // 見た目上の口の位置に合わせるなら調整が必要だが、一旦中心で
        const playerCX = player.x + player.width / 2;
        const playerCY = player.y + player.height / 2;
        const hitDist = (player.width + item.size) / 4; // 甘めの判定

        const dist = Math.hypot(itemCX - playerCX, itemCY - playerCY);

        if (dist < hitDist) {
            // Hit!
            onItemHit(item);
            items.splice(i, 1);
            continue;
        }

        // 画面外
        if (item.y > canvas.height) {
            items.splice(i, 1);
        }
    }
}

function spawnItem() {
    let isPoison = false;

    // レベル1の特別ロジック
    if (level === 1) {
        // 3個目(eatenCount==2)は必ず毒にする (チュートリアル)
        if (eatenCount === 2) {
            isPoison = true;
        } else {
            // それ以外は毒なし
            isPoison = false;
        }
    } else {
        // レベル2以降は確率で毒
        isPoison = Math.random() < (0.1 + level * 0.02);
    }

    const size = canvas.width * GAME_CONFIG.foodSizeRatio;

    // レベルに応じて速度アップ (上昇率を緩やかに)
    const speed = (GAME_CONFIG.baseGravity * (1 + level * 0.05)) * (Math.random() * 0.5 + 0.8) * 10;

    items.push({
        type: isPoison ? 'poison' : 'food',
        imgSrc: isPoison ? ASSETS.poison : ASSETS.foods[Math.floor(Math.random() * ASSETS.foods.length)],
        x: Math.random() * (canvas.width - size),
        y: -size,
        size: size,
        vy: speed,
        rotation: 0,
        vr: (Math.random() - 0.5) * 0.1
    });
}

function onItemHit(item) {
    if (item.type === 'poison') {
        // 毒を食べた
        gameOver();
    } else {
        // 食べ物を食べた
        score += 10 * level; // レベルが高いほど高得点
        eatenCount++;

        // レベルアップ判定
        if (eatenCount % GAME_CONFIG.levelStep === 0) {
            level++;
            // 簡単なエフェクト出してもいいかも
        }

        // 表情変化
        player.state = 'eat';
        player.currentImage = player.images.eat;
        player.stateTimer = 500; // 0.5秒間

        // スコア表示更新
        document.getElementById('score-val').textContent = score;
    }
}

function gameOver() {
    isPlaying = false;
    isGameOver = true;
    player.state = 'damage';
    player.currentImage = player.images.damage;
    draw(); // 最後の描画

    // SDKに結果記録
    if (typeof GameParkSDK !== 'undefined') {
        GameParkSDK.recordGameResult(score);
    }

    setTimeout(() => {
        document.getElementById('final-score').textContent = score;
        let msg = "ドンマイ！";
        if (score > 500) msg = "すごい！お腹いっぱい！";
        else if (score > 1000) msg = "伝説の爆食い！！";

        document.getElementById('result-message').textContent = msg;
        document.getElementById('game-over-screen').classList.remove('hidden');
    }, 1000);
}


// --- 描画処理 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. プレイヤー描画
    if (player.currentImage) {
        ctx.drawImage(player.currentImage, player.x, player.y, player.width, player.height);
    }

    // 2. アイテム描画
    items.forEach(item => {
        const itemImg = getImage(item.imgSrc);

        ctx.save();
        ctx.translate(item.x + item.size / 2, item.y + item.size / 2);
        ctx.rotate(item.rotation);

        // 毒キノコの場合は少し怪しく光らせる？（重いのでやめておく）
        ctx.drawImage(itemImg, -item.size / 2, -item.size / 2, item.size, item.size);

        ctx.restore();
    });
}

