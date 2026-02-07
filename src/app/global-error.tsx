"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body { background-color: #ffffff; color: #171717; margin: 0; font-family: Arial, Helvetica, sans-serif; }
              @media (prefers-color-scheme: dark) {
                body { background-color: #1e1e1e; color: #ededed; }
              }
            `,
          }}
        />
      </head>
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "1rem",
          }}
        >
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              opacity: 0.7,
              marginBottom: "1.5rem",
            }}
          >
            A critical error occurred. Please try again.
          </p>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              onClick={() => reset()}
              style={{
                borderRadius: "0.5rem",
                backgroundColor: "#2563eb",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces root layout; Link component unavailable */}
            <a
              href="/"
              style={{
                borderRadius: "0.5rem",
                border: "1px solid #e5e5e5",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
