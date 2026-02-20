/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      {
        source: '/editor/:slug*',
        destination: '/story/:slug*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
