import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, onChildAdded, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
const db = getDatabase(app);
const chatRef = ref(db, 'global_chat');

// State
let username = localStorage.getItem('chat_username');
const sidebar = document.getElementById('chatSidebar');
const loginOverlay = document.getElementById('chatLoginOverlay');
const messagesContainer = document.getElementById('chatMessages');
const input = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('usernameInput');
const floatingBtn = document.getElementById('chatFloatingBtn');

// Initialize UI
function init() {
    if (username) {
        loginOverlay.style.display = 'none';
        loadMessages();
    } else {
        loginOverlay.style.display = 'flex';
    }

    // Scroll to bottom on load
    scrollToBottom();
}

// Logic: Login
loginBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        username = name;
        localStorage.setItem('chat_username', username);
        loginOverlay.style.display = 'none';
        loadMessages();
    }
});

// Logic: Send Message
function sendMessage() {
    const text = input.value.trim();
    if (text && username) {
        push(chatRef, {
            user: username,
            text: text,
            timestamp: Date.now()
        });
        input.value = '';
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Logic: Listen for Messages
function loadMessages() {
    // Basic listener for new messages
    // Use limitToLast(50) in a real app, keeping it simple here
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg);
    });
}

function renderMessage(msg) {
    const div = document.createElement('div');
    const isMe = msg.user === username;

    div.className = `chat-message ${isMe ? 'me' : 'other'}`;

    // Simple timestamp format
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <div class="msg-header">
            <span class="msg-user">${msg.user}</span>
            <span class="msg-time">${time}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.text)}</div>
    `;

    messagesContainer.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Helper: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toggle Functionality (Exposed globally for the HTML button)
window.toggleChat = function () {
    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        floatingBtn.style.display = 'flex';
    } else {
        floatingBtn.style.display = 'none';
    }
}

// Initial Call
init();
