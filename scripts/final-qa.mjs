import { chromium } from "@playwright/test";

async function finalQA() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  console.log("🔍 Running Final QA - Dark Mode Implementation\n");

  // Light mode regression check - Homepage
  console.log("📸 Light mode regression - Homepage");
  await page.goto("http://localhost:3000/");
  await page.emulateMedia({ colorScheme: "light" });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/final/homepage-light.png",
    fullPage: true,
  });
  console.log("✓ Captured .sisyphus/evidence/final/homepage-light.png\n");

  // Dark mode - Homepage
  console.log("📸 Dark mode - Homepage");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForTimeout(500); // Allow CSS transition
  await page.screenshot({
    path: ".sisyphus/evidence/final/homepage-dark.png",
    fullPage: true,
  });

  // Verify dark mode CSS variables
  const bgColor = await page.evaluate(() => {
    return getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
  });
  console.log(`  --background: ${bgColor} (expected: #1e1e1e)`);
  console.log("✓ Captured .sisyphus/evidence/final/homepage-dark.png\n");

  // Dark mode - Albums page
  console.log("📸 Dark mode - Albums page");
  await page.goto("http://localhost:3000/albums");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/final/albums-dark.png",
    fullPage: true,
  });
  console.log("✓ Captured .sisyphus/evidence/final/albums-dark.png\n");

  // Dark mode - Login page
  console.log("📸 Dark mode - Login page");
  await page.goto("http://localhost:3000/admin/login");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/final/login-dark.png",
    fullPage: true,
  });

  // Verify login button is visible
  const buttonBg = await page.evaluate(() => {
    const button = document.querySelector('button[type="submit"]');
    return getComputedStyle(button).backgroundColor;
  });
  console.log(`  Login button background: ${buttonBg}`);
  console.log("✓ Captured .sisyphus/evidence/final/login-dark.png\n");

  // Verify color-scheme property
  console.log("🔍 Verifying color-scheme property");
  const colorScheme = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).colorScheme;
  });
  console.log(`  color-scheme: ${colorScheme} (expected: light dark)`);

  // Verify theme-color meta tags
  const metaTags = await page.evaluate(() => {
    const lightMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: light)"]',
    );
    const darkMeta = document.querySelector(
      'meta[name="theme-color"][media="(prefers-color-scheme: dark)"]',
    );
    return {
      light: lightMeta?.getAttribute("content"),
      dark: darkMeta?.getAttribute("content"),
    };
  });
  console.log(`  theme-color (light): ${metaTags.light}`);
  console.log(`  theme-color (dark): ${metaTags.dark}\n`);

  await browser.close();
  console.log("✅ Final QA Complete - All screenshots captured");
}

finalQA().catch(console.error);
