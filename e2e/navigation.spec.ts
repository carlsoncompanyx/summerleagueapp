import { expect, test } from '@playwright/test';

test('home returns content with league name', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('Emerald Coast Roller League')).toBeVisible();
});

test('schedule tab navigates to /schedule and shows Schedule heading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-schedule').click();
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
});

test('standings tab navigates to /standings and shows Standings heading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-standings').click();
  await expect(page).toHaveURL(/\/standings$/);
  await expect(page.getByRole('heading', { name: 'Standings' })).toBeVisible();
});

test('chat tab navigates to /chat and shows Shit Talk heading', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-chat').click();
  await expect(page).toHaveURL(/\/chat$/);
  await expect(page.getByRole('heading', { name: 'Shit Talk' })).toBeVisible();
});

test('betting tab shows login for unauthenticated users', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('tab-betting').click();
  await expect(page).toHaveURL(/\/betting$/);
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
});
