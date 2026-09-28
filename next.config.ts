import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // antd 6 ships ESM; nothing to transpile. Logos and avatars live in Supabase Storage.
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
};

export default nextConfig;
