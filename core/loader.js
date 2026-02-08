const FALLBACK_GAMES = [
    {
        "id": "snake",
        "title": "Snake Evolution",
        "type": "2D",
        "category": "Action",
        "path": "games/snake/index.html",
        "thumbnail": "assets/thumbnails/snake.jpg"
    },
    {
        "id": "flappy",
        "title": "Aero Flap",
        "type": "2D",
        "category": "Arcade",
        "path": "games/flappy/index.html",
        "thumbnail": "assets/thumbnails/flappy.jpg"
    },
    {
        "id": "memory",
        "title": "Memory Matrix",
        "type": "2D",
        "category": "Puzzle",
        "path": "games/memory/index.html",
        "thumbnail": "assets/thumbnails/memory.jpg"
    },
    {
        "id": "tictactoe",
        "title": "Tic Tac Pro",
        "type": "2D",
        "category": "Social",
        "path": "games/tictactoe/index.html",
        "thumbnail": "assets/thumbnails/tic.jpg"
    },
    {
        "id": "2048",
        "title": "2048 Master",
        "type": "2D",
        "category": "Puzzle",
        "path": "games/2048/index.html",
        "thumbnail": "assets/thumbnails/2048.jpg"
    },
    {
        "id": "car3d",
        "title": "Nitro Rush 3D",
        "type": "3D",
        "category": "Racing",
        "path": "games/car3d/index.html",
        "thumbnail": "assets/thumbnails/car3d.jpg"
    }
];

let allGames = [];

async function loadGames() {
    try {
        const response = await fetch('games.json');
        if (response.ok) {
            allGames = await response.json();
        } else {
            allGames = FALLBACK_GAMES;
        }
    } catch (error) {
        allGames = FALLBACK_GAMES;
    }

    renderGames(allGames);
    renderSuggestions(allGames);
}

function renderGames(games) {
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.onclick = () => playGame(game.path, game.title);
        card.innerHTML = `
            <div class="card-image-box">
                <img src="${game.thumbnail}" alt="${game.title}" onerror="this.src='https://via.placeholder.com/400?text=${game.title}'">
                <div class="card-gradient"></div>
            </div>
            <div class="card-info">
                <div class="game-badge">
                    <span class="badge-dot"></span>
                    <span class="badge-text">${game.category || 'Arcade'}</span>
                </div>
                <h3 class="card-title">${game.title}</h3>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderSuggestions(games) {
    const suggestionList = document.getElementById('suggestedGames');
    if (!suggestionList) return;
    suggestionList.innerHTML = '';

    // Take random 3 for suggestions
    const shuffled = [...games].sort(() => 0.5 - Math.random());
    shuffled.slice(0, 3).forEach(game => {
        const div = document.createElement('div');
        div.className = 'flex gap-4 group cursor-pointer';
        div.onclick = () => playGame(game.path, game.title);
        div.innerHTML = `
            <div class="w-16 h-16 bg-gray-900 rounded-2xl border border-white/5 group-hover:border-purple-500/50 flex-shrink-0 transition-all overflow-hidden">
                <img src="${game.thumbnail}" class="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" onerror="this.src='https://via.placeholder.com/100?text=${game.id}'">
            </div>
            <div class="flex flex-col justify-center">
                <p class="font-bold text-sm group-hover:text-purple-400 transition-all">${game.title}</p>
                <p class="text-[10px] text-gray-500 font-bold">${game.category || 'ARCADE'} • 4.9★</p>
            </div>
        `;
        suggestionList.appendChild(div);
    });
}

function playGame(path, title) {
    const overlay = document.getElementById('playerOverlay');
    const iframe = document.getElementById('gameIframe');
    const titleEl = document.getElementById('activeTitle');

    titleEl.innerText = title;
    iframe.src = path;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function exitGame() {
    const overlay = document.getElementById('playerOverlay');
    const iframe = document.getElementById('gameIframe');

    overlay.style.display = 'none';
    iframe.src = '';
    document.body.style.overflow = 'auto';
}

// Global exposure for the HTML onclick handlers
window.playGame = playGame;
window.exitGame = exitGame;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGames);
} else {
    loadGames();
}
