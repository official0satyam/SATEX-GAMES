
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
    gameLibrary: [] // Cache for games.json
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
        State.listeners.forEach(unsub => unsub());
        State.listeners = [];
        State.currentUser = null;
        State.profile = null;
        State.friends = [];
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
            await setDoc(userRef, {
                username: manualUsername || user.displayName || `User_${user.uid.slice(0, 5)}`,
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
        const q = query(
            collection(db, "users"),
            where("username", ">=", searchTerm),
            where("username", "<=", searchTerm + '\uf8ff'),
            limit(5)
        );
        const snaps = await getDocs(q);
        return snaps.docs.map(d => d.data());
    },

    sendRequest: async (targetUid) => {
        if (!State.currentUser) return;
        // Add to My Sent
        // Add to Their Received (Simplification: Just creating a 'requests' subcol on target)
        await setDoc(doc(db, `users/${targetUid}/requests/${State.currentUser.uid}`), {
            from: State.currentUser.uid,
            username: State.profile.username,
            avatar: State.profile.avatar,
            timestamp: serverTimestamp(),
            status: 'pending'
        });
    },

    listenToFriends: () => {
        if (!State.currentUser) return;
        const q = query(collection(db, `users/${State.currentUser.uid}/friends`));
        const unsub = onSnapshot(q, (snapshot) => {
            State.friends = snapshot.docs.map(d => d.data());
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: State.friends }));
        });
        State.listeners.push(unsub);

        // Also listen to Requests
        const reqQ = query(collection(db, `users/${State.currentUser.uid}/requests`));
        const reqUnsub = onSnapshot(reqQ, (snapshot) => {
            const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: requests }));
        });
        State.listeners.push(reqUnsub);
    },

    acceptRequest: async (request) => {
        if (!State.currentUser) return;
        const batch = db.batch(); // unused via modular, doing parallel

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
                username: State.profile.username,
                avatar: State.profile.avatar,
                status: 'accepted',
                timestamp: serverTimestamp()
            });

            // 3. Delete Request
            await setDoc(doc(db, `users/${State.currentUser.uid}/requests/${request.from}`), { status: 'accepted' }); // Mark or delete

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
                    username: State.profile.username,
                    avatar: State.profile.avatar
                },
                data,
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0
            });
        } catch (e) { console.error("Feed Post Error", e); }
    },

    listenToFeed: () => {
        const q = query(collection(db, "social_feed"), orderBy("timestamp", "desc"), limit(20));
        const unsub = onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('feedUpdated', { detail: posts }));
        });
        State.listeners.push(unsub);
    }
};

/* -------------------------------------------------------------------------- */
/*                                CHAT SERVICE                                */
/* -------------------------------------------------------------------------- */
export const ChatService = {
    listenToGlobalChat: () => {
        const q = query(collection(db, "global_chat_v2"), orderBy("timestamp", "desc"), limit(50));
        const unsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => d.data()).reverse();
            window.dispatchEvent(new CustomEvent('globalChatUpdated', { detail: msgs }));
        });
        State.listeners.push(unsub);
    },

    sendGlobalMessage: async (text) => {
        if (!State.currentUser || !text.trim()) return;
        await addDoc(collection(db, "global_chat_v2"), {
            text,
            uid: State.currentUser.uid,
            user: State.profile.username,
            avatar: State.profile.avatar,
            timestamp: serverTimestamp(),
            verified: false // Admin badge hook
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
