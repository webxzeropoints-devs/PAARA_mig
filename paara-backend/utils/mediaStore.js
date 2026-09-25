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
  const validSignature =
    (mimetype === 'image/jpeg' &&
      buffer.length >= 3 &&
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    (mimetype === 'image/png' &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )) ||
    (mimetype === 'image/gif' &&
      ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) ||
    (mimetype === 'image/webp' &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP') ||
    (mimetype === 'image/avif' &&
      buffer.subarray(4, 8).toString('ascii') === 'ftyp') ||
    (mimetype === 'image/svg+xml' &&
      buffer.toString('utf8', 0, 4096).trimStart().startsWith('<'));

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
  return /^stratus:/i.test(
    String(value || '').trim()
  );
}

function isCatalystReference(value) {
  return /^catalyst-file:/i.test(
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

    return objectKey.startsWith('products/')
      ? `stratus:${objectKey}`
      : `catalyst-file:${objectKey}`;
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
  const isFileStore = /^catalyst-file:/i.test(normalizedReference);
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

  let contentType = 'application/octet-stream';

  if (!isFileStore) try {
    const object = storage.object(objectKey);
    const details = await object.getDetails();

    contentType =
      details?.content_type ||
      details?.mime_type ||
      contentType;
  } catch {
    // The uploaded content type is already stored in Catalyst.
    // Fall back safely if metadata lookup is unavailable.
  }

  return {
    buffer,
    contentType,
  };
}

async function deleteReference(reference, req) {
  const normalizedReference = String(reference || '').trim();
  const isFileStore = /^catalyst-file:/i.test(normalizedReference);
  const objectKey = isFileStore
    ? normalizedReference.slice('catalyst-file:'.length)
    : objectKeyFromReference(normalizedReference);

  if (!objectKey) {
    return false;
  }

  const storage = isFileStore
    ? getFileStoreFolder(req)
    : getBucket(req);

  if (!storage) return false;

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
};
