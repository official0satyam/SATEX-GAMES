/* -------------------------------------------------------------------------- */
/*                                UI MANAGER                                  */
/* -------------------------------------------------------------------------- */

window.currentUserData = null;
window.activeChatTab = 'global';
window.chatState = {
    globalMessages: [],
    directMessages: [],
    feedPosts: [],
    friends: [],
    requests: [],
    onlineUsers: [],
    activeDmFriend: null
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[UI] Initializing...");

    if (window.loadGames) await window.loadGames();

    const params = new URLSearchParams(window.location.search);
    const view = params.get('view') || 'home';
    const joinGameId = params.get('game');

    if (joinGameId) {
        setTimeout(() => {
            const game = window.allGames?.find(g => g.id === joinGameId);
            if (game) playGame(game.url, game.title);
        }, 500);
    }

    _renderView(view, false);

    window.addEventListener('authStateChanged', (e) => {
        const user = e.detail.user;
        console.log("[UI] Auth state:", user ? "LOGGED_IN" : "GUEST");

        if (user) closeAuthOverlay();
        if (!user) {
            window.chatState.activeDmFriend = null;
            window.chatState.directMessages = [];
        }

        const currentView = new URLSearchParams(window.location.search).get('view') || 'home';
        if (currentView === 'profile' || currentView === 'chat' || currentView === 'social') {
            _renderView(currentView, false);
        }
    });

    window.addEventListener('profileUpdated', (e) => {
        window.currentUserData = e.detail;
        if (document.getElementById('view-profile')?.classList.contains('active')) {
            renderProfile();
        }
    });

    window.addEventListener('globalChatUpdated', (e) => {
        window.chatState.globalMessages = e.detail || [];
        if (isChatViewActive() && window.activeChatTab === 'global') {
            renderGlobalMessages();
        }
    });

    window.addEventListener('directChatUpdated', (e) => {
        const detail = e.detail || {};
        if (window.chatState.activeDmFriend && detail.targetUid === window.chatState.activeDmFriend.uid) {
            window.chatState.directMessages = detail.messages || [];
            if (isChatViewActive() && window.activeChatTab === 'dms') {
                renderDirectMessages();
            }
        }
    });

    window.addEventListener('friendsUpdated', (e) => {
        window.chatState.friends = e.detail || [];
        if (isChatViewActive() && window.activeChatTab === 'dms') {
            renderChatListContent();
        }
    });

    window.addEventListener('requestsUpdated', (e) => {
        window.chatState.requests = e.detail || [];
        if (isChatViewActive() && window.activeChatTab === 'dms') {
            renderChatListContent();
        }
    });

    window.addEventListener('onlineUsersUpdated', (e) => {
        window.chatState.onlineUsers = e.detail || [];
        if (isChatViewActive()) {
            renderChatListContent();
        }
    });

    window.addEventListener('feedUpdated', (e) => {
        window.chatState.feedPosts = e.detail || [];
        if (isSocialViewActive()) {
            renderSocialFeed(true);
        }
    });

    const overlay = document.getElementById('chatLoginOverlay');
    if (overlay) {
        overlay.onclick = (event) => {
            if (event.target === overlay) closeAuthOverlay();
        };
    }
});

/* -------------------------------------------------------------------------- */
/*                              VIEW NAVIGATION                               */
/* -------------------------------------------------------------------------- */

window.addEventListener('popstate', (e) => {
    const view = e.state ? e.state.view : 'home';
    _renderView(view, false);
});

window.switchView = function (viewName) {
    const currentParams = new URLSearchParams(window.location.search);
    const currentView = currentParams.get('view') || 'home';
    if (viewName === currentView) return;

    const url = viewName === 'home' ? window.location.pathname : `?view=${viewName}`;
    history.pushState({ view: viewName }, '', url);
    _renderView(viewName, true);
};

function _renderView(viewName, isPush) {
    console.log("[VIEW] Switching to:", viewName, "push:", isPush);

    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(btn => btn.classList.remove('active'));

    const sideBtn = document.querySelector(`.sidebar-item[data-view="${viewName}"]`);
    if (sideBtn) sideBtn.classList.add('active');

    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes(viewName)) btn.classList.add('active');
    });

    let target = document.getElementById(`view-${viewName}`);
    if (viewName === 'social') {
        target = document.getElementById('view-chat');
    }

    if (!target) {
        document.getElementById('view-home')?.classList.add('active');
        window.scrollTo(0, 0);
        return;
    }

    target.classList.add('active');
    if (viewName === 'profile') renderProfile();
    if (viewName === 'chat') renderChatInterface();
    if (viewName === 'social') renderSocialFeed();

    window.scrollTo(0, 0);
}

function isChatViewActive() {
    const view = new URLSearchParams(window.location.search).get('view') || 'home';
    return view === 'chat' && document.getElementById('view-chat')?.classList.contains('active');
}

function isSocialViewActive() {
    const view = new URLSearchParams(window.location.search).get('view') || 'home';
    return view === 'social' && document.getElementById('view-chat')?.classList.contains('active');
}

/* -------------------------------------------------------------------------- */
/*                              PROFILE RENDERER                              */
/* -------------------------------------------------------------------------- */

function renderProfile() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    if (!window.Services?.state?.currentUser) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
                <i class="fas fa-lock text-6xl text-gray-700 mb-6"></i>
                <h2 class="text-2xl font-bold text-white mb-2">Member Access Only</h2>
                <p class="text-gray-500 mb-8 max-w-xs">Viewing profiles requires an active Satex Games account.</p>
                <button onclick="window.openAuthOverlay()" class="px-8 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-bold text-white shadow-lg shadow-purple-900/40 transition-all transform hover:scale-105">
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
            <h2 class="text-3xl font-black text-white tracking-tight">${escapeHtml(userData.username || 'Player')}</h2>
            <div class="flex gap-4 mt-2 mb-6 text-sm text-gray-400">
                <span><b>${userData.followers_count || 0}</b> Followers</span>
                <span><b>${userData.following_games?.length || 0}</b> Following</span>
            </div>

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
    const container = document.getElementById('view-chat');
    if (!container) return;

    container.innerHTML = `
        <div class="chat-layout">
            <div class="chat-list-panel">
                <div class="p-4 border-b border-white/5">
                    <div class="flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-global" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase">Global</button>
                        <button onclick="switchChatTab('dms')" id="tab-dms" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase">DMs</button>
                    </div>
                </div>
                <div class="p-4 border-b border-white/5">
                    <h4 class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Trending Now</h4>
                    <div id="trending-games-mini" class="flex gap-2 overflow-x-auto pb-2"></div>
                </div>
                <div id="chat-list-content" class="flex-1 overflow-y-auto p-2"></div>
            </div>

            <div class="chat-view-panel">
                <div class="md:hidden mobile-chat-tabs border-b border-white/5 gap-2 overflow-x-auto p-2">
                    <button onclick="switchChatTab('global')" id="tab-mobile-global" class="px-4 py-2 rounded-lg text-xs font-bold">Global</button>
                    <button onclick="switchChatTab('dms')" id="tab-mobile-dms" class="px-4 py-2 rounded-lg text-xs font-bold">DMs</button>
                </div>

                <div id="chat-messages-area" class="flex-1 overflow-y-auto p-4 content-start chat-messages-area"></div>

                <div class="chat-input-container border-t border-white/5">
                    <div class="flex gap-2">
                        <input type="text" id="chatMsgInput" placeholder="Message global chat..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50">
                        <button onclick="window.sendMsg()" class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const input = document.getElementById('chatMsgInput');
    if (input) {
        input.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') await window.sendMsg();
        });
    }

    populateTrending();
    window.Services?.chat?.listenToGlobalChat?.();
    renderChatListContent();
    window.switchChatTab(window.activeChatTab || 'global', true);
}

function renderSocialFeed(isUpdate = false) {
    const container = document.getElementById('view-chat');
    if (!container) return;

    if (!isUpdate || !document.getElementById('social-feed-content')) {
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
                        <div id="social-feed-content" class="social-feed"></div>
                    </div>
                </div>
            </div>
        `;
    }

    window.Services?.feed?.listenToFeed?.();
    renderFeedPosts();
}

function renderFeedPosts() {
    const feedContainer = document.getElementById('social-feed-content');
    if (!feedContainer) return;

    const posts = window.chatState.feedPosts || [];
    if (!posts.length) {
        feedContainer.innerHTML = `<div class="text-center text-gray-500 py-10">No activity yet.</div>`;
        return;
    }

    feedContainer.innerHTML = posts.map(post => {
        const user = post.user || {};
        const avatar = user.avatar || 'assets/icons/logo.jpg';
        const title = getFeedTitle(post);
        const time = formatDateTime(post.timestamp);

        return `
            <div class="feed-item">
                <img class="feed-avatar" src="${avatar}" alt="avatar">
                <div class="feed-content">
                    <div class="feed-header"><b>${escapeHtml(user.username || 'Player')}</b> ${title}</div>
                    <div class="feed-meta">${time}</div>
                </div>
            </div>
        `;
    }).join('');
}

function getFeedTitle(post) {
    if (post.type === 'friend') return `became friends with ${escapeHtml(post.data?.friendName || 'a player')}.`;
    if (post.type === 'favorite') return `followed a game (${escapeHtml(post.data?.gameId || 'unknown')}).`;
    return `posted an update.`;
}

function populateTrending() {
    const games = window.Services?.state?.gameLibrary || window.allGames || [];
    const trendingContainer = document.getElementById('trending-games-mini');
    if (!trendingContainer || !games.length) return;

    trendingContainer.innerHTML = [...games]
        .sort(() => 0.5 - Math.random())
        .slice(0, 5)
        .map(g => `
            <div class="flex-shrink-0 w-16 cursor-pointer group" onclick="playGame('${g.url}', '${escapeAttr(g.title)}')">
                <img src="${g.thumbnail}" class="w-16 h-16 rounded-xl object-cover border border-white/10 group-hover:border-purple-500 transition-all">
                <div class="text-[10px] text-gray-400 truncate mt-1 text-center group-hover:text-white">${escapeHtml(g.title)}</div>
            </div>
        `).join('');
}

function renderChatListContent() {
    const list = document.getElementById('chat-list-content');
    if (!list) return;

    if (window.activeChatTab === 'global') {
        const onlinePreview = (window.chatState.onlineUsers || []).slice(0, 8);
        list.innerHTML = `
            <div class="p-2">
                <div class="bg-white/5 border border-white/10 rounded-xl p-3 mb-3">
                    <p class="text-xs text-gray-300 font-bold mb-1">Global Lobby</p>
                    <p class="text-[11px] text-gray-500">Talk with all players in real time.</p>
                </div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Online Players</div>
                <div class="space-y-2">
                    ${onlinePreview.length ? onlinePreview.map(user => `
                        <div class="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                            <span class="w-2 h-2 rounded-full bg-green-400"></span>
                            <span class="text-xs text-gray-200 truncate">${escapeHtml(user.username || 'Player')}</span>
                        </div>
                    `).join('') : `<div class="text-xs text-gray-500 px-1">No online players found.</div>`}
                </div>
            </div>
        `;
        return;
    }

    renderDirectListPanel(list);
}

function renderDirectListPanel(list) {
    if (!window.Services?.state?.currentUser) {
        list.innerHTML = `
            <div class="p-3">
                <div class="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p class="text-sm text-gray-200 font-bold mb-2">Login Required</p>
                    <p class="text-xs text-gray-500 mb-3">Sign in to view friends and DMs.</p>
                    <button onclick="window.openAuthOverlay()" class="px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-bold">Login / Signup</button>
                </div>
            </div>
        `;
        return;
    }

    const requests = window.chatState.requests || [];
    const friends = window.chatState.friends || [];
    const onlineIds = new Set((window.chatState.onlineUsers || []).map(u => u.uid));

    list.innerHTML = `
        <div class="p-2 space-y-3">
            <div class="bg-white/5 border border-white/10 rounded-xl p-3">
                <div class="flex gap-2">
                    <input id="friendSearchInput" type="text" placeholder="Search username..." class="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none">
                    <button onclick="window.searchFriendUsers()" class="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white font-bold">Find</button>
                </div>
                <div id="friend-search-results" class="mt-2 space-y-2"></div>
            </div>

            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Requests</div>
                <div class="space-y-2">
                    ${requests.length ? requests.map(req => `
                        <div class="bg-white/5 border border-white/10 rounded-lg p-2 flex items-center justify-between gap-2">
                            <div class="text-xs text-gray-200 truncate">${escapeHtml(req.username || req.from)}</div>
                            <button onclick="window.acceptFriendRequest('${req.from}')" class="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-[10px] font-bold">Accept</button>
                        </div>
                    `).join('') : `<div class="text-xs text-gray-500 px-1">No pending requests.</div>`}
                </div>
            </div>

            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Friends</div>
                <div class="space-y-2">
                    ${friends.length ? friends.map(friend => {
                        const isOnline = onlineIds.has(friend.uid);
                        const encodedName = encodeURIComponent(friend.username || 'Player');
                        const encodedAvatar = encodeURIComponent(friend.avatar || '');
                        return `
                            <button onclick="window.startDm('${friend.uid}','${encodedName}','${encodedAvatar}')" class="w-full text-left bg-white/5 border border-white/10 hover:border-purple-500/40 rounded-lg p-2 flex items-center gap-2 transition-all">
                                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-600'}"></span>
                                <span class="text-xs text-gray-200 truncate">${escapeHtml(friend.username || friend.uid)}</span>
                            </button>
                        `;
                    }).join('') : `<div class="text-xs text-gray-500 px-1">No friends yet.</div>`}
                </div>
            </div>

            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Online Players</div>
                <div class="space-y-2">
                    ${(window.chatState.onlineUsers || []).slice(0, 10).map(user => `
                        <div class="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                            <span class="w-2 h-2 rounded-full bg-green-400"></span>
                            <span class="text-xs text-gray-200 truncate">${escapeHtml(user.username || 'Player')}</span>
                        </div>
                    `).join('') || `<div class="text-xs text-gray-500 px-1">No online users right now.</div>`}
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/*                           CHAT LISTENERS & ACTIONS                         */
/* -------------------------------------------------------------------------- */

window.switchChatTab = function (tab, skipListRefresh = false) {
    window.activeChatTab = tab === 'dms' ? 'dms' : 'global';
    updateChatTabStyles();

    const input = document.getElementById('chatMsgInput');
    if (input) {
        if (window.activeChatTab === 'global') {
            input.placeholder = "Message global chat...";
            input.disabled = false;
        } else if (!window.chatState.activeDmFriend) {
            input.placeholder = "Select a friend to start DM...";
            input.disabled = true;
        } else {
            input.placeholder = `Message ${window.chatState.activeDmFriend.username}...`;
            input.disabled = false;
        }
    }

    if (!skipListRefresh) renderChatListContent();
    if (window.activeChatTab === 'global') {
        renderGlobalMessages();
    } else {
        renderDirectMessages();
    }
};

function updateChatTabStyles() {
    const desktopGlobal = document.getElementById('tab-global');
    const desktopDms = document.getElementById('tab-dms');
    const mobileGlobal = document.getElementById('tab-mobile-global');
    const mobileDms = document.getElementById('tab-mobile-dms');

    setTabClasses(desktopGlobal, window.activeChatTab === 'global');
    setTabClasses(desktopDms, window.activeChatTab === 'dms');
    setMobileTabClasses(mobileGlobal, window.activeChatTab === 'global');
    setMobileTabClasses(mobileDms, window.activeChatTab === 'dms');
}

function setTabClasses(el, active) {
    if (!el) return;
    el.classList.remove('bg-purple-600', 'text-white', 'shadow-lg', 'text-gray-500', 'hover:bg-white/5');
    if (active) {
        el.classList.add('bg-purple-600', 'text-white', 'shadow-lg');
    } else {
        el.classList.add('text-gray-500', 'hover:bg-white/5');
    }
}

function setMobileTabClasses(el, active) {
    if (!el) return;
    el.classList.remove('bg-purple-600', 'bg-white/5', 'text-white', 'text-gray-400');
    if (active) {
        el.classList.add('bg-purple-600', 'text-white');
    } else {
        el.classList.add('bg-white/5', 'text-gray-400');
    }
}

function renderGlobalMessages() {
    const container = document.getElementById('chat-messages-area');
    if (!container) return;

    const msgs = window.chatState.globalMessages || [];
    if (!msgs.length) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10">No global messages yet.</div>`;
        return;
    }

    container.innerHTML = '';
    msgs.forEach(msg => renderMessage(msg, container));
    container.scrollTop = container.scrollHeight;
}

function renderDirectMessages() {
    const container = document.getElementById('chat-messages-area');
    if (!container) return;

    if (!window.Services?.state?.currentUser) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10">Login to use direct messages.</div>`;
        return;
    }

    if (!window.chatState.activeDmFriend) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10">Select a friend from the left panel to start chatting.</div>`;
        return;
    }

    const msgs = window.chatState.directMessages || [];
    if (!msgs.length) {
        container.innerHTML = `<div class="text-center text-gray-500 mt-10">No messages yet with ${escapeHtml(window.chatState.activeDmFriend.username)}.</div>`;
        return;
    }

    container.innerHTML = '';
    msgs.forEach(msg => renderMessage(msg, container));
    container.scrollTop = container.scrollHeight;
}

window.sendMsg = async function () {
    const input = document.getElementById('chatMsgInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }

    try {
        if (window.activeChatTab === 'dms') {
            const friend = window.chatState.activeDmFriend;
            if (!friend) return;
            await window.Services.chat.sendDirectMessage(friend.uid, text);
        } else {
            await window.Services.chat.sendGlobalMessage(text);
        }
        input.value = '';
    } catch (e) {
        console.error("[CHAT] send error:", e);
    }
};

window.searchFriendUsers = async function () {
    const input = document.getElementById('friendSearchInput');
    const resultsBox = document.getElementById('friend-search-results');
    if (!input || !resultsBox) return;

    const term = input.value.trim();
    if (!term) {
        resultsBox.innerHTML = '';
        return;
    }

    if (!window.Services?.state?.currentUser) {
        resultsBox.innerHTML = `<div class="text-xs text-gray-500">Login first.</div>`;
        return;
    }

    try {
        const users = await window.Services.friend.searchUsers(term);
        const filtered = users.filter(u => u.uid !== window.Services.state.currentUser.uid);

        if (!filtered.length) {
            resultsBox.innerHTML = `<div class="text-xs text-gray-500">No users found.</div>`;
            return;
        }

        resultsBox.innerHTML = filtered.map(user => `
            <div class="bg-black/20 border border-white/10 rounded-lg p-2 flex items-center justify-between gap-2">
                <div class="text-xs text-gray-200 truncate">${escapeHtml(user.username || user.uid)}</div>
                <button onclick="window.sendFriendRequest('${user.uid}')" class="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-bold">Add</button>
            </div>
        `).join('');
    } catch (e) {
        console.error("[FRIEND] search error:", e);
        resultsBox.innerHTML = `<div class="text-xs text-red-400">Search failed.</div>`;
    }
};

window.sendFriendRequest = async function (targetUid) {
    try {
        await window.Services.friend.sendRequest(targetUid);
    } catch (e) {
        console.error("[FRIEND] request error:", e);
    }
};

window.acceptFriendRequest = async function (fromUid) {
    const request = (window.chatState.requests || []).find(r => r.from === fromUid || r.id === fromUid);
    if (!request) return;

    try {
        await window.Services.friend.acceptRequest(request);
    } catch (e) {
        console.error("[FRIEND] accept error:", e);
    }
};

window.startDm = function (uid, encodedName, encodedAvatar) {
    const username = decodeURIComponent(encodedName || 'Player');
    const avatar = decodeURIComponent(encodedAvatar || '');
    window.chatState.activeDmFriend = { uid, username, avatar };
    window.chatState.directMessages = [];
    window.switchChatTab('dms');
    window.Services?.chat?.listenToDirectChat?.(uid);
};

function renderMessage(msg, container) {
    const isMe = window.Services?.state?.currentUser && msg.uid === window.Services.state.currentUser.uid;
    const div = document.createElement('div');
    const stamp = formatTime(msg.timestamp);

    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
    div.innerHTML = `
        ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1">${escapeHtml(msg.user || 'Player')}</span>` : ''}
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            ${escapeHtml(msg.text || '')}
            <div class="text-[9px] opacity-60 mt-1 text-right">${stamp}</div>
        </div>
    `;
    container.appendChild(div);
}

/* -------------------------------------------------------------------------- */
/*                                AUTH MODAL                                  */
/* -------------------------------------------------------------------------- */

window.openAuthOverlay = function () {
    const overlay = document.getElementById('chatLoginOverlay');
    if (!overlay) return;
    toggleAuthMode('login');
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = '';
    overlay.classList.add('active');
};

window.closeAuthOverlay = closeAuthOverlay;

function closeAuthOverlay() {
    const overlay = document.getElementById('chatLoginOverlay');
    if (!overlay) return;
    overlay.classList.remove('active');
}

window.handleLogin = async function () {
    const email = document.getElementById('emailInput')?.value || '';
    const pass = document.getElementById('passwordInput')?.value || '';
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = "Logging in...";

    try {
        await window.Services.auth.login(email, pass);
        closeAuthOverlay();
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
    }
};

window.handleSignup = async function () {
    const username = (document.getElementById('signupUsername')?.value || '').trim();
    const email = document.getElementById('signupEmail')?.value || '';
    const pass = document.getElementById('signupPassword')?.value || '';
    const errorDiv = document.getElementById('authError');

    if (!username) {
        if (errorDiv) errorDiv.textContent = "Username required";
        return;
    }
    if (errorDiv) errorDiv.textContent = "Creating account...";

    try {
        await window.Services.auth.signup(username, email, pass);
        closeAuthOverlay();
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
    }
};

window.toggleAuthMode = toggleAuthMode;

function toggleAuthMode(mode) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const title = document.querySelector('#chatLoginOverlay h3');
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = '';

    if (!loginForm || !signupForm) return;

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

/* -------------------------------------------------------------------------- */
/*                         LEGACY BRIDGE (OLD WIDGET)                         */
/* -------------------------------------------------------------------------- */

window.toggleChat = function () {
    window.switchView('chat');
};

window.switchTab = function (tab) {
    window.switchView('chat');
    window.switchChatTab(tab === 'friends' ? 'dms' : 'global');
};

window.forceSyncProfile = async function () {
    const current = window.Services?.state?.currentUser;
    if (!current) {
        window.openAuthOverlay();
        return;
    }
    await window.Services.user.fetchProfile(current.uid);
};

window.closePrivateChat = function () {
    window.switchView('chat');
    window.switchChatTab('dms');
};

/* -------------------------------------------------------------------------- */
/*                                  HELPERS                                   */
/* -------------------------------------------------------------------------- */

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return String(value || '').replace(/'/g, "\\'");
}

function formatTime(stamp) {
    const date = coerceDate(stamp);
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(stamp) {
    const date = coerceDate(stamp);
    if (!date) return 'just now';
    return date.toLocaleString();
}

function coerceDate(stamp) {
    if (!stamp) return null;
    if (typeof stamp.toDate === 'function') return stamp.toDate();
    if (typeof stamp === 'number') return new Date(stamp);
    if (typeof stamp.seconds === 'number') return new Date(stamp.seconds * 1000);
    return null;
}
