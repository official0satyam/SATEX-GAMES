import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInAnonymously,
    onAuthStateChanged,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    onChildAdded,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    arrayUnion,
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBQySK9KiYjLqH_blaw8JCogk4TvAz5jH0",
    authDomain: "satex-games.firebaseapp.com",
    projectId: "satex-games",
    storageBucket: "satex-games.firebasestorage.app",
    messagingSenderId: "1021871212512",
    appId: "1:1021871212512:web:ea54d97198a06b81550d85",
    measurementId: "G-968393H9W2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);

const globalChatRef = ref(db, 'global_chat');

// UI Elements
const sidebar = document.getElementById('chatSidebar');
const loginOverlay = document.getElementById('chatLoginOverlay');
const floatingBtn = document.getElementById('chatFloatingBtn');
const globalChatArea = document.getElementById('globalChatArea');
const friendListArea = document.getElementById('friendListArea');
const privateChatArea = document.getElementById('privateChatArea');

// State
let currentUser = null;
let currentTab = 'global';
let currentPrivateChatUser = null;

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        loginOverlay.style.display = 'none';

        // Sync User Data to Firestore if needed
        syncUserProfile(user);

        // Load Initial Data
        loadGlobalChat();
        loadFriends();
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
    }
});

async function syncUserProfile(user) {
    const userRef = doc(firestore, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        await setDoc(userRef, {
            username: user.displayName || `Guest_${user.uid.slice(0, 5)}`,
            email: user.email,
            uid: user.uid,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
            joined: new Date().toISOString(),
            status: 'online',
            friends: []
        });
    } else {
        await updateDoc(userRef, { status: 'online' });
    }
}

// Login
document.getElementById('loginSubmitBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('authError');

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        errorDiv.textContent = e.message;
    }
});

// Signup
document.getElementById('signupSubmitBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('signupUsername').value;
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const errorDiv = document.getElementById('authError');

    // Check unique username
    const q = query(collection(firestore, "users"), where("username", "==", username));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        errorDiv.textContent = "Username already taken";
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: username });
        // Correct profile creation handled by syncUserProfile via onAuthStateChanged
    } catch (e) {
        errorDiv.textContent = e.message;
    }
});

// Guest
document.getElementById('guestLoginBtn')?.addEventListener('click', async () => {
    try {
        await signInAnonymously(auth);
    } catch (e) {
        document.getElementById('authError').textContent = e.message;
    }
});

// ==========================================
// CHAT LOGIC
// ==========================================

// Send Global Message
document.getElementById('sendBtn')?.addEventListener('click', sendGlobalMessage);
document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendGlobalMessage();
});

function sendGlobalMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (text && currentUser) {
        push(globalChatRef, {
            user: currentUser.displayName || 'Guest',
            uid: currentUser.uid,
            text: text,
            timestamp: Date.now()
        });
        input.value = '';
    }
}

function loadGlobalChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = ''; // Clear for fresh load logic if needed, usually onChildAdded appends

    onChildAdded(globalChatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg, container);
    });
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
    const isMe = currentUser && msg.uid === currentUser.uid;

    div.className = `chat-message ${isMe ? 'me' : 'other'}`;
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="msg-header">
            <span class="msg-user">${msg.user}</span>
            <span class="msg-time">${time}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// FRIEND SYSTEM
// ==========================================

document.getElementById('addFriendBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('addFriendInput');
    const targetUsername = input.value.trim();
    if (!targetUsername || !currentUser) return;

    // Find User ID by Username
    const q = query(collection(firestore, "users"), where("username", "==", targetUsername));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        alert("User not found!");
        return;
    }

    const targetUser = snapshot.docs[0].data();
    if (targetUser.uid === currentUser.uid) {
        alert("You cannot add yourself!");
        return;
    }

    // Add to My Friends
    const myRef = doc(firestore, "users", currentUser.uid);
    await updateDoc(myRef, {
        friends: arrayUnion({
            uid: targetUser.uid,
            username: targetUser.username,
            avatar: targetUser.avatar
        })
    });

    alert(`Added ${targetUser.username} to friends!`);
    input.value = '';
    loadFriends(); // Refresh list
});

async function loadFriends() {
    if (!currentUser) return;
    const userRef = doc(firestore, "users", currentUser.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
        const data = snap.data();
        const friends = data.friends || [];
        renderFriendList(friends);
    }
}

function renderFriendList(friends) {
    const container = document.getElementById('friendListContainer');
    container.innerHTML = '';

    friends.forEach(friend => {
        const el = document.createElement('div');
        el.className = 'friend-item';
        el.innerHTML = `
            <div class="friend-avatar">${friend.username[0].toUpperCase()}</div>
            <div class="friend-info">
                <span class="friend-name">${friend.username}</span>
                <span class="friend-status">Online</span>
            </div>
            <button class="text-xs bg-purple-600 px-2 py-1 rounded text-white" onclick="openPrivateChat('${friend.uid}', '${friend.username}')">Chat</button>
        `;
        container.appendChild(el);
    });
}

// ==========================================
// PRIVATE MESSAGES (Simplified 1-on-1)
// ==========================================

window.openPrivateChat = function (targetUid, targetUsername) {
    currentPrivateChatUser = { uid: targetUid, username: targetUsername };

    // Switch View
    friendListArea.style.display = 'none';
    privateChatArea.style.display = 'flex';
    document.getElementById('privateChatUser').textContent = `Chat with ${targetUsername}`;

    // Load Messages (Using Realtime DB for simple private rooms: private_chats/UID1_UID2)
    loadPrivateMessages(targetUid);
}

window.closePrivateChat = function () {
    privateChatArea.style.display = 'none';
    friendListArea.style.display = 'flex';
    currentPrivateChatUser = null;
}

let currentPrivateRef = null;

function loadPrivateMessages(targetUid) {
    const container = document.getElementById('privateMessages');
    container.innerHTML = '';

    // Create a unique room ID (alphabetical order of UIDs ensures same room for both parties)
    const roomID = [currentUser.uid, targetUid].sort().join('_');
    currentPrivateRef = ref(db, `private_chats/${roomID}`);

    onChildAdded(currentPrivateRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg, container);
    });
}

document.getElementById('privateSendBtn')?.addEventListener('click', () => {
    const input = document.getElementById('privateInput');
    const text = input.value.trim();

    if (text && currentPrivateRef && currentUser) {
        push(currentPrivateRef, {
            user: currentUser.displayName,
            uid: currentUser.uid,
            text: text,
            timestamp: Date.now()
        });
        input.value = '';
    }
});


// ==========================================
// UI HELPERS
// ==========================================

window.switchTab = function (tab) {
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(t => t.classList.remove('active'));

    // Simple tab logic
    if (tab === 'global') {
        globalChatArea.style.display = 'flex';
        friendListArea.style.display = 'none';
        privateChatArea.style.display = 'none'; // Close PM if open
        tabs[0].classList.add('active');
    } else {
        globalChatArea.style.display = 'none';
        friendListArea.style.display = 'flex';
        tabs[1].classList.add('active');
        // Reload friends when opening tab
        loadFriends();
    }
}

window.toggleAuthMode = function (mode) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (mode === 'signup') {
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
    } else {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
    }
}

window.toggleChat = function () {
    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        floatingBtn.style.display = 'flex';
    } else {
        floatingBtn.style.display = 'none';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
