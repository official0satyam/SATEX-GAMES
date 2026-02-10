import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    updateProfile,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    getDatabase,
    ref,
    push,
    onChildAdded,
    onValue
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

// [REMOVED GUEST HYBRID LOGIC FOR FRESH START]
const firebaseConfig = {
    apiKey: "AIzaSyBQySK9KiYjLqH_blaw8JCogk4TvAz5jH0",
    authDomain: "satex-games.firebaseapp.com",
    projectId: "satex-games",
    storageBucket: "satex-games.appspot.com",
    messagingSenderId: "1021871212512",
    appId: "1:1021871212512:web:ea54d97198a06b81550d85",
    measurementId: "G-968393H9W2",
    databaseURL: "https://satex-games-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);

const globalChatRef = ref(db, 'global_chat');
let currentUser = null;

// ==========================================
// 1. FRESH AUTH LOGIC
// ==========================================

onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('chatLoginOverlay');

    if (user) {
        console.log("👤 [AUTH] Logged In:", user.uid);
        currentUser = user;
        loginOverlay.style.display = 'none';

        // ⚠️ AUTO-FIX: Create profile if missing
        await syncUserProfile(user, false);

        loadGlobalChat();
        loadFriends();
    } else {
        console.log("👤 [AUTH] Logged Out");
        currentUser = null;
        loginOverlay.style.display = 'flex';
    }
});

// Expose Manual Fix Tool
window.forceSyncProfile = async function () {
    if (!currentUser) {
        alert("Please login first!");
        return;
    }
    await syncUserProfile(currentUser, true);
    loadFriends(); // Refresh UI
};

async function syncUserProfile(user, manual = false) {
    try {
        const userRef = doc(firestore, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            console.log("🆕 [PROFILE] Creating New User Document...");
            if (manual) alert("Creating missing profile...");

            await setDoc(userRef, {
                username: user.displayName || `User_${user.uid.slice(0, 5)}`,
                email: user.email,
                uid: user.uid,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                joined: new Date().toISOString(),
                status: 'online',
                friends: []
            });

            if (manual) alert("✅ Profile Created Successfully!");
        } else {
            console.log("✅ [PROFILE] Exists.");
            if (manual) alert("✅ Profile already exists! (Updated status)");
            await updateDoc(userRef, { status: 'online' });
        }
    } catch (e) {
        console.error("❌ [PROFILE] Error:", e);
        if (manual) alert(`❌ Error: ${e.message}`);
    }
}

// Login Handler
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

// Signup Handler
document.getElementById('signupSubmitBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('signupUsername').value;
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const errorDiv = document.getElementById('authError');

    try {
        // Check username uniqueness
        const q = query(collection(firestore, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            errorDiv.textContent = "Username already taken";
            return;
        }

        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: username });
        // onAuthStateChanged handles document creation
    } catch (e) {
        errorDiv.textContent = e.message;
    }
});


// ==========================================
// 2. CHAT SYSTEM
// ==========================================

function sendGlobalMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (text && currentUser) {
        push(globalChatRef, {
            user: currentUser.displayName || 'Unknown',
            uid: currentUser.uid,
            text: text,
            timestamp: Date.now()
        });
        input.value = '';
    }
}

document.getElementById('sendBtn')?.addEventListener('click', sendGlobalMessage);
document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendGlobalMessage();
});

function loadGlobalChat() {
    const container = document.getElementById('chatMessages');
    container.innerHTML = ''; // Fresh load

    onChildAdded(globalChatRef, (snapshot) => {
        const msg = snapshot.val();
        if (msg) renderMessage(msg, container);
    });
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
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
// 3. FRIEND SYSTEM (ROBUST SEARCH)
// ==========================================

document.getElementById('addFriendBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('addFriendInput');
    const targetUsername = input.value.trim();

    console.log(`🔍 [FRIEND] Searching for: "${targetUsername}"`);

    if (!targetUsername || !currentUser) return;

    try {
        const usersRef = collection(firestore, "users");

        // 1. Try Exact Match
        let snapshot = await getDocs(query(usersRef, where("username", "==", targetUsername)));
        let targetUser = null;

        if (!snapshot.empty) {
            targetUser = snapshot.docs[0].data();
        } else {
            // 2. Fallback: Scan all users (OK for debugging/small apps)
            console.warn(`Scanning all users for "${targetUsername}"...`);
            const allSnap = await getDocs(collection(firestore, "users"));
            const match = allSnap.docs.find(d =>
                d.data().username?.toLowerCase() === targetUsername.toLowerCase()
            );
            if (match) targetUser = match.data();
        }

        if (!targetUser) {
            alert(`User "${targetUsername}" not found!`);
            return;
        }

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

        alert(`Added ${targetUser.username} to friends!`);
        input.value = '';
        loadFriends();
    } catch (e) {
        console.error("❌ [FRIEND] Error:", e);
        alert(`Error: ${e.message}`);
    }
});

async function loadFriends() {
    if (!currentUser) return;
    const userRef = doc(firestore, "users", currentUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
        const data = snap.data();
        renderFriendList(data.friends || []);
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
// 4. PRIVATE & UI HELPERS
// ==========================================

// Private Chat vars
let currentPrivateRef = null;
const friendListArea = document.getElementById('friendListArea');
const privateChatArea = document.getElementById('privateChatArea');

window.openPrivateChat = function (targetUid, targetUsername) {
    friendListArea.style.display = 'none';
    privateChatArea.style.display = 'flex';
    document.getElementById('privateChatUser').textContent = `Chat with ${targetUsername}`;

    const container = document.getElementById('privateMessages');
    container.innerHTML = '';

    const roomID = [currentUser.uid, targetUid].sort().join('_');
    currentPrivateRef = ref(db, `private_chats/${roomID}`);

    onChildAdded(currentPrivateRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg, container);
    });
}

window.closePrivateChat = function () {
    privateChatArea.style.display = 'none';
    friendListArea.style.display = 'flex';
    currentPrivateRef = null;
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

// Tabs & Toggles
window.switchTab = function (tab) {
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(t => t.classList.remove('active'));

    if (tab === 'global') {
        document.getElementById('globalChatArea').style.display = 'flex';
        friendListArea.style.display = 'none';
        privateChatArea.style.display = 'none';
        tabs[0].classList.add('active');
    } else {
        document.getElementById('globalChatArea').style.display = 'none';
        friendListArea.style.display = 'flex';
        tabs[1].classList.add('active');
        loadFriends();
    }
}

window.toggleAuthMode = function (mode) {
    if (mode === 'signup') {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('signupForm').style.display = 'block';
    } else {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('signupForm').style.display = 'none';
    }
}

window.toggleChat = function () {
    const sb = document.getElementById('chatSidebar');
    sb.classList.toggle('collapsed');
    document.getElementById('chatFloatingBtn').style.display = sb.classList.contains('collapsed') ? 'flex' : 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
