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

  if (!bucketName) {
    const error = new Error(
      'Catalyst Stratus is not configured. Set PAARA_STRATUS_BUCKET.'
    );
    error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const catalystApp = getCatalystApp(req);

  return catalystApp
    .stratus()
    .bucket(bucketName);
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

  if (file.buffer.length > MAX_IMAGE_BYTES) {
    const error = new Error('Images must be 5 MB or smaller.');
    error.code = 'IMAGE_TOO_LARGE';
    throw error;
  }
}

function isStratusReference(value) {
  return /^stratus:/i.test(
    String(value || '').trim()
  );
}

function objectKeyFromReference(value) {
  const reference = String(value || '').trim();

  if (!isStratusReference(reference)) {
    return null;
  }

  return reference.slice('stratus:'.length);
}

function toStorageReference(value) {
  const image = String(value || '').trim();

  if (isStratusReference(image)) {
    return image;
  }

  // Preserve existing legacy Catalyst File Store references.
  if (/^catalyst-file:[^/]+$/i.test(image)) {
    return image;
  }

  // Convert our public Stratus media URL back to the canonical
  // database reference when an existing image is submitted again.
  if (image.startsWith('/media/')) {
    const objectKey = image.slice('/media/'.length);

    if (!objectKey || objectKey.includes('..')) {
      return image;
    }

    return `stratus:${objectKey}`;
  }

  // Preserve other legacy/relative image URLs.
  return image;
}
async function uploadImage(file, prefix = 'image', req) {
  validateImage(file);

  const extension = sanitizeExtension(file.originalname);

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

  const bucket = getBucket(req);

  const tempPath = path.join(
    os.tmpdir(),
    `paara-${crypto.randomUUID()}${extension}`
  );

  try {
    await fs.promises.writeFile(
      tempPath,
      file.buffer
    );

    const uploadResult = await bucket.putObject(
      objectKey,
      fs.createReadStream(tempPath),
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
  const objectKey = objectKeyFromReference(reference);

  if (!objectKey) {
    return null;
  }

  const bucket = getBucket(req);

  const stream = await bucket.getObject(objectKey);

  const buffer = await streamToBuffer(stream);

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error(
      'Stratus returned an empty file.'
    );
    error.code = 'MEDIA_DOWNLOAD_EMPTY';
    throw error;
  }

  let contentType = 'application/octet-stream';

  try {
    const object = bucket.object(objectKey);
    const details = await object.getDetails();

    contentType =
      details?.content_type ||
      details?.mime_type ||
      contentType;
  } catch {
    // The uploaded content type is already stored in Stratus.
    // Fall back safely if metadata lookup is unavailable.
  }

  return {
    buffer,
    contentType,
  };
}

async function deleteReference(reference, req) {
  const objectKey = objectKeyFromReference(reference);

  if (!objectKey) {
    return false;
  }

  const bucket = getBucket(req);

  try {
    await bucket.deleteObject(objectKey);
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
  toStorageReference,
};
