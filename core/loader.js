
const FALLBACK_GAMES = [
    {
        "id": "snake",
        "title": "Snake Evolution",
        "category": "Action",
        "url": "games/snake/index.html",
        "thumbnail": "assets/thumbnails/snake.jpg",
        "tags": ["action", "classic", "snake"]
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

    // Check URL params for direct game load
    const urlParams = new URLSearchParams(window.location.search);
    const gameParam = urlParams.get('game');
    if (gameParam) {
        // Find game by title (approximate) or id
        const game = allGames.find(g => g.title.toLowerCase() === gameParam.toLowerCase() || (g.id && g.id === gameParam));
        if (game) {
            playGame(game.url || game.path, game.title, false);
        } else {
            // clear invalid param
            history.replaceState(null, '', window.location.pathname);
        }
    }

    renderGames(allGames);
    renderSuggestions(allGames);
    renderTagsCloud();
}

/* ================= SEARCH LOGIC ================= */
function getUniqueTags() {
    const tags = new Set();
    allGames.forEach(game => {
        if (game.tags) game.tags.forEach(tag => tags.add(tag.toLowerCase()));
        if (game.category) tags.add(game.category.toLowerCase());
    });
    return Array.from(tags).sort();
}

function searchGamesLogic(query) {
    if (!query) return allGames;
    query = query.toLowerCase();

    return allGames.filter((game) => {
        const titleMatch = game.title.toLowerCase().includes(query);
        const categoryMatch = game.category && game.category.toLowerCase().includes(query);
        const tagMatch = game.tags && game.tags.some(tag => tag.toLowerCase().includes(query));
        return titleMatch || categoryMatch || tagMatch;
    });
}

function handleInstantSearch(query) {
    const dropdown = document.getElementById('searchResultsDropdown');

    if (query.length === 0) {
        dropdown.classList.add('hidden');
        return;
    }

    const results = searchGamesLogic(query);
    const topResults = results.slice(0, 5);

    if (results.length > 0) {
        dropdown.innerHTML = '';
        dropdown.classList.remove('hidden');
        dropdown.classList.add('visible');

        topResults.forEach(game => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.onclick = () => {
                playGame(game.url || game.path, game.title);
                dropdown.classList.add('hidden'); // Close after selection
                document.getElementById('gameSearch').value = ''; // Clear input
            };

            const thumb = game.thumbnail || `https://via.placeholder.com/100?text=${encodeURIComponent(game.title)}`;

            div.innerHTML = `
                <img src="${thumb}" alt="${game.title}">
                <div>
                    <div class="text-white font-bold text-sm">${game.title}</div>
                    <div class="text-xs text-gray-500 uppercase tracking-wider">${game.category}</div>
                </div>
            `;
            dropdown.appendChild(div);
        });

        if (results.length > 5) {
            const viewAll = document.createElement('div');
            viewAll.className = 'search-view-all';
            viewAll.innerText = `View all ${results.length} results`;
            viewAll.onclick = () => {
                openSearchPage(query);
                dropdown.classList.add('hidden');
            };
            dropdown.appendChild(viewAll);
        }
    } else {
        dropdown.classList.add('hidden');
    }
}

/* ================= NAVIGATION & SIDEBAR ================= */
function setupEventListeners() {
    const searchInput = document.getElementById('gameSearch');
    const bigSearchInput = document.getElementById('bigSearchInput');

    // --- Search Input Logic ---
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            handleInstantSearch(e.target.value.trim());
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                openSearchPage(e.target.value);
                document.getElementById('searchResultsDropdown').classList.add('hidden');
            }
        });

        // GLOBAL CLICK LISTENER to close dropdown
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('searchResultsDropdown');
            // If click is OUTSIDE the search input AND OUTSIDE the dropdown
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length > 0) {
                handleInstantSearch(searchInput.value.trim());
            }
        });
    }

    if (bigSearchInput) {
        bigSearchInput.addEventListener('input', (e) => {
            performFullSearch(e.target.value);
        });
    }

    // --- Sidebar Filters ---
    // Categories
    document.querySelectorAll('[data-category]').forEach((btn) => {
        btn.addEventListener('click', () => {
            clearSidebarActive();
            btn.classList.add('active');

            const category = btn.dataset.category;
            if (category === 'All') {
                renderGames(allGames);
            } else {
                const filtered = allGames.filter((game) => game.category === category);
                renderGames(filtered);
            }
        });
    });

    // Special Categories
    const btnRecent = document.getElementById('btnRecent');
    if (btnRecent) {
        btnRecent.addEventListener('click', () => {
            clearSidebarActive();
            btnRecent.classList.add('active');
            renderRecentGames();
        });
    }

    const btnNew = document.getElementById('btnNew');
    if (btnNew) {
        btnNew.addEventListener('click', () => {
            clearSidebarActive();
            btnNew.classList.add('active');
            // Mock "New" logic: take last 10 games
            const newGames = [...allGames].reverse().slice(0, 15);
            renderGames(newGames);
        });
    }

    const btnPopular = document.getElementById('btnPopular');
    if (btnPopular) {
        btnPopular.addEventListener('click', () => {
            clearSidebarActive();
            btnPopular.classList.add('active');
            // Mock "Popular" logic: sort deterministically based on title length (random-ish but stable)
            const popularGames = [...allGames].sort((a, b) => a.title.length - b.title.length);
            renderGames(popularGames);
        });
    }
}

function clearSidebarActive() {
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
}

/* ================= GAME PLAY & HISTORY ================= */
// Handle Browser Back Button
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.game) {
        // Correct way would be to ensure overlay is open, but play game logic might re-load iframe
        // Since play game pushes state, popstate usually means we are going BACK.
        // If we are here, we might be going back to a game state or back to null
        playGame(e.state.game, e.state.title, true); // true = restoration, don't push state again
    } else {
        // No state (or null state) -> Close Game
        exitGame(true); // true = from history, don't back()
    }
});

function saveToRecent(gameUrl, title) {
    let recent = JSON.parse(localStorage.getItem('satex_recent') || '[]');
    // Remove if exists to push to top
    recent = recent.filter(r => r.url !== gameUrl);
    // Find metadata
    const gameData = allGames.find(g => (g.url || g.path) === gameUrl) || { title: title, url: gameUrl, category: 'Arcade' };

    recent.unshift(gameData);
    if (recent.length > 20) recent.pop(); // Keep max 20

    localStorage.setItem('satex_recent', JSON.stringify(recent));
}

function renderRecentGames() {
    const recent = JSON.parse(localStorage.getItem('satex_recent') || '[]');
    if (recent.length === 0) {
        const grid = document.getElementById('gamesGrid');
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">You haven\'t played any games yet.</div>';
        return;
    }
    renderGames(recent);
}

function playGame(url, title, isRestoration = false) {
    const overlay = document.getElementById('playerOverlay');
    const iframe = document.getElementById('gameIframe');
    const titleEl = document.getElementById('activeTitle');

    if (titleEl) titleEl.innerText = title;

    // Save to Recent
    if (!isRestoration) {
        saveToRecent(url, title);

        // Push History State so Back button works
        // This makes it "like a new page"
        history.pushState({ game: url, title: title }, title, "?game=" + encodeURIComponent(title));
    }

    iframe.src = url;
    overlay.style.display = 'block';

    // Mobile Fullscreen check
    if (window.innerWidth <= 768) {
        if (iframe.requestFullscreen) {
            iframe.requestFullscreen().catch(err => console.log(err));
        } else if (overlay.requestFullscreen) {
            overlay.requestFullscreen().catch(err => console.log(err));
        }
    }

    document.body.style.overflow = 'hidden';
}

function exitGame(isFromHistory = false) {
    const overlay = document.getElementById('playerOverlay');
    const iframe = document.getElementById('gameIframe');

    overlay.style.display = 'none';
    iframe.src = '';
    document.body.style.overflow = 'auto';

    // If user clicked clickable "Close" button, we need to go back in history 
    // to remove the ?game= query param, IF we aren't already handling a popstate
    if (!isFromHistory) {
        // Check if we have a state to go back from
        if (history.state && history.state.game) {
            history.back();
        }
    }
}

/* ================= UI RENDERING ================= */
// Reuse existing renderGames for the main page
function renderGames(games) {
    const grid = document.getElementById('gamesGrid');
    if (!grid) return;

    if (!games) {
        grid.innerHTML = '<div class="col-span-full text-center py-20"><div class="animate-spin text-4xl text-purple-500 mb-4"><i class="fas fa-spinner"></i></div><p class="text-gray-400">Loading Games...</p></div>';
        return;
    }

    grid.innerHTML = '';

    if (games.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No games found.</div>';
        return;
    }

    games.forEach((game, index) => {
        const gameUrl = game.url || game.path;
        if (!gameUrl) return;

        const card = document.createElement('div');
        card.className = 'game-card';
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

function renderTagsCloud() {
    const container = document.getElementById('searchTagsCloud');
    if (!container) return;
    const uniqueTags = getUniqueTags();
    const displayTags = uniqueTags.slice(0, 20);
    container.innerHTML = '';
    displayTags.forEach(tag => {
        const btn = document.createElement('button');
        btn.className = 'px-4 py-2 bg-white/5 hover:bg-purple-600 border border-white/5 rounded-xl text-xs font-bold text-gray-400 hover:text-white uppercase tracking-widest transition-all';
        btn.innerText = tag;
        btn.onclick = () => {
            document.getElementById('bigSearchInput').value = tag;
            performFullSearch(tag);
        };
        container.appendChild(btn);
    });
}

// Search Page Functions
function openSearchPage(query = '') {
    const overlay = document.getElementById('searchPageOverlay');
    const input = document.getElementById('bigSearchInput');

    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.remove('opacity-0', 'scale-95'); }, 10);

    if (query) {
        input.value = query;
        performFullSearch(query);
    }
    input.focus();
    document.body.style.overflow = 'hidden';
}

function closeSearchPage() {
    const overlay = document.getElementById('searchPageOverlay');
    overlay.classList.add('opacity-0', 'scale-95');
    setTimeout(() => { overlay.classList.add('hidden'); }, 300);
    document.body.style.overflow = 'auto';
}

function performFullSearch(query) {
    if (typeof query !== 'string') query = document.getElementById('bigSearchInput').value;
    const results = searchGamesLogic(query);
    const countEl = document.getElementById('searchResultCount');
    if (countEl) countEl.innerText = `${results.length} Found`;
    renderFullSearchResults(results);
}

function renderFullSearchResults(games) {
    const grid = document.getElementById('fullSearchResultsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (games.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500 font-bold text-xl">No games found. Try searching for tags like "car", "action", "puzzle".</div>';
        return;
    }

    games.forEach((game, index) => {
        const gameUrl = game.url || game.path;
        const thumbUrl = game.thumbnail || `https://via.placeholder.com/400?text=${encodeURIComponent(game.title)}`;
        const card = document.createElement('div');
        card.className = 'game-card';
        card.style.animationDelay = `${Math.min(index * 0.05, 1)}s`;
        card.onclick = () => playGame(gameUrl, game.title);
        const tagsHtml = game.tags ? game.tags.slice(0, 3).map(tag => `<span class="text-[9px] bg-black/50 px-2 py-0.5 rounded text-gray-400">#${tag}</span>`).join('') : '';
        card.innerHTML = `
            <div class="card-image-box">
                <img src="${thumbUrl}" alt="${game.title}" loading="lazy">
                <div class="card-gradient"></div>
            </div>
            <div class="card-info">
                 <div class="game-badge">
                    <span class="badge-dot"></span>
                    <span class="badge-text">${game.category}</span>
                </div>
                <h3 class="card-title mb-2">${game.title}</h3>
                <div class="flex gap-1 flex-wrap">${tagsHtml}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Global exposure
window.playGame = playGame;
window.exitGame = exitGame;
window.openSearchPage = openSearchPage;
window.closeSearchPage = closeSearchPage;
window.performFullSearch = performFullSearch;
window.toggleSidebar = function () {
    const sb = document.getElementById('sidebar');
    sb.style.transform = (sb.style.transform === 'translateX(0px)') ? 'translateX(-100%)' : 'translateX(0px)';
};
window.triggerFullscreen = function () {
    const iframe = document.getElementById('gameIframe');
    if (iframe.requestFullscreen) iframe.requestFullscreen();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGames);
} else {
    loadGames();
}
