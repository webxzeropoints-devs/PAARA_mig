const test = require('node:test');
const assert = require('node:assert/strict');
const mediaStore = require('../utils/mediaStore');

const request = {
  protocol: 'https',
  get(name) {
    if (name === 'origin') return 'https://shop.example';
    if (name === 'host') return 'api.example';
    return undefined;
  },
};

test('managed image URLs map to provider-specific storage references', () => {
  assert.equal(
    mediaStore.toStorageReference('/media/products/photo-1.jpg', request),
    'stratus:products/photo-1.jpg'
  );
  assert.equal(
    mediaStore.toStorageReference('https://api.example/media/12345', request),
    'catalyst-file:12345'
  );
  assert.equal(
    mediaStore.toStorageReference('https://api.example/uploads/legacy.jpg', request),
    '/uploads/legacy.jpg'
  );
});

test('cleanup candidates include canonical and trusted public URL forms', () => {
  const candidates = mediaStore.publicUrlsForReference(
    'stratus:products/photo-1.jpg',
    request
  );
  assert.ok(candidates.includes('stratus:products/photo-1.jpg'));
  assert.ok(candidates.includes('/media/products/photo-1.jpg'));
  assert.ok(candidates.includes('https://shop.example/media/products/photo-1.jpg'));
  assert.ok(candidates.includes('https://api.example/media/products/photo-1.jpg'));
});

test('untrusted or malformed paths are not converted to storage references', () => {
  assert.equal(
    mediaStore.toStorageReference('https://external.example/media/products/photo.jpg', request),
    'https://external.example/media/products/photo.jpg'
  );
  assert.throws(
    () => mediaStore.toStorageReference('/media/products/%252e%252e/photo.jpg', request),
    { code: 'INVALID_IMAGE_REFERENCE' }
  );
  assert.throws(
    () => mediaStore.toStorageReference('stratus:../outside.jpg', request),
    { code: 'INVALID_IMAGE_REFERENCE' }
  );
  assert.equal(
    mediaStore.isSafeExternalImageReference('https://external.example/photo.jpg'),
    true
  );
  assert.equal(
    mediaStore.isSafeExternalImageReference('javascript:alert(1)'),
    false
  );
});

test('download MIME detection follows the image bytes', () => {
  assert.equal(
    mediaStore.detectImageContentType(
      Buffer.from([0xff, 0xd8, 0xff, 0x00])
    ),
    'image/jpeg'
  );
  assert.equal(
    mediaStore.detectImageContentType(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    'image/png'
  );
  assert.equal(mediaStore.detectImageContentType(Buffer.from('not an image')), null);
});
