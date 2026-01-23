import { db, ref, set, get, onValue, update, push, child, runTransaction } from './firebase-config.js';
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

// Custom Modal Helper
function showModal(msg, title="Attention") {
    const modal = document.getElementById('custom-modal');
    const msgEl = document.getElementById('modal-msg');
    const titleEl = document.getElementById('modal-title');
    if(modal && msgEl) {
        msgEl.innerHTML = msg; // Allow HTML for formatting
        if(titleEl) titleEl.textContent = title;
        modal.style.display = 'flex';
    } else {
        alert(msg); // Fallback
    }
}

// Global Event Delegation for Auction Controls
window.addEventListener('click', (e) => {
    // MODAL CLOSE
    if(e.target.id === 'btn-close-modal') {
        document.getElementById('custom-modal').style.display = 'none';
        return;
    }

    // Robus Click Handling: Check closest button if target isn't the button itself
    const btn = e.target.closest('button') || e.target;
    const id = btn.id;
    
    if(window.logDebug && id) window.logDebug("Auction Listener: " + id);
    
    if (!id) return;

    if (id === 'btn-host') hostAuction();
    if (id === 'btn-join') {
        if(window.logDebug) window.logDebug("Auction: Join Clicked (Global)");
        joinAuction().catch(err => {
            console.error("Join Failed:", err);
            if(window.logDebug) window.logDebug("Join Crash: " + err.message);
            showModal("Join Error: " + err.message);
        });
    }
    
    // Admin
    if (id === 'btn-start-auction') setupPlayers();
    if (id === 'btn-spin') spinWheel();
    if (id === 'btn-sell') sellPlayer();
    
    // Host Betting
    if (id === 'btn-host-bid-1') { log("Click: Host Bid 1"); placeBid(1); }

    // Admin Export
    if (id === 'btn-export') exportToCSV();

    // User
    if (id === 'btn-bid-1') placeBid(1);
});

async function exportToCSV() {
    try {
        const snap = await get(ref(db, `rooms/${currentRoomCode}/users`));
        if (!snap.exists()) return showModal("No data to export.");

        const users = snap.val();
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Owner Name,Player Name,Price (Pts)\n";

        Object.values(users).forEach(u => {
            const safeOwner = u.username.replace(/,/g, '');
            
            if (u.team && u.team.length > 0) {
                u.team.forEach((p, index) => {
                    // Visual Grouping: Only show owner name on the first row
                    const ownerDisplay = index === 0 ? safeOwner : ""; 
                    const safePlayer = p.name.replace(/,/g, '');
                    csvContent += `${ownerDisplay},${safePlayer},${p.price}\n`;
                });
                // Gap between teams (Owners)
                csvContent += ",,\n";
            } else {
                 csvContent += `${safeOwner},No Players,0\n,,\n`;
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `auction_results_${currentRoomCode}.csv`);
        document.body.appendChild(link); // Required for FF
        link.click();
        document.body.removeChild(link);

    } catch (e) {
        console.error("Export failed", e);
        showModal("Export failed: " + e.message);
    }
}

// Load History on Lobby Show
// We can't export this easily to app.js without circular dep on showLobby.
// So we'll rely on app.js calling a global or just hook it here if we can detect Lobby state?
// Better: Add a listener for when Lobby is shown.
// For now, let's just run it periodically or when we return to lobby.
// Let's expose a function `loadHistory` that app.js can call.
// Load History with Reverse Sort
window.loadAuctionHistory = async () => {
    const list = getEl('past-matches-list');
    if(!list) return;

    try {
        const snap = await get(ref(db, 'rooms'));
        if (snap.exists()) {
            const rooms = snap.val();
            list.innerHTML = '';
            // Sort keys descending (Newest First assuming timestamp-based or sequential keys)
            // Firebase push keys are timestamp-based.
            const sortedKeys = Object.keys(rooms).sort().reverse();

            sortedKeys.forEach(key => {
                const r = rooms[key];
                const status = r.status || "WAITING";
                const matchName = r.matchName || `Room ${key}`;
                
                let dateStr = "";
                if(r.createdAt) {
                    const d = new Date(r.createdAt);
                    dateStr = d.toLocaleDateString() + " " + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                }

                const li = document.createElement('li');
                li.style.borderBottom = '1px solid #333';
                li.style.padding = '8px 0';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.cursor = 'pointer';
                li.innerHTML = `
                    <div style="display:flex; flex-direction:column;">
                        <span><strong class="accent">${matchName}</strong></span>
                        <span style="font-size:0.7rem; color:#666;">${dateStr}</span>
                    </div>
                    <span style="font-size:0.8rem; align-self:center;">${status}</span>
                `;
                li.onclick = () => {
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
        
        // Add Host as user so they can place bids
        const name = user.displayName || (user.email ? user.email.split('@')[0] : "Host");
        await set(ref(db, `rooms/${code}/users/${user.uid}`), {
            username: `${name} (Host)`,
            balance: totalPurse, // Set to default purse (50) initially
            team: [],
            isHost: true
        });

        currentRoomCode = code;
        currentRole = 'admin';
        getEl('admin-room-code').textContent = code;
        
        // REVEAL ROOM CODE IMMEDIATELY
        const codeHeader = getEl('admin-room-codes-header');
        if(codeHeader) codeHeader.classList.remove('hidden');

        showAdmin();
        setupAdminListeners(code);
    } catch (e) {
        log("Host failed: " + e.message);
        alert("Could not create room.");
    }
}

async function joinAuction() {
    log("joinAuction() called"); // DEBUG
    const codeInput = getEl('room-code-input');
    if(!codeInput) return alert("Internal Error: Input missing");
    
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return showModal("Please enter a room code.", "Input Error");

    const user = auth.currentUser;
    if (!user) {
        log("Join failed: No currentUser");
        return alert("Must be logged in.");
    }

    log(`Attempting join: ${code}`);

    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
        const roomData = snapshot.val();
        log("Room found. Config: " + JSON.stringify(roomData.config || {}));
        
        currentRoomCode = code;
        
        // CHECK IF I AM THE HOST
        if (roomData.admin === user.uid) {
            currentRole = 'admin';
            console.log("Welcome back, Host!");
        } else {
            currentRole = 'user';
        }
        
        // Initialize Game Params
        if (roomData.config) {
            totalPurse = parseInt(roomData.config.purse) || 50; 
            maxSquad = roomData.config.maxSquad || 6;
            minSquad = roomData.config.minSquad || 5;
        }

        const roomUserRef = ref(db, `rooms/${code}/users/${user.uid}`);
        
        const userSnap = await get(roomUserRef);
        // Only initialize if NEW user. Hosts already have data.
        if (!userSnap.exists()) {
             await update(roomUserRef, {
                username: user.email ? user.email.split('@')[0] : "AnonymousUser", 
                balance: totalPurse, 
                team: []
            });
        }

        // ROUTE BASED ON ROLE
        if (currentRole === 'admin') {
            getEl('admin-room-code').textContent = code;
            const codeHeader = getEl('admin-room-codes-header');
            if(codeHeader) codeHeader.classList.remove('hidden');
            
            showAdmin();
            setupAdminListeners(code);
        } else {
            showUser();
            if(getEl('my-max-squad')) getEl('my-max-squad').textContent = maxSquad;
            setupUserListeners(code);
        }
        
        // PERSISTENCE: Save Session
        localStorage.setItem('auction_session', JSON.stringify({
            code: currentRoomCode,
            role: currentRole
        }));
    } else {
        showModal("Room not found. Please check the code.", "Join Error");
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
                
                // REVEAL UI if LIVE (Persistence)
                const sidebar = getEl('admin-sidebar');
                if(sidebar) sidebar.classList.remove('hidden');
                const codeHeader = getEl('admin-room-codes-header');
                if(codeHeader) codeHeader.classList.remove('hidden');

            } else {
                hideEl('admin-setup'); // Wait, if not live, show setup?
                // The logical flow was: if not live, show setup.
                showEl('admin-setup');
                hideEl('admin-controls');
                
                // Ensure Hidden if not live
                const sidebar = getEl('admin-sidebar');
                if(sidebar) sidebar.classList.add('hidden');
                const codeHeader = getEl('admin-room-codes-header');
                if(codeHeader) codeHeader.classList.add('hidden');
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
    console.log("setupPlayers: CLICKED");
    const input = getEl('player-list-input').value;
    const matchName = getEl('input-match-name').value.trim();
    
    // Validation: Match Name is Mandatory
    if (!matchName) {
        console.log("setupPlayers: No match name");
        return showModal("Please enter a <b>Match Name</b>.<br>This will be displayed in the lobby.", "Match Name Required");
    }

    // Game Config Inputs
    const purseVal = parseInt(getEl('input-purse').value) || 50;
    console.log(`[DEBUG] setupPlayers Purse Input: ${getEl('input-purse').value}, Parsed: ${purseVal}`); // DEBUG LOG
    const maxVal = parseInt(getEl('input-max-squad').value) || 6;
    const minVal = parseInt(getEl('input-min-squad').value) || 5;
    const managersVal = parseInt(getEl('input-managers').value) || 4;

    if (!input.trim()) {
        console.log("setupPlayers: No player input");
        return showModal("Please ensure your <b>Player List</b> is not empty.", "Missing Players");
    }

    playersList = input.split('\n').filter(p => p.trim() !== '').map(p => ({
        name: p.trim(),
        sold: false
    }));

    if (playersList.length === 0) {
        console.log("setupPlayers: No valid players parsed");
        return showModal("No valid players found in the list.", "Player List Error");
    }

    // Save Config & Players to DB
    console.log("setupPlayers: Updating DB for Room: " + currentRoomCode);
    try {
        await update(ref(db, `rooms/${currentRoomCode}`), {
            matchName: matchName,
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

        // FIX: Update Host Balance to match the Purse
        const user = auth.currentUser;
        if(user) {
            await update(ref(db, `rooms/${currentRoomCode}/users/${user.uid}`), {
                balance: purseVal 
            });
        }

        hideEl('admin-setup');
        showEl('admin-controls');
        
        // REVEAL UI ELEMENTS on START
        const sidebar = getEl('admin-sidebar');
        if(sidebar) sidebar.classList.remove('hidden');

        const codeHeader = getEl('admin-room-codes-header');
        if(codeHeader) codeHeader.classList.remove('hidden');

        // PERSISTENCE: Save Session
        localStorage.setItem('auction_session', JSON.stringify({
            code: currentRoomCode,
            role: 'admin'
        }));
    } catch(err) {
        console.error("setupPlayers Failed:", err);
        showModal("Setup Failed: " + err.message);
    }
}

async function spinWheel() {
    const roomSnap = await get(ref(db, `rooms/${currentRoomCode}`));
    const roomData = roomSnap.val();
    if (!roomData || !roomData.players) return;

    const unsold = roomData.players.filter(p => !p.sold);
    if (unsold.length === 0) return alert("All players sold!");

    const randomPlayer = unsold[Math.floor(Math.random() * unsold.length)];

    // Base Price is 0 Points (User Request)
    await update(ref(db, `rooms/${currentRoomCode}/current_player`), {
        name: randomPlayer.name,
        basePrice: 0, 
        currentBid: 0, 
        highestBidderUID: null,
        highestBidderName: null
    });
}

async function sellPlayer() {
    const btn = document.getElementById('btn-sell');
    if(btn) btn.disabled = true; // Prevent Double Clicking UI Side

    const roomRef = ref(db, `rooms/${currentRoomCode}`);

    try {
        await runTransaction(roomRef, (roomData) => {
            // CRITICAL FIX: If roomData is null (not cached), return it to trigger server retry.
            // Returning undefined aborts the transaction!
            if (roomData === null) return roomData; 
            
            const currentP = roomData.current_player;
            if (!currentP || !currentP.highestBidderUID) {
                // Abort transaction if no active player/bidder
                return; 
            }

            // Find Winner
            const winnerId = currentP.highestBidderUID;
            const users = roomData.users || {};
            const winner = users[winnerId];

            if (!winner) return; // Should not happen

            // Deduct Balance
            winner.balance = (winner.balance || 0) - currentP.currentBid;
            
            // Add to Team
            if (!winner.team) winner.team = [];
            winner.team.push({
                name: currentP.name,
                price: currentP.currentBid
            });

            // Mark Player as Sold
            if (roomData.players) {
                roomData.players = roomData.players.map(p => {
                    if (p.name === currentP.name) return { ...p, sold: true };
                    return p;
                });
            }

            // Clear Current Player
            roomData.current_player = null;

            return roomData; // Commit
        });
        
        // Success
        console.log("Transaction Committed: Player Sold");

    } catch (e) {
        console.error("Sell Transaction Failed", e);
        showModal("Sell failed: " + e.message);
    } finally {
        if(btn) btn.disabled = false;
    }
}


// --- USER LOGIC (POINTS SYSTEM) ---

async function placeBid(increment) {
    const user = auth.currentUser;
    if (!user) { log("Bid failed: No user"); return; }
    if(!currentRoomCode) { log("Bid failed: No Room Code"); return; }

    const roomRef = ref(db, `rooms/${currentRoomCode}`);

    try {
        await runTransaction(roomRef, (roomData) => {
            // 1. Data Integrity Check
            if (roomData === null) return roomData; // Retry
            
            const currentP = roomData.current_player;
            if (!currentP) return; // Abort if no active player

            // 2. Determine Next Bid
            let nextBid;
            if (currentP.highestBidderUID === null) {
                // First bid
                nextBid = currentP.basePrice > 0 ? currentP.basePrice : increment;
                 // If increment + 0 < basePrice? Logic:
                 // If base 0, next is 1.
                 // If base 100, next is 100 (if we treat first bid as accepting base).
                 // Let's stick to simple logic: Max(base, increment/current+inc)
                 if (nextBid < currentP.basePrice) nextBid = currentP.basePrice;
            } else {
                nextBid = currentP.currentBid + increment;
            }

            // 3. User Validation (from Transaction Data)
            const users = roomData.users || {};
            const userData = users[user.uid];

            if (!userData) return; // User missing in room?

            // 4. Constraint: Already Highest
            if (currentP.highestBidderUID === user.uid) {
                // We cannot return an error message to the UI from inside the transaction easily
                // We just abort the update.
                // Or we can throw? throwing aborts and we catch it.
                // let's just abort.
                return; 
            }

            // 5. Constraints: Balance & Squad
            const currentBalance = userData.balance || 0;
            const currentTeamSize = userData.team ? userData.team.length : 0;
            const roomConfig = roomData.config || {};
            const rMaxSquad = roomConfig.maxSquad || 6;
            const rMinSquad = roomConfig.minSquad || 5;

            // Squad Full?
            if (currentTeamSize + 1 > rMaxSquad) return; 

            // Balance Check
            const remaining = currentBalance - nextBid;
            if (remaining < 0) return;

            // Min Purse Preservation
            const playersNeeded = Math.max(0, rMinSquad - (currentTeamSize + 1));
            const pointsNeeded = playersNeeded * 1;
            if (remaining < pointsNeeded) return;

            // 6. APPLY UPDATE
            roomData.current_player.currentBid = nextBid;
            roomData.current_player.highestBidderUID = user.uid;
            roomData.current_player.highestBidderName = userData.username;

            return roomData;
        });
        
        // Transaction Success
        log(`Bid Transaction Complete`);

    } catch (e) {
        log("PlaceBid Transaction Failed: " + e.message);
        // showModal("Bid Failed: " + e.message); // Transactions retry silent mostly
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
        if (users) {
            renderAdminTeams(users);
            renderHostSquad(users); // NEW: Update Host's personal squad view
        }
    });

    onValue(ref(db, `rooms/${code}/players`), (snapshot) => {
        const players = snapshot.val();
        if(players) renderUnsoldPlayers(players, 'admin');
    });
}

function renderHostSquad(users) {
    const currentUser = auth.currentUser;
    if(!currentUser) return;
    
    // Find Host Data
    const hostData = users[currentUser.uid];
    if(hostData) {
        if(getEl('host-max-squad')) getEl('host-max-squad').textContent = maxSquad;
        if(getEl('host-squad-size')) {
            const size = hostData.team ? hostData.team.length : 0;
            getEl('host-squad-size').textContent = size;
        }

        const list = getEl('host-squad-list');
        if(list) {
            list.innerHTML = '';
            if (hostData.team) {
                hostData.team.forEach(p => {
                    const li = document.createElement('li');
                    li.textContent = `${p.name} (${formatMoney(p.price)})`;
                    li.style.borderBottom = '1px solid #333';
                    li.style.padding = '5px 0';
                    list.appendChild(li);
                });
            }
        }
    }
}

function setupUserListeners(code) {
    const user = auth.currentUser;
    if (!user) return;
 

    onValue(ref(db, `rooms/${code}/current_player`), (snapshot) => {
        const data = snapshot.val();
        updateCurrentPlayerUI(data, 'user');
    });

    onValue(ref(db, `rooms/${code}/players`), (snapshot) => {
        const players = snapshot.val();
        if (players) {
            renderUnsoldPlayers(players, 'user');
        }
    });

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
        div.style.marginBottom = '15px';
        div.style.padding = '10px';
        div.style.background = 'rgba(255,255,255,0.05)';
        div.style.borderRadius = '8px';
        
        const teamSize = u.team ? u.team.length : 0;
        const playerNames = u.team ? u.team.map(p => `<div style="font-size:0.85rem; color:#aaa; margin-left:10px;">• ${p.name} (${formatMoney(p.price)})</div>`).join('') : '<div style="font-size:0.8rem; color:#666; margin-left:10px;">No players</div>';

        div.innerHTML = `
            <div style="margin-bottom:5px;">
                <strong style="color:var(--accent-color);">${u.username}</strong>
                <div style="font-size:0.8rem;">${teamSize}/${maxSquad} | Bal: ${formatMoney(u.balance)}</div>
            </div>
            <div>${playerNames}</div>
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
        d.style.marginBottom = '10px';
        d.style.padding = '10px';
        d.style.background = 'rgba(255,255,255,0.05)';
        d.style.borderRadius = '8px';
        
        const playerNames = u.team ? u.team.map(p => `<div style="font-size:0.8rem; color:#aaa; margin-left:10px;">• ${p.name} (${formatMoney(p.price)})</div>`).join('') : '';

        d.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:5px;">
                <span>${u.username}</span>
                <span class="accent">${u.team ? u.team.length : 0}/${maxSquad}</span>
            </div>
            <div>${playerNames}</div>
        `;
        div.appendChild(d);
    });
}

function renderUnsoldPlayers(players, role) {
    // Filter Unsold
    const unsold = players.filter(p => !p.sold).sort((a,b) => a.name.localeCompare(b.name));
    
    let countId, listId;
    if (role === 'admin') {
        countId = 'host-unsold-count';
        listId = 'host-unsold-list';
    } else {
        countId = 'user-unsold-count';
        listId = 'user-unsold-list';
    }

    const countEl = getEl(countId);
    const listEl = getEl(listId);

    if (countEl) countEl.textContent = unsold.length;
    
    if (listEl) {
        listEl.innerHTML = '';
        unsold.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name;
            li.style.borderBottom = '1px solid #333';
            li.style.padding = '5px 0';
            li.style.color = '#aaa';
            listEl.appendChild(li);
        });
    }
}
