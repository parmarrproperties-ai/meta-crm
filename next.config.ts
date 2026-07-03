import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Allow accessing the dev server from mobile device over local network
  allowedDevOrigins: ["192.168.1.188"],
};

export default nextConfig;
