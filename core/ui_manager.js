
/* -------------------------------------------------------------------------- */
/*                           UI MANAGER & DATA INTEGRATION                    */
/* -------------------------------------------------------------------------- */
// Depends on window.Services from core/services.js

document.addEventListener('DOMContentLoaded', () => {
    // 1. Check Deep Linking for "Join Game"
    const params = new URLSearchParams(window.location.search);
    const joinGameId = params.get('game');
    if (joinGameId) {
        // Find game in library and launch
        setTimeout(() => {
            const game = window.allGames?.find(g => g.id === joinGameId); // Assuming window.allGames populated by loader
            if (game) playGame(game.url, game.title);
        }, 1000); // Small delay for loader
    }

    // 2. Auth State Listener
    window.addEventListener('authStateChanged', (e) => {
        const user = e.detail.user;
        if (user) {
            document.querySelectorAll('.auth-btn').forEach(b => b.classList.add('hidden')); // hide login btns
            // Profile & Chat unlock
        } else {
            // Show Login
        }
    });

    // 3. Profile Updates
    window.addEventListener('profileUpdated', (e) => {
        currentUserData = e.detail;
        if (new URLSearchParams(window.location.search).get('view') === 'profile') {
            renderProfile();
        }
    });

    // 4. Global Chat Updates
    window.addEventListener('globalChatUpdated', (e) => {
        const msgs = e.detail;
        const container = document.getElementById('chat-messages-area');
        if (container && activeChatTab === 'global') {
            container.innerHTML = '';
            msgs.forEach(msg => renderMessage(msg, container));
            container.scrollTop = container.scrollHeight;
        }
    });
});


/* -------------------------------------------------------------------------- */
/*                           VIEW NAVIGATION                                  */
/* -------------------------------------------------------------------------- */
let currentUserData = null;

window.addEventListener('popstate', (e) => {
    const view = e.state ? e.state.view : 'home';
    _renderView(view, false);
});

function switchView(viewName) {
    const currentParams = new URLSearchParams(window.location.search);
    if (viewName === currentParams.get('view')) viewName = 'home';

    const url = viewName === 'home' ? window.location.pathname : `?view=${viewName}`;
    history.pushState({ view: viewName }, '', url);
    _renderView(viewName, true);
}

function _renderView(viewName, isPush) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Bottom Nav Active State
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        if (btn.onclick.toString().includes(viewName)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');
        if (viewName === 'profile') renderProfile();
        if (viewName === 'chat') renderChatInterface();
        if (viewName === 'social') renderSocialFeed(); // New Social View
    }
    window.scrollTo(0, 0);
}

/* -------------------------------------------------------------------------- */
/*                           PROFILE RENDERER                                 */
/* -------------------------------------------------------------------------- */
function renderProfile() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    if (!currentUserData) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
                <i class="fas fa-lock text-6xl text-gray-700 mb-6"></i>
                <h2 class="text-2xl font-bold text-white mb-2">Member Access Only</h2>
                <p class="text-gray-500 mb-8 max-w-xs">Viewing profiles requires an active Satex Games account.</p>
                <button onclick="document.getElementById('chatLoginOverlay').classList.add('active')" class="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-white shadow-lg shadow-purple-900/40 transition-all transform hover:scale-105">
                    Login / Signup
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="profile-header group relative">
            <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop" class="banner-img">
            <button onclick="window.Services.auth.logout()" class="absolute top-4 right-4 bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold backdrop-blur-sm transition-all shadow-lg">
                <i class="fas fa-sign-out-alt mr-1"></i> LOGOUT
            </button>
            <div class="profile-avatar-container">
                <div class="avatar-ring">
                    <img src="${currentUserData.avatar}" class="avatar-img">
                </div>
                <div class="level-badge-large">LVL ${currentUserData.level || 1}</div>
            </div>
        </div>

        <div class="px-4 md:px-0 mt-16 md:mt-0">
            <h2 class="text-3xl font-black text-white tracking-tight">${currentUserData.username}</h2>
            <div class="flex gap-4 mt-2 mb-6 text-sm text-gray-400">
                <span><b>${currentUserData.followers_count || 0}</b> Followers</span>
                <span><b>${currentUserData.following_games?.length || 0}</b> Following</span>
            </div>

            <!-- Gamer Card Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${currentUserData.xp || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Total XP</div>
                </div>
                 <div class="stat-card">
                   <div class="text-2xl font-black text-white">${currentUserData.games_played || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Games Played</div>
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/*                           CHAT & SOCIAL RENDERER                           */
/* -------------------------------------------------------------------------- */
let activeChatTab = 'global';

function renderChatInterface() {
    const container = document.getElementById('view-chat');
    if (container.querySelector('.chat-layout')) return; // already rendered

    container.innerHTML = `
        <div class="chat-layout">
            <!-- Sidebar -->
            <div class="chat-list-panel">
                <div class="p-4 border-b border-white/5">
                     <div class="flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-global" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase bg-purple-600 text-white shadow-lg">Global</button>
                        <button onclick="switchChatTab('dms')" id="tab-dms" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase text-gray-500 hover:bg-white/5">DMs</button>
                    </div>
                </div>
                <!-- Trending Games Hook -->
                <div class="p-4 border-b border-white/5">
                    <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Trending Now</h4>
                    <div id="trending-games-mini" class="flex gap-2 overflow-x-auto pb-2">
                        <!-- JS injected -->
                    </div>
                </div>
                <div id="chat-list-content" class="flex-1 overflow-y-auto p-2"></div>
            </div>

            <!-- Main Area -->
            <div class="chat-view-panel">
                 <!-- Mobile Tabs -->
                <div class="md:hidden mobile-chat-tabs border-b border-white/5 gap-2 overflow-x-auto">
                     <button onclick="switchChatTab('global')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white">Global</button>
                     <button onclick="switchChatTab('dms')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white">DMs</button>
                </div>

                <div id="chat-messages-area" class="flex-1 overflow-y-auto p-4 content-start chat-messages-area"></div>

                <div class="chat-input-container border-t border-white/5">
                    <div class="flex gap-2">
                        <input type="text" id="chatMsgInput" placeholder="Message..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50">
                        <button onclick="sendMsg()" class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Populate Trending
    const games = Services.state.gameLibrary || [];
    if (games.length > 0) {
        const trendingContainer = document.getElementById('trending-games-mini');
        if (trendingContainer) {
            trendingContainer.innerHTML = [...games].sort(() => 0.5 - Math.random()).slice(0, 5).map(g => `
                <div class="flex-shrink-0 w-16 cursor-pointer group" onclick="playGame('${g.url}', '${g.title}')">
                    <img src="${g.thumbnail}" class="w-16 h-16 rounded-xl object-cover border border-white/10 group-hover:border-purple-500 transition-all">
                    <div class="text-[10px] text-gray-400 truncate mt-1 text-center group-hover:text-white">${g.title}</div>
                </div>
            `).join('');
        }
    }

    // Initial Load
    Services.chat.listenToGlobalChat();
}

function switchChatTab(tab) {
    activeChatTab = tab;
    // UI toggle logic...
    const container = document.getElementById('chat-messages-area');
    container.innerHTML = '';

    if (tab === 'global') {
        Services.chat.listenToGlobalChat(); // Re-attach
    } else {
        // Load DMs (Not implemented fully in phase 1, showing placeholder)
        container.innerHTML = `<div class="text-center text-gray-500 mt-10">Direct Messages coming soon!</div>`;
    }
}

function renderMessage(msg, container) {
    const isMe = Services.state.currentUser && msg.uid === Services.state.currentUser.uid;
    const div = document.createElement('div');
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
    div.innerHTML = `
        ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1 cursor-pointer hover:text-purple-400" onclick="openGamerCard('${msg.uid}')">${msg.user}</span>` : ''}
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            ${msg.text}
        </div>
    `;
    container.appendChild(div);
}

window.sendMsg = () => {
    const input = document.getElementById('chatMsgInput');
    if (input && input.value.trim()) {
        Services.chat.sendGlobalMessage(input.value.trim());
        input.value = '';
    }
}

/* -------------------------------------------------------------------------- */
/*                           SOCIAL FEED RENDERER                             */
/* -------------------------------------------------------------------------- */
function renderSocialFeed() {
    const container = document.getElementById('view-chat'); // Reusing Layout
    if (!container) return;

    // If not already social layout, render it
    if (!container.querySelector('.social-feed')) {
        container.innerHTML = `
            <div class="chat-layout">
                <div class="chat-list-panel">
                     <div class="p-4 border-b border-white/5">
                        <h2 class="text-xl font-black text-white px-2">Social Hub</h2>
                    </div>
                    <div class="p-4">
                        <button onclick="switchView('profile')" class="w-full bg-white/5 hover:bg-white/10 text-white rounded-xl p-3 flex items-center gap-3 transition-all mb-2">
                             <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500"></div>
                             <span class="font-bold text-sm">My Profile</span>
                        </button>
                    </div>
                </div>

                <div class="chat-view-panel overflow-y-auto">
                    <div class="p-6 max-w-2xl mx-auto w-full">
                        <h2 class="text-2xl font-black text-white mb-6">Activity Feed</h2>
                        <div id="social-feed-content" class="social-feed">
                            <div class="text-center text-gray-500 py-10">Loading feed...</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        Services.feed.listenToFeed();
    }
}

window.addEventListener('feedUpdated', (e) => {
    const posts = e.detail;
    const container = document.getElementById('social-feed-content');
    if (container) {
        if (posts.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-500 py-10">No recent activity. Be the first!</div>`;
            return;
        }

        container.innerHTML = posts.map(post => {
            let contentHtml = '';
            if (post.type === 'favorite') {
                contentHtml = `
                    <div class="feed-header"><b>${post.user.username}</b> favorited a game</div>
                    <div class="feed-card">
                        <img src="assets/icons/logo.jpg" class="feed-game-thumb"> <!-- Placeholder -->
                        <div class="flex-1">
                             <div class="font-bold text-white text-sm">Game ID: ${post.data.gameId}</div>
                             <div class="text-xs text-gray-500">Arcade</div>
                        </div>
                        <button onclick="playGame(null, '${post.data.gameId}')" class="feed-btn-join">PLAY</button>
                    </div>
                `;
            } else if (post.type === 'join') {
                contentHtml = `<div class="feed-header"><b>${post.user.username}</b> just joined Satex Games! Welcome! 🎉</div>`;
            } else {
                contentHtml = `<div class="feed-header"><b>${post.user.username}</b> posted something.</div>`;
            }

            return `
                <div class="feed-item">
                    <img src="${post.user.avatar}" class="feed-avatar">
                    <div class="feed-content">
                        ${contentHtml}
                        <div class="feed-meta">${new Date(post.timestamp?.toDate()).toLocaleTimeString()}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
});

/* -------------------------------------------------------------------------- */
/*                           GAMER CARD MODAL                                 */
/* -------------------------------------------------------------------------- */
window.openGamerCard = async (uid) => {
    // 1. Create Overlay if Not Exists
    let overlay = document.getElementById('gamerCardOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'gamerCardOverlay';
        overlay.className = 'gamer-card-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('active'); };
        document.body.appendChild(overlay);
    }

    // 2. Load Data
    overlay.innerHTML = `<div class="text-white font-bold">Loading...</div>`;
    overlay.classList.add('active');

    // Fetch user public data (using simplified fetch for now, mostly mock logic for demo)
    // In real app, UserService.fetchPublicProfile(uid)

    const isMe = Services.state.currentUser?.uid === uid;
    const data = isMe ? Services.state.profile : { username: 'Unknown', avatar: '', xp: 0, level: 0, bio: 'Loading...' };
    // TODO: Fetch actual other user data from Firestore

    overlay.innerHTML = `
        <div class="gamer-card">
            <div class="card-banner">
                <button onclick="document.getElementById('gamerCardOverlay').classList.remove('active')" class="absolute top-4 right-4 text-white/50 hover:text-white">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="card-avatar">
                <img src="${data.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + uid}" class="w-full h-full object-cover rounded-full">
            </div>
            <div class="card-content">
                <h3 class="card-username">${data.username}</h3>
                <div class="card-status">
                    <div class="status-dot"></div> Online
                </div>
                
                <div class="card-stats">
                    <div class="stat-item">
                        <span class="stat-val">${data.level || 1}</span>
                        <span class="stat-label">Level</span>
                    </div>
                     <div class="stat-item">
                        <span class="stat-val">${data.xp || 0}</span>
                        <span class="stat-label">XP</span>
                    </div>
                     <div class="stat-item">
                        <span class="stat-val">${data.followers_count || 0}</span>
                        <span class="stat-label">Followers</span>
                    </div>
                </div>

                <div class="card-actions">
                    ${!isMe ? `<button class="btn-primary">Follow</button><button class="btn-secondary">Message</button>` : `<button class="btn-secondary w-full">Edit Profile</button>`}
                </div>
            </div>
        </div>
    `;
};

/* -------------------------------------------------------------------------- */
/*                           AUTH HANDLERS                                    */
/* -------------------------------------------------------------------------- */

window.handleLogin = async function () {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = "Logging in...";

    try {
        await Services.auth.login(email, pass);
        document.getElementById('chatLoginOverlay').classList.remove('active');
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
    }
};

window.handleSignup = async function () {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const errorDiv = document.getElementById('authError');

    if (!username) return errorDiv.textContent = "Username required";
    if (errorDiv) errorDiv.textContent = "Creating account...";

    try {
        await Services.auth.signup(username, email, pass);
        document.getElementById('chatLoginOverlay').classList.remove('active');
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
    }
};

window.toggleAuthMode = function (mode) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.querySelector('#chatLoginOverlay h3');

    if (mode === 'signup') {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        if (title) title.innerText = "CREATE ACCOUNT";
    } else {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        if (title) title.innerText = "PLAYER LOGIN";
    }
}

