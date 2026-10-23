import { expect, test } from '@playwright/test';

const API = process.env.API_URL ?? 'http://localhost:3000';
const TEMPO = process.env.TEMPO_URL ?? 'http://localhost:3200';
const ADMIN = { email: 'admin@example.com', password: 'password123' };

test.describe('authentication (UI -> gateway -> auth-service -> postgres)', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Welcome back')).toBeVisible();
    await expect(page.getByPlaceholder('you@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeEnabled();
  });

  test('client-side validation blocks an invalid e-mail', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('not-an-email');
    await page.getByPlaceholder('your password').fill('password123');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Invalid email address')).toBeVisible();
  });

  test('wrong credentials show an error toast', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(ADMIN.email);
    await page.getByPlaceholder('your password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByText('Login failed')).toBeVisible();
  });

  test('seeded admin can sign in and receives a JWT', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(ADMIN.email);
    await page.getByPlaceholder('your password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Logged in successfully')).toBeVisible();
    await expect(page).toHaveURL('/');
    const token = await page.evaluate(() => localStorage.getItem('accessToken'));
    expect(token).toBeTruthy();
  });

  test('new user can register and is sent to the login page', async ({ page }) => {
    const email = `pw-${Date.now()}@example.com`;
    await page.goto('/register');
    await page.getByPlaceholder('Your name').fill('Playwright User');
    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('your password', { exact: true }).fill('Passw0rd!123');
    await page.getByPlaceholder('confirm your password').fill('Passw0rd!123');
    await page.getByRole('button', { name: /sign up|register|create/i }).click();

    await expect(page.getByText('Registered successfully')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('observability from the browser', () => {
  test('a UI login produces a trace in Tempo (x-trace-id exposed through CORS)', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill(ADMIN.email);
    await page.getByPlaceholder('your password').fill(ADMIN.password);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/login` && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Sign In' }).click(),
    ]);
    const traceId = response.headers()['x-trace-id'];
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);

    await expect
      .poll(async () => (await request.get(`${TEMPO}/api/traces/${traceId}`, { headers: { accept: 'application/json' } })).status(), {
        timeout: 60_000,
        intervals: [2_000],
      })
      .toBe(200);
  });
});
