import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vinext inspects multipart POSTs for progressive Server Actions before
  // dispatching route handlers. Leave room for an 8 MiB file plus form headers;
  // the upload route still enforces its own 8 MiB file and 64 KiB overhead caps.
  experimental: { serverActions: { bodySizeLimit: "9mb" } },
};

export default nextConfig;
