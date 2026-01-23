const { test, expect } = require('@playwright/test');

test.describe('UX Glitch Reproduction', () => {
    test('Leave Auction Glitch Check', async ({ browser }) => {
        // ... existing test ...
    });

    test('Join Glitch Check', async ({ browser }) => {
        const page = await browser.newPage();
        // 1. Host Login & Create Room
        await page.goto('http://localhost:3000');
        await page.fill('#username-input', 'god');
        await page.fill('#password-input', '123456');
        await page.click('#btn-enter');
        await expect(page.locator('#lobby-view')).toBeVisible(); // WAIT FOR LOBBY
        await page.click('#btn-host');
        await expect(page.locator('#admin-view')).toBeVisible();
        
        const code = await page.locator('#admin-room-code').innerText();
        
        // 2. Bidder Joins
        const context = await browser.newContext();
        const bidderPage = await context.newPage();
        await bidderPage.goto('http://localhost:3000');
        await bidderPage.fill('#username-input', 'notgod');
        await bidderPage.fill('#password-input', '123456');
        await bidderPage.click('#btn-enter');
        await expect(bidderPage.locator('#lobby-view')).toBeVisible(); // WAIT FOR LOBBY
        
        await bidderPage.fill('#room-code-input', code);
        await bidderPage.click('#btn-join');
        
        // 3. Verify Success
        await expect(bidderPage.locator('#user-view')).toBeVisible();
        console.log("Joined. Waiting for potential crash...");
        
        // 4. Wait to see if we get kicked back to Lobby
        await bidderPage.waitForTimeout(5000); // Wait for potential refresh/redirect
        
        if (await bidderPage.locator('#lobby-view').isVisible()) {
            throw new Error("Glitch Detected: Redirected to Lobby after Join!");
        }
        
        await expect(bidderPage.locator('#user-view')).toBeVisible();
        await expect(bidderPage.locator('#auth-view')).toBeHidden();
    });
});
