/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy all /api/* requests to the existing Node.js backend.
  // This avoids CORS issues on server-side fetch and matches the Vite proxy config.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*',
      },
    ];
  },

  // Allow Next.js <Image /> to load from localhost ML service
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5002',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5000',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
