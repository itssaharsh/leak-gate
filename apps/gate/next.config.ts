import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A self-contained server for AWS Lambda (see infra/aws).
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // The live drill reads the same data map the merge request pipeline uses.
  outputFileTracingIncludes: {
    "/api/drill": ["../../privacy/datamap.yml"],
  },
  transpilePackages: ["@leakgate/drill"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
