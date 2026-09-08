import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { fadeUp } from "../../lib/motion";
import Seo from "../../components/Seo";
import { getPaaraStory } from "../../lib/api";

const DEFAULT_STORY = {
  title: "A dream shaped by fashion. A brand built with purpose.",
  paragraphs: [
    "Paara Jewellery was founded by Dharshini, born from her lifelong love for fashion, styling, and the beauty found in intricate details. Fashion designing was once a dream she desperately wanted to pursue, but when life took her in an unexpected direction, she refused to let her creative vision fade—she decided to carve out her own path entirely. That journey naturally led her to the world of jewellery, transforming what began as a small, quiet online venture into the thriving reality of Paara.",
    "Today, Paara stands tall on three core pillars she truly believes in and lives by: style, uncompromising quality, and unwavering trust. From meticulously curating anti-tarnish pieces designed to last to connecting warmly and personally with customers face-to-face through bustling weekend stalls in Thiruvallur, every single step of this evolution has been dedicated to creating pieces you can genuinely love, wear with confidence, and trust implicitly.",
    "Our vision moving forward remains beautifully simple and grounded: delivering stunning, high-quality jewellery that is accessible to everyone without compromise.",
  ],
  quote: "Paara is more than just a jewellery brand—it's a living, breathing dream I'm building, one piece at a time.",
  founder: "Dharshini",
};

const parseStory = (story) => {
  if (!story?.title || !story?.description) return DEFAULT_STORY;

  const paragraphs = String(story.description)
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const lastParagraph = paragraphs[paragraphs.length - 1] || "";
  const quoteMatch = lastParagraph.match(/^["“](.*)["”]\s*(?:—\s*(.*))?$/);

  if (!quoteMatch) {
    return { title: story.title, paragraphs, quote: "", founder: "" };
  }

  return {
    title: story.title,
    paragraphs: paragraphs.slice(0, -1),
    quote: quoteMatch[1],
    founder: quoteMatch[2] || "",
  };
};

export default function OurStory() {
  const [story, setStory] = useState(null);

  useEffect(() => {
    let active = true;

    getPaaraStory()
      .then((data) => {
        if (active) setStory(parseStory(data));
      })
      .catch(() => {
        if (active) setStory(DEFAULT_STORY);
      });

    return () => {
      active = false;
    };
  }, []);

  const content = story || DEFAULT_STORY;

  return (
    <div className="min-h-[80vh] bg-sand text-cocoa font-body">
      <Seo title="Our Story" description="Discover the story, vision and purpose behind Paara Jewellery." />
      <div className="max-w-4xl mx-auto px-6 md:px-10 py-20">
        <motion.p initial="hidden" animate="show" variants={fadeUp} className="text-xs uppercase tracking-[.32em] text-gold text-center">
          Paara. Our Story
        </motion.p>
        <motion.h1 initial="hidden" animate="show" variants={fadeUp} className="font-display text-4xl md:text-6xl leading-tight mt-5 text-center">
          {content.title.split(/\s*\.\s*/).map((line, index, lines) => (
            <span key={`${line}-${index}`}>
              {line}{index < lines.length - 1 ? "." : ""}
              {index < lines.length - 1 && <br />}
            </span>
          ))}
        </motion.h1>

        <div className="mt-12 max-w-2xl mx-auto space-y-6 text-cocoa/75 leading-relaxed text-[1.05rem] min-h-[270px]">
          {!story ? (
            <div className="space-y-6 animate-pulse" aria-label="Loading story">
              <div className="h-5 w-full rounded bg-cocoa/10" />
              <div className="h-5 w-11/12 rounded bg-cocoa/10" />
              <div className="h-5 w-10/12 rounded bg-cocoa/10" />
              <div className="h-5 w-full rounded bg-cocoa/10" />
              <div className="h-5 w-9/12 rounded bg-cocoa/10" />
            </div>
          ) : (
            content.paragraphs.map((paragraph) => (
              <motion.p key={paragraph} initial="hidden" animate="show" variants={fadeUp}>
                {paragraph}
              </motion.p>
            ))
          )}
        </div>

        {story && content.quote && (
          <>
            <motion.blockquote
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="text-2xl md:text-[1.9rem] leading-[1.3] text-cocoa/85 italic font-medium mt-14 max-w-xl mx-auto text-center"
              style={{ fontFamily: "Cormorant Garamond, serif" }}
            >
              "{content.quote}"
            </motion.blockquote>
            {content.founder && <p className="font-script mt-6 text-3xl text-cocoa text-center">— {content.founder}</p>}
            {content.founder && <p className="mt-1 text-[10px] uppercase tracking-[.24em] text-cocoa/60 text-center">Founder</p>}
          </>
        )}
      </div>
    </div>
  );
}
