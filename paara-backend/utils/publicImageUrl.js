const fs = require('fs');
const path = require('path');

module.exports = (value) => {
  const image = String(value || '').trim();

  if (!image || image.startsWith('data:')) {
    return image || null;
  }

  // Stratus image reference
  if (/^stratus:/i.test(image)) {
    const objectKey = image.slice('stratus:'.length);

    if (!objectKey) {
      return null;
    }

    return `/media/${objectKey}`;
  }

  // Legacy Catalyst File Store reference
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
      (
        parsed.pathname.startsWith('/uploads/') ||
        parsed.pathname.startsWith('/images/blob/')
      )
    ) {
      if (parsed.pathname.startsWith('/uploads/')) {
        const localPath = path.join(
          __dirname,
          '..',
          'public',
          parsed.pathname.slice(1)
        );

        return fs.existsSync(localPath)
          ? `${parsed.pathname}${parsed.search}`
          : null;
      }

      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Relative legacy paths are already compatible with the worker routes.
  }

  if (image.startsWith('/uploads/')) {
    const localPath = path.join(
      __dirname,
      '..',
      'public',
      image.slice(1)
    );

    return fs.existsSync(localPath)
      ? image
      : null;
  }

  return image;
};
