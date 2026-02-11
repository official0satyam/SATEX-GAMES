
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

/* -------------------------------------------------------------------------- */
/*                           FIREBASE CONFIGURATION                           */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/*                           AUTH & STATE MANAGEMENT                          */
/* -------------------------------------------------------------------------- */

// Global Auth Listener
onAuthStateChanged(auth, async (user) => {
    // We handle UI updates via dispatching events to ui_manager.js usually,
    // but here we also need to manage the global auth state for chat logic.

    if (user) {
        console.log("👤 [AUTH] Logged In:", user.uid);
        currentUser = user;

        // 1. Sync User Profile to Firestore (Create if new)
        await syncUserProfile(user);

        // 2. Fetch Full Profile & Push to UI
        const userDoc = await getDoc(doc(firestore, "users", user.uid));
        if (userDoc.exists()) {
            if (window.updateProfileData) window.updateProfileData(user, userDoc.data());
        }

        // 3. Load Chat Data
        loadGlobalChat();
        loadFriends();

        // 4. Update UI State (Hide Login Overlays)
        document.querySelectorAll('.chat-login-overlay').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.auth-trigger-overlay').forEach(el => el.remove()); // Remove any inline blockers

    } else {
        console.log("👤 [AUTH] Logged Out");
        currentUser = null;
        if (window.updateProfileData) window.updateProfileData(null, null); // Clear UI

        // Show Login Overlay if in protected area
        // logic handled by UI Manager Mostly
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
            // Update status
            await updateDoc(userRef, { status: 'online' });
        }
    } catch (e) {
        console.error("❌ [PROFILE] Error:", e);
    }
}

/* -------------------------------------------------------------------------- */
/*                             AUTH ACTIONS                                   */
/* -------------------------------------------------------------------------- */

// Expose these for HTML onclick attributes
window.handleLogin = async function () {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passwordInput').value;
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.textContent = "Logging in...";

    try {
        await signInWithEmailAndPassword(auth, email, pass);
        // Listener handles rest
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
        // Enforce Uniqueness
        const q = query(collection(firestore, "users"), where("username", "==", username));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            errorDiv.textContent = "Username already taken";
            return;
        }

        // Create Auth
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: username });
        await syncUserProfile(cred.user, username);
        // Listener handles rest

    } catch (e) {
        if (errorDiv) errorDiv.textContent = e.message;
    }
};

window.handleLogout = async function () {
    try {
        await signOut(auth);
        alert("Logged out successfully");
        window.location.reload(); // Refresh to clear state
    } catch (e) {
        console.error(e);
    }
};

// Toggle between Login/Signup forms
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
}


/* -------------------------------------------------------------------------- */
/*                             CHAT LOGIC                                     */
/* -------------------------------------------------------------------------- */

function sendGlobalMessage() {
    const input = document.getElementById('chatMsgInput'); // UI Manager input
    const text = input ? input.value.trim() : "";

    if (text && currentUser) {
        push(globalChatRef, {
            user: currentUser.displayName || currentUser.email.split('@')[0],
            uid: currentUser.uid,
            text: text,
            timestamp: Date.now()
        });
        if (input) input.value = '';
    } else if (!currentUser) {
        alert("Please login to chat!");
    }
}

// Hook into UI Manager's button
window.sendChatMessage = sendGlobalMessage;


function loadGlobalChat() {
    // New Chat View Container
    const newContainer = document.getElementById('chat-messages-area');

    if (newContainer) newContainer.innerHTML = '';

    // Remove old listener if any to avoid dupes? 
    // Ideally we track listeners but for simple app this is ok or we use onValue

    onChildAdded(globalChatRef, (snapshot) => {
        const msg = snapshot.val();
        if (msg) {
            if (newContainer && window.isChatTabGlobal && window.isChatTabGlobal()) {
                renderMessage(msg, newContainer);
            }
        }
    });
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
    const isMe = currentUser && String(msg.uid) === String(currentUser.uid);
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-4`;
    div.innerHTML = `
        ${!isMe ? `<span class="text-[10px] text-gray-500 font-bold mb-1 ml-1 cursor-pointer hover:text-purple-400" onclick="handleAddFriend('${msg.uid}', '${msg.user}')">${msg.user}</span>` : ''}
        <div class="message-bubble ${isMe ? 'me' : 'them'}">
            ${msg.text}
             <span class="text-[8px] opacity-50 block text-right mt-1">${time}</span>
        </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}


/* -------------------------------------------------------------------------- */
/*                             FRIEND SYSTEM                                  */
/* -------------------------------------------------------------------------- */

window.handleAddFriend = async function (targetUid, targetName) {
    if (!currentUser) return;
    if (confirm(`Add ${targetName} as friend?`)) {
        try {
            // Bi-directional Add
            await updateDoc(doc(firestore, "users", currentUser.uid), {
                friends: arrayUnion({ uid: targetUid, username: targetName })
            });
            await updateDoc(doc(firestore, "users", targetUid), {
                friends: arrayUnion({ uid: currentUser.uid, username: currentUser.displayName })
            });
            alert("Friend added!");
            loadFriends();
        } catch (e) {
            alert("Error adding friend: " + e.message);
        }
    }
};

async function loadFriends() {
    if (!currentUser) return;
    const snap = await getDoc(doc(firestore, "users", currentUser.uid));
    if (snap.exists() && snap.data().friends) {
        window.updateFriendsList(snap.data().friends); // Push to UI Manager
    }
}

// Event Hooks from UI Manager
window.addEventListener('chatTabChanged', (e) => {
    if (e.detail.tab === 'global') {
        loadGlobalChat();
    } else {
        loadFriends();
    }
});
