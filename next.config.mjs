/** @type {import('next').NextConfig} */
export default {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex" }] }];
  },
};
