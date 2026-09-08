const express = require('express');
const db = require('../db/database.pg');

const router = express.Router();

const DEFAULT_STORY = {
  title: 'A dream shaped by fashion. A brand built with purpose.',
  description: [
    'Paara Jewellery was founded by Dharshini, born from her lifelong love for fashion, styling, and the beauty found in intricate details. Fashion designing was once a dream she desperately wanted to pursue, but when life took her in an unexpected direction, she refused to let her creative vision fade—she decided to carve out her own path entirely. That journey naturally led her to the world of jewellery, transforming what began as a small, quiet online venture into the thriving reality of Paara.',
    'Today, Paara stands tall on three core pillars she truly believes in and lives by: style, uncompromising quality, and unwavering trust. From meticulously curating anti-tarnish pieces designed to last to connecting warmly and personally with customers face-to-face through bustling weekend stalls in Thiruvallur, every single step of this evolution has been dedicated to creating pieces you can genuinely love, wear with confidence, and trust implicitly.',
    'Our vision moving forward remains beautifully simple and grounded: delivering stunning, high-quality jewellery that is accessible to everyone without compromise.',
    '"Paara is more than just a jewellery brand—it\'s a living, breathing dream I\'m building, one piece at a time." — Dharshini',
  ].join('\n\n'),
};

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT title, description FROM paara_story WHERE id = 1'
    );

    return res.json(result.rows[0] || DEFAULT_STORY);
  } catch (error) {
    if (error.code === '42P01') {
      console.warn('[PAARA_STORY_TABLE_MISSING] Serving default story content.');
      return res.json(DEFAULT_STORY);
    }

    console.error('[PAARA_STORY_GET_FAILED]', error.message);
    return res.status(500).json({
      error: 'Could not load Paara Story.',
    });
  }
});

module.exports = router;
