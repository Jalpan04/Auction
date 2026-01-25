
const { test, expect } = require('@playwright/test');

// CONFIG
// Increase timeout for slow Firebase ops
test.setTimeout(60000); 

const SITE_URL = 'http://localhost:3000'; // Or your deployed URL

test('Full Auction Cycle', async ({ browser }) => {
  // --- ACTOR 1: HOST ---
  const hostContext = await browser.newContext();
  const hostPage = await hostContext.newPage();
  
  await hostPage.goto(SITE_URL);
  
  // Login Host
  await hostPage.fill('#username-input', 'HostUser');
  await hostPage.fill('#password-input', 'password123');
  await hostPage.click('#tab-login'); // Ensure tab
  await hostPage.click('#btn-enter');
  
  // Host creates room
  await expect(hostPage.locator('#lobby-view')).toBeVisible({ timeout: 10000 });
  await hostPage.click('#btn-host');
  
  // Get Room Code
  await expect(hostPage.locator('#admin-room-code')).toBeVisible();
  const code = await hostPage.locator('#admin-room-code').innerText();
  console.log(`Test Room Code: ${code}`);

  // Setup Players
  await hostPage.fill('#input-match-name', 'Test Case Match');
  await hostPage.fill('#player-list-input', 'Player A\nPlayer B\nPlayer C');
  await hostPage.click('#btn-start-auction');
  
  // Verify Host is in Control View
  await expect(hostPage.locator('#admin-controls')).toBeVisible();

  // --- ACTOR 2: USER ---
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  
  await userPage.goto(SITE_URL);
  
  // Login User
  await userPage.fill('#username-input', 'BidderOne');
  await userPage.fill('#password-input', 'password123');
  await userPage.click('#btn-enter');
  
  // Join Room
  await expect(userPage.locator('#lobby-view')).toBeVisible({ timeout: 10000 });
  await userPage.fill('#room-code-input', code);
  await userPage.click('#btn-join');
  
  // Verify User Joined
  await expect(userPage.locator('#user-view')).toBeVisible();
  await expect(userPage.locator('#user-waiting-msg')).toBeVisible();

  // --- INTERACTION ---
  
  // 1. Host Spins
  await hostPage.click('#btn-spin');
  
  // 2. Verify Player shows up for both
  await expect(hostPage.locator('#current-player-name')).not.toContainText('WAITING');
  await expect(userPage.locator('#user-player-name')).not.toContainText('PLAYER NAME'); // Should update
  
  // 3. User Bids
  await userPage.click('#btn-bid-1');
  
  // 4. Verify Bid Update
  await expect(hostPage.locator('#current-bid-display')).toContainText('1 Pts');
  await expect(userPage.locator('#user-current-bid')).toContainText('1 Pts');

  // 5. Host Sells
  await hostPage.click('#btn-sell');
  
  // 6. Verify Transaction
  // User balance should be 49 (50 - 1)
  await expect(userPage.locator('#user-balance')).toContainText('49 Pts');
  
  // User should have 1 player
  await expect(userPage.locator('#my-squad-size')).toContainText('1');

  // --- CLEANUP ---
  await hostContext.close();
  await userContext.close();
});
