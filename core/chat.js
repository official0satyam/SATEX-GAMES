
/* -------------------------------------------------------------------------- */
/*                           CHAT & SOCIAL UI ADAPTER                         */
/* -------------------------------------------------------------------------- */
// This file now bridges the UI (HTML) with the unified Backend Services (services.js)
// It listens for events dispatched by services.js and updates the legacy UI elements.

// Wait for Services to be ready
const checkServices = setInterval(() => {
    if (window.Services) {
        clearInterval(checkServices);
        initChatAdapter();
    }
}, 100);

let chatState = {
    messages: [],
    friends: []
};

function initChatAdapter() {
    console.log("✅ [CHAT] Adapter Initialized. Linked to Services.");

    // 1. Auth Listeners
    window.addEventListener('authStateChanged', (e) => {
        const user = e.detail.user;
        if (user) {
            document.querySelectorAll('.chat-login-overlay').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.auth-trigger-overlay').forEach(el => el.remove());
            loadSocialData();
        } else {
            // UI Manager handles login show/hide usually
        }
    });

    // 2. Chat Listeners
    window.addEventListener('globalChatUpdated', (e) => {
        chatState.messages = e.detail;
        renderGlobalChat();
    });

    window.addEventListener('friendsUpdated', (e) => {
        chatState.friends = e.detail;
        if (window.updateFriendsList) window.updateFriendsList(e.detail);
    });

    // 3. UI Hooks (Binding HTML buttons to Services)
    setupGlobalHooks();
}

function loadSocialData() {
    if (!window.Services?.state?.currentUser) return;
    window.Services.friend.listenToFriends();
    window.Services.chat.listenToGlobalChat();
}

function setupGlobalHooks() {
    // Auth Hooks
    window.handleLogin = async function () {
        const email = document.getElementById('emailInput').value;
        const pass = document.getElementById('passwordInput').value;
        const errorDiv = document.getElementById('authError');
        if (errorDiv) errorDiv.textContent = "Logging in...";

        try {
            await window.Services.auth.login(email, pass);
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
            await window.Services.auth.signup(username, email, pass);
        } catch (e) {
            if (errorDiv) errorDiv.textContent = e.message;
        }
    };

    window.handleLogout = async function () {
        try {
            await window.Services.auth.logout();
        } catch (e) { console.error(e); }
    };

    window.toggleAuthMode = function (mode) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const title = document.getElementById('authTitle');

        if (mode === 'signup') {
            loginForm.classList.add('hidden');
            signupForm.classList.remove('hidden');
            if (title) title.innerText = "CREATE ACCOUNT";
        } else {
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            if (title) title.innerText = "PLAYER LOGIN";
        }
    };

    // Chat Hooks
    window.sendChatMessage = async function () {
        const input = document.getElementById('chatMsgInput');
        const text = input ? input.value.trim() : "";
        if (text) {
            await window.Services.chat.sendGlobalMessage(text);
            if (input) input.value = '';
        } else {
            alert("Please login or type a message!");
        }
    };

    // Friend Hooks
    window.handleAddFriend = async function (targetUid, targetName) {
        if (!window.Services.state.currentUser) return;
        if (confirm(`Send friend request to ${targetName}?`)) {
            try {
                await window.Services.friend.sendRequest(targetUid);
                alert("Request sent!");
            } catch (e) {
                alert("Error: " + e.message);
            }
        }
    };
}

function renderGlobalChat() {
    const container = document.getElementById('chat-messages-area');
    if (!container || (window.isChatTabGlobal && !window.isChatTabGlobal())) return;

    container.innerHTML = '';
    const currentUser = window.Services.state.currentUser;

    chatState.messages.forEach(msg => {
        const div = document.createElement('div');
        const isMe = currentUser && String(msg.uid) === String(currentUser.uid);
        let timeStr = "";
        try {
            timeStr = msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";
        } catch (e) { timeStr = ""; }

        div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
        div.innerHTML = `
            ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1 cursor-pointer hover:text-purple-400" onclick="handleAddFriend('${msg.uid}', '${msg.user}')">${msg.user}</span>` : ''}
            <div class="message-bubble ${isMe ? 'me' : 'them'}">
                ${msg.text}
                 <span class="text-[8px] opacity-50 block text-right mt-1">${timeStr}</span>
            </div>
        `;
        container.appendChild(div);
    });
    container.scrollTop = container.scrollHeight;
}

// Event Hooks from UI Manager logic if it still triggers them
window.addEventListener('chatTabChanged', (e) => {
    if (e.detail.tab === 'global') {
        renderGlobalChat();
    } else {
        // Friends list is handled by ui_manager listening to 'friendsUpdated'
    }
});
