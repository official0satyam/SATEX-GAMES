
/* -------------------------------------------------------------------------- */
/*                               MOCK DATA                                    */
/* -------------------------------------------------------------------------- */
const MOCK_USER = {
    id: "user_001",
    name: "CyberNinja",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    banner: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop",
    level: 54,
    xp: 75, // percentage
    gamesPlayed: 1243,
    winRate: "68%",
    status: "online",
    badges: [
        { name: "Night Owl", icon: "🌙", color: "text-purple-400" },
        { name: "Sniper", icon: "🎯", color: "text-red-400" },
        { name: "Top 100", icon: "🏆", color: "text-yellow-400" },
        { name: "Early Bird", icon: "🌅", color: "text-orange-400" }
    ],
    favGame: {
        title: "Subway Surfers",
        image: "https://img.gamedistribution.com/b57c15d037024b798c2e80efbca087cc-512x384.jpg",
        category: "Action"
    },
    friends: [
        { id: "f1", name: "NeonRider", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka", status: "online", lastMsg: "Let's play!" },
        { id: "f2", name: "PixelQueen", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Baby", status: "offline", lastMsg: "See you later" },
        { id: "f3", name: "GlitchMaster", avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Caleb", status: "online", lastMsg: "Check this out" },
    ],
    messages: [
        { id: 1, sender: "NeonRider", text: "Hey! You online for a match?", type: "them" },
        { id: 2, sender: "me", text: "Yeah, give me 5 mins.", type: "me" },
        { id: 3, sender: "NeonRider", text: "Cool, I'll be in the lobby.", type: "them" }
    ]
};

/* -------------------------------------------------------------------------- */
/*                           VIEW NAVIGATION                                  */
/* -------------------------------------------------------------------------- */
function switchView(viewName) {
    // 1. Hide all views
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
    });

    // 2. Show target view
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active');

        // Load content if needed
        if (viewName === 'profile') renderProfile();
        if (viewName === 'chat') renderChatInterface();
    }

    // 3. Update Sidebar Active State
    document.querySelectorAll('.sidebar-item').forEach(btn => {
        // If dataset view matches
        if (btn.dataset.view) {
            if (btn.dataset.view === viewName) btn.classList.add('active');
            else btn.classList.remove('active');
        } else {
            // For category buttons, only remove active if we are leaving home
            if (viewName !== 'home') btn.classList.remove('active');
        }
    });

    // 4. Update Bottom Nav Active State
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
        // Simple check based on onclick attribute text
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
    if (!container) return; // Should not happen

    const badgesHtml = MOCK_USER.badges.map(b => `
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
            <img src="${MOCK_USER.banner}" class="banner-img">
            <div class="profile-avatar-container">
                <div class="avatar-ring">
                    <img src="${MOCK_USER.avatar}" class="avatar-img">
                </div>
                <div class="level-badge-large">LVL ${MOCK_USER.level}</div>
            </div>
        </div>

        <div class="px-4 md:px-0 mt-16 md:mt-0">
            <div class="flex justify-between items-end mb-8">
                <div>
                    <h2 class="text-3xl font-black text-white tracking-tight">${MOCK_USER.name}</h2>
                    <p class="text-gray-400 font-medium">@${MOCK_USER.id}</p>
                </div>
                <!-- XP Bar (simplified) -->
                <div class="w-32 hidden md:block">
                     <div class="flex justify-between text-xs font-bold text-gray-400 mb-1">
                        <span>XP</span>
                        <span>${MOCK_USER.xp}/100</span>
                    </div>
                    <div class="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-purple-600 to-blue-500" style="width: ${MOCK_USER.xp}%"></div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div class="stat-card">
                   <i class="fas fa-gamepad text-purple-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">${MOCK_USER.gamesPlayed}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Games Played</div>
                </div>
                <div class="stat-card">
                   <i class="fas fa-trophy text-yellow-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">${MOCK_USER.winRate}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Win Rate</div>
                </div>
                <div class="stat-card">
                   <i class="fas fa-medal text-orange-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">${MOCK_USER.badges.length}</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Badges Earned</div>
                </div>
                 <div class="stat-card">
                   <i class="fas fa-clock text-blue-400 text-xl"></i>
                   <div class="text-2xl font-black text-white">124h</div>
                   <div class="text-xs font-bold text-gray-500 uppercase">Play Time</div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
                <!-- Favorite Game -->
                <div>
                    <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Favorite Game</h3>
                    <div class="fav-game-card group cursor-pointer" onclick="alert('Play Favorite Logic')">
                        <img src="${MOCK_USER.favGame.image}" class="w-24 h-24 rounded-2xl object-cover shadow-lg shadow-purple-900/40 group-hover:scale-105 transition-transform">
                        <div class="flex-1">
                            <div class="text-xs font-bold text-purple-400 uppercase mb-1">#1 Pick</div>
                            <h4 class="text-xl font-black text-white mb-2">${MOCK_USER.favGame.title}</h4>
                            <button class="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors">Play Now</button>
                        </div>
                         <i class="fas fa-heart text-purple-500/20 text-6xl absolute -right-4 -bottom-4 rotate-12"></i>
                    </div>
                </div>

                <!-- Recent Activity & Badges -->
                <div class="space-y-8">
                    <div>
                         <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Badges</h3>
                         <div class="flex flex-wrap gap-3">
                             ${badgesHtml}
                         </div>
                    </div>
                    
                    <div>
                         <h3 class="text-sm font-black text-gray-500 uppercase tracking-widest mb-4">Recent Activity</h3>
                         <div class="space-y-3">
                            ${recentHtml.length ? recentHtml : '<p class="text-gray-500 text-sm">No recent games.</p>'}
                         </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* -------------------------------------------------------------------------- */
/*                             CHAT RENDERER                                  */
/* -------------------------------------------------------------------------- */
let activeChatTab = 'global'; // 'global' or 'friends'

function renderChatInterface() {
    const container = document.getElementById('view-chat');
    if (!container) return;

    // Basic Skeleton
    container.innerHTML = `
        <div class="chat-layout">
            <!-- Sidebar List (Desktop Only usually, or part of full layout) -->
            <div class="chat-list-panel">
                <div class="p-4 border-b border-white/5">
                    <div class="flex bg-black/20 p-1 rounded-xl">
                        <button onclick="switchChatTab('global')" id="tab-global" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeChatTab === 'global' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:bg-white/5'}">Global</button>
                        <button onclick="switchChatTab('friends')" id="tab-friends" class="flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${activeChatTab === 'friends' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-500 hover:bg-white/5'} relative">
                            Friends
                            <span class="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full border border-black"></span>
                        </button>
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-2 space-y-2" id="chat-list-content">
                    <!-- Dynamic List Content -->
                </div>
            </div>

            <!-- Main Chat View -->
            <div class="chat-view-panel">
                 <!-- Mobile Tabs (Visible only on mobile via CSS) -->
                <div class="md:hidden mobile-chat-tabs border-b border-white/5 flex gap-2 overflow-x-auto">
                     <button onclick="switchChatTab('global')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white border border-white/5 whitespace-nowrap ${activeChatTab === 'global' ? 'border-purple-500 text-purple-400' : ''}">Global Chat</button>
                     <button onclick="switchChatTab('friends')" class="px-4 py-2 rounded-lg bg-white/5 text-xs font-bold text-white border border-white/5 whitespace-nowrap ${activeChatTab === 'friends' ? 'border-purple-500 text-purple-400' : ''}">Friends (3)</button>
                </div>

                <div class="flex-1 overflow-y-auto p-4 content-start" id="chat-messages-area">
                    <!-- Messages -->
                </div>

                <div class="chat-input-container border-t border-white/5">
                    <form onsubmit="handleChatSubmit(event)" class="flex gap-2">
                        <input type="text" id="chatMsgInput" placeholder="Type a message..." class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors" autocomplete="off">
                        <button type="submit" class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-white hover:bg-purple-500 transition-colors shadow-lg shadow-purple-600/20">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>
    `;

    renderChatContent();
}

function switchChatTab(tab) {
    activeChatTab = tab;
    renderChatInterface(); // Re-render to update classes and list
}

function renderChatContent() {
    const listContent = document.getElementById('chat-list-content');
    const messageArea = document.getElementById('chat-messages-area');

    // 1. Render Sidebar List
    if (activeChatTab === 'global') {
        listContent.innerHTML = `
            <div class="p-4 text-center text-gray-500 text-xs font-bold">
                <i class="fas fa-globe text-2xl mb-2 block opacity-50"></i>
                GLOBAL CHANNEL<br>
                <span class="text-[10px] font-normal opacity-50">1,243 Users Online</span>
            </div>
        `;
    } else {
        listContent.innerHTML = MOCK_USER.friends.map(f => `
            <div class="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer transition-colors group">
                <div class="relative">
                    <img src="${f.avatar}" class="w-10 h-10 rounded-full bg-black">
                    <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${f.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}"></span>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-bold text-sm text-white truncate">${f.name}</div>
                    <div class="text-[10px] text-gray-500 truncate group-hover:text-gray-400">${f.lastMsg}</div>
                </div>
            </div>
        `).join('');
    }

    // 2. Render Messages (Mock)
    if (activeChatTab === 'global') {
        messageArea.innerHTML = `
            <div class="text-center py-10 opacity-50">
                <p class="text-xs font-bold uppercase tracking-widest mb-2">Welcome to Satex Global</p>
                <p class="text-[10px]">Be kind and respectful.</p>
            </div>
            ${renderMessage({ sender: "System", text: "Welcome to the server!", type: "info" })}
            ${renderMessage({ sender: "CoolGamer99", text: "Anyone playing Nitro Rush?", type: "them" })}
         `;
    } else {
        // Show convo with first friend for demo
        messageArea.innerHTML = MOCK_USER.messages.map(renderMessage).join('');
    }
}

function renderMessage(msg) {
    if (msg.type === 'info') return `<div class="text-center text-[10px] text-gray-500 my-4 uppercase tracking-widest font-bold">--- ${msg.text} ---</div>`;

    const isMe = msg.type === 'me';
    return `
        <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4">
             ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1">${msg.sender}</span>` : ''}
            <div class="message-bubble ${msg.type}">
                ${msg.text}
                ${!isMe ? `<button class="absolute -right-6 top-0 text-gray-600 hover:text-red-500 text-[10px] p-1"><i class="fas fa-flag"></i></button>` : ''}
            </div>
        </div>
    `;
}

function handleChatSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatMsgInput');
    const text = input.value.trim();
    if (!text) return;

    // Add message
    const messageArea = document.getElementById('chat-messages-area');
    const newMsgHtml = renderMessage({ sender: "me", text: text, type: "me" });
    messageArea.insertAdjacentHTML('beforeend', newMsgHtml);

    // Scroll to bottom
    messageArea.scrollTop = messageArea.scrollHeight;

    input.value = '';

    // Simulate reply
    if (activeChatTab === 'friends') {
        setTimeout(() => {
            const replyHtml = renderMessage({ sender: "NeonRider", text: "Lets gooo!", type: "them" });
            messageArea.insertAdjacentHTML('beforeend', replyHtml);
            messageArea.scrollTop = messageArea.scrollHeight;
        }, 1500);
    }
}

// Global Exports
window.switchView = switchView;
window.switchChatTab = switchChatTab;
window.handleChatSubmit = handleChatSubmit;
/* -------------------------------------------------------------------------- */
