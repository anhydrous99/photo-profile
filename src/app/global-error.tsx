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
              body { background-color: #ffffff; color: #0a0a0a; margin: 0; font-family: Arial, Helvetica, sans-serif; }
              .ge-primary { background-color: #0a0a0a; color: #ffffff; }
              .ge-secondary { border: 1px solid #d4d4d4; color: inherit; }
              @media (prefers-color-scheme: dark) {
                body { background-color: #0a0a0a; color: #ededed; }
                .ge-primary { background-color: #ededed; color: #0a0a0a; }
                .ge-secondary { border-color: #3a3a3a; }
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
              className="ge-primary"
              style={{
                borderRadius: 0,
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces root layout; Link component unavailable */}
            <a
              href="/"
              className="ge-secondary"
              style={{
                borderRadius: 0,
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
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
