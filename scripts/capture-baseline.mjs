import { chromium } from "@playwright/test";

async function captureBaseline() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Homepage
  await page.goto("http://localhost:3000/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/baseline/homepage-light.png",
    fullPage: true,
  });
  console.log("✓ Captured homepage-light.png");

  // Albums page
  await page.goto("http://localhost:3000/albums");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/baseline/albums-light.png",
    fullPage: true,
  });
  console.log("✓ Captured albums-light.png");

  // Login page
  await page.goto("http://localhost:3000/admin/login");
  await page.waitForLoadState("networkidle");
  await page.screenshot({
    path: ".sisyphus/evidence/baseline/login-light.png",
    fullPage: true,
  });
  console.log("✓ Captured login-light.png");

  await browser.close();
  console.log("\n✅ All baseline screenshots captured successfully");
}

captureBaseline().catch(console.error);
