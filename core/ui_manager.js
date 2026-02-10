
/* -------------------------------------------------------------------------- */
/*                           DATA MANAGEMENT                                  */
/* -------------------------------------------------------------------------- */
let currentUserData = null; // Will be set by chat.js

// Exposed function for chat.js (Firebase) to push data
window.updateProfileData = function (user, profile) {
    currentUserData = {
        ...user,
        ...profile // merged firestore data
    };
    console.log("🔥 [UI] Profile Data Updated", currentUserData);

    // Refresh current view if needed
    const currentView = new URLSearchParams(window.location.search).get('view');
    if (currentView === 'profile') renderProfile();
    // Chat updates handled by chat.js listeners mostly
}

/* -------------------------------------------------------------------------- */
/*                           VIEW NAVIGATION                                  */
/* -------------------------------------------------------------------------- */
// Handle PopState (Browser Back Button)
window.addEventListener('popstate', (e) => {
    const view = e.state ? e.state.view : 'home';
    _renderView(view, false); // false = don't push state
});

function switchView(viewName) {
    // 1. Toggle Logic: If already on view, go home (unless it's home already)
    const currentParams = new URLSearchParams(window.location.search);
    const currentView = currentParams.get('view') || 'home';

    if (viewName === currentView && viewName !== 'home') {
        viewName = 'home';
    }

    // 2. Push State
    const url = viewName === 'home' ? window.location.pathname : `?view=${viewName}`;
    history.pushState({ view: viewName }, '', url);

    _renderView(viewName, true);
}

// Internal render function
function _renderView(viewName, isPush) {
    // 1. Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    // 2. Show target view
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');
        if (viewName === 'profile') renderProfile();
        if (viewName === 'chat') {
            // Let chat.js know to load if needed, or just render layout
            renderChatInterface();
            // Dispatch event for chat.js to hook into
            window.dispatchEvent(new CustomEvent('chatViewOpened'));
        }
    }

    // 3. Update Sidebar Active State
    document.querySelectorAll('.sidebar-item').forEach(btn => {
        if (btn.dataset.view) {
            if (btn.dataset.view === viewName) btn.classList.add('active');
            else btn.classList.remove('active');
        } else {
            if (viewName !== 'home') btn.classList.remove('active');
        }
    });

    // 4. Update Bottom Nav Active State
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        const isTarget = btn.getAttribute('onclick').includes(viewName);
        if (isTarget) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Scroll to top
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
            <div class="flex flex-col items-center justify-center h-96 text-center">
                <i class="fas fa-lock text-6xl text-gray-700 mb-4"></i>
                <h2 class="text-xl font-bold text-white">Login Required</h2>
                <p class="text-gray-500 mb-6">Please sign in to view your profile.</p>
                <button onclick="document.getElementById('chatLoginOverlay').classList.remove('hidden')" class="px-6 py-2 bg-purple-600 rounded-xl font-bold text-white hover:bg-purple-500">Login / Signup</button>
            </div>
        `;
        return;
    }

    // Use Real Data
    const badgesHtml = [
        { name: "Night Owl", icon: "🌙" },
        { name: "Sniper", icon: "🎯" }
    ].map(b => `
        <div class="flex flex-col items-center gap-1 bg-white/5 p-3 rounded-xl border border-white/5 w-20">
            <span class="text-2xl">${b.icon}</span>
            <span class="text-[10px] font-bold text-gray-400 text-center leading-tight">${b.name}</span>
        </div>
    `).join('');

    const recentHtml = JSON.parse(localStorage.getItem('satex_recent') || '[]').slice(0, 3).map(g => `
        <div class="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 transition-colors" onclick="playGame('${g.url}', '${g.title}')">
            <img src="${g.thumbnail || 'assets/icons/logo.jpg'}" class="w-12 h-12 rounded-lg object-cover bg-black">
            <div>
                <div class="font-bold text-sm text-white">${g.title}</div>
                <div class="text-xs text-gray-500">${g.category || 'Arcade'}</div>
            </div>
            <button class="ml-auto text-xs bg-purple-600 px-3 py-1.5 rounded-lg font-bold">PLAY</button>
        </div>
    `).join('');

    container.innerHTML = `
        <!-- Header -->
        <div class="profile-header">
            <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop" class="banner-img">
            <div class="profile-avatar-container">
                <div class="avatar-ring">
                    <img src="${currentUserData.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + currentUserData.uid}" class="avatar-img">
                </div>
                <div class="level-badge-large">LVL 1</div>
            </div>
        </div>

        <div class="px-4 md:px-0 mt-16 md:mt-0">
            <div class="flex justify-between items-end mb-8">
                <div>
                    <h2 class="text-3xl font-black text-white tracking-tight">${currentUserData.username || 'User'}</h2>
                    <p class="text-gray-400 font-medium">@${currentUserData.uid.slice(0, 8)}...</p>
                </div>
                 <!-- XP Bar (simplified) -->
                <div class="w-32 hidden md:block">
                     <div class="flex justify-between text-xs font-bold text-gray-400 mb-1">
                        <span>XP</span>
                        <span>0/100</span>
                    </div>
                    <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-purple-600 to-blue-500" style="width: 10%"></div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="stat-card">
                   <i class="fas fa-gamepad text-purple-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">0</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Games Played</div>
                </div>
                <div class="stat-card">
                   <i class="fas fa-trophy text-yellow-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">--</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Win Rate</div>
                </div>
                <!-- ... -->
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
                <!-- Recent Activity -->
                <div>
                     <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Badges</h3>
                     <div class="flex flex-wrap gap-3">
                         ${badgesHtml}
                     </div>
                </div>
                
                <div>
                     <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Recent Activity</h3>
                     <div class="space-y-3">
                        ${recentHtml.length ? recentHtml : '<p class="text-gray-500 text-sm">No recent games played.</p>'}
                     </div>
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/*                             CHAT RENDERER                                  */
/* -------------------------------------------------------------------------- */
let activeChatTab = 'global';

function renderChatInterface() {
    const container = document.getElementById('view-chat');
    if (!container) return;

    if (!currentUserData) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center p-8">
                <i class="fas fa-comments text-6xl text-gray-700 mb-4"></i>
                <h2 class="text-xl font-bold text-white">Guest Access Restricted</h2>
                <p class="text-gray-500 mb-6">Please join Satex Games to chat with others.</p>
                <button onclick="document.getElementById('chatLoginOverlay').classList.remove('hidden')" class="px-6 py-2 bg-purple-600 rounded-xl font-bold text-white hover:bg-purple-500">Login to Chat</button>
            </div>
        `;
        return;
    }

    // Keep existing DOM if already rendered to preserve state/scroll
    if (container.querySelector('.chat-layout')) return;

    // Render Basic Skeleton (Empty lists, chat.js will populate)
    container.innerHTML = `
        <div class="chat-layout">
            <!-- Sidebar List -->
            <div class="chat-list-panel">
                <div class="p-4 border-b border-white/5">
                    <div class="flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-global" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all bg-purple-600 text-white shadow-lg">Global</button>
                        <button onclick="switchChatTab('friends')" id="tab-friends" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all text-gray-500 hover:bg-white/5 relative">
                            Friends
                            <span class="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full border border-black hidden" id="friend-dot"></span>
                        </button>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-2 space-y-2" id="chat-list-content">
                    <!-- chat.js fills this -->
                    <div class="text-center p-4 text-gray-500 text-xs">Loading contacts...</div>
                </div>
            </div>

            <!-- Main Chat View -->
            <div class="chat-view-panel">
                 <!-- Mobile Tabs -->
                <div class="md:hidden mobile-chat-tabs border-b border-white/5 flex gap-2 overflow-x-auto">
                     <button onclick="switchChatTab('global')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white border border-white/5 whitespace-nowrap active-tab-mobile">Global Chat</button>
                     <button onclick="switchChatTab('friends')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white border border-white/5 whitespace-nowrap">Friends</button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 content-start chat-messages-area" id="chat-messages-area">
                    <!-- chat.js fills this -->
                </div>

                <div class="chat-input-container border-t border-white/5">
                    <div class="flex gap-2">
                        <input type="text" id="chatMsgInput" placeholder="Type a message..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors" autocomplete="off">
                        <button onclick="window.sendChatMessage()" class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-white hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Trigger initial load from chat.js
    window.dispatchEvent(new CustomEvent('chatTabChanged', { detail: { tab: 'global' } }));
}

function switchChatTab(tab) {
    activeChatTab = tab;
    // Update UI tabs
    const globalBtn = document.getElementById('tab-global');
    const friendsBtn = document.getElementById('tab-friends');
    if (globalBtn && friendsBtn) {
        if (tab === 'global') {
            globalBtn.classList.add('bg-purple-600', 'text-white', 'shadow-lg');
            globalBtn.classList.remove('text-gray-500', 'hover:bg-white/5');
            friendsBtn.classList.remove('bg-purple-600', 'text-white', 'shadow-lg');
            friendsBtn.classList.add('text-gray-500', 'hover:bg-white/5');
        } else {
            friendsBtn.classList.add('bg-purple-600', 'text-white', 'shadow-lg');
            friendsBtn.classList.remove('text-gray-500', 'hover:bg-white/5');
            globalBtn.classList.remove('bg-purple-600', 'text-white', 'shadow-lg');
            globalBtn.classList.add('text-gray-500', 'hover:bg-white/5');
        }
    }

    // Notify chat.js to update content
    window.dispatchEvent(new CustomEvent('chatTabChanged', { detail: { tab: tab } }));
}

// Global Exports
window.switchView = switchView;
window.switchChatTab = switchChatTab;
