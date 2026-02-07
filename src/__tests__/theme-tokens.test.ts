import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("Theme Tokens", () => {
  let cssContent: string;

  beforeAll(() => {
    const cssPath = resolve(__dirname, "../app/globals.css");
    cssContent = readFileSync(cssPath, "utf-8");
  });

  describe("CSS Structure", () => {
    it("should have :root block with light theme tokens", () => {
      expect(cssContent).toMatch(/:root\s*{[\s\S]*?}/);
    });

    it("should have @media (prefers-color-scheme: dark) block", () => {
      expect(cssContent).toMatch(
        /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)/,
      );
    });

    it("should have color-scheme property on html", () => {
      expect(cssContent).toMatch(/color-scheme:\s*light\s+dark/);
    });
  });

  describe("Light Theme Tokens", () => {
    const expectedLightTokens = [
      "--background",
      "--foreground",
      "--surface",
      "--surface-secondary",
      "--surface-hover",
      "--surface-inset",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--border",
      "--border-strong",
      "--accent",
      "--accent-hover",
      "--accent-surface",
      "--accent-text",
      "--status-success-bg",
      "--status-success-text",
      "--status-warning-bg",
      "--status-warning-text",
      "--status-error-bg",
      "--status-error-text",
      "--status-error-surface",
      "--status-error-surface-text",
      "--ring-offset",
      "--button-primary-bg",
      "--button-primary-text",
    ];

    expectedLightTokens.forEach((token) => {
      it(`should define ${token} in :root`, () => {
        const rootMatch = cssContent.match(/:root\s*{([\s\S]*?)}/);
        expect(rootMatch).toBeTruthy();
        const rootContent = rootMatch?.[1] || "";
        expect(rootContent).toContain(token);
      });
    });
  });

  describe("Dark Theme Tokens", () => {
    const expectedDarkTokens = [
      "--background",
      "--foreground",
      "--surface",
      "--surface-secondary",
      "--surface-hover",
      "--surface-inset",
      "--text-primary",
      "--text-secondary",
      "--text-tertiary",
      "--border",
      "--border-strong",
      "--accent",
      "--accent-hover",
      "--accent-surface",
      "--accent-text",
      "--status-success-bg",
      "--status-success-text",
      "--status-warning-bg",
      "--status-warning-text",
      "--status-error-bg",
      "--status-error-text",
      "--status-error-surface",
      "--status-error-surface-text",
      "--ring-offset",
      "--button-primary-bg",
      "--button-primary-text",
    ];

    expectedDarkTokens.forEach((token) => {
      it(`should define ${token} in dark mode`, () => {
        const darkMatch = cssContent.match(
          /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*{([\s\S]*?)}/,
        );
        expect(darkMatch).toBeTruthy();
        const darkContent = darkMatch?.[1] || "";
        expect(darkContent).toContain(token);
      });
    });
  });

  describe("Token Parity", () => {
    it("should have matching light and dark tokens", () => {
      const rootMatch = cssContent.match(/:root\s*{([\s\S]*?)}/);
      const darkMatch = cssContent.match(
        /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*{([\s\S]*?)}/,
      );

      expect(rootMatch).toBeTruthy();
      expect(darkMatch).toBeTruthy();

      const rootContent = rootMatch?.[1] || "";
      const darkContent = darkMatch?.[1] || "";

      // Extract token names from both blocks
      const lightTokens = new Set(
        (rootContent.match(/--[\w-]+/g) || []).map((t) => t.trim()),
      );
      const darkTokens = new Set(
        (darkContent.match(/--[\w-]+/g) || []).map((t) => t.trim()),
      );

      // Every light token should have a dark equivalent
      lightTokens.forEach((token) => {
        expect(darkTokens.has(token)).toBe(true);
      });
    });
  });

  describe("Token Values", () => {
    it("should have valid color values in light theme", () => {
      const rootMatch = cssContent.match(/:root\s*{([\s\S]*?)}/);
      const rootContent = rootMatch?.[1] || "";

      // Check for hex colors or valid CSS color values
      const colorPattern = /#[0-9a-fA-F]{6}|rgb\(|hsl\(|var\(/;
      expect(rootContent).toMatch(colorPattern);
    });

    it("should have valid color values in dark theme", () => {
      const darkMatch = cssContent.match(
        /@media\s*\(\s*prefers-color-scheme:\s*dark\s*\)\s*{([\s\S]*?)}/,
      );
      const darkContent = darkMatch?.[1] || "";

      // Check for hex colors or valid CSS color values
      const colorPattern = /#[0-9a-fA-F]{6}|rgb\(|hsl\(|var\(/;
      expect(darkContent).toMatch(colorPattern);
    });
  });
});
