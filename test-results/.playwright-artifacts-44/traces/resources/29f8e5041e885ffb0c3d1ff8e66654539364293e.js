import { auth, onAuthStateChanged, signOut, get, ref, db } from './firebase-config.js';
import { getEl, hideEl, showEl } from './utils.js';

// State
let currentUser = null;

// Init
document.addEventListener('DOMContentLoaded', () => {
    console.log("App initialized");
    setupNavigation();
});

function setupNavigation() {
    // Auth State Listener
    onAuthStateChanged(auth, (user) => {
        // Hide Loading View
        hideEl('loading-view');

        if (user) {
            currentUser = user;
            console.log("User logged in:", user.email);
            
            // Check persistence
            const session = localStorage.getItem('auction_session');
            if (session) {
                try {
                    const s = JSON.parse(session);
                    if (window.restoreSession) {
                        window.restoreSession(s.code, s.role);
                    } else {
                        showLobby();
                    }
                } catch(e) {
                    console.error("Session parse error", e);
                    showLobby();
                }
            } else {
                showLobby();
            }
        } else {
            currentUser = null;
            console.log("User logged out");
            showAuth();
        }
    });

    // Navigation Global Delegation
    window.addEventListener('click', async (e) => {
        const id = e.target.id;
        const classList = e.target.classList;

        if (id === 'btn-logout') {
            try {
                if(window.clearSession) window.clearSession();
                await signOut(auth);
                location.reload();
            } catch (error) {
                console.error("Logout failed", error);
            }
        }

        if (classList.contains('btn-quit')) {
            if(window.clearSession) window.clearSession();
            showLobby();
            window.location.reload();
        }
    });
}

// View Switchers
function hideAllViews() {
    hideEl('loading-view'); // Ensure loading is hidden
    hideEl('auth-view');
    hideEl('lobby-view');
    hideEl('admin-view');
    hideEl('user-view');
}

export function showAuth() {
    hideAllViews();
    showEl('auth-view');
}

export async function showLobby() {
    hideAllViews();
    showEl('lobby-view');
    
    // Load History
    if (window.loadAuctionHistory) window.loadAuctionHistory();
    
    if (currentUser) {
        // Fetch username from DB
        try {
            const snap = await get(ref(db, `users/${currentUser.uid}/username`));
            if (snap.exists()) {
                getEl('user-email').textContent = snap.val();
            } else {
                getEl('user-email').textContent = "Unknown User";
            }
        } catch (e) {
            console.error(e);
        }
    }
}

export function showAdmin() {
    hideAllViews();
    showEl('admin-view');
}

export function showUser() {
    hideAllViews();
    showEl('user-view');
}
