import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() { return [{source:'/api/:path*',destination:`${process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'}/:path*`}]; },
};
export default config;
