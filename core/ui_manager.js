/* -------------------------------------------------------------------------- */
/*                                UI MANAGER                                  */
/* -------------------------------------------------------------------------- */

window.currentUserData = null;
window.activeChatTab = 'global';
window.chatState = {
    currentView: 'home',
    globalMessages: [],
    directMessages: [],
    dmThreads: [],
    feedPosts: [],
    feedComments: {},
    feedCommentUnsubs: {},
    expandedComments: {},
    friends: [],
    requests: [],
    onlineUsers: [],
    activeDmFriend: null,
    viewedProfileUid: null,
    viewedProfileData: null,
    viewedProfileRelation: null,
    mobileListOpen: false,
    mobileDmConversationOpen: false,
    feedFollowingOnly: false,
    followedUsers: [],
    followedUsersLoadedFor: null,
    sentRequests: {},
    feedComposerFiles: [],
    profileUpload: {
        avatarUrl: '',
        coverUrl: ''
    }
};

const PRESET_AVATARS = Array.from({ length: 10 }, (_, idx) => `https://api.dicebear.com/7.x/adventurer/svg?seed=satex-avatar-${idx + 1}`);
const PRESET_COVERS = Array.from({ length: 10 }, (_, idx) => `https://picsum.photos/seed/satex-cover-${idx + 1}/1280/420`);

document.addEventListener('DOMContentLoaded', async () => {
    console.log("[UI] Initializing...");
    ensureToastStack();

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

    document.querySelectorAll('.sidebar-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const nextView = btn.getAttribute('data-view');
            if (nextView) window.switchView(nextView);
        });
    });

    window.addEventListener('authStateChanged', (e) => {
        const user = e.detail.user;
        console.log("[UI] Auth state:", user ? "LOGGED_IN" : "GUEST");

        if (user) {
            closeAuthOverlay();
            window.chatState.sentRequests = {};
        }
        if (!user) {
            cleanupFeedComposerPreviewUrls();
            cleanupProfilePreviewUrls();
            window.chatState.activeDmFriend = null;
            window.chatState.directMessages = [];
            window.chatState.sentRequests = {};
            window.chatState.feedComposerFiles = [];
            window.chatState.profileUpload = { avatarUrl: '', coverUrl: '' };
            window.chatState.feedFollowingOnly = false;
            window.chatState.followedUsers = [];
            window.chatState.followedUsersLoadedFor = null;
            window.chatState.viewedProfileUid = null;
            window.chatState.viewedProfileData = null;
            window.chatState.viewedProfileRelation = null;
            cleanupFeedCommentListeners();
            window.chatState.feedComments = {};
            window.chatState.expandedComments = {};
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
        if (window.chatState.viewedProfileUid && window.Services?.state?.currentUser && window.chatState.viewedProfileUid !== window.Services.state.currentUser.uid) {
            loadViewedProfile(window.chatState.viewedProfileUid);
        }
        if (isChatViewActive()) {
            renderChatListContent();
            updateChatTabStyles();
        }
    });

    window.addEventListener('requestsUpdated', (e) => {
        window.chatState.requests = e.detail || [];
        if (window.chatState.viewedProfileUid && window.Services?.state?.currentUser && window.chatState.viewedProfileUid !== window.Services.state.currentUser.uid) {
            loadViewedProfile(window.chatState.viewedProfileUid);
        }
        if (isChatViewActive()) {
            renderChatListContent();
            updateChatTabStyles();
        }
    });

    window.addEventListener('onlineUsersUpdated', (e) => {
        window.chatState.onlineUsers = e.detail || [];
        if (isChatViewActive()) {
            renderChatListContent();
        }
    });

    window.addEventListener('dmThreadsUpdated', (e) => {
        window.chatState.dmThreads = e.detail || [];
        if (isChatViewActive() && window.activeChatTab === 'dms') {
            renderChatListContent();
        }
    });

    window.addEventListener('feedUpdated', (e) => {
        window.chatState.feedPosts = e.detail || [];
        pruneFeedCommentListeners();
        if (isSocialViewActive()) {
            renderSocialFeed(true);
        }
    });

    window.addEventListener('serviceError', (e) => {
        const detail = e.detail || {};
        if (!detail.message) return;
        showToast(detail.message, "error");
    });

    const overlay = document.getElementById('chatLoginOverlay');
    if (overlay) {
        overlay.onclick = (event) => {
            if (event.target === overlay) closeAuthOverlay();
        };
    }

    window.addEventListener('resize', () => {
        if (isChatViewActive()) updateMobileChatPanels();
        syncMobileShellVisibility();
    });

    setTimeout(() => {
        if (!window.Services?.auth) {
            console.error("[UI] Services module failed to initialize. Auth unavailable.");
            showToast("Core services did not load. Refresh page.", "error");
        }
    }, 3000);
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
    if (window.matchMedia('(max-width: 1100px)').matches) {
        const sidebar = document.getElementById('sidebar');
        const backdrop = document.getElementById('sidebarBackdrop');
        if (sidebar) sidebar.style.transform = 'translateX(-100%)';
        if (backdrop) backdrop.classList.add('hidden');
    }
};

function _renderView(viewName, isPush) {
    console.log("[VIEW] Switching to:", viewName, "push:", isPush);
    const previousView = window.chatState.currentView || 'home';

    if (previousView === 'chat' && viewName !== 'chat') {
        window.Services?.chat?.stopDirectChat?.();
        window.Services?.chat?.stopDmThreads?.();
        window.Services?.chat?.stopGlobalChat?.();
        window.Services?.friend?.stopOnlineUsers?.();
        window.chatState.mobileDmConversationOpen = false;
    }
    if (previousView === 'social' && viewName !== 'social') {
        cleanupFeedCommentListeners();
        window.Services?.feed?.stopFeed?.();
    }

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
        window.chatState.currentView = 'home';
        syncMobileShellVisibility();
        window.scrollTo(0, 0);
        return;
    }

    target.classList.add('active');
    if (viewName === 'profile') renderProfile();
    if (viewName === 'chat') renderChatInterface();
    if (viewName === 'social') renderSocialFeed();

    window.chatState.currentView = viewName;
    syncMobileShellVisibility();
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

function isProfileViewActive() {
    const view = new URLSearchParams(window.location.search).get('view') || 'home';
    return view === 'profile' && document.getElementById('view-profile')?.classList.contains('active');
}

function isMobileViewport() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function syncMobileShellVisibility() {
    const header = document.getElementById('appHeader') || document.querySelector('header.glass-header');
    const bottomNav = document.getElementById('mobileBottomNav') || document.querySelector('nav.bottom-nav');
    if (!header || !bottomNav) return;

    const isMobile = isMobileViewport();
    const inSocialView = window.chatState.currentView === 'social';
    const inChatView = window.chatState.currentView === 'chat';
    const inProfileView = window.chatState.currentView === 'profile';
    const inDmConversation = inChatView
        && window.activeChatTab === 'dms'
        && Boolean(window.chatState.activeDmFriend)
        && Boolean(window.chatState.mobileDmConversationOpen);
    const shouldHideHeader = isMobile && (inSocialView || inChatView || inProfileView);

    if (shouldHideHeader) {
        header.classList.add('hidden');
        if (inDmConversation) bottomNav.classList.add('hidden');
        else bottomNav.classList.remove('hidden');
        if (inDmConversation) document.body.classList.add('mobile-dm-focused');
        else document.body.classList.remove('mobile-dm-focused');
    } else {
        header.classList.remove('hidden');
        bottomNav.classList.remove('hidden');
        document.body.classList.remove('mobile-dm-focused');
    }
}

function renderMobileViewHeader(title = 'Section') {
    return `
        <div class="profile-v2-mobile-head md:hidden">
            <button onclick="toggleSidebar()" class="profile-v2-mobile-btn" aria-label="Menu">
                <i class="fas fa-bars"></i>
            </button>
            <h2 class="profile-v2-mobile-title">${escapeHtml(title)}</h2>
            <button onclick="openSearchPage('')" class="profile-v2-mobile-btn" aria-label="Search">
                <i class="fas fa-search"></i>
            </button>
        </div>
    `;
}

function updateChatComposerState() {
    const composer = document.getElementById('chat-input-container');
    const input = document.getElementById('chatMsgInput');
    if (!composer || !input) return;

    const isMobile = isMobileViewport();
    let showComposer = true;
    if (window.activeChatTab === 'dms' && isMobile && !window.chatState.mobileDmConversationOpen) {
        showComposer = false;
    }
    composer.classList.toggle('hidden', !showComposer);

    if (window.activeChatTab === 'global') {
        input.placeholder = "Message global chat...";
        input.disabled = false;
        return;
    }
    if (!window.chatState.activeDmFriend) {
        input.placeholder = "Select a friend to start DM...";
        input.disabled = true;
        return;
    }

    input.placeholder = `Message ${window.chatState.activeDmFriend.username}...`;
    input.disabled = false;
}

async function loadViewedProfile(uid) {
    if (!uid) return;
    try {
        const profile = await window.Services?.user?.fetchUserByUid?.(uid);
        if (!profile) {
            window.chatState.viewedProfileData = null;
            window.chatState.viewedProfileRelation = null;
            if (isProfileViewActive()) renderProfile();
            return;
        }

        window.chatState.viewedProfileData = profile;
        if (window.Services?.state?.currentUser && uid !== window.Services.state.currentUser.uid) {
            const [friendRelation, followRelation] = await Promise.all([
                window.Services.friend.getRelationship(uid),
                window.Services.user.getFollowRelationship(uid)
            ]);
            window.chatState.viewedProfileRelation = {
                ...(friendRelation || {}),
                ...(followRelation || {})
            };
        } else {
            window.chatState.viewedProfileRelation = null;
        }
        if (isProfileViewActive()) renderProfile();
    } catch (e) {
        console.error("[PROFILE] load viewed profile error:", e);
        showToast(e.message || "Could not load profile", "error");
    }
}

window.openUserProfile = async function (uid) {
    if (!uid) return;
    const currentUid = window.Services?.state?.currentUser?.uid || null;
    if (currentUid && uid === currentUid) {
        window.chatState.viewedProfileUid = null;
        window.chatState.viewedProfileData = null;
        window.chatState.viewedProfileRelation = null;
        if (isProfileViewActive()) renderProfile();
        else window.switchView('profile');
        return;
    }

    window.chatState.viewedProfileUid = uid;
    window.chatState.viewedProfileData = null;
    window.chatState.viewedProfileRelation = null;
    if (isProfileViewActive()) renderProfile();
    else window.switchView('profile');
    await loadViewedProfile(uid);
};

window.openMyProfile = function () {
    window.chatState.viewedProfileUid = null;
    window.chatState.viewedProfileData = null;
    window.chatState.viewedProfileRelation = null;
    if (isProfileViewActive()) renderProfile();
    else window.switchView('profile');
};

window.sendFriendRequestFromViewedProfile = async function () {
    const targetUid = window.chatState.viewedProfileUid;
    if (!targetUid) return;
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    try {
        await window.Services.friend.sendRequest(targetUid);
        window.chatState.sentRequests[targetUid] = true;
        window.chatState.viewedProfileRelation = {
            ...(window.chatState.viewedProfileRelation || {}),
            isSelf: false,
            isFriend: false,
            incomingRequest: false,
            outgoingRequest: true
        };
        showToast("Friend request sent", "success");
        renderProfile();
    } catch (e) {
        showToast(e.message || "Could not send request", "error");
    }
};

window.acceptViewedProfileRequest = async function () {
    const targetUid = window.chatState.viewedProfileUid;
    if (!targetUid) return;
    const request = (window.chatState.requests || []).find(r => r.from === targetUid || r.id === targetUid);
    if (!request) {
        showToast("No pending request from this player", "error");
        return;
    }

    try {
        await window.Services.friend.acceptRequest(request);
        window.chatState.viewedProfileRelation = {
            ...(window.chatState.viewedProfileRelation || {}),
            isSelf: false,
            isFriend: true,
            incomingRequest: false,
            outgoingRequest: false
        };
        showToast("Friend request accepted", "success");
        renderProfile();
    } catch (e) {
        showToast(e.message || "Could not accept request", "error");
    }
};

window.followViewedProfile = async function () {
    const targetUid = window.chatState.viewedProfileUid;
    if (!targetUid) return;
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    try {
        await window.Services.user.followUser(targetUid, window.chatState.viewedProfileData || {});
        window.chatState.followedUsersLoadedFor = null;
        window.chatState.viewedProfileRelation = {
            ...(window.chatState.viewedProfileRelation || {}),
            isFollowing: true
        };
        if (window.chatState.viewedProfileData) {
            const current = Number(window.chatState.viewedProfileData.followers_count || 0);
            window.chatState.viewedProfileData.followers_count = current + 1;
        }
        showToast("Now following this player", "success");
        renderProfile();
    } catch (e) {
        showToast(e.message || "Could not follow player", "error");
    }
};

window.unfollowViewedProfile = async function () {
    const targetUid = window.chatState.viewedProfileUid;
    if (!targetUid) return;
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    try {
        await window.Services.user.unfollowUser(targetUid);
        window.chatState.followedUsersLoadedFor = null;
        window.chatState.viewedProfileRelation = {
            ...(window.chatState.viewedProfileRelation || {}),
            isFollowing: false
        };
        if (window.chatState.viewedProfileData) {
            const current = Number(window.chatState.viewedProfileData.followers_count || 0);
            window.chatState.viewedProfileData.followers_count = Math.max(0, current - 1);
        }
        showToast("Unfollowed player", "success");
        renderProfile();
    } catch (e) {
        showToast(e.message || "Could not unfollow player", "error");
    }
};

window.messageViewedProfile = function () {
    const target = window.chatState.viewedProfileData;
    if (!target?.uid) return;
    const encodedName = encodeURIComponent(target.username || target.display_name || 'Player');
    const encodedAvatar = encodeURIComponent(target.avatar || '');
    window.startDm(target.uid, encodedName, encodedAvatar);
    window.switchView('chat');
};

/* -------------------------------------------------------------------------- */
/*                              PROFILE RENDERER                              */
/* -------------------------------------------------------------------------- */

function renderProfileLegacy() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    const currentUser = window.Services?.state?.currentUser || null;
    const viewedUid = window.chatState.viewedProfileUid;
    const isViewingOther = Boolean(viewedUid && (!currentUser || viewedUid !== currentUser.uid));

    if (isViewingOther) {
        const profile = window.chatState.viewedProfileData;
        if (!profile) {
            container.innerHTML = `
                ${renderMobileViewHeader('Profile')}
                <div class="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
                    <i class="fas fa-user-circle text-6xl text-gray-700 mb-4"></i>
                    <h2 class="text-xl font-bold text-white mb-2">Loading profile...</h2>
                    <p class="text-sm text-gray-500">Fetching player details.</p>
                    <button onclick="window.openMyProfile()" class="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">Back</button>
                </div>
            `;
            loadViewedProfile(viewedUid);
            return;
        }

        const relation = window.chatState.viewedProfileRelation || {};
        const relationPending = relation.outgoingRequest || window.chatState.sentRequests[viewedUid];
        const followAction = !currentUser
            ? `<button onclick="window.openAuthOverlay()" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">Login to Follow</button>`
            : relation.isFollowing
                ? `<button onclick="window.unfollowViewedProfile()" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold"><i class="fas fa-user-minus mr-1"></i> Following</button>`
                : `<button onclick="window.followViewedProfile()" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"><i class="fas fa-user-check mr-1"></i> Follow</button>`;
        const primaryAction = !currentUser
            ? `<button onclick="window.openAuthOverlay()" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">Login to Add Friend</button>`
            : relation.isFriend
                ? `<button onclick="window.messageViewedProfile()" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"><i class="fas fa-paper-plane mr-1"></i> Message</button>`
                : relation.incomingRequest
                    ? `<button onclick="window.acceptViewedProfileRequest()" class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-xs font-bold"><i class="fas fa-check mr-1"></i> Accept Request</button>`
                    : relationPending
                        ? `<button class="px-4 py-2 rounded-lg bg-gray-700 text-gray-300 text-xs font-bold cursor-not-allowed" disabled>Request Sent</button>`
                        : `<button onclick="window.sendFriendRequestFromViewedProfile()" class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"><i class="fas fa-user-plus mr-1"></i> Add Friend</button>`;

        container.innerHTML = `
            <div class="profile-header group relative">
                <img src="${profile.cover_photo || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop'}" class="banner-img">
                <div class="profile-action-row absolute top-4 right-4 flex gap-2">
                    <button onclick="window.openMyProfile()" class="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg text-xs font-bold backdrop-blur-sm transition-all shadow-lg">
                        <i class="fas fa-arrow-left mr-1"></i> BACK
                    </button>
                </div>
                <div class="profile-avatar-container">
                    <div class="avatar-ring">
                        <img src="${profile.avatar || 'assets/icons/logo.jpg'}" class="avatar-img">
                    </div>
                    <div class="level-badge-large">LVL ${profile.level || 1}</div>
                </div>
            </div>
            <div class="profile-main-content px-4 md:px-0 mt-16 md:mt-0 space-y-6">
                <div>
                    <h2 class="text-3xl font-black text-white tracking-tight">${escapeHtml(profile.display_name || profile.username || 'Player')}</h2>
                    <p class="text-sm text-gray-400 mt-2 max-w-2xl">${escapeHtml(profile.bio || 'No bio yet.')}</p>
                    <div class="flex flex-wrap gap-4 mt-3 text-sm text-gray-400">
                        <span><b>${profile.followers_count || 0}</b> Followers</span>
                        <span><b>${profile.following_count || 0}</b> Following</span>
                        <span><b>${(profile.favorite_games || []).length}</b> Favorites</span>
                        <span><b>${profile.xp || 0}</b> XP</span>
                        <span><b>${profile.games_played || 0}</b> Games</span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full ${profile.status?.state === 'online' ? 'bg-green-400' : profile.status?.state === 'away' ? 'bg-yellow-400' : 'bg-gray-500'}"></span>
                            ${escapeHtml((profile.status?.state || 'offline').toUpperCase())}
                        </span>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    ${followAction}
                    ${primaryAction}
                    ${relation.isFriend ? `<span class="px-3 py-2 rounded-lg bg-green-700/40 text-green-200 text-xs font-bold">Friends</span>` : ''}
                    ${relation.followsYou ? `<span class="px-3 py-2 rounded-lg bg-sky-700/40 text-sky-200 text-xs font-bold">Follows You</span>` : ''}
                </div>
                <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
                    <h3 class="text-lg font-black text-white mb-3">Favorite Games</h3>
                    ${Array.isArray(profile.favorite_games) && profile.favorite_games.length
                ? `<div class="text-xs text-gray-300">${profile.favorite_games.length} saved game(s)</div>`
                : `<div class="text-xs text-gray-500">No favorites visible yet.</div>`}
                </div>
            </div>
        `;
        return;
    }

    if (!currentUser) {
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
    const recentGames = getRecentGames().slice(0, 8);
    const favoriteIds = new Set((userData.favorite_games || []).map(id => String(id || '').trim().toLowerCase()).filter(Boolean));
    const favoriteGames = resolveFavoriteGames(userData.favorite_games || []).slice(0, 8);

    container.innerHTML = `
        <div class="profile-header group relative">
            <img src="${userData.cover_photo || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop'}" class="banner-img">
            <div class="profile-action-row absolute top-4 right-4 flex gap-2">
                <button onclick="window.openEditProfileModal()" class="bg-white/15 hover:bg-white/25 text-white px-4 py-2 rounded-lg text-xs font-bold backdrop-blur-sm transition-all shadow-lg">
                    <i class="fas fa-pen mr-1"></i> EDIT
                </button>
                <button onclick="window.handleLogout()" class="bg-red-600/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold backdrop-blur-sm transition-all shadow-lg">
                    <i class="fas fa-sign-out-alt mr-1"></i> LOGOUT
                </button>
            </div>
            <div class="profile-avatar-container">
                <div class="avatar-ring">
                    <img src="${userData.avatar || 'assets/icons/logo.jpg'}" class="avatar-img">
                </div>
                <div class="level-badge-large">LVL ${userData.level || 1}</div>
            </div>
        </div>

        <div class="profile-main-content px-4 md:px-0 mt-16 md:mt-0 space-y-8">
            <div>
                <h2 class="text-3xl font-black text-white tracking-tight">${escapeHtml(userData.display_name || userData.username || 'Player')}</h2>
                <p class="text-sm text-gray-400 mt-2 max-w-2xl">${escapeHtml(userData.bio || 'No bio yet. Click edit profile to add one.')}</p>
                <div class="flex flex-wrap gap-4 mt-3 text-sm text-gray-400">
                    <span><b>${userData.followers_count || 0}</b> Followers</span>
                    <span><b>${(userData.favorite_games || []).length}</b> Favorites</span>
                    <span><b>${userData.following_count || 0}</b> Following</span>
                    <span class="inline-flex items-center gap-1">
                        <span class="w-2 h-2 rounded-full ${userData.status?.state === 'online' ? 'bg-green-400' : userData.status?.state === 'away' ? 'bg-yellow-400' : 'bg-gray-500'}"></span>
                        ${escapeHtml((userData.status?.state || 'offline').toUpperCase())}
                    </span>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${userData.xp || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Total XP</div>
                </div>
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${userData.games_played || 0}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Games Played</div>
                </div>
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${recentGames.length}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Recent Games</div>
                </div>
                <div class="stat-card">
                   <div class="text-2xl font-black text-white">${favoriteGames.length}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Favorites</div>
                </div>
            </div>

            <div class="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-black text-white">Favorite Games</h3>
                    <span class="text-xs text-gray-500">Tap heart to remove</span>
                </div>
                ${favoriteGames.length ? `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        ${favoriteGames.map(game => renderProfileGameCard(game, true)).join('')}
                    </div>
                ` : `<div class="text-sm text-gray-500">No favorite games yet. Add from your recent games below.</div>`}
            </div>

            <div class="bg-white/5 border border-white/10 rounded-2xl p-4 mb-8">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-lg font-black text-white">Recent Games</h3>
                    <span class="text-xs text-gray-500">Keep your profile active by playing</span>
                </div>
                ${recentGames.length ? `
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                        ${recentGames.map(game => renderProfileGameCard(game, isGameFavorited(favoriteIds, game))).join('')}
                    </div>
                ` : `<div class="text-sm text-gray-500">No recent games found yet.</div>`}
            </div>
        </div>
    `;
}

function renderProfile() {
    const container = document.getElementById('view-profile');
    if (!container) return;

    const currentUser = window.Services?.state?.currentUser || null;
    const viewedUid = window.chatState.viewedProfileUid;
    const isViewingOther = Boolean(viewedUid && (!currentUser || viewedUid !== currentUser.uid));

    if (isViewingOther) {
        const profile = window.chatState.viewedProfileData;
        if (!profile) {
            container.innerHTML = `
                ${renderMobileViewHeader('Profile')}
                <div class="flex flex-col items-center justify-center p-8 text-center min-h-[50vh]">
                    <i class="fas fa-user-circle text-6xl text-gray-700 mb-4"></i>
                    <h2 class="text-xl font-bold text-white mb-2">Loading profile...</h2>
                    <p class="text-sm text-gray-500">Fetching player details.</p>
                    <button onclick="window.openMyProfile()" class="mt-4 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold">Back</button>
                </div>
            `;
            loadViewedProfile(viewedUid);
            return;
        }

        const relation = window.chatState.viewedProfileRelation || {};
        const relationPending = relation.outgoingRequest || window.chatState.sentRequests[viewedUid];
        const statusState = String(profile.status?.state || 'offline').toLowerCase();
        const statusClass = statusState === 'online' ? 'online' : statusState === 'away' ? 'away' : 'offline';
        const xp = Number(profile.xp || 0);
        const level = Number(profile.level || 1);
        const xpProgress = Math.max(6, Math.min(100, Math.round((xp % 1000) / 10)));
        const viewedFavoriteGames = resolveFavoriteGames(profile.favorite_games || []).slice(0, 8);
        const gameCount = Number(profile.games_played || viewedFavoriteGames.length || 0);
        const achievementsHtml = renderProfileAchievements(profile.achievements || [], false);

        const followAction = !currentUser
            ? `<button onclick="window.openAuthOverlay()" class="profile-v2-btn secondary">Login to Follow</button>`
            : relation.isFollowing
                ? `<button onclick="window.unfollowViewedProfile()" class="profile-v2-btn secondary"><i class="fas fa-user-minus mr-1"></i> Following</button>`
                : `<button onclick="window.followViewedProfile()" class="profile-v2-btn primary"><i class="fas fa-user-check mr-1"></i> Follow</button>`;
        const primaryAction = !currentUser
            ? `<button onclick="window.openAuthOverlay()" class="profile-v2-btn primary">Login to Add Friend</button>`
            : relation.isFriend
                ? `<button onclick="window.messageViewedProfile()" class="profile-v2-btn primary"><i class="fas fa-paper-plane mr-1"></i> Message</button>`
                : relation.incomingRequest
                    ? `<button onclick="window.acceptViewedProfileRequest()" class="profile-v2-btn success"><i class="fas fa-check mr-1"></i> Accept Request</button>`
                    : relationPending
                        ? `<button class="profile-v2-btn muted" disabled>Request Sent</button>`
                        : `<button onclick="window.sendFriendRequestFromViewedProfile()" class="profile-v2-btn primary"><i class="fas fa-user-plus mr-1"></i> Add Friend</button>`;

        container.innerHTML = `
            ${renderMobileViewHeader('Profile')}
            <div class="profile-v2-root">
                <aside class="profile-v2-hero glass-panel">
                    <div class="profile-v2-cover">
                        <img src="${profile.cover_photo || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop'}" class="cover-img">
                    </div>
                    <div class="profile-v2-top-actions">
                        <button onclick="window.openMyProfile()" class="profile-v2-icon-btn">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                    </div>
                    <div class="profile-v2-avatar-wrap">
                        <div class="profile-v2-avatar-ring">
                            <img src="${profile.avatar || 'assets/icons/logo.jpg'}" class="avatar-img">
                            <span class="profile-v2-status-dot ${statusClass}"></span>
                        </div>
                        <div class="profile-v2-rank-pill">${escapeHtml(statusState.toUpperCase())}</div>
                    </div>
                    <div class="profile-v2-identity">
                        <h1 class="profile-v2-name">${escapeHtml(profile.display_name || profile.username || 'Player')}</h1>
                        <p class="profile-v2-handle">@${escapeHtml(profile.username || 'player')}</p>
                        <div class="profile-v2-xp-wrap">
                            <div class="profile-v2-xp-meta">
                                <span>LEVEL ${level}</span>
                                <span>${xp} XP</span>
                            </div>
                            <div class="profile-v2-xp-bg">
                                <div class="profile-v2-xp-fill" style="width:${xpProgress}%"></div>
                            </div>
                        </div>
                        <p class="profile-v2-bio">${escapeHtml(profile.bio || 'No bio yet.')}</p>
                        <div class="profile-v2-stats-grid">
                            <div class="profile-v2-stat-box">
                                <div class="profile-v2-stat-value">${Number(profile.followers_count || 0)}</div>
                                <div class="profile-v2-stat-label">Followers</div>
                            </div>
                            <div class="profile-v2-stat-box">
                                <div class="profile-v2-stat-value">${Number(profile.following_count || 0)}</div>
                                <div class="profile-v2-stat-label">Following</div>
                            </div>
                            <div class="profile-v2-stat-box">
                                <div class="profile-v2-stat-value">${gameCount}</div>
                                <div class="profile-v2-stat-label">Games</div>
                            </div>
                        </div>
                        <div class="profile-v2-actions-row">
                            ${followAction}
                            ${primaryAction}
                        </div>
                        <div class="profile-v2-meta-tags">
                            ${relation.isFriend ? `<span class="profile-v2-tag friend">Friends</span>` : ''}
                            ${relation.followsYou ? `<span class="profile-v2-tag info">Follows You</span>` : ''}
                        </div>
                    </div>
                </aside>

                <main class="profile-v2-content">
                    <section class="mb-8">
                        <div class="profile-v2-section-head">
                            <h3 class="profile-v2-title"><i class="fas fa-trophy text-yellow-500"></i> Achievements</h3>
                            <span class="profile-v2-count-chip">${Array.isArray(profile.achievements) ? profile.achievements.length : 0} Unlocked</span>
                        </div>
                        <div class="profile-v2-badges">
                            ${achievementsHtml}
                        </div>
                    </section>
                    <section class="mb-8">
                        <div class="profile-v2-section-head">
                            <h3 class="profile-v2-title"><i class="fas fa-gamepad text-purple-400"></i> Favorite Games</h3>
                            <span class="text-xs text-gray-500">${viewedFavoriteGames.length} Visible</span>
                        </div>
                        ${viewedFavoriteGames.length ? `
                            <div class="profile-v2-games-scroll">
                                ${viewedFavoriteGames.map(game => renderProfileGameCard(game, false, false)).join('')}
                            </div>
                        ` : `<div class="profile-v2-empty">No favorite games visible yet.</div>`}
                    </section>
                </main>
            </div>
        `;
        return;
    }

    if (!currentUser) {
        container.innerHTML = `
            ${renderMobileViewHeader('Profile')}
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
    const recentGames = getRecentGames().slice(0, 8);
    const favoriteIds = new Set((userData.favorite_games || []).map(id => String(id || '').trim().toLowerCase()).filter(Boolean));
    const favoriteGames = resolveFavoriteGames(userData.favorite_games || []).slice(0, 8);
    const statusState = String(userData.status?.state || 'offline').toLowerCase();
    const statusClass = statusState === 'online' ? 'online' : statusState === 'away' ? 'away' : 'offline';
    const xp = Number(userData.xp || 0);
    const level = Number(userData.level || 1);
    const xpProgress = Math.max(6, Math.min(100, Math.round((xp % 1000) / 10)));
    const achievementsHtml = renderProfileAchievements(userData.achievements || [], true);

    container.innerHTML = `
        ${renderMobileViewHeader('Profile')}
        <div class="profile-v2-root">
            <aside class="profile-v2-hero glass-panel">
                <div class="profile-v2-cover">
                    <img src="${userData.cover_photo || 'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop'}" class="cover-img">
                </div>
                <div class="profile-v2-top-actions">
                    <button onclick="window.openEditProfileModal()" class="profile-v2-icon-btn">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button onclick="window.handleLogout()" class="profile-v2-icon-btn danger">
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
                <div class="profile-v2-avatar-wrap">
                    <div class="profile-v2-avatar-ring">
                        <img src="${userData.avatar || 'assets/icons/logo.jpg'}" class="avatar-img">
                        <span class="profile-v2-status-dot ${statusClass}"></span>
                    </div>
                    <div class="profile-v2-rank-pill">LEVEL ${level}</div>
                </div>
                <div class="profile-v2-identity">
                    <h1 class="profile-v2-name">${escapeHtml(userData.display_name || userData.username || 'Player')}</h1>
                    <p class="profile-v2-handle">@${escapeHtml(userData.username || 'player')}</p>
                    <div class="profile-v2-xp-wrap">
                        <div class="profile-v2-xp-meta">
                            <span>LEVEL ${level}</span>
                            <span>${xp} XP</span>
                        </div>
                        <div class="profile-v2-xp-bg">
                            <div class="profile-v2-xp-fill" style="width:${xpProgress}%"></div>
                        </div>
                    </div>
                    <p class="profile-v2-bio">${escapeHtml(userData.bio || 'No bio yet. Click edit profile to add one.')}</p>
                    <div class="profile-v2-stats-grid">
                        <div class="profile-v2-stat-box">
                            <div class="profile-v2-stat-value">${Number(userData.followers_count || 0)}</div>
                            <div class="profile-v2-stat-label">Followers</div>
                        </div>
                        <div class="profile-v2-stat-box">
                            <div class="profile-v2-stat-value">${Number(userData.following_count || 0)}</div>
                            <div class="profile-v2-stat-label">Following</div>
                        </div>
                        <div class="profile-v2-stat-box">
                            <div class="profile-v2-stat-value">${Number(userData.games_played || 0)}</div>
                            <div class="profile-v2-stat-label">Games</div>
                        </div>
                    </div>
                    <div class="profile-v2-actions-row">
                        <button onclick="window.openEditProfileModal()" class="profile-v2-btn primary"><i class="fas fa-user-edit mr-1"></i> Edit Profile</button>
                        <button onclick="window.handleLogout()" class="profile-v2-btn danger"><i class="fas fa-sign-out-alt mr-1"></i> Logout</button>
                    </div>
                </div>
            </aside>

            <main class="profile-v2-content">
                <section class="mb-8">
                    <div class="profile-v2-section-head">
                        <h3 class="profile-v2-title"><i class="fas fa-trophy text-yellow-500"></i> Achievements</h3>
                        <span class="profile-v2-count-chip">${Array.isArray(userData.achievements) ? userData.achievements.length : 0} Unlocked</span>
                    </div>
                    <div class="profile-v2-badges">
                        ${achievementsHtml}
                    </div>
                </section>

                <section class="mb-8">
                    <div class="profile-v2-section-head">
                        <h3 class="profile-v2-title"><i class="fas fa-heart text-pink-400"></i> Favorite Games</h3>
                        <span class="text-xs text-gray-500">Tap heart to remove</span>
                    </div>
                    ${favoriteGames.length ? `
                        <div class="profile-v2-games-scroll">
                            ${favoriteGames.map(game => renderProfileGameCard(game, true, true)).join('')}
                        </div>
                    ` : `<div class="profile-v2-empty">No favorite games yet. Add from recent games below.</div>`}
                </section>

                <section class="mb-8">
                    <div class="profile-v2-section-head">
                        <h3 class="profile-v2-title"><i class="fas fa-clock-rotate-left text-blue-400"></i> Recent Games</h3>
                        <span class="text-xs text-gray-500">Keep your profile active by playing</span>
                    </div>
                    ${recentGames.length ? `
                        <div class="profile-v2-games-scroll">
                            ${recentGames.map(game => renderProfileGameCard(game, isGameFavorited(favoriteIds, game), true)).join('')}
                        </div>
                    ` : `<div class="profile-v2-empty">No recent games found yet.</div>`}
                </section>
            </main>
        </div>
    `;
}

function renderProfileAchievements(achievements, isOwn) {
    if (!Array.isArray(achievements) || !achievements.length) {
        return `<div class="text-xs text-gray-500">${isOwn ? 'Play more games to unlock badges.' : 'No achievements visible yet.'}</div>`;
    }

    return achievements.slice(0, 12).map((badge, idx) => {
        const label = typeof badge === 'string' ? badge : (badge?.label || badge?.name || `Badge ${idx + 1}`);
        const icon = badge?.icon || 'fa-award';
        return `
            <div class="profile-v2-badge" title="${escapeAttr(label)}">
                <i class="fas ${escapeAttr(icon)}"></i>
            </div>
        `;
    }).join('');
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
                <div class="md:hidden mobile-chat-tabs border-b border-white/5 p-2">
                    <div class="flex-1 flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-mobile-global" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide">Global</button>
                        <button onclick="switchChatTab('dms')" id="tab-mobile-dms" class="flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide">DMs</button>
                    </div>
                    <button onclick="openSearchPage('')" class="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300">
                        <i class="fas fa-search"></i>
                    </button>
                </div>
                <div id="mobile-dm-conversation-header" class="hidden md:hidden border-b border-white/10 bg-black/80 backdrop-blur-md px-3 py-2">
                    <div class="flex items-center gap-2">
                        <button onclick="window.closeMobileDmConversation()" class="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-gray-200">
                            <i class="fas fa-arrow-left"></i>
                        </button>
                        <button id="mobileDmHeaderProfileBtn" class="flex-1 min-w-0 flex items-center gap-2 text-left"></button>
                    </div>
                </div>
                <div id="mobile-global-strip" class="md:hidden px-2 pb-2 border-b border-white/5"></div>
                <div id="mobile-dm-list-panel" class="md:hidden px-2 pb-2 border-b border-white/5 hidden"></div>

                <div id="chat-messages-area" class="flex-1 overflow-y-auto p-4 content-start chat-messages-area"></div>

                <div id="chat-input-container" class="chat-input-container border-t border-white/5">
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
    window.Services?.friend?.listenToFriends?.();
    window.Services?.friend?.listenToOnlineUsers?.();
    window.Services?.chat?.listenToDmThreads?.();
    window.Services?.chat?.listenToGlobalChat?.();
    if (window.chatState.activeDmFriend?.uid) {
        window.Services?.chat?.listenToDirectChat?.(window.chatState.activeDmFriend.uid);
    }
    renderChatListContent();
    updateMobileListVisibility();
    window.switchChatTab(window.activeChatTab || 'global', true, window.chatState.mobileDmConversationOpen);
}

async function ensureFollowingUsersLoaded(force = false) {
    const uid = window.Services?.state?.currentUser?.uid || null;
    if (!uid) {
        window.chatState.followedUsers = [];
        window.chatState.followedUsersLoadedFor = null;
        return [];
    }
    if (!force && window.chatState.followedUsersLoadedFor === uid && Array.isArray(window.chatState.followedUsers)) {
        return window.chatState.followedUsers;
    }
    try {
        const users = await window.Services?.user?.listFollowingUsers?.(30);
        window.chatState.followedUsers = Array.isArray(users) ? users : [];
        window.chatState.followedUsersLoadedFor = uid;
        return window.chatState.followedUsers;
    } catch (e) {
        console.error("[FEED] following list error:", e);
        return window.chatState.followedUsers || [];
    }
}

function renderFollowedUsersPanels() {
    const desktopList = document.getElementById('social-following-list');
    const mobileList = document.getElementById('social-mobile-following');
    const storyList = document.getElementById('social-story-rail');
    const suggestions = document.getElementById('social-suggestion-list');
    const followed = window.chatState.followedUsers || [];
    const onlineUsers = (window.chatState.onlineUsers || []).filter(user => user?.uid);
    const discoverUsers = followed.length
        ? followed
        : onlineUsers.filter(user => user.uid !== window.Services?.state?.currentUser?.uid);
    const storyUsers = discoverUsers.slice(0, 18);

    const itemsHtml = followed.length
        ? followed.slice(0, 20).map(user => `
            <button onclick="window.openUserProfile('${escapeAttr(user.uid)}')" class="w-full bg-black/20 border border-white/10 hover:border-purple-500/40 rounded-lg p-2 flex items-center gap-2 transition-all text-left">
                <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-7 h-7 rounded-full object-cover border border-white/10">
                <div class="min-w-0">
                    <div class="text-xs font-bold text-gray-200 truncate">${escapeHtml(user.username || 'Player')}</div>
                    <div class="text-[10px] text-gray-500">Following</div>
                </div>
            </button>
        `).join('')
        : '<div class="text-xs text-gray-500">Follow players to customize your feed.</div>';

    if (desktopList) desktopList.innerHTML = itemsHtml;
    if (mobileList) {
        mobileList.innerHTML = followed.length
            ? followed.slice(0, 12).map(user => `
                <button onclick="window.openUserProfile('${escapeAttr(user.uid)}')" class="flex-shrink-0 w-16 text-center">
                    <div class="w-12 h-12 rounded-full overflow-hidden border border-white/15 mx-auto">
                        <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-12 h-12 object-cover">
                    </div>
                    <div class="text-[10px] text-gray-300 truncate mt-1">${escapeHtml(user.username || 'Player')}</div>
                </button>
            `).join('')
            : '<div class="text-xs text-gray-500 px-1">No followed players yet.</div>';
    }

    if (storyList) {
        const currentAvatar = window.currentUserData?.avatar || 'assets/icons/logo.jpg';
        const currentUid = window.Services?.state?.currentUser?.uid || '';
        storyList.innerHTML = `
            <button onclick="${currentUid ? `window.openUserProfile('${escapeAttr(currentUid)}')` : `window.switchView('profile')`}" class="feed-v2-story-item">
                <div class="feed-v2-story-ring add">
                    <img src="${currentAvatar}" alt="avatar" class="feed-v2-story-img">
                </div>
                <span class="feed-v2-story-name">You</span>
            </button>
            ${storyUsers.map(user => `
                <button onclick="window.openUserProfile('${escapeAttr(user.uid)}')" class="feed-v2-story-item">
                    <div class="feed-v2-story-ring">
                        <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="feed-v2-story-img">
                    </div>
                    <span class="feed-v2-story-name">${escapeHtml(user.username || 'Player')}</span>
                </button>
            `).join('')}
        `;
    }

    if (suggestions) {
        suggestions.innerHTML = discoverUsers.length
            ? discoverUsers.slice(0, 5).map(user => `
                <div class="feed-v2-suggest-row">
                    <button onclick="window.openUserProfile('${escapeAttr(user.uid)}')" class="feed-v2-suggest-user">
                        <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="feed-v2-suggest-avatar">
                        <div class="min-w-0">
                            <div class="feed-v2-suggest-name">${escapeHtml(user.username || 'Player')}</div>
                            <div class="feed-v2-suggest-meta">${followed.length ? 'Following' : 'Online now'}</div>
                        </div>
                    </button>
                    <button onclick="window.openUserProfile('${escapeAttr(user.uid)}')" class="feed-v2-follow-btn">View</button>
                </div>
            `).join('')
            : '<div class="text-xs text-gray-500">Follow players to personalize your feed.</div>';
    }
}

function updateFeedFollowingToggle() {
    const btn = document.getElementById('feed-following-toggle');
    const label = document.getElementById('feed-following-toggle-label');
    const mobileBtn = document.getElementById('feed-following-toggle-mobile');
    const mobileLabel = document.getElementById('feed-following-toggle-label-mobile');
    const globalBtn = document.getElementById('feed-filter-global');
    const isFollowingOnly = window.chatState.feedFollowingOnly;

    if (btn) {
        btn.className = isFollowingOnly ? 'feed-v2-chip active' : 'feed-v2-chip';
    }
    if (label) {
        label.textContent = 'Following';
    }

    if (mobileBtn) {
        mobileBtn.className = isFollowingOnly ? 'feed-v2-chip active' : 'feed-v2-chip';
    }
    if (mobileLabel) {
        mobileLabel.textContent = 'Following';
    }

    if (globalBtn) {
        globalBtn.className = isFollowingOnly ? 'feed-v2-chip' : 'feed-v2-chip active';
    }
}

window.setFeedFilterMode = function (mode = 'global') {
    window.chatState.feedFollowingOnly = mode === 'following';
    updateFeedFollowingToggle();
    renderFeedPosts();
};

window.toggleFeedFollowingOnly = function () {
    window.setFeedFilterMode(window.chatState.feedFollowingOnly ? 'global' : 'following');
};

function renderFeedTrendingGames() {
    const container = document.getElementById('social-trending-games');
    if (!container) return;
    const games = [...(window.Services?.state?.gameLibrary || window.allGames || [])]
        .slice(0, 6);

    if (!games.length) {
        container.innerHTML = '<div class="text-xs text-gray-500">No games loaded yet.</div>';
        return;
    }

    container.innerHTML = games.slice(0, 4).map((game, idx) => `
        <button onclick="playGame('${escapeAttr(game.url || game.path || '')}','${escapeAttr(game.title || 'Game')}')" class="feed-v2-trend-row">
            <div class="feed-v2-trend-rank">#${idx + 1}</div>
            <div class="min-w-0 text-left">
                <div class="feed-v2-trend-title">${escapeHtml(game.title || 'Game')}</div>
                <div class="feed-v2-trend-meta">${escapeHtml(game.category || 'Arcade')}</div>
            </div>
        </button>
    `).join('');
}

function renderSocialFeed(isUpdate = false) {
    const container = document.getElementById('view-chat');
    if (!container) return;

    if (!isUpdate || !document.getElementById('social-feed-content')) {
        container.innerHTML = `
            <div class="feed-v2-layout">
                <aside class="feed-v2-left rail-panel hidden lg:block">
                    <h2 class="feed-v2-side-title">Social Hub</h2>
                    <button onclick="switchView('profile')" class="feed-v2-profile-link">
                        <div class="feed-v2-profile-dot"></div>
                        <span>My Profile</span>
                    </button>
                    <button onclick="window.setFeedFilterMode('following')" id="feed-following-toggle" class="feed-v2-chip">
                        <span id="feed-following-toggle-label">Following</span>
                    </button>
                    <div class="feed-v2-side-block">
                        <div class="feed-v2-side-label">Following</div>
                        <div id="social-following-list" class="space-y-2"></div>
                    </div>
                </aside>

                <main class="feed-v2-main">
                    <div class="feed-v2-mobile-head">
                        <button onclick="toggleSidebar()" class="feed-v2-mobile-menu" aria-label="Menu">
                            <i class="fas fa-bars"></i>
                        </button>
                        <h2 class="feed-v2-main-title">Activity Feed</h2>
                        <button onclick="openSearchPage('')" class="feed-v2-mobile-search">
                            <i class="fas fa-search"></i>
                        </button>
                    </div>

                    <div id="social-story-rail" class="feed-v2-stories"></div>

                    <div class="feed-v2-composer rail-panel">
                        <textarea id="statusPostInput" maxlength="260" placeholder="What's on your mind?" class="feed-v2-composer-input"></textarea>
                        <div class="feed-v2-composer-row">
                            <div class="flex items-center gap-2">
                                <label for="statusImageFiles" class="feed-v2-icon-action" title="Image"><i class="far fa-image"></i></label>
                                <button onclick="openSearchPage('')" class="feed-v2-icon-action" title="Tag Game"><i class="fas fa-gamepad"></i></button>
                                <button type="button" class="feed-v2-icon-action" title="Sticker"><i class="fas fa-note-sticky"></i></button>
                            </div>
                            <button onclick="window.publishStatusPost()" class="feed-v2-post-btn">Post</button>
                        </div>
                        <input id="statusImageFiles" type="file" accept="image/*" multiple class="hidden" onchange="window.handleFeedImageSelection(event)">
                        <div id="statusImagePreview" class="hidden mt-3 grid grid-cols-3 gap-2"></div>
                        <div id="statusImageMeta" class="text-[11px] text-gray-500 mt-2">Text posts are enabled</div>
                    </div>

                    <div class="feed-v2-filters">
                        <button onclick="window.setFeedFilterMode('global')" class="feed-v2-chip" id="feed-filter-global">Global</button>
                        <button onclick="window.setFeedFilterMode('following')" id="feed-following-toggle-mobile" class="feed-v2-chip">
                            <span id="feed-following-toggle-label-mobile">Following</span>
                        </button>
                        <button type="button" class="feed-v2-chip passive" title="Coming soon" disabled>Mentions</button>
                        <button type="button" class="feed-v2-chip passive" title="Coming soon" disabled>VIPs</button>
                    </div>

                    <div class="lg:hidden mb-4">
                        <div id="social-mobile-following" class="feed-v2-mobile-following"></div>
                    </div>

                    <div id="social-feed-content" class="feed-v2-stream"></div>
                </main>

                <aside class="feed-v2-right rail-panel hidden xl:block">
                    <div class="feed-v2-side-block mb-4">
                        <div class="feed-v2-side-label">Who to Follow</div>
                        <div id="social-suggestion-list" class="space-y-2"></div>
                    </div>
                    <div class="feed-v2-side-block">
                        <div class="feed-v2-side-label">Trending Games</div>
                        <div id="social-trending-games" class="space-y-2"></div>
                    </div>
                </aside>
            </div>
        `;
    }

    window.Services?.feed?.listenToFeed?.();
    ensureFollowingUsersLoaded().then(() => {
        renderFollowedUsersPanels();
        renderFeedTrendingGames();
        renderFeedPosts();
    });
    renderFeedComposerPreview();
    updateFeedFollowingToggle();
    const desktopToggle = document.getElementById('feed-following-toggle');
    if (desktopToggle) desktopToggle.onclick = () => window.setFeedFilterMode('following');
    const mobileToggle = document.getElementById('feed-following-toggle-mobile');
    if (mobileToggle) mobileToggle.onclick = () => window.setFeedFilterMode('following');
    const globalFilterBtn = document.getElementById('feed-filter-global');
    if (globalFilterBtn) globalFilterBtn.onclick = () => window.setFeedFilterMode('global');
    renderFeedPosts();
}

function renderFeedPosts() {
    const feedContainer = document.getElementById('social-feed-content');
    if (!feedContainer) return;

    const currentUid = window.Services?.state?.currentUser?.uid || null;
    const followingIds = new Set((window.chatState.followedUsers || []).map(user => user.uid).filter(Boolean));
    const posts = (window.chatState.feedPosts || []).filter(post => {
        if (post.type === 'friend') return false;
        if (!window.chatState.feedFollowingOnly) return true;
        const postUid = post?.user?.uid || null;
        if (!postUid) return false;
        if (currentUid && postUid === currentUid) return true;
        return followingIds.has(postUid);
    });
    if (!posts.length) {
        feedContainer.innerHTML = `<div class="feed-v2-empty">${window.chatState.feedFollowingOnly ? 'No activity from followed players yet.' : 'No activity yet.'}</div>`;
        return;
    }

    feedContainer.innerHTML = posts.map(post => {
        const user = post.user || {};
        const avatar = user.avatar || 'assets/icons/logo.jpg';
        const safeUid = user.uid ? escapeAttr(user.uid) : '';
        const canOpenProfile = Boolean(safeUid);
        const title = getFeedTitle(post);
        const time = formatDateTime(post.timestamp);
        const body = getFeedBody(post);
        const comments = window.chatState.feedComments[post.id] || [];
        const commentsExpanded = Boolean(window.chatState.expandedComments[post.id]);
        const totalComments = Number(post.comments || 0);
        const commentsPreview = commentsExpanded ? comments : comments.slice(-2);
        const isLiked = false;

        return `
            <article class="feed-v2-post rail-panel">
                <div class="feed-v2-post-head">
                    <div class="feed-v2-user-block">
                        ${canOpenProfile
                ? `<button onclick="window.openUserProfile('${safeUid}')" class="feed-v2-user-avatar">
                                <img class="w-full h-full object-cover" src="${avatar}" alt="avatar">
                           </button>`
                : `<div class="feed-v2-user-avatar"><img class="w-full h-full object-cover" src="${avatar}" alt="avatar"></div>`}
                        <div class="min-w-0">
                            ${canOpenProfile
                ? `<button onclick="window.openUserProfile('${safeUid}')" class="feed-v2-user-name">${escapeHtml(user.display_name || user.username || 'Player')}</button>`
                : `<div class="feed-v2-user-name">${escapeHtml(user.display_name || user.username || 'Player')}</div>`}
                            <div class="feed-v2-user-time">${time}</div>
                        </div>
                    </div>
                    <button class="feed-v2-more-btn"><i class="fas fa-ellipsis-h"></i></button>
                </div>
                <div class="feed-v2-post-text">${title}</div>
                <div class="feed-v2-post-body">
                    ${body}
                </div>
                <div class="feed-v2-post-actions">
                    <button onclick="window.likeFeedPost('${post.id}')" class="feed-v2-action-btn ${isLiked ? 'liked' : ''}">
                        <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i> ${Number(post.likes || 0)}
                    </button>
                    <button onclick="window.toggleFeedComments('${post.id}')" class="feed-v2-action-btn">
                        <i class="far fa-comment"></i> ${totalComments}
                    </button>
                    <button onclick="window.openUserProfile('${safeUid}')" class="feed-v2-action-btn ${canOpenProfile ? '' : 'hidden'}">
                        <i class="fas fa-user"></i> Profile
                    </button>
                </div>
                <div class="${commentsExpanded ? 'mt-3' : 'hidden'}" id="post-comments-${post.id}">
                    <div class="space-y-2 mb-2">
                        ${commentsPreview.length ? commentsPreview.map(comment => `
                            <div class="feed-v2-comment-row">
                                <div class="text-[11px] text-gray-300"><b>${escapeHtml(comment.username || 'Player')}:</b> ${escapeHtml(comment.text || '')}</div>
                            </div>
                        `).join('') : '<div class="text-[11px] text-gray-500">No comments yet.</div>'}
                    </div>
                    <div class="flex gap-2">
                        <input id="comment-input-${post.id}" type="text" placeholder="Write a comment..." class="feed-v2-comment-input">
                        <button onclick="window.submitFeedComment('${post.id}')" class="feed-v2-comment-send">Send</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

function getFeedTitle(post) {
    if (post.type === 'friend') return `became friends with ${escapeHtml(post.data?.friendName || 'a player')}.`;
    if (post.type === 'favorite') return `favorited a game.`;
    if (post.type === 'follow') return `started following ${escapeHtml(post.data?.targetName || 'a player')}.`;
    if (post.type === 'status') return `shared a status.`;
    if (post.type === 'profile_update') return `updated profile details.`;
    return `posted an update.`;
}

function getFeedBody(post) {
    if (post.type === 'favorite') {
        const game = findGameById(post.data?.gameId);
        if (!game) return '';
        return `
            <div class="feed-v2-system-event">
                <img src="${game.thumbnail || 'assets/icons/logo.jpg'}" class="feed-v2-mini-thumb" alt="${escapeHtml(game.title)}">
                <div class="min-w-0">
                    <div class="text-xs text-gray-300">Favorited a game</div>
                    <div class="text-sm font-bold text-white truncate">${escapeHtml(game.title)}</div>
                </div>
                <button onclick="playGame('${escapeAttr(game.url || '')}','${escapeAttr(game.title || 'Game')}')" class="feed-v2-mini-play">Play</button>
            </div>
        `;
    }

    if (post.type === 'status') {
        const safeText = escapeHtml(post.data?.text || '');
        const imageUrl = post.data?.imageUrl ? String(post.data.imageUrl) : '';
        const textBlock = safeText ? `<div class="feed-v2-status-text">${safeText}</div>` : '';
        const imageBlock = imageUrl ? `
            <div class="feed-v2-post-media">
                <img src="${escapeAttr(imageUrl)}" alt="post image" class="w-full h-auto object-cover">
            </div>
        ` : '';
        return `${textBlock}${imageBlock}`;
    }

    if (post.type === 'profile_update') {
        const fields = (post.data?.fields || []).join(', ');
        return `<div class="feed-v2-status-text text-xs">Updated: ${escapeHtml(fields || 'profile fields')}</div>`;
    }

    return '';
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
        const globalHtml = renderGlobalListPanel();
        list.innerHTML = globalHtml;
        updateMobileChatPanels();
        return;
    }

    renderDirectListPanel(list);
    updateMobileChatPanels();
}

function renderGlobalListPanel() {
    const onlinePreview = (window.chatState.onlineUsers || []).slice(0, 12);
    return `
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
                        <button onclick="window.openUserProfile('${user.uid}')" class="w-6 h-6 rounded-full overflow-hidden border border-white/10">
                            <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-6 h-6 rounded-full object-cover">
                        </button>
                        <button onclick="window.openUserProfile('${user.uid}')" class="text-xs text-gray-200 truncate flex-1 text-left hover:text-white">${escapeHtml(user.username || 'Player')}</button>
                        <button onclick="window.openUserProfile('${user.uid}')" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-gray-200">View</button>
                    </div>
                `).join('') : `<div class="text-xs text-gray-500 px-1">No online players found.</div>`}
            </div>
        </div>
    `;
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
    const threadByTarget = new Map((window.chatState.dmThreads || []).map(thread => [thread.targetUid, thread]));

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
                            <div class="flex items-center gap-2 min-w-0">
                                <button onclick="window.openUserProfile('${req.from}')" class="w-7 h-7 rounded-full overflow-hidden border border-white/10">
                                    <img src="${req.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-7 h-7 rounded-full object-cover">
                                </button>
                                <button onclick="window.openUserProfile('${req.from}')" class="text-xs text-gray-200 truncate text-left hover:text-white">${escapeHtml(req.username || req.from)}</button>
                            </div>
                            <div class="flex items-center gap-1">
                                <button onclick="window.acceptFriendRequest('${req.from}')" class="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-[10px] font-bold">Accept</button>
                                <button onclick="window.declineFriendRequest('${req.from}')" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-gray-300">Decline</button>
                            </div>
                        </div>
                    `).join('') : `<div class="text-xs text-gray-500 px-1">No pending requests.</div>`}
                </div>
            </div>

            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Friends</div>
                <div class="space-y-2">
                    ${friends.length ? friends.map(friend => {
        const isOnline = onlineIds.has(friend.uid);
        const thread = threadByTarget.get(friend.uid);
        const unread = Number(thread?.unreadCount || 0);
        const encodedName = encodeURIComponent(friend.username || 'Player');
        const encodedAvatar = encodeURIComponent(friend.avatar || '');
        return `
                            <div class="w-full bg-white/5 border border-white/10 hover:border-purple-500/40 rounded-lg p-2 flex items-center gap-2 transition-all">
                                <span class="w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-600'}"></span>
                                <button onclick="window.openUserProfile('${friend.uid}')" class="w-7 h-7 rounded-full overflow-hidden border border-white/10">
                                    <img src="${friend.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-7 h-7 rounded-full object-cover">
                                </button>
                                <button onclick="window.openUserProfile('${friend.uid}')" class="text-xs text-gray-200 truncate flex-1 text-left hover:text-white">${escapeHtml(friend.username || friend.uid)}</button>
                                ${unread > 0 ? `<span class="px-1.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold">${unread}</span>` : ''}
                                <button onclick="window.startDm('${friend.uid}','${encodedName}','${encodedAvatar}')" class="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white">Chat</button>
                            </div>
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
                            <button onclick="window.openUserProfile('${user.uid}')" class="w-7 h-7 rounded-full overflow-hidden border border-white/10">
                                <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-7 h-7 rounded-full object-cover">
                            </button>
                            <button onclick="window.openUserProfile('${user.uid}')" class="text-xs text-gray-200 truncate flex-1 text-left hover:text-white">${escapeHtml(user.username || 'Player')}</button>
                            <button onclick="window.openUserProfile('${user.uid}')" class="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-[10px] font-bold text-gray-200">View</button>
                        </div>
                    `).join('') || `<div class="text-xs text-gray-500 px-1">No online users right now.</div>`}
                </div>
            </div>
        </div>
    `;
}

function renderMobileDirectPanel(list) {
    if (!window.Services?.state?.currentUser) {
        list.innerHTML = `<div class="text-xs text-gray-400 p-2">Login to view direct messages.</div>`;
        return;
    }

    const friends = window.chatState.friends || [];
    const onlineIds = new Set((window.chatState.onlineUsers || []).map(u => u.uid));
    const friendMap = new Map(friends.map(friend => [friend.uid, friend]));
    const threads = (window.chatState.dmThreads || [])
        .filter(thread => thread?.targetUid && thread?.lastMessage?.text)
        .map(thread => {
            const friend = friendMap.get(thread.targetUid) || {};
            return {
                uid: thread.targetUid,
                username: friend.username || thread.lastMessage?.user || 'Player',
                avatar: friend.avatar || '',
                isOnline: onlineIds.has(thread.targetUid),
                unread: Number(thread.unreadCount || 0),
                text: String(thread.lastMessage?.text || ''),
                updatedAt: thread.updatedAt || thread.lastMessage?.at || null
            };
        })
        .sort((a, b) => {
            const aDate = coerceDate(a.updatedAt);
            const bDate = coerceDate(b.updatedAt);
            return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
        });

    const circles = friends.slice(0, 20).map(friend => {
        const isOnline = onlineIds.has(friend.uid);
        const encodedName = encodeURIComponent(friend.username || 'Player');
        const encodedAvatar = encodeURIComponent(friend.avatar || '');
        return `
            <button onclick="window.startDm('${friend.uid}','${encodedName}','${encodedAvatar}')" class="flex-shrink-0 w-16 text-center">
                <div class="relative mx-auto w-12 h-12 rounded-full overflow-hidden border ${isOnline ? 'border-green-400/70' : 'border-white/15'}">
                    <img src="${friend.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-12 h-12 object-cover">
                    <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border border-black ${isOnline ? 'bg-green-400' : 'bg-gray-500'}"></span>
                </div>
                <div class="text-[10px] text-gray-300 truncate mt-1">${escapeHtml(friend.username || 'Player')}</div>
            </button>
        `;
    }).join('');

    const rows = threads.map(thread => {
        const encodedName = encodeURIComponent(thread.username || 'Player');
        const encodedAvatar = encodeURIComponent(thread.avatar || '');
        const isActive = window.chatState.activeDmFriend?.uid === thread.uid;
        return `
            <div class="w-full rounded-xl p-2 flex items-center gap-2 ${isActive ? 'bg-purple-600/20 border border-purple-500/40' : 'bg-white/5 border border-white/10'}">
                <button onclick="window.openUserProfile('${thread.uid}')" class="w-10 h-10 rounded-full overflow-hidden border border-white/10">
                    <img src="${thread.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-10 h-10 rounded-full object-cover">
                </button>
                <button onclick="window.openUserProfile('${thread.uid}')" class="flex-1 min-w-0 text-left">
                    <div class="text-xs font-bold ${isActive ? 'text-white' : 'text-gray-200'} truncate">${escapeHtml(thread.username || 'Player')}</div>
                    <div class="text-[10px] ${thread.isOnline ? 'text-green-300' : 'text-gray-500'} truncate">${escapeHtml(thread.text)}</div>
                </button>
                <div class="text-right">
                    <div class="text-[10px] text-gray-500 mb-1">${formatTime(thread.updatedAt)}</div>
                    ${thread.unread > 0 ? `<span class="inline-flex items-center justify-center min-w-[1.2rem] px-1 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold">${thread.unread}</span>` : ''}
                </div>
                <button onclick="window.startDm('${thread.uid}','${encodedName}','${encodedAvatar}')" class="px-2 py-1 rounded bg-purple-600 hover:bg-purple-500 text-[10px] font-bold text-white">Chat</button>
            </div>
        `;
    }).join('');

    list.innerHTML = `
        <div class="space-y-3 bg-black/20 border border-white/10 rounded-xl p-2 max-h-[54vh] overflow-y-auto">
            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 py-1">Friends</div>
                <div class="flex gap-2 overflow-x-auto pb-1">
                    ${circles || `<div class="text-xs text-gray-500 px-1">No friends yet.</div>`}
                </div>
            </div>
            <div>
                <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 py-1">Messages</div>
                <div class="space-y-2">
                    ${rows || `<div class="text-xs text-gray-500 px-1">No chats yet. Tap a friend above to start chatting.</div>`}
                </div>
            </div>
        </div>
    `;
}

function renderMobileGlobalStrip(container) {
    const onlineUsers = (window.chatState.onlineUsers || []).slice(0, 20);
    if (!container) return;
    container.innerHTML = `
        <div class="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 py-2">Online In Global</div>
        <div class="flex gap-2 overflow-x-auto pb-1">
            ${onlineUsers.length ? onlineUsers.map(user => `
                <button onclick="window.openUserProfile('${user.uid}')" class="flex-shrink-0 w-16 text-center">
                    <div class="relative mx-auto w-12 h-12 rounded-full overflow-hidden border border-white/15">
                        <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-12 h-12 object-cover">
                        <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border border-black ${user.status?.state === 'online' ? 'bg-green-400' : 'bg-gray-500'}"></span>
                    </div>
                    <div class="text-[10px] text-gray-300 truncate mt-1">${escapeHtml(user.username || 'Player')}</div>
                </button>
            `).join('') : `<div class="text-xs text-gray-500 px-1">No online players right now.</div>`}
        </div>
    `;
}

function updateMobileChatPanels() {
    const globalStrip = document.getElementById('mobile-global-strip');
    const dmPanel = document.getElementById('mobile-dm-list-panel');
    const mobileTabs = document.querySelector('.mobile-chat-tabs');
    const messagesArea = document.getElementById('chat-messages-area');
    const dmHeader = document.getElementById('mobile-dm-conversation-header');
    if (!globalStrip || !dmPanel || !mobileTabs || !messagesArea || !dmHeader) return;

    const isMobile = isMobileViewport();
    if (!isMobile) {
        globalStrip.classList.add('hidden');
        dmPanel.classList.add('hidden');
        dmHeader.classList.add('hidden');
        messagesArea.classList.remove('hidden');
        mobileTabs.classList.remove('hidden');
        window.chatState.mobileDmConversationOpen = false;
        updateChatComposerState();
        syncMobileShellVisibility();
        return;
    }

    if (window.activeChatTab === 'global') {
        window.chatState.mobileDmConversationOpen = false;
        globalStrip.classList.remove('hidden');
        dmPanel.classList.add('hidden');
        dmHeader.classList.add('hidden');
        messagesArea.classList.remove('hidden');
        mobileTabs.classList.remove('hidden');
        renderMobileGlobalStrip(globalStrip);
    } else {
        const hasActiveConversation = Boolean(window.chatState.activeDmFriend && window.chatState.mobileDmConversationOpen);
        if (hasActiveConversation) {
            globalStrip.classList.add('hidden');
            dmPanel.classList.add('hidden');
            dmHeader.classList.remove('hidden');
            messagesArea.classList.remove('hidden');
            mobileTabs.classList.add('hidden');
            updateMobileDmConversationHeader();
        } else {
            globalStrip.classList.add('hidden');
            dmPanel.classList.remove('hidden');
            dmHeader.classList.add('hidden');
            messagesArea.classList.add('hidden');
            mobileTabs.classList.remove('hidden');
            renderMobileDirectPanel(dmPanel);
        }
    }
    updateChatComposerState();
    syncMobileShellVisibility();
}

function updateMobileDmConversationHeader() {
    const profileBtn = document.getElementById('mobileDmHeaderProfileBtn');
    const friend = window.chatState.activeDmFriend;
    if (!profileBtn || !friend) return;
    const targetUid = friend.uid || '';
    const safeName = escapeHtml(friend.username || 'Player');
    const avatar = friend.avatar || 'assets/icons/logo.jpg';

    profileBtn.innerHTML = `
        <div class="w-9 h-9 rounded-full overflow-hidden border border-white/10">
            <img src="${avatar}" alt="avatar" class="w-9 h-9 object-cover">
        </div>
        <div class="min-w-0">
            <div class="text-sm font-bold text-white truncate">${safeName}</div>
            <div class="text-[11px] text-gray-400 truncate">Direct message</div>
        </div>
    `;
    profileBtn.onclick = () => window.openUserProfile(targetUid);
}

/* -------------------------------------------------------------------------- */
/*                           CHAT LISTENERS & ACTIONS                         */
/* -------------------------------------------------------------------------- */

window.switchChatTab = function (tab, skipListRefresh = false, openConversation = null) {
    const prevTab = window.activeChatTab;
    window.activeChatTab = tab === 'dms' ? 'dms' : 'global';
    const isMobile = isMobileViewport();

    if (window.activeChatTab === 'global') {
        window.chatState.mobileDmConversationOpen = false;
    } else {
        if (!window.chatState.activeDmFriend && !isMobile && (window.chatState.friends || []).length) {
            const firstFriend = window.chatState.friends[0];
            window.chatState.activeDmFriend = {
                uid: firstFriend.uid,
                username: firstFriend.username || 'Player',
                avatar: firstFriend.avatar || ''
            };
        }
        if (isMobile) {
            if (openConversation === true) {
                window.chatState.mobileDmConversationOpen = Boolean(window.chatState.activeDmFriend);
            } else if (openConversation === false) {
                window.chatState.mobileDmConversationOpen = false;
            } else if (prevTab !== 'dms') {
                window.chatState.mobileDmConversationOpen = false;
            } else if (!window.chatState.activeDmFriend) {
                window.chatState.mobileDmConversationOpen = false;
            }
        }

        if (window.chatState.activeDmFriend?.uid) {
            window.Services?.chat?.listenToDirectChat?.(window.chatState.activeDmFriend.uid);
        }
    }

    updateChatTabStyles();
    updateMobileChatPanels();
    updateChatComposerState();

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
    const pendingRequests = (window.chatState.requests || []).length;

    if (desktopGlobal) desktopGlobal.textContent = "Global";
    if (mobileGlobal) mobileGlobal.textContent = "Global";
    if (desktopDms) desktopDms.textContent = pendingRequests > 0 ? `DMs (${pendingRequests})` : "DMs";
    if (mobileDms) mobileDms.textContent = pendingRequests > 0 ? `DMs (${pendingRequests})` : "DMs";

    setTabClasses(desktopGlobal, window.activeChatTab === 'global');
    setTabClasses(desktopDms, window.activeChatTab === 'dms');
    setMobileTabClasses(mobileGlobal, window.activeChatTab === 'global');
    setMobileTabClasses(mobileDms, window.activeChatTab === 'dms');
}

function updateMobileListVisibility() {
    updateMobileChatPanels();
}

window.toggleMobileChatList = function () {
    updateMobileChatPanels();
};

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
    el.classList.remove('bg-purple-600', 'bg-white/5', 'text-white', 'text-gray-400', 'border-b-2', 'border-purple-400', 'border-transparent');
    if (active) {
        el.classList.add('bg-purple-600', 'text-white', 'border-b-2', 'border-purple-400');
    } else {
        el.classList.add('bg-white/5', 'text-gray-400', 'border-b-2', 'border-transparent');
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
    msgs.forEach(msg => renderMessage(msg, container, 'global'));
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
    msgs.forEach(msg => renderMessage(msg, container, 'dm'));
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
            if (!friend) {
                showToast("Select a friend to start DM", "error");
                return;
            }
            await window.Services.chat.sendDirectMessage(friend.uid, text);
        } else {
            await window.Services.chat.sendGlobalMessage(text);
        }
        input.value = '';
    } catch (e) {
        console.error("[CHAT] send error:", e);
        showToast("Message failed to send", "error");
    }
};

window.searchFriendUsers = async function () {
    await searchFriendUsersByIds('friendSearchInput', 'friend-search-results');
};

window.searchFriendUsersMobile = async function () {
    await searchFriendUsersByIds('friendSearchInputMobile', 'friend-search-results-mobile');
};

async function searchFriendUsersByIds(inputId, resultsId) {
    const input = document.getElementById(inputId);
    const resultsBox = document.getElementById(resultsId);
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
        const friendIds = new Set((window.chatState.friends || []).map(friend => friend.uid));
        const incomingRequests = new Set((window.chatState.requests || []).map(req => req.from));

        if (!filtered.length) {
            resultsBox.innerHTML = `<div class="text-xs text-gray-500">No users found.</div>`;
            return;
        }

        resultsBox.innerHTML = filtered.map(user => `
            <div class="bg-black/20 border border-white/10 rounded-lg p-2 flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                    <img src="${user.avatar || 'assets/icons/logo.jpg'}" alt="avatar" class="w-7 h-7 rounded-full object-cover border border-white/10">
                    <div class="text-xs text-gray-200 truncate">${escapeHtml(user.username || user.uid)}</div>
                </div>
                ${friendIds.has(user.uid)
                ? '<button class="px-2 py-1 rounded bg-green-700/60 text-gray-200 text-[10px] font-bold cursor-default" disabled>Friends</button>'
                : incomingRequests.has(user.uid)
                    ? `<button onclick="window.acceptFriendRequest('${user.uid}')" class="px-2 py-1 rounded bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold">Accept</button>`
                    : `<button data-add-uid="${user.uid}" onclick="window.sendFriendRequest('${user.uid}')" class="px-2 py-1 rounded ${window.chatState.sentRequests[user.uid] ? 'bg-gray-600 text-gray-200 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white'} text-[10px] font-bold" ${window.chatState.sentRequests[user.uid] ? 'disabled' : ''}>
                        ${window.chatState.sentRequests[user.uid] ? 'Sent' : 'Add'}
                    </button>`
            }
            </div>
        `).join('');
    } catch (e) {
        console.error("[FRIEND] search error:", e);
        resultsBox.innerHTML = `<div class="text-xs text-red-400">Search failed.</div>`;
    }
}

window.sendFriendRequest = async function (targetUid) {
    try {
        await window.Services.friend.sendRequest(targetUid);
        markFriendRequestSent(targetUid);
        showToast("Friend request sent", "success");
    } catch (e) {
        console.error("[FRIEND] request error:", e);
        showToast(e.message || "Could not send request", "error");
    }
};

window.acceptFriendRequest = async function (fromUid) {
    const request = (window.chatState.requests || []).find(r => r.from === fromUid || r.id === fromUid);
    if (!request) return;

    try {
        await window.Services.friend.acceptRequest(request);
        showToast(`You and ${request.username || 'player'} are now friends`, "success");
    } catch (e) {
        console.error("[FRIEND] accept error:", e);
        showToast("Could not accept request", "error");
    }
};

window.declineFriendRequest = async function (fromUid) {
    try {
        await window.Services.friend.declineRequest(fromUid);
        showToast("Request declined", "success");
    } catch (e) {
        showToast("Could not decline request", "error");
    }
};

window.startDm = function (uid, encodedName, encodedAvatar) {
    const username = decodeURIComponent(encodedName || 'Player');
    const avatar = decodeURIComponent(encodedAvatar || '');
    window.chatState.activeDmFriend = { uid, username, avatar };
    window.chatState.directMessages = [];
    window.switchChatTab('dms', false, isMobileViewport());
    window.Services?.chat?.listenToDirectChat?.(uid);
};

window.closeMobileDmConversation = function () {
    window.chatState.mobileDmConversationOpen = false;
    updateMobileChatPanels();
};

function renderMessage(msg, container, scope = 'global') {
    const isMe = window.Services?.state?.currentUser && msg.uid === window.Services.state.currentUser.uid;
    const div = document.createElement('div');
    const stamp = formatTime(msg.timestamp);
    const safeUid = escapeAttr(msg.uid || '');
    const canOpenProfile = Boolean(msg.uid);
    const avatar = msg.avatar || 'assets/icons/logo.jpg';
    const username = escapeHtml(msg.user || 'Player');

    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
    div.innerHTML = `
        ${!isMe && scope === 'global'
            ? `<div class="flex items-center gap-2 mb-1 ml-1">
                ${canOpenProfile
                    ? `<button onclick="window.openUserProfile('${safeUid}')" class="w-7 h-7 rounded-full overflow-hidden border border-white/10">
                        <img src="${avatar}" alt="avatar" class="w-7 h-7 object-cover">
                    </button>
                    <button onclick="window.openUserProfile('${safeUid}')" class="text-[11px] text-gray-300 font-bold hover:text-white transition-colors">${username}</button>`
                    : `<div class="w-7 h-7 rounded-full overflow-hidden border border-white/10"><img src="${avatar}" alt="avatar" class="w-7 h-7 object-cover"></div>
                    <span class="text-[11px] text-gray-300 font-bold">${username}</span>`}
            </div>`
            : ''}
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            ${escapeHtml(msg.text || '')}
            <div class="text-[9px] opacity-60 mt-1 text-right">${stamp}</div>
        </div>
    `;
    container.appendChild(div);
}

/* -------------------------------------------------------------------------- */
/*                           SOCIAL ACTION HANDLERS                           */
/* -------------------------------------------------------------------------- */

window.publishStatusPost = async function () {
    const input = document.getElementById('statusPostInput');
    const imageInput = document.getElementById('statusImageFiles');
    const postBtn = document.querySelector('button[onclick="window.publishStatusPost()"]');
    if (!input) return;
    const text = input.value.trim();
    const files = window.chatState.feedComposerFiles || [];
    if (!text) {
        showToast("Write something before posting", "error");
        return;
    }

    try {
        if (postBtn) {
            postBtn.disabled = true;
            postBtn.classList.add('opacity-70', 'cursor-not-allowed');
            postBtn.textContent = 'Posting...';
        }
        if (files.length) {
            showToast("Image posts are temporarily disabled. Text posted only.", "info");
        }
        await window.Services.feed.postStatus({ text });

        input.value = '';
        if (imageInput) imageInput.value = '';
        cleanupFeedComposerPreviewUrls();
        window.chatState.feedComposerFiles = [];
        renderFeedComposerPreview();
        showToast("Status posted", "success");
    } catch (e) {
        showToast(e.message || "Unable to post status", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            postBtn.textContent = 'Post Update';
        }
    }
};

window.handleFeedImageSelection = async function (event) {
    const input = event?.target || null;
    if (input) input.value = '';
    cleanupFeedComposerPreviewUrls();
    window.chatState.feedComposerFiles = [];
    renderFeedComposerPreview();
    showToast("Image posts are temporarily disabled. Use text posts for now.", "info");
};

window.likeFeedPost = async function (postId) {
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    try {
        await window.Services.feed.likePost(postId);
    } catch (e) {
        showToast("Unable to update like", "error");
    }
};

window.toggleFeedComments = function (postId) {
    const next = !window.chatState.expandedComments[postId];
    window.chatState.expandedComments[postId] = next;
    if (next) {
        ensureFeedCommentSubscription(postId);
    } else if (window.chatState.feedCommentUnsubs[postId]) {
        window.chatState.feedCommentUnsubs[postId]();
        delete window.chatState.feedCommentUnsubs[postId];
    }
    renderFeedPosts();
};

window.submitFeedComment = async function (postId) {
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    const input = document.getElementById(`comment-input-${postId}`);
    const text = (input?.value || '').trim();
    if (!text) return;

    try {
        await window.Services.feed.addComment(postId, text);
        if (input) input.value = '';
    } catch (e) {
        showToast("Comment failed", "error");
    }
};

window.toggleFavoriteGame = async function (gameId) {
    if (!window.Services?.state?.currentUser) {
        window.openAuthOverlay();
        return;
    }
    try {
        await window.Services.user.toggleFavoriteGame(gameId);
        showToast("Favorites updated", "success");
        if (document.getElementById('view-profile')?.classList.contains('active')) {
            renderProfile();
        }
    } catch (e) {
        showToast(e.message || "Unable to update favorites", "error");
    }
};

window.openEditProfileModal = function () {
    const userData = window.currentUserData || {};
    let modal = document.getElementById('editProfileModal');
    cleanupProfilePreviewUrls();
    window.chatState.profileUpload = {
        avatarUrl: userData.avatar || PRESET_AVATARS[0],
        coverUrl: userData.cover_photo || PRESET_COVERS[0]
    };

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'editProfileModal';
        modal.className = 'hidden fixed inset-0 z-[7100] bg-black/80 backdrop-blur-md items-center justify-center p-4';
        modal.innerHTML = `
            <div class="w-full max-w-2xl bg-[#13131a] border border-white/10 rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-black text-white">Edit Profile</h3>
                    <button onclick="window.closeEditProfileModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                    <div>
                        <div class="text-xs text-gray-400 font-bold mb-2">Avatar</div>
                        <img id="editProfileAvatarPreview" src="assets/icons/logo.jpg" alt="avatar preview" class="w-full h-24 rounded-xl object-cover border border-white/10">
                        <div id="editAvatarPresetList" class="mt-2 grid grid-cols-5 gap-2"></div>
                    </div>
                    <div>
                        <div class="text-xs text-gray-400 font-bold mb-2">Cover</div>
                        <img id="editProfileCoverPreview" src="assets/icons/logo.jpg" alt="cover preview" class="w-full h-24 rounded-xl object-cover border border-white/10 mb-2">
                        <div id="editCoverPresetList" class="grid grid-cols-2 md:grid-cols-5 gap-2"></div>
                    </div>
                </div>
                <label class="text-xs text-gray-400 font-bold">Username</label>
                <input id="editProfileUsername" type="text" class="w-full mt-1 mb-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm">
                <label class="text-xs text-gray-400 font-bold">Bio</label>
                <textarea id="editProfileBio" maxlength="180" class="w-full mt-1 mb-4 h-24 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm resize-none"></textarea>
                <div class="flex gap-2">
                    <button onclick="window.closeEditProfileModal()" class="flex-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-bold">Cancel</button>
                    <button onclick="window.saveProfileEdits()" class="flex-1 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.closeEditProfileModal();
        });
    }

    document.getElementById('editProfileUsername').value = userData.username || '';
    document.getElementById('editProfileBio').value = userData.bio || '';
    const avatarPreview = document.getElementById('editProfileAvatarPreview');
    const coverPreview = document.getElementById('editProfileCoverPreview');
    if (avatarPreview) avatarPreview.src = window.chatState.profileUpload.avatarUrl || PRESET_AVATARS[0];
    if (coverPreview) coverPreview.src = window.chatState.profileUpload.coverUrl || PRESET_COVERS[0];
    renderProfilePresetOptions();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeEditProfileModal = function () {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
    cleanupProfilePreviewUrls();
    window.chatState.profileUpload = { avatarUrl: '', coverUrl: '' };
};

function renderProfilePresetOptions() {
    const avatarList = document.getElementById('editAvatarPresetList');
    const coverList = document.getElementById('editCoverPresetList');
    const selectedAvatar = window.chatState.profileUpload?.avatarUrl || '';
    const selectedCover = window.chatState.profileUpload?.coverUrl || '';
    if (avatarList) {
        avatarList.innerHTML = PRESET_AVATARS.map((url, idx) => `
            <button onclick="window.selectPresetAvatar('${escapeAttr(url)}')" class="rounded-lg border ${selectedAvatar === url ? 'border-purple-400 ring-2 ring-purple-500/40' : 'border-white/10'} overflow-hidden bg-black/20 hover:border-purple-500/50 transition-all" title="Avatar ${idx + 1}">
                <img src="${url}" alt="Avatar ${idx + 1}" class="w-full h-12 object-cover">
            </button>
        `).join('');
    }
    if (coverList) {
        coverList.innerHTML = PRESET_COVERS.map((url, idx) => `
            <button onclick="window.selectPresetCover('${escapeAttr(url)}')" class="rounded-lg border ${selectedCover === url ? 'border-purple-400 ring-2 ring-purple-500/40' : 'border-white/10'} overflow-hidden bg-black/20 hover:border-purple-500/50 transition-all" title="Cover ${idx + 1}">
                <img src="${url}" alt="Cover ${idx + 1}" class="w-full h-12 object-cover">
            </button>
        `).join('');
    }
}

window.saveProfileEdits = async function () {
    const saveBtn = document.querySelector('#editProfileModal button[onclick="window.saveProfileEdits()"]');
    const username = (document.getElementById('editProfileUsername')?.value || '').trim();
    const bio = (document.getElementById('editProfileBio')?.value || '').trim();
    const avatarUrl = String(window.chatState.profileUpload?.avatarUrl || '').trim();
    const coverUrl = String(window.chatState.profileUpload?.coverUrl || '').trim();

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.classList.add('opacity-70', 'cursor-not-allowed');
            saveBtn.textContent = 'Saving...';
        }
        await window.Services.user.updateProfileFields({ username, bio, avatar: avatarUrl, coverPhoto: coverUrl });
        window.closeEditProfileModal();
        window.chatState.profileUpload = { avatarUrl: '', coverUrl: '' };
        showToast("Profile updated successfully", "success");
        renderProfile();
    } catch (e) {
        showToast(e.message || "Unable to save profile", "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('opacity-70', 'cursor-not-allowed');
            saveBtn.textContent = 'Save';
        }
    }
};

window.selectPresetAvatar = function (url) {
    if (!url) return;
    window.chatState.profileUpload.avatarUrl = url;
    const avatarPreview = document.getElementById('editProfileAvatarPreview');
    if (avatarPreview) avatarPreview.src = url;
    renderProfilePresetOptions();
};

window.selectPresetCover = function (url) {
    if (!url) return;
    window.chatState.profileUpload.coverUrl = url;
    const coverPreview = document.getElementById('editProfileCoverPreview');
    if (coverPreview) coverPreview.src = url;
    renderProfilePresetOptions();
};

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

async function waitForServicesReady(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const services = window.Services;
        if (services && services.auth && services.user && services.feed && services.chat) {
            return services;
        }
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    throw new Error("App services are not ready. Please refresh and try again.");
}

window.handleLogin = async function () {
    const email = document.getElementById('emailInput')?.value || '';
    const pass = document.getElementById('passwordInput')?.value || '';
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = "Logging in...";

    try {
        const services = await waitForServicesReady();
        await services.auth.login(email, pass);
        closeAuthOverlay();
        showToast("Logged in successfully", "success");
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
        showToast("Login failed", "error");
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
        const services = await waitForServicesReady();
        await services.auth.signup(username, email, pass);
        closeAuthOverlay();
        showToast("Account created", "success");
    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
        showToast("Signup failed", "error");
    }
};

window.handleLogout = async function () {
    try {
        const services = await waitForServicesReady();
        await services.auth.logout();
    } catch (e) {
        showToast(e.message || "Logout failed", "error");
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
    showToast("Profile refreshed", "success");
};

window.closePrivateChat = function () {
    window.switchView('chat');
    window.switchChatTab('dms');
};

function renderProfileGameCard(game, isFavorite, allowFavorite = true) {
    const safeTitle = escapeHtml(game.title || 'Game');
    const safeThumb = game.thumbnail || 'assets/icons/logo.jpg';
    const safeUrl = escapeAttr(game.url || '');
    const safeGameId = game.id ? escapeAttr(game.id) : '';
    const favoriteBtn = allowFavorite && game.id ? `
        <button onclick="window.toggleFavoriteGame('${safeGameId}')" class="profile-v2-card-btn ${isFavorite ? 'active' : ''}">
            <i class="fas fa-heart mr-1"></i>${isFavorite ? 'Saved' : 'Save'}
        </button>
    ` : '';

    return `
        <div class="profile-v2-game-card">
            <img src="${safeThumb}" class="profile-v2-game-thumb" alt="${safeTitle}">
            <div class="p-3">
                <div class="text-sm font-bold text-white truncate">${safeTitle}</div>
                <div class="flex items-center justify-between gap-2 mt-2">
                    <button onclick="playGame('${safeUrl}','${escapeAttr(game.title || 'Game')}')" class="profile-v2-card-btn play">
                    Play
                </button>
                ${favoriteBtn}
                </div>
            </div>
        </div>
    `;
}

function getRecentGames() {
    try {
        const recent = JSON.parse(localStorage.getItem('satex_recent') || '[]');
        return recent.map(g => normalizeGame(g)).filter(Boolean);
    } catch (e) {
        return [];
    }
}

function resolveFavoriteGames(gameIds) {
    if (!Array.isArray(gameIds)) return [];
    return gameIds.map(id => findGameById(id)).filter(Boolean);
}

function findGameById(gameId) {
    if (!gameId) return null;
    const games = window.Services?.state?.gameLibrary || window.allGames || [];
    const lookup = String(gameId).trim().toLowerCase();
    let game = games.find(g => String(g.id || '').trim().toLowerCase() === lookup);
    if (!game) {
        game = games.find(g => String(extractIdFromUrl(g.url || g.path) || '').trim().toLowerCase() === lookup);
    }
    if (!game && lookup.includes('/')) {
        game = games.find(g => String(g.url || g.path || '').trim().toLowerCase().includes(lookup));
    }
    return game ? normalizeGame(game) : null;
}

function normalizeGame(raw) {
    if (!raw) return null;
    const url = raw.url || raw.path;
    if (!url) return null;
    return {
        id: raw.id || extractIdFromUrl(url),
        title: raw.title || 'Game',
        url,
        thumbnail: raw.thumbnail || 'assets/icons/logo.jpg',
        category: raw.category || 'Arcade'
    };
}

function isGameFavorited(favoriteIdSet, game) {
    if (!favoriteIdSet || !game) return false;
    const directId = String(game.id || '').trim().toLowerCase();
    if (directId && favoriteIdSet.has(directId)) return true;
    const extractedId = String(extractIdFromUrl(game.url || game.path || '') || '').trim().toLowerCase();
    if (extractedId && favoriteIdSet.has(extractedId)) return true;
    return false;
}

function extractIdFromUrl(url) {
    const games = window.Services?.state?.gameLibrary || window.allGames || [];
    const match = games.find(g => (g.url || g.path) === url);
    if (match?.id) return match.id;
    const parts = String(url).split('/');
    return parts.length > 1 ? parts[parts.length - 2] : null;
}

function markFriendRequestSent(targetUid) {
    if (!targetUid) return;
    window.chatState.sentRequests[targetUid] = true;
    document.querySelectorAll(`[data-add-uid="${targetUid}"]`).forEach(btn => {
        btn.disabled = true;
        btn.textContent = 'Sent';
        btn.classList.remove('bg-purple-600', 'hover:bg-purple-500', 'text-white');
        btn.classList.add('bg-gray-600', 'text-gray-200', 'cursor-not-allowed');
    });
}

function renderFeedComposerPreview() {
    const preview = document.getElementById('statusImagePreview');
    const meta = document.getElementById('statusImageMeta');
    if (!preview || !meta) return;

    const files = window.chatState.feedComposerFiles || [];
    if (!files.length) {
        preview.classList.add('hidden');
        preview.innerHTML = '';
        meta.textContent = 'Text posts are enabled';
        return;
    }

    preview.classList.remove('hidden');
    preview.innerHTML = files.map((file, index) => `
        <div class="relative border border-white/10 rounded-lg overflow-hidden">
            <img src="${file.previewUrl}" alt="preview ${index + 1}" class="w-full h-20 object-cover">
            <button onclick="window.removeFeedComposerImage(${index})" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    meta.textContent = `${files.length} image${files.length > 1 ? 's' : ''} selected`;
}

window.removeFeedComposerImage = function (index) {
    const files = window.chatState.feedComposerFiles || [];
    if (index < 0 || index >= files.length) return;
    const removed = files[index];
    if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
    }
    files.splice(index, 1);
    window.chatState.feedComposerFiles = files;

    const fileInput = document.getElementById('statusImageFiles');
    if (!files.length && fileInput) fileInput.value = '';
    renderFeedComposerPreview();
};

function cleanupFeedComposerPreviewUrls() {
    (window.chatState.feedComposerFiles || []).forEach(file => {
        if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
    });
}

function cleanupProfilePreviewUrls() {
    // Preset images are remote URLs, no object URL cleanup needed.
}

function ensureFeedCommentSubscription(postId) {
    if (!postId) return;
    if (window.chatState.feedCommentUnsubs[postId]) return;
    const unsub = window.Services?.feed?.listenToPostComments?.(postId, (comments) => {
        window.chatState.feedComments[postId] = comments || [];
        if (window.chatState.expandedComments[postId]) {
            renderFeedPosts();
        }
    });
    if (typeof unsub === 'function') {
        window.chatState.feedCommentUnsubs[postId] = unsub;
    }
}

function cleanupFeedCommentListeners() {
    Object.values(window.chatState.feedCommentUnsubs || {}).forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    window.chatState.feedCommentUnsubs = {};
}

function pruneFeedCommentListeners() {
    const activePostIds = new Set((window.chatState.feedPosts || []).map(post => post.id));
    Object.entries(window.chatState.feedCommentUnsubs || {}).forEach(([postId, unsub]) => {
        if (!activePostIds.has(postId)) {
            if (typeof unsub === 'function') unsub();
            delete window.chatState.feedCommentUnsubs[postId];
            delete window.chatState.feedComments[postId];
            delete window.chatState.expandedComments[postId];
        }
    });
}

function ensureToastStack() {
    if (document.getElementById('toastStack')) return;
    const stack = document.createElement('div');
    stack.id = 'toastStack';
    stack.className = 'fixed top-20 right-4 z-[7200] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(stack);
}

function showToast(message, type = 'info') {
    ensureToastStack();
    const stack = document.getElementById('toastStack');
    if (!stack) return;

    const tone = type === 'success'
        ? 'border-green-500/40 bg-green-500/15 text-green-100'
        : type === 'error'
            ? 'border-red-500/40 bg-red-500/15 text-red-100'
            : 'border-purple-500/40 bg-purple-500/15 text-purple-100';

    const toast = document.createElement('div');
    toast.className = `pointer-events-auto min-w-[220px] max-w-[320px] border ${tone} rounded-xl px-3 py-2 text-xs font-bold shadow-lg`;
    toast.textContent = message;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2600);
}

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
