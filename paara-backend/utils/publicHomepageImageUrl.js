const publicHomepageImageUrl = (value) => {
  const image = String(value || '').trim();

  if (!image || image.startsWith('data:')) {
    return image || null;
  }

  // Current Stratus image reference.
  if (/^stratus:.+$/i.test(image)) {
    const objectKey = image.slice('stratus:'.length).trim();

    if (!objectKey || objectKey.includes('..')) {
      return null;
    }

    return `/media/${objectKey}`;
  }

  // Legacy Catalyst File Store reference.
  if (/^catalyst-file:[^/]+$/i.test(image)) {
    return `/media/${encodeURIComponent(
      image.slice('catalyst-file:'.length)
    )}`;
  }

  try {
    const parsed = new URL(image);

    if (
      ['paarajewellery.in', 'www.paarajewellery.in'].includes(
        parsed.hostname
      ) &&
      parsed.pathname.startsWith('/uploads/')
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Preserve non-URL values for the frontend to resolve.
  }

  return image;
};

module.exports = publicHomepageImageUrl;
