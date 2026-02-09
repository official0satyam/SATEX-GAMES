const FALLBACK_GAMES = [
    {
        "id": "snake",
        "title": "Snake Evolution",
        "category": "Action",
        "url": "games/snake/index.html",
        "thumbnail": "assets/thumbnails/snake.jpg"
    },
    {
        "id": "flappy",
        "title": "Aero Flap",
        "category": "Arcade",
        "url": "games/flappy/index.html",
        "thumbnail": "assets/thumbnails/flappy.jpg"
    },
    {
        "id": "memory",
        "title": "Memory Matrix",
        "category": "Puzzle",
        "url": "games/memory/index.html",
        "thumbnail": "assets/thumbnails/memory.jpg"
    },
    {
        "id": "tictactoe",
        "title": "Tic Tac Pro",
        "category": "Social",
        "url": "games/tictactoe/index.html",
        "thumbnail": "assets/thumbnails/tic.jpg"
    },
    {
        "id": "2048",
        "title": "2048 Master",
        "category": "Puzzle",
        "url": "games/2048/index.html",
        "thumbnail": "assets/thumbnails/2048.jpg"
    },
    {
        "id": "car3d",
        "title": "Nitro Rush 3D",
        "category": "Racing",
        "url": "games/car3d/index.html",
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
            console.warn('games.json not found, using fallback');
            allGames = FALLBACK_GAMES;
        }
    } catch (error) {
        console.error('Error loading games.json:', error);
        allGames = FALLBACK_GAMES;
    }

    setupEventListeners();
    renderGames(allGames);
    renderSuggestions(allGames);
}

function setupEventListeners() {
    const searchInput = document.getElementById('gameSearch');
    const categoryButtons = document.querySelectorAll('[data-category]');

    // Search Filter
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            let filtered = allGames;

            // Check if a category is active
            const activeCategoryBtn = document.querySelector('.sidebar-item.active[data-category]');
            if (activeCategoryBtn) {
                const category = activeCategoryBtn.dataset.category;
                if (category !== 'All') {
                    filtered = filtered.filter((game) => game.category === category);
                }
            }

            filtered = filtered.filter((game) =>
                game.title.toLowerCase().includes(query) ||
                (game.category && game.category.toLowerCase().includes(query))
            );
            renderGames(filtered);
        });
    }

    // Category Filter
    categoryButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            categoryButtons.forEach((b) => b.classList.remove('active'));
            // Add to clicked
            btn.classList.add('active');

            const category = btn.dataset.category;
            let filtered = allGames;

            if (category !== 'All') {
                filtered = allGames.filter((game) => game.category === category);
            }

            // Also re-apply search if it exists
            if (searchInput && searchInput.value) {
                const query = searchInput.value.toLowerCase();
                filtered = filtered.filter((game) =>
                    game.title.toLowerCase().includes(query) ||
                    (game.category && game.category.toLowerCase().includes(query))
                );
            }

            renderGames(filtered);
        });
    });
}

function renderGames(games) {
    const grid = document.getElementById('gamesGrid');
    const searchInput = document.getElementById('gameSearch');

    if (!grid) return;

    // Initial Loading State
    if (!games) {
        grid.innerHTML = '<div class="col-span-full text-center py-20"><div class="animate-spin text-4xl text-purple-500 mb-4"><i class="fas fa-spinner"></i></div><p class="text-gray-400">Loading Games...</p></div>';
        return;
    }

    grid.innerHTML = '';

    if (games.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No games found matches your search.</div>';
        return;
    }

    games.forEach((game, index) => {
        // Use url or path (backward compatibility)
        const gameUrl = game.url || game.path;
        if (!gameUrl) return;

        const card = document.createElement('div');
        card.className = 'game-card';
        // Add animation delay for staggered entrance if many items
        card.style.animationDelay = `${Math.min(index * 0.05, 1)}s`;

        card.onclick = () => playGame(gameUrl, game.title);

        const thumbUrl = game.thumbnail || `https://via.placeholder.com/400?text=${encodeURIComponent(game.title)}`;

        card.innerHTML = `
            <div class="card-image-box">
                <img src="${thumbUrl}" alt="${game.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/400?text=Game'">
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
        const gameUrl = game.url || game.path;
        const thumbUrl = game.thumbnail || `https://via.placeholder.com/100?text=${encodeURIComponent(game.title)}`;

        const div = document.createElement('div');
        div.className = 'flex gap-4 group cursor-pointer';
        div.onclick = () => playGame(gameUrl, game.title);
        div.innerHTML = `
            <div class="w-16 h-16 bg-gray-900 rounded-2xl border border-white/5 group-hover:border-purple-500/50 flex-shrink-0 transition-all overflow-hidden">
                <img src="${thumbUrl}" class="w-full h-full object-cover group-hover:scale-110 transition-all duration-500" onerror="this.src='https://via.placeholder.com/100?text=Icon'">
            </div>
            <div class="flex flex-col justify-center">
                <p class="font-bold text-sm group-hover:text-purple-400 transition-all">${game.title}</p>
                <p class="text-[10px] text-gray-500 font-bold">${game.category || 'ARCADE'} • 4.9★</p>
            </div>
        `;
        suggestionList.appendChild(div);
    });
}

function playGame(url, title) {
    const overlay = document.getElementById('playerOverlay');
    const iframe = document.getElementById('gameIframe');
    const titleEl = document.getElementById('activeTitle');

    if (titleEl) titleEl.innerText = title;

    // Check if it's a GameDistribution URL (they often need specific handling or just work in iframe)
    // For now, simple iframe src set
    iframe.src = url;

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
