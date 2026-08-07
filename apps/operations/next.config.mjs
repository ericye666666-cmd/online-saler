/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@online-saler/business-rules", "@online-saler/shared-types"]
};

export default nextConfig;
