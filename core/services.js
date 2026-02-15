
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
    limit,
    runTransaction,
    increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
    getStorage,
    ref as storageRef,
    uploadString,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
const storageBucketCandidates = [
    firebaseConfig.storageBucket,
    `${firebaseConfig.projectId}.firebasestorage.app`,
    `${firebaseConfig.projectId}.appspot.com`
].filter((value, idx, list) => value && list.indexOf(value) === idx);

/* -------------------------------------------------------------------------- */
/*                               STATE MANAGEMENT                             */
/* -------------------------------------------------------------------------- */
const State = {
    currentUser: null,
    profile: null,
    friends: [],
    requests: [],
    listeners: [], // Store unsubscribe functions
    gameLibrary: [], // Cache for games.json
    friendsUnsub: null,
    requestsUnsub: null,
    feedUnsub: null,
    globalChatUnsub: null,
    directChatUnsub: null,
    onlineUsersUnsub: null,
    dmThreadsUnsub: null,
    activeDmTarget: null,
    presenceBound: false
};

const MAX_BIO_LENGTH = 180;
const MAX_STATUS_LENGTH = 260;

function emitServiceError(scope, error) {
    window.dispatchEvent(new CustomEvent('serviceError', {
        detail: {
            scope,
            code: error?.code || null,
            message: mapFirebaseError(error, error?.message || 'Unknown error')
        }
    }));
}

function mapFirebaseError(error, fallbackMessage) {
    const code = String(error?.code || '');
    if (code.includes('quota-exceeded') || code.includes('resource-exhausted')) {
        return 'Firebase quota exceeded. Please upgrade plan or wait for quota reset.';
    }
    if (code.includes('permission-denied') || code.includes('unauthorized')) {
        return 'Permission denied by Firebase rules. Please update Firestore/Storage rules.';
    }
    if (code.includes('failed-precondition')) {
        return 'A required Firestore index is missing. Create the index from Firebase console.';
    }
    if (code.includes('bucket-not-found')) {
        return 'Firebase Storage bucket is not configured. Enable Storage in Firebase console.';
    }
    if (code.includes('retry-limit-exceeded')) {
        return 'Upload timed out. Please try a smaller image or retry.';
    }
    if (code.includes('invalid-format')) {
        return 'Selected file format is not supported.';
    }
    if (code.includes('unavailable')) {
        return 'Firebase service is temporarily unavailable. Try again in a moment.';
    }
    return fallbackMessage || error?.message || 'Operation failed';
}

function buildStoragePath(folder, ext = "jpg") {
    const uid = State.currentUser?.uid || "anonymous";
    const token = Math.random().toString(36).slice(2, 10);
    return `${folder}/${uid}/${Date.now()}_${token}.${ext}`;
}

async function uploadImageDataUrl(dataUrl, folder) {
    const safeData = String(dataUrl || "").trim();
    if (!safeData.startsWith("data:image/")) {
        throw new Error("Invalid image format.");
    }

    // ImgBB API Implementation
    const apiKey = 'beb2b04b30d7efa311eaa67b40cf67cc';

    try {
        console.log("[Upload] Starting upload to ImgBB...");

        // Remove header to get pure base64 for ImgBB
        const base64Image = safeData.replace(/^data:image\/\w+;base64,/, "");

        const formData = new FormData();
        formData.append("image", base64Image);

        // Upload to ImgBB
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            console.log("[Upload] Success:", data.data.url);
            return data.data.url;
        } else {
            console.error("[Upload] ImgBB Error:", data);
            throw new Error(data.error?.message || "Image upload failed via ImgBB.");
        }

    } catch (error) {
        console.error("[Upload] Error:", error);
        throw new Error("Image upload failed. Please try again.");
    }
}

/* -------------------------------------------------------------------------- */
/*                                AUTH SERVICE                                */
/* -------------------------------------------------------------------------- */
export const AuthService = {
    init: () => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log("?? [AUTH] Logged In:", user.uid);
                State.currentUser = user;
                await UserService.syncProfile(user);
                await UserService.fetchProfile(user.uid);

                // Start lightweight core listeners. Heavy listeners are started by view.
                FriendService.listenToFriends();

                // Presence
                await UserService.updateStatus('online');
                if (!State.presenceBound) {
                    State.presenceBound = true;
                    window.addEventListener('beforeunload', () => UserService.updateStatus('offline'));
                    document.addEventListener('visibilitychange', () => {
                        if (!State.currentUser) return;
                        if (document.hidden) {
                            UserService.updateStatus('away');
                        } else {
                            UserService.updateStatus('online');
                        }
                    });
                }

            } else {
                console.log("?? [AUTH] Logged Out");
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
        const safeUsername = (username || "").trim();
        if (safeUsername.length < 3) throw new Error("Username must be at least 3 characters");
        // 1. Check Username Uniqueness
        const q = query(collection(db, "users"), where("username_lc", "==", safeUsername.toLowerCase()));
        if (!(await getDocs(q)).empty) throw new Error("Username taken");

        // 2. Create Auth
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: safeUsername });

        // 3. Create Profile Doc
        await UserService.syncProfile(cred.user, safeUsername);
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
        if (State.globalChatUnsub) { State.globalChatUnsub(); State.globalChatUnsub = null; }
        if (State.directChatUnsub) { State.directChatUnsub(); State.directChatUnsub = null; }
        if (State.onlineUsersUnsub) { State.onlineUsersUnsub(); State.onlineUsersUnsub = null; }
        if (State.dmThreadsUnsub) { State.dmThreadsUnsub(); State.dmThreadsUnsub = null; }

        State.listeners.forEach(unsub => unsub());
        State.listeners = [];
        State.currentUser = null;
        State.profile = null;
        State.friends = [];
        State.requests = [];
        State.activeDmTarget = null;

        window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: [] }));
        window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: [] }));
        window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: [] }));
        window.dispatchEvent(new CustomEvent('dmThreadsUpdated', { detail: [] }));
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
                display_name: safeName,
                email: user.email,
                uid: user.uid,
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
                cover_photo: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop",
                bio: "Just a gamer.",
                level: 1,
                xp: 0,
                games_played: 0,
                achievements: [],
                status: { state: 'online', game: null },
                followers_count: 0,
                following_count: 0,
                following_games: [],
                favorite_games: [],
                last_active: serverTimestamp(),
                joined: new Date().toISOString()
            });
        } else {
            const existing = snap.data() || {};
            const backfill = {};
            if (!existing.username_lc && existing.username) backfill.username_lc = String(existing.username).toLowerCase();
            if (!existing.display_name && existing.username) backfill.display_name = existing.username;
            if (!existing.cover_photo) backfill.cover_photo = "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2670&auto=format&fit=crop";
            if (typeof existing.games_played !== "number") backfill.games_played = 0;
            if (typeof existing.followers_count !== "number") backfill.followers_count = 0;
            if (typeof existing.following_count !== "number") backfill.following_count = 0;
            if (!Array.isArray(existing.achievements)) backfill.achievements = [];
            if (!Array.isArray(existing.favorite_games)) backfill.favorite_games = [];
            if (!Array.isArray(existing.following_games)) backfill.following_games = [];
            if (Object.keys(backfill).length) {
                await updateDoc(userRef, backfill);
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

    fetchUserByUid: async (uid) => {
        if (!uid) return null;
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return null;
        return { uid, ...snap.data() };
    },

    updateStatus: async (state, game = null) => {
        if (!State.currentUser) return;
        try {
            await updateDoc(doc(db, "users", State.currentUser.uid), {
                status: { state, game, last_seen: serverTimestamp() },
                last_active: serverTimestamp()
            });
        } catch (e) {
            console.warn("Status update failed", e);
            try {
                await setDoc(doc(db, "users", State.currentUser.uid), {
                    status: { state, game, last_seen: serverTimestamp() },
                    last_active: serverTimestamp()
                }, { merge: true });
            } catch (fallbackError) {
                console.warn("Status fallback failed", fallbackError);
            }
        }
    },

    updateProfileFields: async ({ username, bio, avatar, coverPhoto }) => {
        if (!State.currentUser) throw new Error("Login required");

        const updates = {};
        const current = State.profile || {};
        const hasUsername = typeof username === "string";
        const hasBio = typeof bio === "string";
        const hasAvatar = typeof avatar === "string";
        const hasCover = typeof coverPhoto === "string";
        const safeUsername = hasUsername ? username.trim() : "";
        const safeBio = hasBio ? bio.trim() : "";
        const safeAvatar = hasAvatar ? avatar.trim() : "";
        const safeCover = hasCover ? coverPhoto.trim() : "";

        if (hasUsername && safeUsername && safeUsername !== current.username) {
            if (safeUsername.length < 3) throw new Error("Username must be at least 3 characters");
            const normalized = safeUsername.toLowerCase();
            const q = query(collection(db, "users"), where("username_lc", "==", normalized));
            const snaps = await getDocs(q);
            const hasConflict = snaps.docs.some(d => d.id !== State.currentUser.uid);
            if (hasConflict) throw new Error("Username already taken");
            updates.username = safeUsername;
            updates.display_name = safeUsername;
            updates.username_lc = normalized;
        }

        if (hasBio) {
            if (safeBio.length > MAX_BIO_LENGTH) throw new Error(`Bio must be ${MAX_BIO_LENGTH} characters or less`);
            if (safeBio !== (current.bio || "")) {
                updates.bio = safeBio;
            }
        }

        if (hasAvatar && safeAvatar && safeAvatar !== current.avatar) {
            updates.avatar = safeAvatar;
        }
        if (hasCover && safeCover && safeCover !== current.cover_photo) {
            updates.cover_photo = safeCover;
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

    uploadAvatarDataUrl: async (dataUrl) => {
        if (!State.currentUser) throw new Error("Login required");
        const imageUrl = await uploadImageDataUrl(dataUrl, "avatars");
        await UserService.updateProfileFields({ avatar: imageUrl });
        return imageUrl;
    },

    uploadCoverDataUrl: async (dataUrl) => {
        if (!State.currentUser) throw new Error("Login required");
        const imageUrl = await uploadImageDataUrl(dataUrl, "covers");
        await UserService.updateProfileFields({ coverPhoto: imageUrl });
        return imageUrl;
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
        const isFollowing = State.profile?.following_games?.includes(gameId);

        if (isFollowing) {
            await updateDoc(ref, { following_games: arrayRemove(gameId) });
        } else {
            await updateDoc(ref, { following_games: arrayUnion(gameId) });
            // Feed Post
            FeedService.postActivity('favorite', { gameId });
        }
        await UserService.fetchProfile(State.currentUser.uid); // Refresh local
    },

    getFollowRelationship: async (targetUid) => {
        if (!State.currentUser || !targetUid || targetUid === State.currentUser.uid) {
            return { isFollowing: false, followsYou: false };
        }
        const [followingSnap, followerSnap] = await Promise.all([
            getDoc(doc(db, `users/${State.currentUser.uid}/following_users/${targetUid}`)),
            getDoc(doc(db, `users/${State.currentUser.uid}/followers/${targetUid}`))
        ]);
        return {
            isFollowing: followingSnap.exists(),
            followsYou: followerSnap.exists()
        };
    },

    followUser: async (targetUid, targetProfile = null) => {
        if (!State.currentUser) throw new Error("Login required");
        if (!targetUid) throw new Error("Target user missing");
        if (targetUid === State.currentUser.uid) throw new Error("You cannot follow yourself");

        const myUserRef = doc(db, "users", State.currentUser.uid);
        const targetUserRef = doc(db, "users", targetUid);
        const myFollowingRef = doc(db, `users/${State.currentUser.uid}/following_users/${targetUid}`);
        const theirFollowerRef = doc(db, `users/${targetUid}/followers/${State.currentUser.uid}`);

        await runTransaction(db, async (tx) => {
            const [followSnap, myUserSnap, targetUserSnap] = await Promise.all([
                tx.get(myFollowingRef),
                tx.get(myUserRef),
                tx.get(targetUserRef)
            ]);
            if (followSnap.exists()) return;

            const myData = myUserSnap.exists() ? (myUserSnap.data() || {}) : {};
            const targetData = targetUserSnap.exists() ? (targetUserSnap.data() || {}) : {};
            const nextFollowingCount = (Number(myData.following_count || 0) || 0) + 1;
            const nextFollowersCount = (Number(targetData.followers_count || 0) || 0) + 1;

            tx.set(myFollowingRef, {
                uid: targetUid,
                username: targetData.username || targetProfile?.username || "Player",
                avatar: targetData.avatar || targetProfile?.avatar || "",
                timestamp: serverTimestamp()
            });
            tx.set(theirFollowerRef, {
                uid: State.currentUser.uid,
                username: State.profile?.username || State.currentUser.displayName || "Player",
                avatar: State.profile?.avatar || "",
                timestamp: serverTimestamp()
            });
            tx.set(myUserRef, { following_count: nextFollowingCount }, { merge: true });
            tx.set(targetUserRef, { followers_count: nextFollowersCount }, { merge: true });
        });

        await UserService.fetchProfile(State.currentUser.uid);
        await FeedService.postActivity('follow', {
            targetUid,
            targetName: targetProfile?.display_name || targetProfile?.username || "player"
        });
    },

    unfollowUser: async (targetUid) => {
        if (!State.currentUser) throw new Error("Login required");
        if (!targetUid || targetUid === State.currentUser.uid) return;

        const myUserRef = doc(db, "users", State.currentUser.uid);
        const targetUserRef = doc(db, "users", targetUid);
        const myFollowingRef = doc(db, `users/${State.currentUser.uid}/following_users/${targetUid}`);
        const theirFollowerRef = doc(db, `users/${targetUid}/followers/${State.currentUser.uid}`);

        await runTransaction(db, async (tx) => {
            const [followSnap, myUserSnap, targetUserSnap] = await Promise.all([
                tx.get(myFollowingRef),
                tx.get(myUserRef),
                tx.get(targetUserRef)
            ]);
            if (!followSnap.exists()) return;

            const myData = myUserSnap.exists() ? (myUserSnap.data() || {}) : {};
            const targetData = targetUserSnap.exists() ? (targetUserSnap.data() || {}) : {};
            const nextFollowingCount = Math.max(0, (Number(myData.following_count || 0) || 0) - 1);
            const nextFollowersCount = Math.max(0, (Number(targetData.followers_count || 0) || 0) - 1);

            tx.delete(myFollowingRef);
            tx.delete(theirFollowerRef);
            tx.set(myUserRef, { following_count: nextFollowingCount }, { merge: true });
            tx.set(targetUserRef, { followers_count: nextFollowersCount }, { merge: true });
        });

        await UserService.fetchProfile(State.currentUser.uid);
    },

    listFollowingUsers: async (maxItems = 30) => {
        if (!State.currentUser) return [];
        const safeLimit = Math.max(1, Math.min(60, Number(maxItems) || 30));
        try {
            const followingQ = query(
                collection(db, `users/${State.currentUser.uid}/following_users`),
                orderBy("timestamp", "desc"),
                limit(safeLimit)
            );
            const snap = await getDocs(followingQ);
            return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        } catch (error) {
            const fallbackQ = query(
                collection(db, `users/${State.currentUser.uid}/following_users`),
                limit(safeLimit)
            );
            const fallback = await getDocs(fallbackQ);
            return fallback.docs.map(d => ({ uid: d.id, ...d.data() }));
        }
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
            to: targetUid,
            username: State.profile?.username || State.currentUser.displayName || "Player",
            avatar: State.profile?.avatar || "",
            timestamp: serverTimestamp(),
            status: 'pending'
        });
        return { status: 'sent' };
    },

    cancelRequest: async (targetUid) => {
        if (!State.currentUser || !targetUid) return;
        await deleteDoc(doc(db, `users/${targetUid}/requests/${State.currentUser.uid}`));
    },

    declineRequest: async (fromUid) => {
        if (!State.currentUser || !fromUid) return;
        await deleteDoc(doc(db, `users/${State.currentUser.uid}/requests/${fromUid}`));
    },

    removeFriend: async (targetUid) => {
        if (!State.currentUser || !targetUid) return;
        const myRef = doc(db, `users/${State.currentUser.uid}/friends/${targetUid}`);
        const theirRef = doc(db, `users/${targetUid}/friends/${State.currentUser.uid}`);
        await Promise.all([deleteDoc(myRef), deleteDoc(theirRef)]);
    },

    getRelationship: async (targetUid) => {
        if (!State.currentUser || !targetUid) {
            return { isSelf: false, isFriend: false, outgoingRequest: false, incomingRequest: false };
        }
        if (targetUid === State.currentUser.uid) {
            return { isSelf: true, isFriend: false, outgoingRequest: false, incomingRequest: false };
        }

        // Prefer local listener state to avoid unnecessary reads.
        let isFriend = State.friends.some(f => f.uid === targetUid);
        let incomingRequest = State.requests.some(r => (r.from || r.id) === targetUid);

        if (!State.friendsUnsub) {
            const friendSnap = await getDoc(doc(db, `users/${State.currentUser.uid}/friends/${targetUid}`));
            isFriend = friendSnap.exists();
        }
        if (!State.requestsUnsub) {
            const incomingSnap = await getDoc(doc(db, `users/${State.currentUser.uid}/requests/${targetUid}`));
            incomingRequest = incomingSnap.exists();
        }

        if (isFriend || incomingRequest) {
            return {
                isSelf: false,
                isFriend,
                outgoingRequest: false,
                incomingRequest
            };
        }

        const outgoingSnap = await getDoc(doc(db, `users/${targetUid}/requests/${State.currentUser.uid}`));
        return { isSelf: false, isFriend, outgoingRequest: outgoingSnap.exists(), incomingRequest };
    },

    listenToFriends: () => {
        if (!State.currentUser) {
            State.friends = [];
            State.requests = [];
            window.dispatchEvent(new CustomEvent('friendsUpdated', { detail: [] }));
            window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: [] }));
            return;
        }

        if (State.friendsUnsub && State.requestsUnsub) return;
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
            State.requests = requests;
            window.dispatchEvent(new CustomEvent('requestsUpdated', { detail: requests }));
        });
    },

    listenToOnlineUsers: () => {
        if (!State.currentUser) {
            if (State.onlineUsersUnsub) {
                State.onlineUsersUnsub();
                State.onlineUsersUnsub = null;
            }
            window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: [] }));
            return;
        }
        if (State.onlineUsersUnsub) return;

        const q = query(
            collection(db, "users"),
            where("status.state", "==", "online"),
            limit(30)
        );
        State.onlineUsersUnsub = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs
                .map(d => d.data())
                .filter(u => u.uid !== State.currentUser.uid);
            window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: users }));
        });
    },

    stopOnlineUsers: () => {
        if (State.onlineUsersUnsub) {
            State.onlineUsersUnsub();
            State.onlineUsersUnsub = null;
        }
        window.dispatchEvent(new CustomEvent('onlineUsersUpdated', { detail: [] }));
    },

    acceptRequest: async (request) => {
        if (!State.currentUser) return;

        try {
            await runTransaction(db, async (transaction) => {
                // References
                const myFriendRef = doc(db, `users/${State.currentUser.uid}/friends/${request.from}`);
                const theirFriendRef = doc(db, `users/${request.from}/friends/${State.currentUser.uid}`);
                const requestRef = doc(db, `users/${State.currentUser.uid}/requests/${request.from}`);

                // 1. Add to My Friends
                transaction.set(myFriendRef, {
                    uid: request.from,
                    username: request.username,
                    avatar: request.avatar,
                    status: 'accepted',
                    timestamp: serverTimestamp(),
                    acceptedAt: serverTimestamp()
                });

                // 2. Add Me to Their Friends
                transaction.set(theirFriendRef, {
                    uid: State.currentUser.uid,
                    username: State.profile?.username || State.currentUser.displayName || "Player",
                    avatar: State.profile?.avatar || "",
                    status: 'accepted',
                    timestamp: serverTimestamp(),
                    acceptedAt: serverTimestamp()
                });

                // 3. Delete Request
                transaction.delete(requestRef);
            });

            // Feed Post (Outside transaction as it's not critical for data integrity of friendship)
            FeedService.postActivity('friend', { friendId: request.from, friendName: request.username });

        } catch (e) {
            console.error("Accept Friend Error", e);
            throw e; // Re-throw for UI to handle
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
            await addDoc(collection(db, "posts"), {
                type,
                user: {
                    uid: State.currentUser.uid,
                    username: State.profile?.username || State.currentUser.displayName || "Player",
                    display_name: State.profile?.display_name || State.profile?.username || State.currentUser.displayName || "Player",
                    avatar: State.profile?.avatar || ""
                },
                data,
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0
            });
        } catch (e) { console.error("Feed Post Error", e); }
    },

    postStatus: async (payload) => {
        if (!State.currentUser) throw new Error("Login required");
        const isString = typeof payload === "string";
        const safeText = (isString ? payload : payload?.text || "").trim();
        let imageUrl = (isString ? "" : payload?.imageUrl || "").trim();
        const imageDataUrl = (isString ? "" : payload?.imageDataUrl || "").trim();

        if (safeText.length > MAX_STATUS_LENGTH) {
            throw new Error(`Status must be ${MAX_STATUS_LENGTH} characters or less`);
        }
        if (imageDataUrl) {
            imageUrl = await uploadImageDataUrl(imageDataUrl, "feed");
        }
        const gameCheck = (typeof payload === 'object' ? payload?.game : null);
        if (!safeText && !imageUrl && !gameCheck) {
            throw new Error("Post must include text, image, or game content");
        }
        try {
            await addDoc(collection(db, "posts"), {
                type: "status",
                user: {
                    uid: State.currentUser.uid,
                    username: State.profile?.username || State.currentUser.displayName || "Player",
                    display_name: State.profile?.display_name || State.profile?.username || State.currentUser.displayName || "Player",
                    avatar: State.profile?.avatar || ""
                },
                data: {
                    text: safeText,
                    imageUrl,
                    game: (typeof payload === 'object' ? payload?.game : null)
                },
                timestamp: serverTimestamp(),
                likes: 0,
                comments: 0
            });
        } catch (error) {
            throw new Error(mapFirebaseError(error, "Failed to publish status"));
        }
    },

    uploadPostImageDataUrl: async (dataUrl) => {
        if (!State.currentUser) throw new Error("Login required");
        return uploadImageDataUrl(dataUrl, "feed");
    },

    likePost: async (postId) => {
        if (!State.currentUser) return;
        const postRef = doc(db, "posts", postId);
        const likeRef = doc(db, `posts/${postId}/likes/${State.currentUser.uid}`);
        let liked = false;

        try {
            await runTransaction(db, async (transaction) => {
                const likeDoc = await transaction.get(likeRef);
                if (likeDoc.exists()) {
                    // Unlike
                    transaction.delete(likeRef);
                    transaction.update(postRef, { likes: increment(-1) });
                    liked = false;
                } else {
                    // Like
                    transaction.set(likeRef, {
                        uid: State.currentUser.uid,
                        timestamp: serverTimestamp()
                    });
                    transaction.update(postRef, { likes: increment(1) });
                    liked = true;
                }
            });
            return liked;
        } catch (e) {
            console.error("Like Error", e);
            throw e;
        }
    },

    addComment: async (postId, text) => {
        if (!State.currentUser) return;
        if (!text.trim()) return;

        try {
            await addDoc(collection(db, `posts/${postId}/comments`), {
                text: text.trim(),
                uid: State.currentUser.uid,
                username: State.profile?.username || "Player",
                avatar: State.profile?.avatar || "",
                timestamp: serverTimestamp()
            });
            await updateDoc(doc(db, "posts", postId), { comments: increment(1) });
        } catch (e) { console.error("Comment Error", e); }
    },

    listenToPostComments: (postId, callback) => {
        if (!postId) return () => { };
        const commentsQuery = query(
            collection(db, `posts/${postId}/comments`),
            orderBy("timestamp", "asc"),
            limit(100)
        );
        return onSnapshot(commentsQuery, (snapshot) => {
            const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            if (typeof callback === "function") callback(comments);
        });
    },

    listenToFeed: () => {
        if (State.feedUnsub) return;
        const q = query(collection(db, "posts"), orderBy("timestamp", "desc"), limit(12));
        State.feedUnsub = onSnapshot(
            q,
            (snapshot) => {
                const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                window.dispatchEvent(new CustomEvent('feedUpdated', { detail: posts }));
            },
            (error) => {
                console.error("Feed listener error", error);
                emitServiceError('feed', error);
            }
        );
    },

    deletePost: async (postId) => {
        if (!State.currentUser) throw new Error("Login required");
        // Verify ownership is handled via security rules, but UI should also check.
        // We delete the doc. Subcollections (likes/comments) might need manual deletion or cloud function trigger,
        // but for now we delete the main post.
        await deleteDoc(doc(db, "posts", postId));
    },

    stopFeed: () => {
        if (State.feedUnsub) {
            State.feedUnsub();
            State.feedUnsub = null;
        }
    }
};

/* -------------------------------------------------------------------------- */
/*                                CHAT SERVICE                                */
/* -------------------------------------------------------------------------- */
export const ChatService = {
    listenToGlobalChat: () => {
        if (State.globalChatUnsub) return;
        const q = query(collection(db, "global_chat_v2"), orderBy("timestamp", "desc"), limit(30));
        State.globalChatUnsub = onSnapshot(
            q,
            (snapshot) => {
                const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
                window.dispatchEvent(new CustomEvent('globalChatUpdated', { detail: msgs }));
            },
            (error) => {
                console.error("Global chat listener error", error);
                emitServiceError('global_chat', error);
            }
        );
    },

    listenToDmThreads: () => {
        if (!State.currentUser) {
            window.dispatchEvent(new CustomEvent('dmThreadsUpdated', { detail: [] }));
            return;
        }
        if (State.dmThreadsUnsub) return;

        const buildThreads = (snapshot) => {
            const threads = snapshot.docs.map(d => {
                const data = d.data() || {};
                const participants = Array.isArray(data.participants) ? data.participants : [];
                const targetUid = participants.find(uid => uid !== State.currentUser.uid) || null;
                return {
                    id: d.id,
                    ...data,
                    targetUid,
                    unreadCount: data.unread?.[State.currentUser.uid] || 0
                };
            });
            window.dispatchEvent(new CustomEvent('dmThreadsUpdated', { detail: threads }));
        };

        const orderedQ = query(
            collection(db, "chats"),
            where("participants", "array-contains", State.currentUser.uid),
            orderBy("updatedAt", "desc"),
            limit(30)
        );
        State.dmThreadsUnsub = onSnapshot(
            orderedQ,
            buildThreads,
            (error) => {
                const fallbackQ = query(
                    collection(db, "chats"),
                    where("participants", "array-contains", State.currentUser.uid),
                    limit(30)
                );
                if (State.dmThreadsUnsub) State.dmThreadsUnsub();
                State.dmThreadsUnsub = onSnapshot(
                    fallbackQ,
                    buildThreads,
                    (fallbackError) => {
                        console.error("DM thread listener error", fallbackError);
                        emitServiceError('dm_threads', fallbackError || error);
                    }
                );
            }
        );
    },

    stopGlobalChat: () => {
        if (State.globalChatUnsub) {
            State.globalChatUnsub();
            State.globalChatUnsub = null;
        }
    },

    stopDmThreads: () => {
        if (State.dmThreadsUnsub) {
            State.dmThreadsUnsub();
            State.dmThreadsUnsub = null;
        }
        window.dispatchEvent(new CustomEvent('dmThreadsUpdated', { detail: [] }));
    },

    sendGlobalMessage: async (text) => {
        const safeText = (text || "").trim();
        if (!State.currentUser || !safeText) return;
        // Global chat can remain in global_chat_v2 or migrate to a 'global' chat document in chats collection
        // For now, keeping global_chat_v2 as it's separate from DMs
        await addDoc(collection(db, "global_chat_v2"), {
            text: safeText,
            uid: State.currentUser.uid,
            user: State.profile?.username || State.currentUser.displayName || "Player",
            avatar: State.profile?.avatar || "",
            timestamp: serverTimestamp(),
            verified: false
        });
    },

    listenToDirectChat: (targetUid) => {
        if (!State.currentUser || !targetUid) return;
        const ids = [State.currentUser.uid, targetUid].sort();
        const chatId = `${ids[0]}_${ids[1]}`;
        const chatRef = doc(db, "chats", chatId);

        if (State.directChatUnsub && State.activeDmTarget === targetUid) return;
        if (State.directChatUnsub) {
            State.directChatUnsub();
            State.directChatUnsub = null;
        }

        State.activeDmTarget = targetUid;
        updateDoc(chatRef, {
            [`unread.${State.currentUser.uid}`]: 0,
            [`lastReadAt.${State.currentUser.uid}`]: serverTimestamp()
        }).catch(() => { });

        const q = query(
            collection(db, `chats/${chatId}/messages`),
            orderBy("timestamp", "asc"),
            limit(100)
        );
        State.directChatUnsub = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            window.dispatchEvent(new CustomEvent('directChatUpdated', {
                detail: { targetUid, messages: msgs }
            }));
        });
    },

    stopDirectChat: () => {
        if (State.directChatUnsub) {
            State.directChatUnsub();
            State.directChatUnsub = null;
        }
        State.activeDmTarget = null;
    },

    sendDirectMessage: async (targetUid, text) => {
        if (!State.currentUser || !targetUid || !text.trim()) return;
        const ids = [State.currentUser.uid, targetUid].sort();
        const chatId = `${ids[0]}_${ids[1]}`;
        const chatRef = doc(db, "chats", chatId);
        const trimmed = text.trim();

        await setDoc(chatRef, {
            participants: ids,
            updatedAt: serverTimestamp(),
            lastMessage: {
                text: trimmed,
                from: State.currentUser.uid,
                at: serverTimestamp()
            },
            unread: {
                [State.currentUser.uid]: 0
            }
        }, { merge: true });
        await updateDoc(chatRef, { [`unread.${targetUid}`]: increment(1) });

        await addDoc(collection(db, `chats/${chatId}/messages`), {
            text: trimmed,
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
