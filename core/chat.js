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

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const firestore = getFirestore(app);

const globalChatRef = ref(db, 'global_chat');
let currentUser = null;

// ==========================================
// 1. ROBUST AUTH & PROFILE MANAGEMENT
// ==========================================

onAuthStateChanged(auth, async (user) => {
    const loginOverlay = document.getElementById('chatLoginOverlay');

    if (user) {
        console.log("👤 [AUTH] Logged In:", user.uid);
        currentUser = user;
        loginOverlay.style.display = 'none';

        // Auto-fix profile if missing OR if username is "Guest_" but we have a real name now
        await syncUserProfile(user);

        // Push to UI Manager (Profile Page)
        if (window.updateProfileData) {
            const snap = await getDoc(doc(firestore, "users", user.uid));
            if (snap.exists()) window.updateProfileData(user, snap.data());
        }

        loadGlobalChat();
        loadFriends();
    } else {
        currentUser = null;
        loginOverlay.style.display = 'flex';
    }
});

// Sync Profile: Ensures DB matches Auth
async function syncUserProfile(user, manualUsername = null) {
    try {
        const userRef = doc(firestore, "users", user.uid);
        const snap = await getDoc(userRef);

        const finalUsername = manualUsername || user.displayName || `User_${user.uid.slice(0, 5)}`;

        if (!snap.exists()) {
            console.log("🆕 [PROFILE] Creating New User Document...");
            await setDoc(userRef, {
                username: finalUsername,
                email: user.email,
                uid: user.uid,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                joined: new Date().toISOString(),
                status: 'online',
                friends: []
            });
        } else {
            // Update status AND fix username if it was random before
            const data = snap.data();
            if (manualUsername || (user.displayName && data.username.startsWith("Guest_"))) {
                await updateDoc(userRef, {
                    status: 'online',
                    username: finalUsername
                });
            } else {
                await updateDoc(userRef, { status: 'online' });
            }
        }
    } catch (e) {
        console.error("❌ [PROFILE] Error:", e);
    }
}

// Manual Repair Tool
window.forceSyncProfile = async function () {
    if (!currentUser) return alert("Login first!");
    await syncUserProfile(currentUser);
    alert("Profile sync run. Check console for details.");
    loadFriends();
};


// ==========================================
// 2. SIGNUP FIX (Prevent Random Usernames)
// ==========================================

document.getElementById('signupSubmitBtn')?.addEventListener('click', async () => {
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value;
    const pass = document.getElementById('signupPassword').value;
    const errorDiv = document.getElementById('authError');

    if (!username) return errorDiv.textContent = "Username required";

    try {
        // Enforce Uniqueness
        const q = query(collection(firestore, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            errorDiv.textContent = "Username already taken";
            return;
        }

        // Create Auth
        const cred = await createUserWithEmailAndPassword(auth, email, pass);

        // ⚡ CRITICAL: Set DisplayName IMMEDIATELY
        await updateProfile(cred.user, { displayName: username });

        // ⚡ CRITICAL: Create DB Doc IMMEDIATELY (Avoid race condition)
        await syncUserProfile(cred.user, username);

    } catch (e) {
        errorDiv.textContent = e.message;
    }
});

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


// ==========================================
// 3. GLOBAL CHAT & INTERACTION
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
    // Supports both Old Overlay and New Chat View
    const container = document.getElementById('chatMessages'); // overlay
    const newContainer = document.getElementById('chat-messages-area'); // new view

    if (container) container.innerHTML = '';
    if (newContainer) newContainer.innerHTML = '';

    onChildAdded(globalChatRef, (snapshot) => {
        const msg = snapshot.val();
        if (msg) {
            if (container) renderMessage(msg, container);
            if (newContainer && activeTabGlobal()) renderMessage(msg, newContainer);
        }
    });
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
    const isMe = currentUser && String(msg.uid) === String(currentUser.uid);
    div.className = `chat-message ${isMe ? 'me' : 'other'}`;
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // ✨ Clickable Username for "Add Friend"
    div.innerHTML = `
        <div class="msg-header">
            <span class="msg-user" style="cursor:pointer; color:#a855f7; text-decoration:underline;" 
                  onclick="window.handleGlobalUserClick('${msg.uid}', '${escapeHtml(msg.user)}')">
                  ${msg.user}
            </span>
            <span class="msg-time">${time}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// Handle Click on Global Chat User
window.handleGlobalUserClick = function (targetUid, targetName) {
    if (!currentUser) return;
    if (targetUid === currentUser.uid) return;

    if (confirm(`Do you want to add ${targetName} as a friend?`)) {
        addFriendByUid(targetUid, targetName);
    }
}


// ==========================================
// 4. BI-DIRECTIONAL FRIEND SYSTEM
// ==========================================

// Helper: Add friend by UID (for Global Chat click)
async function addFriendByUid(targetUid, targetName) {
    try {
        const userRef = doc(firestore, "users", targetUid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            await executeAddFriend(snap.data());
        }
    } catch (e) {
        alert("Error adding friend: " + e.message);
    }
}

document.getElementById('addFriendBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('addFriendInput');
    const targetUsername = input.value.trim();
    if (!targetUsername || !currentUser) return;

    console.log(`🔍 [FRIEND] Searching...`);

    // Fuzzy Search Logic
    try {
        let targetUser = null;
        let usersRef = collection(firestore, "users");
        // Exact
        let snap = await getDocs(query(usersRef, where("username", "==", targetUsername)));
        if (!snap.empty) targetUser = snap.docs[0].data();
        else {
            // Fuzzy
            const allSnap = await getDocs(usersRef);
            const match = allSnap.docs.find(d => d.data().username?.toLowerCase() === targetUsername.toLowerCase());
            if (match) targetUser = match.data();
        }

        if (!targetUser) return alert("User not found!");

        await executeAddFriend(targetUser);
        input.value = '';

    } catch (e) {
        console.error("Add Friend Error", e);
        alert("Error: " + e.message);
    }
});

// ⚡ CORE: Bi-Directional Add
async function executeAddFriend(targetUser) {
    if (targetUser.uid === currentUser.uid) return alert("Can't add yourself.");

    try {
        // 1. Add Target to MY list
        const myRef = doc(firestore, "users", currentUser.uid);
        await updateDoc(myRef, {
            friends: arrayUnion({
                uid: targetUser.uid,
                username: targetUser.username,
                avatar: targetUser.avatar || ''
            })
        });

        // 2. Add ME to Target's list (So they see me too!)
        const targetRef = doc(firestore, "users", targetUser.uid);
        await updateDoc(targetRef, {
            friends: arrayUnion({
                uid: currentUser.uid,
                username: currentUser.displayName || currentUser.username,
                avatar: currentUser.photoURL || '' // Or default
            })
        });

        console.log("✅ [FRIEND] Bi-directional add complete.");
        alert(`You and ${targetUser.username} are now friends!`);
        loadFriends();

    } catch (e) {
        alert("Transaction failed: " + e.message);
    }
}


// ==========================================
// 5. LIST & PRIVATE CHAT
// ==========================================

async function loadFriends() {
    if (!currentUser) return;
    const snap = await getDoc(doc(firestore, "users", currentUser.uid));
    if (snap.exists()) renderFriendList(snap.data().friends || []);
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

// ... Private Chat Logic (Same as before) ...
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

// UI Toggles
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
