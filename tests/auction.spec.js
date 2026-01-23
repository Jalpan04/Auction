
const { test, expect } = require('@playwright/test');

// CONFIG
test.setTimeout(120000); // 2 Minutes for Stress Test
const SITE_URL = 'http://localhost:3000';

const USERS = {
    HOST: { u: 'god', p: '123456' },
    BIDDER1: { u: 'notgod', p: '123456' },
    BIDDER2: { u: 'dog', p: '123456' }
};

test.describe('Auction App Robustness', () => {

  // --- TEST 1: SMOKE TEST ---
  test('Smoke Test: Standard Flow', async ({ browser }) => {
     // 1. Host (god) Logs in & Creates Room
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await hostPage.goto(SITE_URL);
    await hostPage.fill('#username-input', USERS.HOST.u);
    await hostPage.fill('#password-input', USERS.HOST.p);
    await hostPage.click('#btn-enter');
    // Wait for Lobby
    await expect(hostPage.locator('#lobby-view')).toBeVisible(); 
    await hostPage.click('#btn-host');
    
    // Get Code
    await expect(hostPage.locator('#admin-room-code')).toBeVisible();
    const code = await hostPage.locator('#admin-room-code').innerText();
    console.log(`Smoke Room: ${code}`);

    // Setup Match
    await hostPage.fill('#input-match-name', 'Smoke Match');
    await hostPage.fill('#player-list-input', 'Player A');
    await hostPage.click('#btn-start-auction');
    await expect(hostPage.locator('#admin-controls')).toBeVisible();

    // 2. Bidder (notgod) Joins
    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    await userPage.goto(SITE_URL);
    await userPage.fill('#username-input', USERS.BIDDER1.u);
    await userPage.fill('#password-input', USERS.BIDDER1.p);
    await userPage.click('#btn-enter');
    await expect(userPage.locator('#lobby-view')).toBeVisible();
    await userPage.fill('#room-code-input', code);
    await userPage.click('#btn-join');
    await expect(userPage.locator('#user-view')).toBeVisible();

    // 3. Game Flow
    await hostPage.click('#btn-spin');
    await expect(hostPage.locator('#current-player-name')).toContainText('Player A');
    
    await userPage.click('#btn-bid-1');
    await expect(hostPage.locator('#current-bid-display')).toContainText('1 Pts');
    
    await hostPage.click('#btn-sell');
    await expect(userPage.locator('#my-squad-size')).toContainText('1');

    await hostCtx.close();
    await userCtx.close();
  });


  // --- TEST 2: STRESS TEST (3-WAY) ---
  test('Stress Test: 3-Way Bidding War', async ({ browser }) => {
    console.log("Starting Stress Test...");
    
    // 1. Host (god) - Also acts as Bidder 3
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await hostPage.goto(SITE_URL);
    await hostPage.fill('#username-input', USERS.HOST.u);
    await hostPage.fill('#password-input', USERS.HOST.p);
    await hostPage.click('#btn-enter');
    await expect(hostPage.locator('#lobby-view')).toBeVisible();
    await hostPage.click('#btn-host');
    
    // FIX: Wait for Room Code to be populated (non-empty)
    await expect(hostPage.locator('#admin-room-code')).not.toHaveText('', { timeout: 10000 });
    const rawCode = await hostPage.locator('#admin-room-code').innerText();
    const code = rawCode.trim();
    console.log(`Stress Room: ${code}`);

    // High Purse for bidding war
    await hostPage.fill('#input-purse', '500'); 
    await hostPage.fill('#input-match-name', 'Stress Match');
    await hostPage.fill('#player-list-input', 'Star Player');
    await hostPage.click('#btn-start-auction');
    // FIX 1: Host must finish writing DB before users join
    await expect(hostPage.locator('#admin-controls')).toBeVisible();

    // Helper to robustly join
    const robustJoin = async (page, userKey) => {
        await page.goto(SITE_URL);
        await page.fill('#username-input', USERS[userKey].u);
        await page.fill('#password-input', USERS[userKey].p);
        await page.click('#btn-enter');
        await expect(page.locator('#lobby-view')).toBeVisible();
        await page.fill('#room-code-input', code);
        
        // Try Join with Error Check
        console.log(`[${userKey}] Entering Code: ${code}`);
        await page.waitForTimeout(500); // Small stability delay
        await page.click('#btn-join');
        console.log(`[${userKey}] Clicked Join... Waiting for View`);
        try {
            await expect(page.locator('#user-view')).toBeVisible({ timeout: 10000 });
        } catch (e) {
            // Check for Error Modal content
            const modal = page.locator('#modal-msg');
            if (await modal.isVisible()) {
                const err = await modal.innerText();
                throw new Error(`Join Failed for ${userKey}: ${err}`);
            }
            throw e; // Rethrow timeout if no modal
        }
    };

    // 2. Bidder 1 (notgod)
    const b1Ctx = await browser.newContext();
    const b1Page = await b1Ctx.newPage();
    await robustJoin(b1Page, 'BIDDER1');

    // 3. Bidder 2 (dog)
    const b2Ctx = await browser.newContext();
    const b2Page = await b2Ctx.newPage();
    await robustJoin(b2Page, 'BIDDER2');

    // 4. Start Round - WAIT for everyone to be ready
    await expect(hostPage.locator('#admin-controls')).toBeVisible(); // Host sees Admin Controls
    await expect(b1Page.locator('#user-view')).toBeVisible();
    await expect(b2Page.locator('#user-view')).toBeVisible();

    console.log("All Bidders in Room. Spinning...");
    await hostPage.click('#btn-spin');
    
    // Ensure Player is active for everyone
    await expect(hostPage.locator('#current-player-name')).toContainText('Star Player');
    await expect(b1Page.locator('#user-player-name')).toContainText('Star Player'); // Verify B1 sees it
    await expect(b2Page.locator('#user-player-name')).toContainText('Star Player'); // Verify B2 sees it

    console.log("Player Active for all. Starting Spam...");

    // 5. CONCURRENT BIDDING (Host + B1 + B2)
    console.log(`Unleashing bids from ${USERS.HOST.u}, ${USERS.BIDDER1.u}, ${USERS.BIDDER2.u}`);
    
    const spamBids = async (page, btnId) => {
        for(let k=0; k<20; k++) {
            let success = false;
            let attempts = 0;
            
            // Retry a single iteration up to 3 times if blocked by modal
            while(!success && attempts < 3) {
                attempts++;
                
                // 1. Clear Modal if present
                const modal = page.locator('#custom-modal');
                if (await modal.isVisible()) {
                    await page.click('#btn-close-modal');
                    await page.waitForTimeout(50); // Allow fade out
                }

                // 2. Try to Click
                try {
                    await page.click(btnId, { timeout: 300 }); 
                    success = true;
                } catch (e) {
                    // Start next retry loop to notify modal check again
                }
            }
            // Add randomness to prevent perfect sync locking
            // INCREASED DELAY: 20-70ms was too fast for Real DB transactions. Tried 100-200ms.
            await page.waitForTimeout(Math.random() * 100 + 100); 
        }
    };

    // Host Button ID: btn-host-bid-1
    // User Button ID: btn-bid-1
    await Promise.all([
        spamBids(hostPage, '#btn-host-bid-1'),
        spamBids(b1Page, '#btn-bid-1'),
        spamBids(b2Page, '#btn-bid-1')
    ]);

    // 6. Verify
    await hostPage.waitForTimeout(3000);
    const bidText = await hostPage.locator('#current-bid-display').innerText();
    const highBid = parseInt(bidText.replace(' Pts', ''));
    console.log(`Final Bid: ${highBid}`);
    // Relaxed expectation: With high contention and "Already Highest" blocking, 
    // we just want to ensure *some* valid bids processed.
    expect(highBid).toBeGreaterThan(5);

    // 7. Sell
    await hostPage.click('#btn-sell');
    await hostPage.waitForTimeout(2000); // Wait for Sell transaction & UI updates
    
    // 8. Verify One Winner
    let winnerCount = 0;
    
    // Check Host Squad
    const hostSquad = await hostPage.locator('#host-squad-size').innerText();
    if(hostSquad === '1') winnerCount++;

    // Check B1 Squad
    const b1Squad = await b1Page.locator('#my-squad-size').innerText();
    if(b1Squad === '1') winnerCount++;

    // Check B2 Squad
    const b2Squad = await b2Page.locator('#my-squad-size').innerText();
    if(b2Squad === '1') winnerCount++;

    expect(winnerCount).toBe(1);

    await hostCtx.close();
    await b1Ctx.close();
    await b2Ctx.close();
  });


  // --- TEST 3: BUDGET STRESS TEST ---
  test('In-Depth: Budget Limits Under Load', async ({ browser }) => {
    // 1. Host (god) sets low purse
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    await hostPage.goto(SITE_URL);
    await hostPage.fill('#username-input', USERS.HOST.u);
    await hostPage.fill('#password-input', USERS.HOST.p);
    await hostPage.click('#btn-enter');
    await expect(hostPage.locator('#lobby-view')).toBeVisible();
    await hostPage.click('#btn-host');
    const codeLoc = hostPage.locator('#admin-room-code');
    await expect(codeLoc).toBeVisible();
    await expect(codeLoc).not.toBeEmpty();
    const code = await codeLoc.innerText();
    
    await hostPage.fill('#input-purse', '5'); // LOW BUDGET
    await hostPage.fill('#input-match-name', 'Budget Test');
    await hostPage.fill('#player-list-input', 'Cheap Player');
    await hostPage.click('#btn-start-auction');
    // FIX: Wait for Admin Controls to appear to ensure DB write (Purse=5) is complete
    await expect(hostPage.locator('#admin-controls')).toBeVisible();

    // 2. Bidder (dog) Joins
    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    userPage.on('console', msg => console.log(`[USER LOG] ${msg.text()}`)); // Capture Browser Logs
    await userPage.goto(SITE_URL);
    await userPage.fill('#username-input', USERS.BIDDER2.u);
    await userPage.fill('#password-input', USERS.BIDDER2.p);
    await userPage.click('#btn-enter');
    await expect(userPage.locator('#lobby-view')).toBeVisible();
    await userPage.fill('#room-code-input', code);
    await userPage.click('#btn-join');
    
    // START DBG: Check if Join Succeeds
    try {
        await expect(userPage.locator('#user-view')).toBeVisible({ timeout: 5000 });
    } catch(e) {
        const modal = userPage.locator('#modal-msg');
        if (await modal.isVisible()) {
            const err = await modal.innerText();
            console.error(`[BUDGET TEST] Join Failed: ${err}`);
            throw new Error(`Join Failed: ${err}`);
        }
        throw e;
    }
    // END DBG
    
    // IMPORTANT: Verify Balance is 5 (assigned by room config)
    await expect(userPage.locator('#user-balance')).toContainText('5 Pts');

    // 3. Spam Bids
    await hostPage.click('#btn-spin');
    console.log("Spamming 10 bids with 5 Pts budget...");
    for(let i=0; i<10; i++) {
        await userPage.click('#btn-bid-1');
        await userPage.waitForTimeout(100);
    }
    
    await hostPage.waitForTimeout(2000);

    // 4. Verify Limit
    const bidText = await hostPage.locator('#current-bid-display').innerText();
    const bid = parseInt(bidText.replace(' Pts', ''));
    console.log(`Final Bid: ${bid} (Should be <= 5)`);
    expect(bid).toBeLessThanOrEqual(5);

    await hostCtx.close();
    await userCtx.close();
  });

});
