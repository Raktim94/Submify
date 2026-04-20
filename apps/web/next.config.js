/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    return [{ source: '/setup', destination: '/register', permanent: false }];
  }
};

module.exports = nextConfig;
