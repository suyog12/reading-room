import type { NextConfig } from "next";

/**
 * Security headers. None of these are optional once something is on the open
 * internet, and all of them are free.
 */
const securityHeaders = [
  // Nobody frames this app, so nobody can overlay an invisible copy of it and
  // harvest clicks.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },

  // Don't let a browser guess that an uploaded file is really a script.
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Never leak a room or book id to a third party through the referer.
  { key: "Referrer-Policy", value: "no-referrer" },

  // Nothing here needs a camera, a microphone, or your position.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },

  // Once seen over https, only ever use https.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
