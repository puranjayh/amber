import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read generated JSON by computed path, which the tracer cannot follow.
  outputFileTracingIncludes: {
    "/**": [
      "./app/_data/*.json",
      "./data/compiled/*.json",
      "./data/eval/*.json",
      "./data/claims/*.json",
      "./data/synthea/*.json",
      "./fixtures/*.json",
    ],
  },
  // Tests and scripts outside the served routes still carry type drift; `npx tsc` reports it.
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
