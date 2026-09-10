const publicHomepageImageUrl = (value) => {
  const image = String(value || '').trim();
  if (!image || image.startsWith('data:')) return image || null;

  if (/^catalyst-file:[^/]+$/i.test(image)) {
    return `/media/${encodeURIComponent(image.slice('catalyst-file:'.length))}`;
  }

  try {
    const parsed = new URL(image);
    if (
      ['paarajewellery.in', 'www.paarajewellery.in'].includes(parsed.hostname)
      && parsed.pathname.startsWith('/uploads/')
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Preserve non-URL values for the frontend to resolve.
  }

  return image;
};

module.exports = publicHomepageImageUrl;
