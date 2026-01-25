
import fetch from 'node-fetch'; // Standard in Node 18+ usually, or use globalThis.fetch
// If node-fetch isn't available, we might use https module. 
// Assuming Node env has fetch or I'll use https.

const DB_URL = "https://myauction-app-default-rtdb.firebaseio.com";
const CODE = process.argv[2]; 

if (!CODE) { console.error("No code provided"); process.exit(1); }

console.log(`Bot Host active for Room: ${CODE}`);

async function run() {
    while(true) {
        try {
            // 1. Fetch Room State
            const res = await fetch(`${DB_URL}/rooms/${CODE}.json`);
            const room = await res.json();
            
            // 2. Fetch Players (New Structure)
            const pRes = await fetch(`${DB_URL}/room_players/${CODE}.json`);
            const players = await pRes.json();

            if(!room) { console.log("Room empty"); break; }

            // Note: Bot needs index for update. Map keys.
            let indexedPlayers = [];
             if (Array.isArray(players)) {
                indexedPlayers = players.map((p, i) => ({ ...p, key: i }));
            } else if (players) {
                indexedPlayers = Object.keys(players).map(key => ({ ...players[key], key: key }));
            }

            const unsold = indexedPlayers.filter(p => !p.sold);
            const currentP = room.current_player;

            // STATUS REPORT
            // console.log(`Unsold: ${unsold.length}, Active: ${currentP ? currentP.name : 'None'}`);

            if (!currentP && unsold.length > 0) {
                // SPIN
                const nextP = unsold[0]; // Just pick first
                console.log(`Spinning: ${nextP.name}`);
                await fetch(`${DB_URL}/rooms/${CODE}/current_player.json`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        name: nextP.name,
                        originalIndex: nextP.key,
                        basePrice: 0,
                        currentBid: 0,
                        highestBidderUID: null,
                        highestBidderName: null
                    })
                });
            } 
            else if (currentP && currentP.highestBidderUID) {
                // HAS BID -> SELL IMMEDIATELY
                console.log(`Selling ${currentP.name} to ${currentP.highestBidderName}`);
                
                // Need to update User Balance & Team
                // 1. Fetch User
                const uRes = await fetch(`${DB_URL}/rooms/${CODE}/users/${currentP.highestBidderUID}.json`);
                const user = await uRes.json();
                
                const newBalance = (user.balance || 0) - currentP.currentBid;
                const newTeam = user.team || [];
                newTeam.push({ name: currentP.name, price: currentP.currentBid });
                
                // 2. Update User
                await fetch(`${DB_URL}/rooms/${CODE}/users/${currentP.highestBidderUID}.json`, {
                    method: 'PATCH',
                    body: JSON.stringify({ balance: newBalance, team: newTeam })
                });

                // 3. Update Player List (Mark Sold) using originalIndex
                let idx = currentP.originalIndex;
                if (idx === undefined) {
                    const found = indexedPlayers.find(p => p.name === currentP.name);
                    if (found) idx = found.key;
                }

                if(idx !== undefined) {
                    await fetch(`${DB_URL}/room_players/${CODE}/${idx}/sold.json`, {
                        method: 'PUT',
                        body: 'true' // Firebase bool
                    });
                }

                // 4. Clear Active
                await fetch(`${DB_URL}/rooms/${CODE}/current_player.json`, { method: 'DELETE' });
                
                console.log("Sold & Cleared.");
            }
        
            await new Promise(r => setTimeout(r, 2000)); // Wait 2s
        } catch (e) {
            console.error("Bot Loop Error:", e);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

run();
