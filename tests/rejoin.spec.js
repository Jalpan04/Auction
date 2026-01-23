
import { test, expect } from '@playwright/test';

test.describe('Host Rejoin Logic', () => {
    test('Host regains Admin access after rejoin', async ({ browser }) => {
        const page = await browser.newPage();
        
        // 1. Host Login & Create Room
        await page.goto('http://localhost:3000');
        await page.fill('#username-input', 'god');
        await page.fill('#password-input', '123456');
        await page.click('#btn-enter');
        await expect(page.locator('#lobby-view')).toBeVisible(); 
        
        await page.click('#btn-host');
        await expect(page.locator('#admin-view')).toBeVisible();
        
        // Get Code
        const code = await page.locator('#admin-room-code').innerText();
        console.log("Room Code:", code);

        // 2. Host Leaves
        const quitBtn = page.locator('.btn-quit').first();
        await quitBtn.click();
        await expect(page.locator('#lobby-view')).toBeVisible();

        // 3. Host Re-Joins with Code
        await page.fill('#room-code-input', code);
        await page.click('#btn-join');

        // 4. VERIFY: Should be Admin View, NOT User View
        await expect(page.locator('#admin-view')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#user-view')).toBeHidden();
        
        console.log("Host successfully rejoined as Admin!");
    });
});
