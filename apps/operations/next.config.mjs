/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@online-saler/business-rules", "@online-saler/shared-types"],
  async headers() {
    return [{
      source: "/downloads/:file(direct-loop-print-agent\\.(?:zip|json))",
      headers: [{ key: "Cache-Control", value: "no-store" }]
    }];
  }
};

export default nextConfig;
