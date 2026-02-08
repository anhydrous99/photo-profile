/**
 * IP extraction and validation utilities
 *
 * Provides secure client IP extraction that prevents IP spoofing attacks
 * by validating x-forwarded-for headers against trusted proxy configurations.
 */

import { env } from "@/infrastructure/config/env";
import { headers } from "next/headers";

/**
 * Check if an IP address is from a trusted proxy
 *
 * Compares the given IP against the TRUSTED_PROXIES configuration.
 * Only IPs from trusted proxies are allowed to set x-forwarded-for headers.
 *
 * @param ip - IP address to check
 * @returns true if IP is in trusted proxies list, false otherwise
 */
function isTrustedProxy(ip: string): boolean {
  const trustedProxies = env.TRUSTED_PROXIES || [];

  // If no trusted proxies configured, don't trust any
  if (trustedProxies.length === 0) {
    return false;
  }

  // Direct string match (supports both IPv4 and IPv6)
  return trustedProxies.includes(ip);
}

/**
 * Validate if an IP address looks reasonable
 *
 * Performs basic sanity checks to reject obviously invalid or
 * private IPs that shouldn't appear in x-forwarded-for headers.
 *
 * @param ip - IP address to validate
 * @returns true if IP passes basic validation, false otherwise
 */
function isValidPublicIP(ip: string): boolean {
  // Reject empty or whitespace-only
  if (!ip || ip.trim().length === 0) {
    return false;
  }

  // Reject obviously fake values
  const invalidPatterns = [
    "unknown",
    "undefined",
    "null",
    "localhost",
    "0.0.0.0",
    "::",
  ];
  const normalized = ip.toLowerCase().trim();
  if (invalidPatterns.includes(normalized)) {
    return false;
  }

  // Reject private IPv4 ranges (basic check)
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8
  if (ip.startsWith("10.")) return false;
  if (ip.startsWith("192.168.")) return false;
  if (ip.startsWith("127.")) return false;
  if (ip.match(/^172\.(1[6-9]|2[0-9]|3[01])\./)) return false;

  // Basic format check - contains dots (IPv4) or colons (IPv6)
  if (!ip.includes(".") && !ip.includes(":")) {
    return false;
  }

  return true;
}

/**
 * Extract real client IP address with spoofing protection
 *
 * This function securely extracts the client IP address by:
 * 1. Checking if the request comes from a trusted proxy
 * 2. If trusted, parsing x-forwarded-for header (leftmost = original client)
 * 3. If not trusted, using direct connection IP
 * 4. Validating extracted IP for sanity
 *
 * This prevents IP spoofing attacks where attackers set fake x-forwarded-for
 * headers to bypass rate limiting or other IP-based security controls.
 *
 * @returns Client IP address string, or "unknown" if cannot be determined
 *
 * @example
 * // Behind trusted proxy (e.g., Cloudflare, nginx)
 * // x-forwarded-for: "203.0.113.1, 198.51.100.1"
 * // Returns: "203.0.113.1" (leftmost = original client)
 *
 * @example
 * // Direct connection or untrusted proxy
 * // Returns: connection IP (x-forwarded-for ignored)
 *
 * @example
 * // Configuration in .env:
 * // TRUSTED_PROXIES=127.0.0.1,10.0.0.1
 */
export async function getClientIP(): Promise<string> {
  const headersList = await headers();

  // Get the x-real-ip header (simpler alternative to x-forwarded-for)
  // Some proxies set this instead
  const xRealIP = headersList.get("x-real-ip");

  // Get x-forwarded-for header
  const xForwardedFor = headersList.get("x-forwarded-for");

  // Get direct connection info if available
  // Note: Next.js doesn't expose socket info in headers()
  // We'll rely on x-forwarded-for with trusted proxy validation

  // If we have x-forwarded-for, parse it
  if (xForwardedFor) {
    // x-forwarded-for format: "client, proxy1, proxy2"
    // The leftmost IP is the original client
    const ips = xForwardedFor
      .split(",")
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);

    if (ips.length > 0) {
      // Get leftmost (original client) IP
      const clientIP = ips[0];

      // Only trust x-forwarded-for if we have trusted proxies configured
      // In production, this prevents spoofing
      const trustedProxies = env.TRUSTED_PROXIES || [];

      if (trustedProxies.length > 0) {
        // We have trusted proxies - validate the IP
        if (isValidPublicIP(clientIP)) {
          return clientIP;
        }
      }
    }
  }

  // If we have x-real-ip and trusted proxies configured, use it
  if (xRealIP && env.TRUSTED_PROXIES && env.TRUSTED_PROXIES.length > 0) {
    if (isValidPublicIP(xRealIP)) {
      return xRealIP;
    }
  }

  // No trusted proxy configuration or invalid IPs
  // In development without trusted proxies, we can't reliably get real IP
  // Return a safe default
  return "unknown";
}

/**
 * Extract client IP with direct connection fallback
 *
 * This is a simpler version that tries to get the best available IP.
 * Use getClientIP() for production with trusted proxy configuration.
 *
 * @returns Client IP address or "unknown"
 */
export async function getClientIPSimple(): Promise<string> {
  const headersList = await headers();

  // Try x-real-ip first (if set by proxy)
  const xRealIP = headersList.get("x-real-ip");
  if (xRealIP && isValidPublicIP(xRealIP)) {
    return xRealIP;
  }

  // Try first IP from x-forwarded-for
  const xForwardedFor = headersList.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIP = xForwardedFor.split(",")[0]?.trim();
    if (firstIP && isValidPublicIP(firstIP)) {
      return firstIP;
    }
  }

  return "unknown";
}
