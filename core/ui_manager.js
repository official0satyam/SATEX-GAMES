
/* -------------------------------------------------------------------------- */
/*                           UI MANAGER (STRICT FIX)                          */
/* -------------------------------------------------------------------------- */
// STRICT FIX: Ensure Auth unlocks UI immediately and Views switch cleanly.

window.currentUserData = null; // Global State

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 [UI] Initializing...");

    // 1. Force Load Game Data First
    if (window.loadGames) await window.loadGames();

    // 2. Check URL for View
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'home';
    const joinGameId = params.get('game');

    // 3. Handle Deep Linking (Game)
    if (joinGameId) {
        setTimeout(() => {
            const game = window.allGames?.find(g => g.id === joinGameId);
            if (game) playGame(game.url, game.title);
        }, 500);
    }

    // 4. Initial View Render
    _renderView(view, false);

    // 5. Auth State Listener (The "Key" to the Gate)
    window.addEventListener('authStateChanged', (e) => {
        const user = e.detail.user;
        console.log("🔐 [UI] Auth State Changed:", user ? "LOGGED IN" : "GUEST");

        if (user) {
            // UNLOCK GATES
            document.querySelectorAll('.auth-btn').forEach(b => b.classList.add('hidden'));
            // If on profile/chat, re-render to show content instead of lock screen
            const currentView = new URLSearchParams(window.location.search).get('view');
            if (currentView === 'profile' || currentView === 'chat' || currentView === 'social') {
                _renderView(currentView, false);
            }
        }
    });

    // 6. Profile Data Updates
    window.addEventListener('profileUpdated', (e) => {
        window.currentUserData = e.detail; // Sync Global
        console.log("👤 [UI] Profile Data Synced", window.currentUserData?.username);
        // Force re-render of profile if active
        if (document.getElementById('view-profile').classList.contains('active')) {
            renderProfile();
        }
    });

    // 7. Global Chat Updates
    window.addEventListener('globalChatUpdated', (e) => {
        const msgs = e.detail;
        const container = document.getElementById('chat-messages-area');
        if (container && window.activeChatTab === 'global') {
            container.innerHTML = '';
            msgs.forEach(msg => renderMessage(msg, container));
            container.scrollTop = container.scrollHeight;
        }
    });

    // 8. Feed Updates
    window.addEventListener('feedUpdated', (e) => {
        // Redraw feed if social view is active
        if (document.getElementById('view-chat').classList.contains('active')) {
            renderSocialFeed(true); // pass update flag
        }
    });

    // 9. Close Overlay on Outside Click
    const overlay = document.getElementById('chatLoginOverlay');
    if (overlay) {
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        }
    }
});


/* -------------------------------------------------------------------------- */
/*                           VIEW NAVIGATION                                  */
/* -------------------------------------------------------------------------- */
window.activeChatTab = 'global';

window.addEventListener('popstate', (e) => {
    const view = e.state ? e.state.view : 'home';
    _renderView(view, false);
});

window.switchView = function (viewName) {
    const currentParams = new URLSearchParams(window.location.search);
    if (viewName === currentParams.get('view')) return; // No-op if same

    const url = viewName === 'home' ? window.location.pathname : `?view=${viewName}`;
    history.pushState({ view: viewName }, '', url);
    _renderView(viewName, true);
}

function _renderView(viewName, isPush) {
    console.log("📺 [VIEW] Switching to:", viewName);

    // Hide All Sections
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Update Sidebar/Nav Active State
    document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));

    // Highlight Buttons
    const sideBtn = document.querySelector(`.sidebar-item[data-view="${viewName}"]`);
    if (sideBtn) sideBtn.classList.add('active');

    // Bottom Nav (match onclick)
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes(viewName)) btn.classList.add('active');
    });

    // Show Target View
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');

        // View Specific Logic
        if (viewName === 'profile') renderProfile();
        if (viewName === 'chat') renderChatInterface();
        if (viewName === 'social') renderSocialFeed();
    } else {
        // Fallback to home if view doesn't exist
        document.getElementById('view-home').classList.add('active');
    }
    window.scrollTo(0, 0);
}

/* -------------------------------------------------------------------------- */
/*                           PROFILE RENDERER                                 */
/* -------------------------------------------------------------------------- */
function renderProfile() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    // STRICT LOCK: Check Global State
    if (!window.Services?.state?.currentUser) {
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

    const userData = window.currentUserData || { username: 'Loading...', level: 1, xp: 0 };

    container.innerHTML = `
        <div class="profile-header group relative">
            <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop" class="banner-img">
            <button onclick="window.Services.auth.logout()" class="absolute top-4 right-4 bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold backdrop-blur-sm transition-all shadow-lg">
                <i class="fas fa-sign-out-alt mr-1"></i> LOGOUT
            </button>
            <div class="profile-avatar-container">
                <div class="avatar-ring">
                    <img src="${userData.avatar || 'assets/icons/logo.jpg'}" class="avatar-img">
                </div>
                <div class="level-badge-large">LVL ${userData.level || 1}</div>
            </div>
        </div>

        <div class="px-4 md:px-0 mt-16 md:mt-0">
            <h2 class="text-3xl font-black text-white tracking-tight">${userData.username}</h2>
            <div class="flex gap-4 mt-2 mb-6 text-sm text-gray-400">
                <span><b>${userData.followers_count || 0}</b> Followers</span>
                <span><b>${userData.following_games?.length || 0}</b> Following</span>
            </div>

            <!-- Gamer Card Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${userData.xp || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Total XP</div>
                </div>
                 <div class="stat-card">
                   <div class="text-2xl font-black text-white">${userData.games_played || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Games Played</div>
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/*                           CHAT & SOCIAL RENDERER                           */
/* -------------------------------------------------------------------------- */
function renderChatInterface() {
    const container = document.getElementById('view-chat'); // Reusing container
    const isChatMode = !new URLSearchParams(window.location.search).get('view')?.includes('social');

    // Prevent re-rendering if already there (unless switching)
    if (isChatMode && container.querySelector('.chat-input-container')) return;

    container.innerHTML = `
        <div class="chat-layout">
            <!-- Sidebar -->
            <div class="chat-list-panel">
                <div class="p-4 border-b border-white/5">
                     <div class="flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-global" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase ${window.activeChatTab === 'global' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:bg-white/5'}">Global</button>
                        <button onclick="switchChatTab('dms')" id="tab-dms" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase ${window.activeChatTab === 'dms' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:bg-white/5'}">DMs</button>
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
                        <button onclick="window.sendMsg()" class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Populate Trending
    populateTrending();

    // Initial Load
    Services.chat.listenToGlobalChat();
}

function renderSocialFeed(isUpdate = false) {
    const container = document.getElementById('view-chat');

    if (!isUpdate) {
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

function populateTrending() {
    const games = Services.state.gameLibrary || window.allGames || [];
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
}

/* -------------------------------------------------------------------------- */
/*                           LISTENERS & ACTIONS                              */
/* -------------------------------------------------------------------------- */
window.switchChatTab = function (tab) {
    window.activeChatTab = tab;
    if (tab === 'global') {
        renderChatInterface();
    } else {
        // Mock DM view
        const container = document.getElementById('chat-messages-area');
        if (container) container.innerHTML = `<div class="text-center text-gray-500 mt-10">Direct Messages coming soon!</div>`;
    }
}

window.sendMsg = async function () {
    const input = document.getElementById('chatMsgInput');
    if (input && input.value.trim()) {
        if (!Services.state.currentUser) {
            document.getElementById('chatLoginOverlay').classList.add('active');
            return;
        }
        await Services.chat.sendGlobalMessage(input.value.trim());
        input.value = '';
    }
}

function renderMessage(msg, container) {
    const isMe = Services.state.currentUser && msg.uid === Services.state.currentUser.uid;
    const div = document.createElement('div');
    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
    div.innerHTML = `
        ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1 cursor-pointer hover:text-purple-400" onclick="alert('Profile: ${msg.uid}')">${msg.user}</span>` : ''}
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            ${msg.text}
        </div>
    `;
    container.appendChild(div);
}

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
