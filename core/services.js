
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
    getFirestore,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    arrayUnion,
    arrayRemove,
    collection,
    query,
    where,
    getDocs,
    addDoc,
    onSnapshot,
    serverTimestamp,
    orderBy,
    limit
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
    measurementId: "G-968393H9W2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* -------------------------------------------------------------------------- */
/*                               STATE MANAGEMENT                             */
/* -------------------------------------------------------------------------- */
const State = {
    currentUser: null,
    profile: null,
    friends: [],
    listeners: [], // Store unsubscribe functions
    gameLibrary: [], // Cache for games.json
    friendsUnsub: null,
    requestsUnsub: null,
    feedUnsub: null,
    globalChatUnsub: null,
    directChatUnsub: null,
    onlineUsersUnsub: null,
    activeDmTarget: null
};

/* -------------------------------------------------------------------------- */
/*                                AUTH SERVICE                                */
/* -------------------------------------------------------------------------- */
export const AuthService = {
    init: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("👤 [AUTH] Logged In:", user.uid);
                State.currentUser = user;
                await UserService.syncProfile(user);
                await UserService.fetchProfile(user.uid);

                // Start Listeners
                FriendService.listenToFriends();
                FriendService.listenToOnlineUsers();
                ChatService.listenToGlobalChat();
                FeedService.listenToFeed();

                // Presence
                UserService.updateStatus('online');
                window.addEventListener('beforeunload', () => UserService.updateStatus('offline'));

            } else {
                console.log("👤 [AUTH] Logged Out");
                AuthService.cleanup();
            }
            // Notify UI
            window.dispatchEvent(new CustomEvent('authStateChanged', { detail: { user } }));
        });
    },

    login: async (email, pass) => {
        return signInWithEmailAndPassword(auth, email, pass);
    },

    signup: async (username, email, pass) => {
        // 1. Check Username Uniqueness
        const q = query(collection(db, "users"), where("username", "==", username));
        if (!(await getDocs(q)).empty) throw new Error("Username taken");

        // 2. Create Auth
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: username });

        // 3. Create Profile Doc
        await UserService.syncProfile(cred.user, username);
        return cred.user;
    },

    logout: async () => {
        await UserService.updateStatus('offline');
        AuthService.cleanup();
        await signOut(auth);
        window.location.reload();
    },

    cleanup: () => {
        if (State.friendsUnsub) { State.friendsUnsub(); State.friendsUnsub = null; }
        if (State.requestsUnsub) { State.requestsUnsub(); State.requestsUnsub = null; }
        if (State.feedUnsub) { State.feedUnsub(); State.feedUnsub = null; }
        if (State.directChatUnsub) { State.directChatUnsub(); State.directChatUnsub = null; }
        if (State.onlineUsersUnsub) { State.onlineUsersUnsub(); State.onlineUsersUnsub = null; }

        State.listeners.forEach(unsub => unsub());
        State.listeners = [];
        State.currentUser = null;
        State.profile = null;
        State.friends = [];
        State.activeDmTarget = null;

        window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: [] }));
        window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: [] }));
        window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: [] }));
    }
};

/* -------------------------------------------------------------------------- */
/*                                USER SERVICE                                */
/* -------------------------------------------------------------------------- */
export const UserService = {
    syncProfile: async (user, manualUsername = null) => {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            const safeName = manualUsername || user.displayName || `User_${user.uid.slice(0, 5)}`;
            await setDoc(userRef, {
                username: safeName,
                username_lc: safeName.toLowerCase(),
                email: user.email,
                uid: user.uid,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                bio: "Just a gamer.",
                level: 1,
                xp: 0,
                status: { state: 'online', game: null },
                followers_count: 0,
                following_games: [],
                favorite_games: [],
                joined: new Date().toISOString()
            });
        } else {
            const existing = snap.data() || {};
            if (!existing.username_lc && existing.username) {
                await updateDoc(userRef, { username_lc: String(existing.username).toLowerCase() });
            }
        }
    },

    fetchProfile: async (uid) => {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            State.profile = snap.data();
            window.dispatchEvent(new CustomEvent('profileUpdated', { detail: State.profile }));
        }
    },

    updateStatus: async (state, game = null) => {
        if (!State.currentUser) return;
        try {
            await updateDoc(doc(db, "users", State.currentUser.uid), {
                status: { state, game, last_seen: serverTimestamp() }
            });
        } catch (e) { console.warn("Status update failed", e); }
    },

    updateProfileFields: async ({ username, bio, avatar }) => {
        if (!State.currentUser) throw new Error("Login required");

        const updates = {};
        const current = State.profile || {};
        const safeUsername = (username || "").trim();
        const safeBio = (bio || "").trim();
        const safeAvatar = (avatar || "").trim();

        if (safeUsername && safeUsername !== current.username) {
            if (safeUsername.length < 3) throw new Error("Username must be at least 3 characters");
            const normalized = safeUsername.toLowerCase();
            const q = query(collection(db, "users"), where("username", "==", safeUsername));
            const snaps = await getDocs(q);
            const hasConflict = snaps.docs.some(d => d.id !== State.currentUser.uid);
            if (hasConflict) throw new Error("Username already taken");
            updates.username = safeUsername;
            updates.username_lc = normalized;
        }

        if (safeBio.length > 180) throw new Error("Bio must be 180 characters or less");
        if (safeBio !== (current.bio || "")) {
            updates.bio = safeBio;
        }

        if (safeAvatar && safeAvatar !== current.avatar) {
            updates.avatar = safeAvatar;
        }

        if (Object.keys(updates).length === 0) return;

        await updateDoc(doc(db, "users", State.currentUser.uid), updates);
        if (updates.username) {
            try {
                await updateProfile(State.currentUser, { displayName: updates.username });
            } catch (err) {
                console.warn("DisplayName update failed", err);
            }
        }
        await UserService.fetchProfile(State.currentUser.uid);
        await FeedService.postActivity('profile_update', { fields: Object.keys(updates) });
    },

    toggleFavoriteGame: async (gameId) => {
        if (!State.currentUser || !gameId) return;
        const ref = doc(db, "users", State.currentUser.uid);
        const favorites = State.profile?.favorite_games || [];
        const isFav = favorites.includes(gameId);
        if (isFav) {
            await updateDoc(ref, { favorite_games: arrayRemove(gameId) });
        } else {
            await updateDoc(ref, { favorite_games: arrayUnion(gameId) });
            await FeedService.postActivity('favorite', { gameId });
        }
        await UserService.fetchProfile(State.currentUser.uid);
    },

    toggleFollowGame: async (gameId) => {
        if (!State.currentUser) return;
        const ref = doc(db, "users", State.currentUser.uid);
        const isFollowing = State.profile.following_games?.includes(gameId);

        if (isFollowing) {
            await updateDoc(ref, { following_games: arrayRemove(gameId) });
        } else {
            await updateDoc(ref, { following_games: arrayUnion(gameId) });
            // Feed Post
            FeedService.postActivity('favorite', { gameId });
        }
        await UserService.fetchProfile(State.currentUser.uid); // Refresh local
    }
};

/* -------------------------------------------------------------------------- */
/*                               FRIEND SERVICE                               */
/* -------------------------------------------------------------------------- */
export const FriendService = {
    searchUsers: async (searchTerm) => {
        const safeTerm = (searchTerm || "").trim();
        if (!safeTerm) return [];

        const lowerTerm = safeTerm.toLowerCase();
        const qLower = query(
            collection(db, "users"),
            where("username_lc", ">=", lowerTerm),
            where("username_lc", "<=", lowerTerm + '\uf8ff'),
            limit(8)
        );
        let snaps = await getDocs(qLower);

        if (snaps.empty) {
            const fallbackQ = query(
                collection(db, "users"),
                where("username", ">=", safeTerm),
                where("username", "<=", safeTerm + '\uf8ff'),
                limit(8)
            );
            snaps = await getDocs(fallbackQ);
        }

        return snaps.docs.map(d => d.data());
    },

    sendRequest: async (targetUid) => {
        if (!State.currentUser) throw new Error("Login required");
        if (targetUid === State.currentUser.uid) throw new Error("You cannot add yourself");

        const existingFriend = await getDoc(doc(db, `users/${State.currentUser.uid}/friends/${targetUid}`));
        if (existingFriend.exists()) throw new Error("Already friends");

        const existingRequest = await getDoc(doc(db, `users/${targetUid}/requests/${State.currentUser.uid}`));
        if (existingRequest.exists() && (existingRequest.data()?.status || 'pending') === 'pending') {
            throw new Error("Request already sent");
        }
        const reverseRequest = await getDoc(doc(db, `users/${State.currentUser.uid}/requests/${targetUid}`));
        if (reverseRequest.exists() && (reverseRequest.data()?.status || 'pending') === 'pending') {
            throw new Error("This player already sent you a request. Accept it from Requests.");
        }

        await setDoc(doc(db, `users/${targetUid}/requests/${State.currentUser.uid}`), {
            from: State.currentUser.uid,
            username: State.profile?.username || State.currentUser.displayName || "Player",
            avatar: State.profile?.avatar || "",
            timestamp: serverTimestamp(),
            status: 'pending'
        });
        return { status: 'sent' };
    },

    listenToFriends: () => {
        if (!State.currentUser) {
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: [] }));
            window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: [] }));
            return;
        }

        if (State.friendsUnsub) State.friendsUnsub();
        if (State.requestsUnsub) State.requestsUnsub();

        const q = query(collection(db, `users/${State.currentUser.uid}/friends`));
        State.friendsUnsub = onSnapshot(q, (snapshot) => {
            State.friends = snapshot.docs.map(d => d.data());
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: State.friends }));
        });

        // Also listen to Requests
        const reqQ = query(collection(db, `users/${State.currentUser.uid}/requests`));
        State.requestsUnsub = onSnapshot(reqQ, (snapshot) => {
            const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: requests }));
        });
    },

    listenToOnlineUsers: () => {
        if (!State.onlineUsersUnsub && !State.currentUser) return;

        if (State.onlineUsersUnsub) {
            State.onlineUsersUnsub();
            State.onlineUsersUnsub = null;
        }

        if (!State.currentUser) {
            window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: [] }));
            return;
        }

        const q = query(
            collection(db, "users"),
            where("status.state", "==", "online"),
            limit(50)
        );
        State.onlineUsersUnsub = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs
                .map(d => d.data())
                .filter(u => u.uid !== State.currentUser.uid);
            window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: users }));
        });
    },

    acceptRequest: async (request) => {
        if (!State.currentUser) return;

        try {
            // 1. Add to My Friends
            await setDoc(doc(db, `users/${State.currentUser.uid}/friends/${request.from}`), {
                uid: request.from,
                username: request.username,
                avatar: request.avatar,
                status: 'accepted',
                timestamp: serverTimestamp()
            });

            // 2. Add Me to Their Friends
            await setDoc(doc(db, `users/${request.from}/friends/${State.currentUser.uid}`), {
                uid: State.currentUser.uid,
                username: State.profile?.username || State.currentUser.displayName || "Player",
                avatar: State.profile?.avatar || "",
                status: 'accepted',
                timestamp: serverTimestamp()
            });

            // 3. Delete Request
            await deleteDoc(doc(db, `users/${State.currentUser.uid}/requests/${request.from}`));

            // Feed Post
            FeedService.postActivity('friend', { friendId: request.from, friendName: request.username });

        } catch (e) {
            console.error("Accept Friend Error", e);
        }
    }
};

/* -------------------------------------------------------------------------- */
/*                                FEED SERVICE                                */
/* -------------------------------------------------------------------------- */
export const FeedService = {
    postActivity: async (type, data) => {
        if (!State.currentUser) return;
        try {
            await addDoc(collection(db, "social_feed"), {
                type,
                user: {
                    uid: State.currentUser.uid,
                    username: State.profile?.username || State.currentUser.displayName || "Player",
                    avatar: State.profile?.avatar || ""
                },
                data,
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0
            });
        } catch (e) { console.error("Feed Post Error", e); }
    },

    postStatus: async (text) => {
        if (!State.currentUser) throw new Error("Login required");
        const safeText = (text || "").trim();
        if (!safeText) throw new Error("Status text cannot be empty");
        if (safeText.length > 260) throw new Error("Status must be 260 characters or less");
        await FeedService.postActivity("status", { text: safeText });
    },

    listenToFeed: () => {
        if (State.feedUnsub) State.feedUnsub();
        const q = query(collection(db, "social_feed"), orderBy("timestamp", "desc"), limit(20));
        State.feedUnsub = onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('feedUpdated', { detail: posts }));
        });
    }
};

/* -------------------------------------------------------------------------- */
/*                                CHAT SERVICE                                */
/* -------------------------------------------------------------------------- */
export const ChatService = {
    listenToGlobalChat: () => {
        if (State.globalChatUnsub) return;
        const q = query(collection(db, "global_chat_v2"), orderBy("timestamp", "desc"), limit(50));
        State.globalChatUnsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
            window.dispatchEvent(new CustomEvent('globalChatUpdated', { detail: msgs }));
        });
    },

    sendGlobalMessage: async (text) => {
        if (!State.currentUser || !text.trim()) return;
        await addDoc(collection(db, "global_chat_v2"), {
            text,
            uid: State.currentUser.uid,
            user: State.profile?.username || State.currentUser.displayName || "Player",
            avatar: State.profile?.avatar || "",
            timestamp: serverTimestamp(),
            verified: false // Admin badge hook
        });
    },

    listenToDirectChat: (targetUid) => {
        if (!State.currentUser || !targetUid) return;
        const ids = [State.currentUser.uid, targetUid].sort();
        const threadId = `${ids[0]}_${ids[1]}`;

        if (State.directChatUnsub && State.activeDmTarget === targetUid) return;
        if (State.directChatUnsub) {
            State.directChatUnsub();
            State.directChatUnsub = null;
        }

        State.activeDmTarget = targetUid;
        const q = query(
            collection(db, `dm_threads/${threadId}/messages`),
            orderBy("timestamp", "asc"),
            limit(200)
        );
        State.directChatUnsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('directChatUpdated', {
                detail: { targetUid, messages: msgs }
            }));
        });
    },

    sendDirectMessage: async (targetUid, text) => {
        if (!State.currentUser || !targetUid || !text.trim()) return;
        const ids = [State.currentUser.uid, targetUid].sort();
        const threadId = `${ids[0]}_${ids[1]}`;
        const threadRef = doc(db, "dm_threads", threadId);

        await setDoc(threadRef, {
            participants: ids,
            updatedAt: serverTimestamp(),
            lastMessage: {
                text: text.trim(),
                from: State.currentUser.uid,
                at: serverTimestamp()
            }
        }, { merge: true });

        await addDoc(collection(db, `dm_threads/${threadId}/messages`), {
            text: text.trim(),
            uid: State.currentUser.uid,
            user: State.profile?.username || State.currentUser.displayName || "Player",
            avatar: State.profile?.avatar || "",
            timestamp: serverTimestamp()
        });
    }
};

// Initialize
AuthService.init();

// Expose Global API for UI
window.Services = {
    auth: AuthService,
    user: UserService,
    friend: FriendService,
    feed: FeedService,
    chat: ChatService,
    state: State // For debugging
};
