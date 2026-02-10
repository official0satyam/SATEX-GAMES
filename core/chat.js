import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInAnonymously,
    onAuthStateChanged,
    updateProfile,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    onChildAdded,
    onValue,
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

// 🔍 [CONFIG] Updated with Database URL
const firebaseConfig = {
    apiKey: "AIzaSyBQySK9KiYjLqH_blaw8JCogk4TvAz5jH0",
    authDomain: "satex-games.firebaseapp.com",
    projectId: "satex-games",
    storageBucket: "satex-games.appspot.com",
    messagingSenderId: "1021871212512",
    appId: "1:1021871212512:web:ea54d97198a06b81550d85",
    measurementId: "G-968393H9W2",
    // ⬇️ CRITICAL: Updated via Console Feedback
    databaseURL: "https://satex-games-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);

const globalChatRef = ref(db, 'global_chat');
const connectedRef = ref(db, ".info/connected");

// 🔍 [DEBUG] Monitor Database Connection
onValue(connectedRef, (snap) => {
    if (snap.val() === true) {
        console.log("✅ [FIREBASE] Connected to Realtime Database!");
    } else {
        console.log("❌ [FIREBASE] Disconnected. Check Console for 404/Permission errors.");
    }
});

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

// Check Local Guest Session First
const localGuest = localStorage.getItem('chat_guest_session');

if (localGuest && !auth.currentUser) {
    console.log("👤 [AUTH] Restoring Local Guest Session");
    currentUser = JSON.parse(localGuest);
    loginOverlay.style.display = 'none';
    loadGlobalChat();
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("👤 [AUTH] User Logged In:", user.uid);
        currentUser = user;
        // Clear local guest if real user logs in
        localStorage.removeItem('chat_guest_session');
        loginOverlay.style.display = 'none';

        syncUserProfile(user);
        loadGlobalChat();
        loadFriends();
    } else {
        // Only show overlay if no local guest
        if (!localStorage.getItem('chat_guest_session')) {
            console.log("👤 [AUTH] No User - Showing Login");
            currentUser = null;
            loginOverlay.style.display = 'flex';
        }
    }
});

async function syncUserProfile(user) {
    try {
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
    } catch (e) {
        console.error("❌ [PROFILE] Sync User Error:", e);
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

    try {
        const q = query(collection(firestore, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            errorDiv.textContent = "Username already taken";
            return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: username });
    } catch (e) {
        errorDiv.textContent = e.message;
    }
});

// Guest Mode (Hybrid: Local Mock to avoid Firebase Auth Errors)
document.getElementById('guestLoginBtn')?.addEventListener('click', async () => {
    console.log("👤 [AUTH] Starting Guest Mode...");
    const randomId = Math.floor(Math.random() * 100000);
    const guestUser = {
        uid: `guest_${randomId}`,
        displayName: `Guest_${randomId}`,
        email: null,
        isGuest: true
    };

    currentUser = guestUser;
    localStorage.setItem('chat_guest_session', JSON.stringify(guestUser));
    loginOverlay.style.display = 'none';
    loadGlobalChat();
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
        console.log("📤 [CHAT] Sending message:", text);
        push(globalChatRef, {
            user: currentUser.displayName || 'Guest',
            uid: currentUser.uid,
            text: text,
            timestamp: Date.now()
        }).then(() => {
            console.log("✅ [CHAT] Message Sent!");
        }).catch((e) => {
            console.error("❌ [CHAT] Send Failed:", e);
            alert("Connection Error: Check Console.");
        });
        input.value = '';
    } else {
        console.warn("⚠️ [CHAT] Cannot send: No text or No user");
    }
}

function loadGlobalChat() {
    const container = document.getElementById('chatMessages');
    console.log("🔄 [CHAT] Loading Chat Listener...");

    // In a real app, remove old listeners first.
    container.innerHTML = '';

    onChildAdded(globalChatRef, (snapshot) => {
        const msg = snapshot.val();
        if (msg) {
            // console.log("📩 [CHAT] Received:", msg);
            renderMessage(msg, container);
        }
    }, (error) => {
        console.error("❌ [CHAT] Listener Error:", error);
    });
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
    // Ensure accurate string comparison for UIDs
    const isMe = currentUser && String(msg.uid) === String(currentUser.uid);

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

    console.log(`🔍 [FRIEND] Searching for: "${targetUsername}"`);

    if (currentUser?.isGuest) {
        alert("Please login to use Friend features!");
        return;
    }

    if (!targetUsername || !currentUser) return;

    try {
        const usersRef = collection(firestore, "users");

        // 1. Try Exact Match
        let snapshot = await getDocs(query(usersRef, where("username", "==", targetUsername)));
        let targetUser = null;

        if (!snapshot.empty) {
            targetUser = snapshot.docs[0].data();
        } else {
            console.warn(`⚠️ [FRIEND] Exact match failed. Scanning all users for "${targetUsername}"...`);
            // 2. Fallback: Scan all users (OK for debugging/small apps)
            try {
                const allSnap = await getDocs(collection(firestore, "users"));
                const match = allSnap.docs.find(d =>
                    d.data().username?.toLowerCase() === targetUsername.toLowerCase()
                );
                if (match) {
                    targetUser = match.data();
                    console.log(`✅ [FRIEND] Found fuzzy match: ${targetUser.username}`);
                }
            } catch (err) {
                console.error("Error scanning users:", err);
            }
        }

        if (!targetUser) {
            alert(`User "${targetUsername}" not found!`);
            return;
        }
        console.log("✅ [FRIEND] Found user:", targetUser);

        if (targetUser.uid === currentUser.uid) {
            alert("You cannot add yourself!");
            return;
        }

        const myRef = doc(firestore, "users", currentUser.uid);
        await updateDoc(myRef, {
            friends: arrayUnion({
                uid: targetUser.uid,
                username: targetUser.username,
                avatar: targetUser.avatar
            })
        });

        console.log("✅ [FRIEND] Friend added successfully!");
        alert(`Added ${targetUser.username} to friends!`);
        input.value = '';
        loadFriends();
    } catch (e) {
        console.error("❌ [FRIEND] Error:", e);
        alert("Error adding friend. Check console.");
    }
});

async function loadFriends() {
    if (!currentUser || currentUser.isGuest) return;

    try {
        const userRef = doc(firestore, "users", currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();
            const friends = data.friends || [];
            renderFriendList(friends);
        }
    } catch (e) {
        console.error("❌ [FRIEND] Load Error:", e);
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
// PRIVATE MESSAGES
// ==========================================

window.openPrivateChat = function (targetUid, targetUsername) {
    currentPrivateChatUser = { uid: targetUid, username: targetUsername };

    friendListArea.style.display = 'none';
    privateChatArea.style.display = 'flex';
    document.getElementById('privateChatUser').textContent = `Chat with ${targetUsername}`;

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

    if (tab === 'global') {
        globalChatArea.style.display = 'flex';
        friendListArea.style.display = 'none';
        privateChatArea.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        globalChatArea.style.display = 'none';
        friendListArea.style.display = 'flex';
        tabs[1].classList.add('active');
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
