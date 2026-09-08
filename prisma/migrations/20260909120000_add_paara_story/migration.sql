-- CreateTable paara_story
CREATE TABLE "paara_story" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL DEFAULT 'A dream shaped by fashion. A brand built with purpose.',
    "description" TEXT NOT NULL,
    "created_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
    "updated_at" TEXT NOT NULL DEFAULT to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),

    CONSTRAINT "paara_story_pkey" PRIMARY KEY ("id")
);

-- Insert default row
INSERT INTO "paara_story" ("id", "title", "description", "created_at", "updated_at")
VALUES (
    1,
    'A dream shaped by fashion. A brand built with purpose.',
    'Paara Jewellery was founded by Dharshini, born from her lifelong love for fashion, styling, and the beauty found in intricate details. Fashion designing was once a dream she desperately wanted to pursue, but when life took her in an unexpected direction, she refused to let her creative vision fade—she decided to carve out her own path entirely. That journey naturally led her to the world of jewellery, transforming what began as a small, quiet online venture into the thriving reality of Paara.

Today, Paara stands tall on three core pillars she truly believes in and lives by: style, uncompromising quality, and unwavering trust. From meticulously curating anti-tarnish pieces designed to last to connecting warmly and personally with customers face-to-face through bustling weekend stalls in Thiruvallur, every single step of this evolution has been dedicated to creating pieces you can genuinely love, wear with confidence, and trust implicitly.

Our vision moving forward remains beautifully simple and grounded: delivering stunning, high-quality jewellery that is accessible to everyone without compromise.

"Paara is more than just a jewellery brand—it''s a living, breathing dream I''m building, one piece at a time." — Dharshini',
    to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS'),
    to_char(CURRENT_TIMESTAMP, 'YYYY-MM-DD HH24:MI:SS')
) ON CONFLICT DO NOTHING;
