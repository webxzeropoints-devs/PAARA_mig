const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://paara_test:paara_test@127.0.0.1:5432/paara_test';
const adminRouter = require('../routes/admin');

test('replace_images accepts explicit booleans and rejects ambiguous values', () => {
  assert.equal(adminRouter.parseReplacementFlag('true'), true);
  assert.equal(adminRouter.parseReplacementFlag('false'), false);
  assert.equal(adminRouter.parseReplacementFlag(undefined), false);
  assert.throws(
    () => adminRouter.parseReplacementFlag('sometimes'),
    { code: 'INVALID_IMAGE_REPLACEMENT_FLAG' }
  );
});

test('image slots preserve mixed upload and retained image ordering', () => {
  const slots = adminRouter.orderedImageUrls({
    uploadedImages: ['upload-a', 'upload-b'],
    existingImages: ['retain-a', 'retain-b'],
    uploadSlots: [2, 0],
    existingSlots: [1, 3],
  });

  assert.deepEqual(slots, ['upload-b', 'retain-a', 'upload-a', 'retain-b']);
});

test('an empty replacement produces an empty ordered image list', () => {
  assert.deepEqual(adminRouter.orderedImageUrls({
    uploadedImages: [],
    existingImages: [],
    uploadSlots: null,
    existingSlots: null,
  }), []);
});

test('image slots reject duplicates, gaps, and malformed values', () => {
  assert.throws(
    () => adminRouter.orderedImageUrls({
      uploadedImages: ['upload-a', 'upload-b'],
      existingImages: [],
      uploadSlots: [0, 0],
      existingSlots: null,
    }),
    /unique non-negative integers/
  );
  assert.throws(
    () => adminRouter.orderedImageUrls({
      uploadedImages: ['upload-a'],
      existingImages: ['retain-a'],
      uploadSlots: [0],
      existingSlots: [2],
    }),
    /continuous sequence/
  );
  assert.throws(
    () => adminRouter.parseImageSlots(['-1'], 1, 'upload_slots'),
    /non-negative integer/
  );
});
