import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the ffmpeg binary out of the server bundle so ffmpeg-static can
  // resolve the correct absolute path to its packaged executable at runtime.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
