import { db, ref, set, get, onValue, update, push, child } from './firebase-config.js';
import { auth } from './firebase-config.js';
import { getEl, hideEl, showEl, generateRoomCode, formatMoney } from './utils.js';
import { showAdmin, showUser } from './app.js';

let currentRoomCode = null;
let currentRole = null; // 'admin' or 'user'
let playersList = [];

// Game Settings
let totalPurse = 50;
let maxSquad = 6;
let minSquad = 5;

// Global Event Delegation for Auction Controls
window.addEventListener('click', (e) => {
    const id = e.target.id;
    if(window.logDebug) window.logDebug("Auction Listener: " + id);

    if (!id) return;

    if (id === 'btn-host') hostAuction();
    if (id === 'btn-join') {
        if(window.logDebug) window.logDebug("Auction: Join Clicked (Global)");
        joinAuction();
    }

    // Admin
    if (id === 'btn-start-auction') setupPlayers();
    if (id === 'btn-spin') spinWheel();
    if (id === 'btn-sell') sellPlayer();

    // Host Betting
    if (id === 'btn-host-bid-1') { log("Click: Host Bid 1"); placeBid(1); }
    if (id === 'btn-host-bid-2') { log("Click: Host Bid 2"); placeBid(2); }

    // User
    if (id === 'btn-bid-1') placeBid(1);
    if (id === 'btn-bid-2') placeBid(2);
});

// Load History on Lobby Show
// We can't export this easily to app.js without circular dep on showLobby.
// So we'll rely on app.js calling a global or just hook it here if we can detect Lobby state?
// Better: Add a listener for when Lobby is shown.
// For now, let's just run it periodically or when we return to lobby.
// Let's expose a function `loadHistory` that app.js can call.
window.loadAuctionHistory = async () => {
    const list = getEl('past-matches-list');
    if(!list) return;

    // For Mock Persisted, we can scan rooms
    // In Real Firebase, querying all rooms might be heavy, but fine for prototype.
    try {
        const snap = await get(ref(db, 'rooms'));
        if (snap.exists()) {
            const rooms = snap.val();
            list.innerHTML = '';
            Object.keys(rooms).forEach(key => {
                const r = rooms[key];
                 // Filter? Show all for now.
                const status = r.status || "WAITING";
                const matchName = r.matchName || `Room ${key}`;
                const li = document.createElement('li');
                li.style.borderBottom = '1px solid #333';
                li.style.padding = '8px 0';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.cursor = 'pointer';
                li.innerHTML = `
                    <span><strong class="accent">${matchName}</strong></span>
                    <span style="font-size:0.8rem">${status}</span>
                `;
                li.onclick = () => {
                     // Click to copy or rejoin?
                     getEl('room-code-input').value = key;
                };
                list.appendChild(li);
            });
        }
    } catch(e) { console.error(e); }
};


function log(msg) {
    console.log(msg);
    if(window.logDebug) window.logDebug(msg);
}

// --- LOBBY LOGIC ---

async function hostAuction() {
    const user = auth.currentUser;
    if (!user) return alert("Must be logged in.");

    const code = generateRoomCode();
    const roomRef = ref(db, `rooms/${code}`);

    try {
        await set(roomRef, {
            admin: user.uid,
            status: "WAITING",
            createdAt: Date.now()
        });

        // Add Host as "Auditor" user so they can place bids
        await set(ref(db, `rooms/${code}/users/${user.uid}`), {
            username: "Host (Auditor)",
            balance: 10000, // High balance for Auditor
            team: [],
            isHost: true
        });

        currentRoomCode = code;
        currentRole = 'admin';
        getEl('admin-room-code').textContent = code;
        showAdmin();
        setupAdminListeners(code);
    } catch (e) {
        log("Host failed: " + e.message);
        alert("Could not create room.");
    }
}

async function joinAuction() {
    const code = getEl('room-code-input').value.trim().toUpperCase();
    if (!code) return alert("Enter a room code.");

    const user = auth.currentUser;
    if (!user) return alert("Must be logged in.");

    log(`Attempting join: ${code}`);

    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
        const roomData = snapshot.val();
        log("Room found. Config: " + JSON.stringify(roomData.config || {}));

        currentRoomCode = code;
        currentRole = 'user';

        // Initialize Game Params from DB if exists, else defaults
        if (roomData.config) {
            totalPurse = roomData.config.purse || 50;
            maxSquad = roomData.config.maxSquad || 6;
            minSquad = roomData.config.minSquad || 5;
        }

        const roomUserRef = ref(db, `rooms/${code}/users/${user.uid}`);

        // Only reset balance if not already joined?
        // For simplicity, we reset or ensure defaults.
        // IMPORTANT: We use 'purse' from config.
        const userSnap = await get(roomUserRef);
        if (!userSnap.exists()) {
             await update(roomUserRef, {
                username: user.email ? user.email.split('@')[0] : "AnonymousUser",
                balance: totalPurse,
                team: []
            });
        }

        showUser();
        // Update UI max squad label
        if(getEl('my-max-squad')) getEl('my-max-squad').textContent = maxSquad;

        setupUserListeners(code);

        // PERSISTENCE: Save Session
        localStorage.setItem('auction_session', JSON.stringify({
            code: currentRoomCode,
            role: 'user'
        }));
    } else {
        alert("Room not found.");
    }
}

// --- PERSISTENCE RESTORE ---
window.restoreSession = async (code, role) => {
    log(`Restoring Session: ${code} as ${role}`);
    const user = auth.currentUser;
    if (!user) return; // Can't restore if not logged in

    currentRoomCode = code;
    currentRole = role;

    // Fetch Room Data to Sync Config
    try {
        const snap = await get(ref(db, `rooms/${code}`));
        if (!snap.exists()) {
            console.warn("Restored room does not exist.");
            localStorage.removeItem('auction_session');
            return;
        }
        const data = snap.val();
        if (data.config) {
            totalPurse = data.config.purse;
            maxSquad = data.config.maxSquad;
            minSquad = data.config.minSquad;
        }

        if (role === 'admin') {
            getEl('admin-room-code').textContent = code;
            showAdmin();
            // If setup was done (status LIVE), show controls. Else show setup.
            if (data.status === 'LIVE') {
                hideEl('admin-setup');
                showEl('admin-controls');
            } else {
                showEl('admin-setup');
                hideEl('admin-controls');
            }
            setupAdminListeners(code);
        } else {
            showUser();
            if(getEl('my-max-squad')) getEl('my-max-squad').textContent = maxSquad;
            setupUserListeners(code);
        }
    } catch (e) {
        console.error("Restore failed", e);
    }
};

window.clearSession = () => {
    localStorage.removeItem('auction_session');
};

// --- ADMIN LOGIC ---

async function setupPlayers() {
    const input = getEl('player-list-input').value;
    const matchName = getEl('input-match-name').value.trim();
    // Game Config Inputs
    const purseVal = parseInt(getEl('input-purse').value) || 50;
    const maxVal = parseInt(getEl('input-max-squad').value) || 6;
    const minVal = parseInt(getEl('input-min-squad').value) || 5;
    const managersVal = parseInt(getEl('input-managers').value) || 4;

    if (!input.trim()) return alert("Enter players.");

    playersList = input.split('\n').filter(p => p.trim() !== '').map(p => ({
        name: p.trim(),
        sold: false
    }));

    if (playersList.length === 0) return alert("No valid players found.");

    // Save Config & Players to DB
    await update(ref(db, `rooms/${currentRoomCode}`), {
        matchName: matchName || `Room ${currentRoomCode}`,
        players: playersList,
        config: {
            purse: purseVal,
            maxSquad: maxVal,
            minSquad: minVal,
            managers: managersVal
        },
        status: "LIVE"
    });

    // Update local vars
    totalPurse = purseVal;
    maxSquad = maxVal;
    minSquad = minVal;

    // FIX: Update Host Balance to match the Purse (Auditor needs funds, but let's match generic purse or stay high?)
    // User requested: "host balance should be same as everyone"
    // So we set it to purseVal.
    const user = auth.currentUser;
    if(user) {
        await update(ref(db, `rooms/${currentRoomCode}/users/${user.uid}`), {
            balance: purseVal
        });
    }

    hideEl('admin-setup');
    showEl('admin-controls');

    // PERSISTENCE: Save Session
    localStorage.setItem('auction_session', JSON.stringify({
        code: currentRoomCode,
        role: 'admin'
    }));
}

async function spinWheel() {
    const roomSnap = await get(ref(db, `rooms/${currentRoomCode}`));
    const roomData = roomSnap.val();
    if (!roomData || !roomData.players) return;

    const unsold = roomData.players.filter(p => !p.sold);
    if (unsold.length === 0) return alert("All players sold!");

    const randomPlayer = unsold[Math.floor(Math.random() * unsold.length)];

    // Base Price is 1 Point
    await update(ref(db, `rooms/${currentRoomCode}/current_player`), {
        name: randomPlayer.name,
        basePrice: 1,
        currentBid: 0, // Starts at 0, first bid makes it 1 ?? Or starts at 1? Prompt says "Base price of 1 point".
        // Usually in auctions, it starts at base. So first bid is at least base.
        // Let's set currentBid to 0, so first button click sets it to 1.
        // OR set it to 1, and first bidder takes it at 1.
        // Let's go with: Display 1. First bid is 1. If someone bids +1, it becomes 2.
        currentBid: 1,
        highestBidderUID: null,
        highestBidderName: null
    });
}

async function sellPlayer() {
    const roomRef = ref(db, `rooms/${currentRoomCode}`);
    const snapshot = await get(roomRef);
    const data = snapshot.val();
    const currentP = data.current_player;

    if (!currentP || !currentP.highestBidderUID) {
        return alert("No active player or no bids!");
    }

    const updatedPlayers = data.players.map(p => {
        if (p.name === currentP.name) return { ...p, sold: true };
        return p;
    });

    const winnerRef = child(roomRef, `users/${currentP.highestBidderUID}`);
    const winnerSnap = await get(winnerRef);
    const winnerData = winnerSnap.val();

    if (!winnerData) return alert("Winner data not found.");

    const newBalance = (winnerData.balance || 0) - currentP.currentBid;
    const newTeam = winnerData.team ? [...winnerData.team] : [];
    newTeam.push({
        name: currentP.name,
        price: currentP.currentBid
    });

    const updates = {};
    updates[`rooms/${currentRoomCode}/players`] = updatedPlayers;
    updates[`rooms/${currentRoomCode}/users/${currentP.highestBidderUID}/balance`] = newBalance;
    updates[`rooms/${currentRoomCode}/users/${currentP.highestBidderUID}/team`] = newTeam;
    updates[`rooms/${currentRoomCode}/current_player`] = null;

    await update(ref(db), updates);
}


// --- USER LOGIC (POINTS SYSTEM) ---

async function placeBid(increment) {
    try {
        const user = auth.currentUser;
        if (!user) { log("Bid failed: No user"); return; }

        if(!currentRoomCode) { log("Bid failed: No Room Code"); return; }

        log(`Placing bid: +${increment} for ${user.displayName || user.email || user.uid}`);

        const roomRef = ref(db, `rooms/${currentRoomCode}`);
        const snapshot = await get(roomRef);
        const data = snapshot.val();

        if (!data || !data.current_player) { log("Bid failed: No active player"); return alert("No player active."); }

        // Sync config just in case
        if (data.config) {
            maxSquad = data.config.maxSquad;
            minSquad = data.config.minSquad;
        }

        const currentP = data.current_player;

        let nextBid;
        if (currentP.highestBidderUID === null) {
            // First bid.
            nextBid = increment;
            // Ensure at least base price? Base is 1. increment is 1 or 2.
            if (nextBid < currentP.basePrice) nextBid = currentP.basePrice;
        } else {
            nextBid = currentP.currentBid + increment;
        }

        log(`Bid Calc: Current=${currentP.currentBid}, Inc=${increment}, Next=${nextBid}`);

        // Check balance & Constraints
        const userRef = child(roomRef, `users/${user.uid}`);
        const userSnap = await get(userRef);
        const userData = userSnap.val();

        if(!userData) {
            log("Bid Critical Error: User Data not found in DB!");
            // Auto-fix for host?
            return alert("User data missing.");
        }

        if (currentP.highestBidderUID === user.uid) {
            return alert("You are already the highest bidder.");
        }

        const currentBalance = userData.balance;
        const currentTeamSize = userData.team ? userData.team.length : 0;

        // Host override: If isHost, maybe skip squad constraints?
        // Prompt implies Host plays as "Auditor", so they should probably follow rules OR have bypass.
        // Let's enforce rules but they have 10000 points.
        // But Host doesn't need "min squad" usually.
        // Let's Check isHost
        const isHost = userData.isHost === true;

        if (!isHost) {
            // 1. Max Squad Size Constraint
            if (currentTeamSize + 1 > maxSquad) {
                 return alert(`Squad Full! Max ${maxSquad} players.`);
            }

            // 2. Purse Preservation Constraint
            const remainingPurseInitial = currentBalance;
            const remainingPurseAfterBid = remainingPurseInitial - nextBid;

            const playersNeededForMin = Math.max(0, minSquad - (currentTeamSize + 1));
            const pointsNeededForMin = playersNeededForMin * 1;

            if (remainingPurseAfterBid < pointsNeededForMin) {
                return alert(`Cannot Bid! Need ${pointsNeededForMin} pts for remaining ${playersNeededForMin} players.`);
            }

            if (remainingPurseAfterBid < 0) {
                return alert("Insufficient funds.");
            }
        }

        // Update Bid
        log("Bid Valid. Updating DB...");
        await update(ref(db, `rooms/${currentRoomCode}/current_player`), {
            currentBid: nextBid,
            highestBidderUID: user.uid,
            highestBidderName: userData.username
        });
        log("Bid Complete.");
    } catch (e) {
        log("PlaceBid Exception: " + e.message);
        console.error(e);
        alert("Bid Error: " + e.message);
    }
}


// --- LISTENERS ---

function setupAdminListeners(code) {
    onValue(ref(db, `rooms/${code}/current_player`), (snapshot) => {
        const data = snapshot.val();
        updateCurrentPlayerUI(data, 'admin');
    });

    onValue(ref(db, `rooms/${code}/users`), (snapshot) => {
        const users = snapshot.val();
        if (users) renderAdminTeams(users);
    });
}

function setupUserListeners(code) {
    onValue(ref(db, `rooms/${code}/current_player`), (snapshot) => {
        const data = snapshot.val();
        updateCurrentPlayerUI(data, 'user');
    });

    const user = auth.currentUser;
    onValue(ref(db, `rooms/${code}/users/${user.uid}`), (snapshot) => {
        const data = snapshot.val();
        if (data) {
            getEl('user-balance').textContent = formatMoney(data.balance);
            if(getEl('my-squad-size')) {
                const size = data.team ? data.team.length : 0;
                getEl('my-squad-size').textContent = size;
            }
            renderMyTeam(data.team);
        }
    });

    onValue(ref(db, `rooms/${code}/users`), (snapshot) => {
        const users = snapshot.val();
        if (users) renderLeaderboard(users);
    });
}

// --- RENDER HELPERS ---

function updateCurrentPlayerUI(data, view) {
    if (!data) {
        if (view === 'admin') {
            getEl('current-player-name').textContent = "WAITING...";
            getEl('current-bid-display').textContent = "-";
            getEl('current-bidder-name').textContent = "None";
        } else {
            getEl('user-waiting-msg').classList.remove('hidden');
            getEl('user-active-player').classList.add('hidden');
            getEl('bidding-controls').classList.add('hidden');
        }
        return;
    }

    if (view === 'admin') {
        getEl('current-player-name').textContent = data.name;
        getEl('current-bid-display').textContent = formatMoney(data.currentBid);
        getEl('current-bidder-name').textContent = data.highestBidderName || "None";
    } else {
        getEl('user-waiting-msg').classList.add('hidden');
        getEl('user-active-player').classList.remove('hidden');
        getEl('user-player-name').textContent = data.name;
        getEl('user-current-bid').textContent = formatMoney(data.currentBid);
        getEl('user-top-bidder').textContent = data.highestBidderName || "None";
        getEl('bidding-controls').classList.remove('hidden');
    }
}

function renderAdminTeams(users) {
    const list = getEl('admin-teams-list');
    list.innerHTML = '';
    Object.values(users).forEach(u => {
        const div = document.createElement('div');
        div.style.marginBottom = '10px';
        div.style.padding = '10px';
        div.style.background = 'rgba(255,255,255,0.05)';
        const teamSize = u.team ? u.team.length : 0;
        div.innerHTML = `
            <strong>${u.username}</strong>: ${teamSize}/${maxSquad} players | Bal: ${formatMoney(u.balance)}
        `;
        list.appendChild(div);
    });
}

function renderMyTeam(team) {
    const list = getEl('my-squad-list');
    list.innerHTML = '';
    if (!team) return;
    team.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.name} (${formatMoney(p.price)})`;
        li.style.borderBottom = '1px solid #333';
        li.style.padding = '5px 0';
        list.appendChild(li);
    });
}

function renderLeaderboard(users) {
    const div = getEl('leaderboard');
    div.innerHTML = '';
    const sorted = Object.values(users).sort((a,b) => {
        const lenA = a.team ? a.team.length : 0;
        const lenB = b.team ? b.team.length : 0;
        return lenB - lenA; // Most players first
    });

    sorted.forEach(u => {
        const d = document.createElement('div');
        d.className = 'lb-item';
        d.style.display = 'flex';
        d.style.justifyContent = 'space-between';
        d.style.marginBottom = '5px';
        d.style.fontSize = '0.9rem';
        d.innerHTML = `
            <span>${u.username}</span>
            <span class="accent">${u.team ? u.team.length : 0}/${maxSquad}</span>
        `;
        div.appendChild(d);
    });
}
