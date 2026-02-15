
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
let listenersBound = false;
let instantSearchTimer = null;
let latestInstantQuery = '';
const userSearchCache = new Map();

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
    window.allGames = allGames;

    if (!listenersBound) {
        setupEventListeners();
        listenersBound = true;
    }

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

    // 4. Cache & Populate Trending
    if (window.Services && window.Services.state) {
        window.Services.state.gameLibrary = allGames;

        // Populate Chat Trending (random 5 for now)
        const trendingContainer = document.getElementById('trending-games-mini');
        if (trendingContainer) {
            trendingContainer.innerHTML = allGames.sort(() => 0.5 - Math.random()).slice(0, 5).map(g => `
                <div class="flex-shrink-0 w-16 cursor-pointer group" onclick="playGame('${g.url}', '${g.title}')">
                    <img src="${g.thumbnail}" class="w-16 h-16 rounded-xl object-cover border border-white/10 group-hover:border-purple-500 transition-all">
                    <div class="text-[10px] text-gray-400 truncate mt-1 text-center group-hover:text-white">${g.title}</div>
                </div>
            `).join('');
        }
    }

    renderFullHome(allGames);
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

async function searchUsersLogic(query) {
    const safeQuery = (query || '').trim();
    if (safeQuery.length < 2) return [];
    if (!window.Services?.friend?.searchUsers) return [];

    const cacheKey = safeQuery.toLowerCase();
    if (userSearchCache.has(cacheKey)) {
        return userSearchCache.get(cacheKey);
    }

    try {
        const users = await window.Services.friend.searchUsers(safeQuery);
        const normalized = (users || [])
            .filter(user => user && user.uid)
            .map(user => ({
                uid: user.uid,
                username: user.username || 'Player',
                avatar: user.avatar || ''
            }));
        userSearchCache.set(cacheKey, normalized);
        return normalized;
    } catch (error) {
        return [];
    }
}

function escapeSearchHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeSearchAttr(value) {
    return String(value || '').replace(/'/g, "\\'");
}

async function handleInstantSearch(query) {
    const dropdown = document.getElementById('searchResultsDropdown');
    latestInstantQuery = query;
    const querySnapshot = query;

    if (query.length === 0) {
        dropdown.classList.remove('visible');
        dropdown.classList.add('hidden');
        return;
    }

    const results = searchGamesLogic(query);
    const users = await searchUsersLogic(query);
    if (querySnapshot !== latestInstantQuery) return;
    const topResults = results.slice(0, 5);
    const topUsers = users.slice(0, 3);

    if (results.length > 0 || users.length > 0) {
        dropdown.innerHTML = '';
        dropdown.classList.remove('hidden');
        dropdown.classList.add('visible');

        if (topUsers.length) {
            const usersLabel = document.createElement('div');
            usersLabel.className = 'px-3 py-2 text-[10px] font-black tracking-widest uppercase text-sky-300 bg-sky-500/10 border-b border-white/5';
            usersLabel.innerText = 'Players';
            dropdown.appendChild(usersLabel);

            topUsers.forEach((user) => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.onclick = () => {
                    if (typeof window.openUserProfile === 'function') {
                        window.openUserProfile(user.uid);
                    }
                    dropdown.classList.remove('visible');
                    dropdown.classList.add('hidden');
                    const searchInput = document.getElementById('gameSearch');
                    if (searchInput) searchInput.value = '';
                };
                div.innerHTML = `
                    <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="${escapeSearchHtml(user.username)}">
                    <div>
                        <div class="text-white font-bold text-sm">${escapeSearchHtml(user.username)}</div>
                        <div class="text-xs text-sky-300 uppercase tracking-wider">Player</div>
                    </div>
                `;
                dropdown.appendChild(div);
            });
        }

        if (topResults.length) {
            const gamesLabel = document.createElement('div');
            gamesLabel.className = 'px-3 py-2 text-[10px] font-black tracking-widest uppercase text-purple-300 bg-purple-500/10 border-y border-white/5';
            gamesLabel.innerText = 'Games';
            dropdown.appendChild(gamesLabel);
        }

        topResults.forEach(game => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.onclick = () => {
                playGame(game.url || game.path, game.title);
                dropdown.classList.remove('visible'); // Close after selection
                dropdown.classList.add('hidden');
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

        const totalCount = results.length + users.length;
        if (results.length > 5 || users.length > 3) {
            const viewAll = document.createElement('div');
            viewAll.className = 'search-view-all';
            viewAll.innerText = `View all ${totalCount} results`;
            viewAll.onclick = () => {
                openSearchPage(query);
                dropdown.classList.remove('visible');
                dropdown.classList.add('hidden');
            };
            dropdown.appendChild(viewAll);
        }
    } else {
        dropdown.classList.remove('visible');
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
            const term = e.target.value.trim();
            if (instantSearchTimer) clearTimeout(instantSearchTimer);
            instantSearchTimer = setTimeout(() => {
                handleInstantSearch(term);
            }, 180);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                openSearchPage(e.target.value);
                document.getElementById('searchResultsDropdown').classList.remove('visible');
                document.getElementById('searchResultsDropdown').classList.add('hidden');
            }
        });

        // GLOBAL CLICK LISTENER to close dropdown
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('searchResultsDropdown');
            const searchInput = document.getElementById('gameSearch');

            if (!dropdown || !searchInput) return;

            // If click is OUTSIDE the search input AND OUTSIDE the dropdown
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.remove('visible');
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

            // Set pending filter and switch view
            window.pendingHomeFilter = category;
            if (window.switchView) {
                window.switchView('home');
            } else {
                // Fallback if UI manager not ready
                renderGames(category === 'All' ? allGames : allGames.filter(g => g.category === category));
            }
        });
    });

    // Special Categories
    const btnRecent = document.getElementById('btnRecent');
    if (btnRecent) {
        btnRecent.addEventListener('click', () => {
            clearSidebarActive();
            btnRecent.classList.add('active');

            // Custom function for Recent is slightly different as it pulls from LocalStorage
            // We can use a special "filter" string or handle it:
            // Let's manually trigger it after switch
            if (window.switchView) {
                window.switchView('home');
                // Delay slightly to ensure render happened
                setTimeout(() => {
                    renderRecentGames();
                    // Update UI manually for the title since filteredGames doesn't handle 'Recent'
                    const title = document.querySelector('.section-title');
                    if (title) title.innerHTML = '<i class="fas fa-history text-green-500"></i> Recently Played';
                    const hero = document.getElementById('homeFeatured');
                    if (hero) hero.style.display = 'none';
                }, 50);
            } else {
                renderRecentGames();
            }
        });
    }

    const btnNew = document.getElementById('btnNew');
    if (btnNew) {
        btnNew.addEventListener('click', () => {
            clearSidebarActive();
            btnNew.classList.add('active');

            window.pendingHomeFilter = 'New'; // We need to handle 'New' in filterGames or here

            // Since filterGames might not handle "New", let's do similar custom logic:
            if (window.switchView) {
                window.switchView('home');
                setTimeout(() => {
                    const newGames = [...allGames].reverse().slice(0, 15);
                    renderGames(newGames);
                    const title = document.querySelector('.section-title');
                    if (title) title.innerHTML = '<i class="fas fa-star text-yellow-500"></i> New Games';
                    const hero = document.getElementById('homeFeatured');
                    if (hero) hero.style.display = 'none';
                }, 50);
            }
        });
    }

    const btnPopular = document.getElementById('btnPopular');
    if (btnPopular) {
        btnPopular.addEventListener('click', () => {
            clearSidebarActive();
            btnPopular.classList.add('active');

            if (window.switchView) {
                window.switchView('home');
                setTimeout(() => {
                    const popularGames = [...allGames].sort((a, b) => a.title.length - b.title.length);
                    renderGames(popularGames);
                    const title = document.querySelector('.section-title');
                    if (title) title.innerHTML = '<i class="fas fa-fire text-orange-500"></i> Popular';
                    const hero = document.getElementById('homeFeatured');
                    if (hero) hero.style.display = 'none';
                }, 50);
            }
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
    let recent = [];
    if (window.Services && window.Services.state && window.Services.state.currentUser) {
        // Use Firestore Profile
        recent = window.Services.state.profile?.recent_games || [];
    } else {
        // Fallback to Local Storage for Guests
        try {
            recent = JSON.parse(localStorage.getItem('satex_recent') || '[]');
        } catch (e) { recent = []; }
    }

    if (!recent || recent.length === 0) {
        const grid = document.getElementById('gamesGrid');
        if (grid) grid.innerHTML = '<div class="col-span-full text-center py-20 text-gray-500">No recent games found. Play some games to see them here!</div>';
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
    const featured = document.getElementById('homeFeatured');

    // Toggle Featured Section
    if (featured) {
        if (games === window.allGames) {
            featured.style.display = 'block';
        } else {
            featured.style.display = 'none';
        }
    }

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

    if (query) input.value = query;
    performFullSearch(input.value || '');
    input.focus();
    document.body.style.overflow = 'hidden';
}

function closeSearchPage() {
    const overlay = document.getElementById('searchPageOverlay');
    overlay.classList.add('opacity-0', 'scale-95');
    setTimeout(() => { overlay.classList.add('hidden'); }, 300);
    document.body.style.overflow = 'auto';
}

async function performFullSearch(query) {
    if (typeof query !== 'string') query = document.getElementById('bigSearchInput').value;
    const safeQuery = query.trim();
    const results = searchGamesLogic(safeQuery);
    const users = await searchUsersLogic(safeQuery);
    const countEl = document.getElementById('searchResultCount');
    const userCountEl = document.getElementById('searchUserCount');
    if (countEl) countEl.innerText = `${results.length} Found`;
    if (userCountEl) userCountEl.innerText = `${users.length} Found`;
    renderUserSearchResults(users, safeQuery);
    renderFullSearchResults(results);
}

function renderUserSearchResults(users, query) {
    const section = document.getElementById('fullSearchUsersSection');
    const list = document.getElementById('fullSearchUsersList');
    if (!section || !list) return;

    if (!query || query.length < 2) {
        section.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');

    if (!users.length) {
        list.innerHTML = '<div class="text-sm text-gray-500 bg-white/5 border border-white/10 rounded-xl px-4 py-3">No players found.</div>';
        return;
    }

    list.innerHTML = users.map((user) => {
        const safeUid = escapeSearchAttr(user.uid);
        const safeName = escapeSearchHtml(user.username || 'Player');
        const safeAvatar = escapeSearchAttr(user.avatar || 'assets/icons/logo.jpg');
        return `
            <div class="bg-white/5 border border-white/10 hover:border-sky-400/40 rounded-xl px-3 py-2 flex items-center justify-between gap-3 transition-all">
                <button onclick="window.openUserProfile('${safeUid}'); closeSearchPage();" class="flex items-center gap-3 min-w-0 text-left">
                    <img src="${safeAvatar}" alt="${safeName}" class="w-10 h-10 rounded-full object-cover border border-white/10">
                    <div class="min-w-0">
                        <div class="text-sm font-bold text-white truncate">${safeName}</div>
                        <div class="text-[11px] text-sky-300 uppercase tracking-wider">Player</div>
                    </div>
                </button>
                <button onclick="window.openUserProfile('${safeUid}'); closeSearchPage();" class="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-xs font-bold text-sky-200">View</button>
            </div>
        `;
    }).join('');
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

        // Use new COMPACT structure
        card.className = 'compact-search-card'; // Defined in home.css
        card.style.animationDelay = `${Math.min(index * 0.05, 1)}s`;
        card.onclick = () => playGame(gameUrl, game.title);

        card.innerHTML = `
            <div class="compact-thumb-box">
                <img src="${thumbUrl}" class="compact-thumb" alt="${game.title}" loading="lazy">
            </div>
            <div class="compact-info">
                <div class="compact-cat">${game.category || 'Arcade'}</div>
                <h3 class="compact-title">${game.title}</h3>
            </div>
        `;
        grid.appendChild(card);
    });
}
function playGame(url, title) {
    if (!title) return;
    // Use title to find game in game.html, robust enough for this use case
    window.location.href = `game.html?title=${encodeURIComponent(title)}`;
}

// Global exposure
window.playGame = playGame;
window.exitGame = exitGame;
window.openSearchPage = openSearchPage;
window.closeSearchPage = closeSearchPage;
window.performFullSearch = performFullSearch;
window.loadGames = loadGames;
if (typeof window.toggleSidebar !== 'function') {
    window.toggleSidebar = function () {
        const sb = document.getElementById('sidebar');
        if (!sb) return;
        sb.style.transform = (sb.style.transform === 'translateX(0px)') ? 'translateX(-100%)' : 'translateX(0px)';
    };
}
window.triggerFullscreen = function () {
    const iframe = document.getElementById('gameIframe');
    if (iframe.requestFullscreen) iframe.requestFullscreen();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadGames);
} else {
    loadGames();
}

/* ================= FAVORITES LOGIC ================= */
function toggleFavorite(gameId) {
    if (!gameId) return;
    let favorites = JSON.parse(localStorage.getItem('satex_favorites') || '[]');
    const index = favorites.indexOf(gameId);

    if (index > -1) {
        favorites.splice(index, 1);
        if (typeof showToast === 'function') showToast("Removed from My List");
    } else {
        favorites.push(gameId);
        if (typeof showToast === 'function') showToast("Added to My List", "success");
    }
    localStorage.setItem('satex_favorites', JSON.stringify(favorites));

    // Update UI if hero is showing this game
    const btn = document.getElementById(`fav-btn-${gameId}`);
    if (btn) {
        if (index > -1) {
            btn.innerHTML = '<i class="fa-solid fa-plus"></i> ADD TO LIST';
            btn.classList.remove('active');
        } else {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> ADDED';
            btn.classList.add('active');
        }
    }
}

function isFavorite(gameId) {
    const favorites = JSON.parse(localStorage.getItem('satex_favorites') || '[]');
    return favorites.includes(gameId);
}
window.toggleFavorite = toggleFavorite;

/* ================= HOME PAGE LOGIC ================= */

function renderFullHome(games) {
    if (!games || games.length === 0) return;

    // Reset Title
    const title = document.querySelector('.section-title');
    if (title) title.innerHTML = '<i class="fa-solid fa-gamepad text-blue-500"></i> All Games';

    // 1. Hero
    const heroGame = games.find(g => g.title.toLowerCase().includes('neon')) || games[Math.floor(Math.random() * games.length)];
    renderHero(heroGame);

    // 2. Trending (Random 6)
    const trending = [...games].sort(() => 0.5 - Math.random()).slice(0, 10);
    renderRail('trendingRail', trending);

    // 3. Action (Filter)
    const action = games.filter(g => g.category === 'Action').slice(0, 10);
    renderRail('actionRail', action);

    // 4. Render Grid for bottom (and hide Featured just in case logic was weird)
    renderGames(games);
}

function renderHero(game) {
    const container = document.getElementById('homeHeroContainer');
    if (!container || !game) return;

    // We can use a high-res image if available, else thumbnail
    const bg = game.thumbnail || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&q=80&w=2000';
    const isFav = isFavorite(game.id || game.title);
    const favText = isFav ? '<i class="fa-solid fa-check"></i> ADDED' : '<i class="fa-solid fa-plus"></i> ADD TO LIST';

    container.innerHTML = `
        <section class="hero-banner">
            <img src="${bg}" class="hero-bg">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="tag-pill"><i class="fa-solid fa-star mr-1"></i> FEATURED</div>
                <h1 class="hero-title">${game.title}</h1>
                <p class="text-gray-300 mb-6 max-w-lg leading-relaxed line-clamp-2">Experience the thrill of ${game.title}. Play instantly in your browser.</p>
                <div class="hero-actions">
                    <button class="btn-primary" onclick="playGame('${game.url || game.path}', '${game.title}')"><i class="fa-solid fa-play"></i> PLAY NOW</button>
                    <button id="fav-btn-${game.id || game.title}" class="btn-glass ${isFav ? 'active' : ''}" onclick="toggleFavorite('${game.id || game.title}')">${favText}</button>
                </div>
            </div>
        </section>
    `;
}

function renderRail(elementId, games) {
    const rail = document.getElementById(elementId);
    if (!rail) return;

    rail.innerHTML = games.map(game => `
        <div class="rail-card" onclick="playGame('${game.url || game.path}', '${game.title}')">
            <img src="${game.thumbnail || 'assets/icons/logo.jpg'}" class="game-img">
            <div class="play-icon"><i class="fa-solid fa-play"></i></div>
            <div class="game-overlay">
                <h4 class="font-bold text-white text-sm">${game.title}</h4>
                <p class="text-[10px] text-gray-300 uppercase">${game.category || 'Arcade'}</p>
            </div>
        </div>
    `).join('');
}

window.filterGames = function (category) {
    // UI Update
    document.querySelectorAll('.cat-tag').forEach(tag => {
        if (tag.innerText.trim() === category || (category === 'All' && tag.innerText.trim() === 'All')) {
            tag.classList.add('active');
        } else {
            tag.classList.remove('active');
        }
    });

    const homeFeatured = document.getElementById('homeFeatured');
    const gamesGrid = document.getElementById('gamesGrid');
    const title = document.querySelector('.section-title');

    if (category === 'All') {
        if (homeFeatured) homeFeatured.style.display = 'block';
        if (title) title.innerHTML = '<i class="fa-solid fa-gamepad text-blue-500"></i> All Games';
        renderGames(window.allGames);
    } else {
        if (homeFeatured) homeFeatured.style.display = 'none';

        // Update Title - Show Category Name
        if (title) title.innerHTML = `<i class="fa-solid fa-layer-group text-purple-500"></i> ${category} Games`;

        // Filter Games
        const filtered = window.allGames.filter(g => g.category === category || (g.tags && g.tags.includes(category.toLowerCase())));
        renderGames(filtered);
    }

    // Scroll to filters/grid so user sees change immediately
    const filterContainer = document.getElementById('homeCategories') || gamesGrid;
    if (filterContainer) {
        const yOffset = -100; // Account for sticky header
        const y = filterContainer.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: y, behavior: 'smooth' });
    }
};
