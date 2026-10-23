/**
 * Selenium WebDriver UI test (jest runner).
 *   local Chrome (driver auto-managed by selenium-manager): npm run test:selenium
 *   Selenium Grid in docker:  docker compose -f docker-compose.yaml -f tests/docker-compose.tests.yaml --profile selenium up -d selenium
 *                             SELENIUM_REMOTE_URL=http://localhost:4444/wd/hub CLIENT_URL=http://host.docker.internal:4000 npm run test:selenium
 */
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:4000';
const ADMIN = { email: 'admin@example.com', password: 'password123' };

jest.setTimeout(60_000);

let driver;

beforeAll(async () => {
  const options = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--window-size=1280,900');
  const builder = new Builder().forBrowser('chrome').setChromeOptions(options);
  if (process.env.SELENIUM_REMOTE_URL) builder.usingServer(process.env.SELENIUM_REMOTE_URL);
  driver = await builder.build();
});

afterAll(async () => {
  if (driver) await driver.quit();
});

async function fillAndSubmitLogin(email, password) {
  await driver.get(`${CLIENT_URL}/login`);
  await driver.wait(until.elementLocated(By.css('input[type="email"]')), 15_000);
  await driver.findElement(By.css('input[type="email"]')).sendKeys(email);
  await driver.findElement(By.css('input[type="password"]')).sendKeys(password);
  await driver.findElement(By.css('button[type="submit"]')).click();
}

const toastText = async () => {
  const toast = await driver.wait(until.elementLocated(By.css('[data-sonner-toast]')), 15_000);
  return toast.getText();
};

describe('login page (Selenium)', () => {
  test('renders the sign-in form', async () => {
    await driver.get(`${CLIENT_URL}/login`);
    const heading = await driver.wait(until.elementLocated(By.xpath('//*[contains(text(),"Welcome back")]')), 15_000);
    expect(await heading.isDisplayed()).toBe(true);
  });

  test('rejects wrong credentials', async () => {
    await fillAndSubmitLogin(ADMIN.email, 'wrong-password');
    expect(await toastText()).toContain('Login failed');
  });

  test('signs in the seeded admin', async () => {
    await fillAndSubmitLogin(ADMIN.email, ADMIN.password);
    expect(await toastText()).toContain('Logged in successfully');
    await driver.wait(async () => (await driver.getCurrentUrl()) === `${CLIENT_URL}/`, 15_000);
    const token = await driver.executeScript('return window.localStorage.getItem("accessToken")');
    expect(token).toBeTruthy();
  });
});
