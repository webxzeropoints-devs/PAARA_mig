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
        'Catalyst request context is required for File Store operations.'
      );
      error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
      throw error;
    }

    // AppSail: initialize the Catalyst SDK with the Express request.
    return catalyst.initialize(req);
  } catch (error) {
    error.code = error.code || 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }
}

async function getFolder(req) {
  const folderId = String(
    process.env.PAARA_MEDIA_FOLDER_ID || ''
  ).trim();

  if (!folderId) {
    const error = new Error(
      'Catalyst File Store is not configured. Set PAARA_MEDIA_FOLDER_ID for the media folder.'
    );
    error.code = 'MEDIA_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const catalystApp = getCatalystApp(req);

  return catalystApp.filestore().folder(folderId);
}

function sanitizeName(value) {
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

  if (!ALLOWED_IMAGE_TYPES.has(
    String(file.mimetype || '').toLowerCase()
  )) {
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

async function uploadImage(file, prefix = 'image', req) {
  validateImage(file);

  const filename =
    `${String(prefix)
      .replace(/[^a-z0-9-]/gi, '-')
      .slice(0, 32)}-` +
    `${Date.now()}-` +
    `${crypto.randomUUID()}` +
    `${sanitizeName(file.originalname)}`;

  const folder = await getFolder(req);

  /*
   * Catalyst Node File Store expects the upload `code` to be
   * a real filesystem ReadStream. Multer gives us the file in
   * memory, so write it temporarily to /tmp and create a
   * ReadStream from that file.
   *
   * AppSail instances provide writable temporary storage under
   * the OS temp directory.
   */
  const tempPath = path.join(
    os.tmpdir(),
    `paara-${crypto.randomUUID()}${sanitizeName(file.originalname)}`
  );

  try {
    await fs.promises.writeFile(tempPath, file.buffer);

    const details = await folder.uploadFile({
      code: fs.createReadStream(tempPath),
      name: filename,
    });

    const fileId = details?.id || details?.file_id;

    if (!fileId) {
      const error = new Error(
        'Catalyst File Store did not return a file ID.'
      );
      error.code = 'MEDIA_UPLOAD_UNVERIFIED';
      throw error;
    }

    return {
      reference: `catalyst-file:${fileId}`,
      fileId: String(fileId),
      contentType: file.mimetype,
    };
  } finally {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

function isCatalystReference(value) {
  return /^catalyst-file:[^/]+$/i.test(
    String(value || '').trim()
  );
}

function toStorageReference(value) {
  const image = String(value || '').trim();

  if (isCatalystReference(image)) {
    return image;
  }

  const match = image.match(
    /^\/media\/([A-Za-z0-9_-]+)$/i
  );

  return match
    ? `catalyst-file:${decodeURIComponent(match[1])}`
    : image;
}

function fileIdFromReference(value) {
  return String(value || '')
    .trim()
    .slice('catalyst-file:'.length);
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
      'Catalyst File Store did not return a readable download stream.'
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
  if (!isCatalystReference(reference)) {
    return null;
  }

  const fileId = fileIdFromReference(reference);
  const folder = await getFolder(req);

  const [downloadStream, details] = await Promise.all([
    folder.downloadFile(fileId),
    folder.getFileDetails(fileId),
  ]);

  const buffer = await streamToBuffer(downloadStream);

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const error = new Error(
      'Catalyst File Store returned an empty file.'
    );
    error.code = 'MEDIA_DOWNLOAD_EMPTY';
    throw error;
  }

  return {
    buffer,
    contentType:
      details?.content_type ||
      details?.mime_type ||
      'application/octet-stream',
  };
}

async function deleteReference(reference, req) {
  if (!isCatalystReference(reference)) {
    return false;
  }

  const folder = await getFolder(req);

  try {
    return await folder.deleteFile(
      fileIdFromReference(reference)
    );
  } catch (error) {
    if (
      error?.status === 404 ||
      error?.statusCode === 404 ||
      error?.response?.status === 404
    ) {
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
  isCatalystReference,
  toStorageReference,
};
