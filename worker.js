const BACKEND_ORIGIN = "https://paara-backend-50045721727.development.catalystappsail.in";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const upstreamUrl = new URL(url.pathname + url.search, BACKEND_ORIGIN);
      const upstreamRequest = new Request(upstreamUrl, request);
      return fetch(upstreamRequest);
    }

    return env.ASSETS.fetch(request);
  },
};
