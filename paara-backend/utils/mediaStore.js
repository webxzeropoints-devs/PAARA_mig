const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
]);

const IMAGE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp'],
  ['image/svg+xml', '.svg'],
  ['image/avif', '.avif'],
]);

function getCatalystApp(req) {
  try {
    const catalyst = require('zcatalyst-sdk-node');

    if (!req) {
      const error = new Error(
        'Catalyst request context is required for Stratus operations.'
      );
      error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
      throw error;
    }

    return catalyst.initialize(req);
  } catch (error) {
    error.code = error.code || 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }
}

function getBucket(req) {
  const bucketName = String(
    process.env.PAARA_STRATUS_BUCKET || ''
  ).trim();

  if (!bucketName) return null;

  const catalystApp = getCatalystApp(req);

  return catalystApp
    .stratus()
    .bucket(bucketName);
}

function getFileStoreFolder(req) {
  const folderId = String(
    process.env.PAARA_MEDIA_FOLDER_ID || ''
  ).trim();

  if (!folderId) return null;

  return getCatalystApp(req)
    .filestore()
    .folder(folderId);
}

function getStorage(req) {
  const bucket = getBucket(req);
  if (bucket) return { type: 'stratus', storage: bucket };

  const folder = getFileStoreFolder(req);
  if (folder) return { type: 'filestore', storage: folder };

  const error = new Error(
    'Catalyst media storage is not configured. Set PAARA_MEDIA_FOLDER_ID or PAARA_STRATUS_BUCKET.'
  );
  error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
  throw error;
}

function sanitizeExtension(value) {
  const name = String(value || 'image').normalize('NFKC');

  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.'))
    : '';

  const safeExtension = extension
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 10);

  return safeExtension || '.bin';
}

function detectImageContentType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return 'image/jpeg';

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) return 'image/png';

  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) {
    return 'image/gif';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) return 'image/webp';

  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).toString('ascii') === 'ftyp' &&
    /^(avif|avis)$/.test(buffer.subarray(8, 12).toString('ascii'))
  ) return 'image/avif';

  const svgPrefix = buffer
    .toString('utf8', 0, 4096)
    .replace(/^\uFEFF/, '')
    .trimStart()
    .replace(/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*/i, '');

  if (/^<svg(?:\s|>)/i.test(svgPrefix)) {
    return 'image/svg+xml';
  }

  return null;
}

function validateImage(file) {
  if (!file?.buffer?.length) {
    const error = new Error('The uploaded image is empty.');
    error.code = 'INVALID_IMAGE_UPLOAD';
    throw error;
  }

  if (
    !ALLOWED_IMAGE_TYPES.has(
      String(file.mimetype || '').toLowerCase()
    )
  ) {
    const error = new Error(
      'Only JPEG, PNG, GIF, WebP, AVIF, or SVG images are allowed.'
    );
    error.code = 'INVALID_IMAGE_TYPE';
    throw error;
  }

  const buffer = file.buffer;
  const mimetype = String(file.mimetype || '').toLowerCase();
  const validSignature = detectImageContentType(buffer) === mimetype;

  if (!validSignature) {
    const error = new Error('The uploaded file is not a valid image.');
    error.code = 'INVALID_IMAGE_CONTENT';
    throw error;
  }

  if (file.buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('Images must be 5 MB or smaller.');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
}

function isStratusReference(value) {
  const reference = String(value || '').trim();
  if (!/^stratus:/i.test(reference)) return false;

  const objectKey = reference.slice('stratus:'.length);
  return objectKey.startsWith('products/') &&
    !objectKey.includes('\\') &&
    !/[^a-z0-9._/-]/i.test(objectKey) &&
    !/[?#\u0000-\u001f]/.test(objectKey) &&
    objectKey.split('/').every((part) => part && part !== '.' && part !== '..');
}

function isCatalystReference(value) {
  const reference = String(value || '').trim();
  if (!/^catalyst-file:/i.test(reference)) return false;

  const fileId = reference.slice('catalyst-file:'.length);
  return Boolean(fileId) &&
    fileId !== '.' &&
    fileId !== '..' &&
    !/[\\/;?#\u0000-\u001f]/.test(fileId);
}

function objectKeyFromReference(value) {
  const reference = String(value || '').trim();

  if (!isStratusReference(reference)) {
    return null;
  }

  return reference.slice('stratus:'.length);
}

function trustedMediaOrigins(req) {
  const origins = new Set();
  const addOrigin = (value) => {
    if (!value) return;
    try {
      origins.add(new URL(value).origin);
    } catch {
      return;
    }
  };

  addOrigin(req?.get?.('origin'));
  if (req?.get?.('host')) {
    addOrigin(`${req.protocol || 'https'}://${req.get('host')}`);
  }
  String(process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .forEach(addOrigin);
  addOrigin('https://paarajewellery.in');
  addOrigin('https://www.paarajewellery.in');
  return origins;
}

function publicUrlsForReference(reference, req) {
  let pathname;
  if (isStratusReference(reference)) {
    pathname = `/media/${reference.slice('stratus:'.length)}`;
  } else if (isCatalystReference(reference)) {
    pathname = `/media/${encodeURIComponent(
      reference.slice('catalyst-file:'.length)
    )}`;
  } else {
    return [];
  }

  const urls = new Set([reference, pathname]);
  for (const origin of trustedMediaOrigins(req)) {
    urls.add(`${origin}${pathname}`);
  }
  return [...urls];
}

function referenceFromMediaPath(pathname) {
  if (!pathname.startsWith('/media/')) return null;

  let objectKey;
  try {
    objectKey = decodeURIComponent(pathname.slice('/media/'.length));
  } catch {
    return null;
  }

  if (!objectKey || objectKey.includes('\\') || /[?#\u0000-\u001f]/.test(objectKey)) {
    return null;
  }
  if (objectKey.startsWith('products/')) {
    const reference = `stratus:${objectKey}`;
    return isStratusReference(reference) ? reference : null;
  }
  const reference = `catalyst-file:${objectKey}`;
  return isCatalystReference(reference) ? reference : null;
}

function isSafeExternalImageReference(value) {
  const image = String(value || '').trim();
  if (!image || /[\\\u0000-\u001f]/.test(image)) return false;

  if (/^https?:\/\//i.test(image)) {
    try {
      const parsed = new URL(image);
      return Boolean(parsed.hostname) &&
        !parsed.username &&
        !parsed.password;
    } catch {
      return false;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(image) || image.startsWith('//')) {
    return false;
  }

  const path = image.split(/[?#]/, 1)[0];
  return path.split('/').every((part) => part !== '..');
}

function toStorageReference(value, req) {
  const image = String(value || '').trim();
  if (!image) {
    const error = new Error('An image reference cannot be empty.');
    error.code = 'INVALID_IMAGE_REFERENCE';
    throw error;
  }

  if (isStratusReference(image)) {
    return image;
  }
  if (/^stratus:/i.test(image)) {
    const error = new Error('The Stratus image reference is invalid.');
    error.code = 'INVALID_IMAGE_REFERENCE';
    throw error;
  }

  if (isCatalystReference(image)) {
    return image;
  }
  if (/^catalyst-file:/i.test(image)) {
    const error = new Error('The Catalyst File Store reference is invalid.');
    error.code = 'INVALID_IMAGE_REFERENCE';
    throw error;
  }

  let mediaPath = image;
  let trustedAbsoluteUrl = false;
  if (/^https?:\/\//i.test(image)) {
    try {
      const parsed = new URL(image);
      if (parsed.username || parsed.password) {
        throw new Error('Image URLs cannot contain credentials.');
      }
      if (trustedMediaOrigins(req).has(parsed.origin)) {
        if (
          parsed.pathname.startsWith('/media/') &&
          (parsed.search || parsed.hash)
        ) {
          const error = new Error('Managed media URLs cannot include a query or fragment.');
          error.code = 'INVALID_IMAGE_REFERENCE';
          throw error;
        }
        mediaPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        trustedAbsoluteUrl = true;
      }
    } catch {
      const error = new Error('The image URL is invalid.');
      error.code = 'INVALID_IMAGE_REFERENCE';
      throw error;
    }
  }

  if (mediaPath.startsWith('/media/')) {
    const reference = referenceFromMediaPath(mediaPath);
    if (!reference) {
      const error = new Error('The managed media URL is invalid.');
      error.code = 'INVALID_IMAGE_REFERENCE';
      throw error;
    }
    return reference;
  }

  if (/^(?:data|javascript|file):/i.test(image) || /[\u0000-\u001f]/.test(image)) {
    const error = new Error('The image URL is not allowed.');
    error.code = 'INVALID_IMAGE_REFERENCE';
    throw error;
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(image) && !/^https?:\/\//i.test(image)) {
    const error = new Error('The image URL scheme is not allowed.');
    error.code = 'INVALID_IMAGE_REFERENCE';
    throw error;
  }

  if (trustedAbsoluteUrl) return mediaPath;

  // Keep legacy external and relative URLs as URLs, not storage keys.
  return image;
}

async function referenceExists(reference, req) {
  if (isStratusReference(reference)) {
    const bucket = getBucket(req);
    if (!bucket) {
      const error = new Error('Catalyst Stratus is not configured.');
      error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
      throw error;
    }
    try {
      await bucket.object(objectKeyFromReference(reference)).getDetails();
      return true;
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.response?.status;
      if (status === 404) return false;
      throw error;
    }
  }

  if (isCatalystReference(reference)) {
    const folder = getFileStoreFolder(req);
    if (!folder) {
      const error = new Error('Catalyst File Store is not configured.');
      error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
      throw error;
    }
    try {
      await folder.getFileDetails(reference.slice('catalyst-file:'.length));
      return true;
    } catch (error) {
      const status = error?.status || error?.statusCode || error?.response?.status;
      if (status === 404) return false;
      throw error;
    }
  }

  return true;
}

function safeCleanupDiagnostic(reference, error) {
  console.error('[MEDIA_CLEANUP_PENDING]', {
    provider: isStratusReference(reference)
      ? 'stratus'
      : isCatalystReference(reference)
        ? 'catalyst-file'
        : 'unmanaged',
    reference,
    code: error?.code || error?.status || error?.statusCode || 'MEDIA_CLEANUP_FAILED',
  });
}
async function uploadImage(file, prefix = 'image', req) {
  validateImage(file);

  const contentType = String(file.mimetype || '').toLowerCase();
  const extension = IMAGE_EXTENSIONS.get(contentType) || sanitizeExtension(file.originalname);

  const filename =
    `${String(prefix)
      .replace(/[^a-z0-9-]/gi, '-')
      .slice(0, 32)}-` +
    `${Date.now()}-` +
    `${crypto.randomUUID()}` +
    `${extension}`;

  /*
   * Stratus does not allow certain special characters in object
   * paths/names. Our generated filename contains only safe
   * characters.
   */
  const objectKey = `products/${filename}`;

  const { type, storage } = getStorage(req);

  if (type === 'stratus') {
    const uploadResult = await storage.putObject(
      objectKey,
      file.buffer,
      {
        contentType: file.mimetype,
        overwrite: false,
      }
    );

    return {
      reference: `stratus:${objectKey}`,
      objectKey,
      contentType: file.mimetype,
      uploadResult,
    };
  }

  const tempPath = path.join(
    os.tmpdir(),
    `paara-${crypto.randomUUID()}${extension}`
  );

  try {
    await fs.promises.writeFile(tempPath, file.buffer);
    const uploadResult = await storage.uploadFile({
      name: filename,
      code: fs.createReadStream(tempPath),
    });
    const fileId = uploadResult?.id || uploadResult?.file_id;

    if (!fileId) {
      const error = new Error('Catalyst File Store did not return a file id.');
      error.code = 'MEDIA_UPLOAD_INVALID_RESPONSE';
      throw error;
    }

    return {
      reference: `catalyst-file:${fileId}`,
      objectKey: String(fileId),
      contentType: file.mimetype,
      uploadResult,
    };
  } finally {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore temporary-file cleanup failures.
    }
  }
}

async function streamToBuffer(stream) {
  if (Buffer.isBuffer(stream)) {
    return stream;
  }

  if (
    !stream ||
    typeof stream[Symbol.asyncIterator] !== 'function'
  ) {
    const error = new Error(
      'Stratus did not return a readable download stream.'
    );
    error.code = 'MEDIA_DOWNLOAD_INVALID';
    throw error;
  }

  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

async function download(reference, req) {
  const normalizedReference = String(reference || '').trim();
  const isFileStore = isCatalystReference(normalizedReference);
  const objectKey = isFileStore
    ? normalizedReference.slice('catalyst-file:'.length)
    : objectKeyFromReference(normalizedReference);

  if (!objectKey) return null;

  const storage = isFileStore
    ? getFileStoreFolder(req)
    : getBucket(req);

  if (!storage) {
    const error = new Error(
      isFileStore
        ? 'Catalyst File Store is not configured. Set PAARA_MEDIA_FOLDER_ID.'
        : 'Catalyst Stratus is not configured. Set PAARA_STRATUS_BUCKET.'
    );
    error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const stream = isFileStore
    ? await storage.getFileStream(objectKey)
    : await storage.getObject(objectKey);

  const buffer = await streamToBuffer(stream);

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error(
      'Catalyst media storage returned an empty file.'
    );
    error.code = 'MEDIA_DOWNLOAD_EMPTY';
    throw error;
  }

  const contentType = detectImageContentType(buffer);

  if (!contentType) {
    const error = new Error('Stored media bytes are not a supported image.');
    error.code = 'MEDIA_CONTENT_TYPE_UNKNOWN';
    throw error;
  }

  return {
    buffer,
    contentType,
  };
}

async function deleteReference(reference, req) {
  const normalizedReference = String(reference || '').trim();
  const isFileStore = isCatalystReference(normalizedReference);
  const objectKey = isFileStore
    ? normalizedReference.slice('catalyst-file:'.length)
    : objectKeyFromReference(normalizedReference);

  if (!objectKey) {
    return false;
  }

  const storage = isFileStore
    ? getFileStoreFolder(req)
    : getBucket(req);

  if (!storage) {
    const error = new Error(
      isFileStore
        ? 'Catalyst File Store is not configured.'
        : 'Catalyst Stratus is not configured.'
    );
    error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  try {
    if (isFileStore) {
      await storage.deleteFile(objectKey);
    } else {
      await storage.deleteObject(objectKey);
    }
    return true;
  } catch (error) {
    const status =
      error?.status ||
      error?.statusCode ||
      error?.response?.status;

    if (status === 404) {
      return false;
    }

    throw error;
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  uploadImage,
  download,
  deleteReference,
  isStratusReference,
  isCatalystReference,
  toStorageReference,
  detectImageContentType,
  isSafeExternalImageReference,
  publicUrlsForReference,
  referenceExists,
  safeCleanupDiagnostic,
};
