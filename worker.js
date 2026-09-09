const BACKEND_ORIGIN = "https://paara-backend-50045721727.development.catalystappsail.in";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Dynamic backend resources must not fall through to the Vite SPA asset
    // handler. Product/homepage uploads are stored and served by AppSail under
    // /uploads, while private legacy Blob images are exposed through
    // /images/blob by the backend.
    if (
      url.pathname === "/api" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/uploads/") ||
      url.pathname === "/images/blob" ||
      url.pathname.startsWith("/images/blob/")
    ) {
      const upstreamUrl = new URL(url.pathname + url.search, BACKEND_ORIGIN);
      const upstreamRequest = new Request(upstreamUrl, request);
      return fetch(upstreamRequest);
    }

    return env.ASSETS.fetch(request);
  },
};
