/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@online-saler/business-rules", "@online-saler/shared-types"],
  serverExternalPackages: ["@remotion/renderer"]
};

export default nextConfig;
