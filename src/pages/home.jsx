import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";

import ProductFlipCard from "../components/ProductFlipCard";
import VaultScrollStage from "../components/VaultScrollStage";
import { apiGet, getProducts, getVaultToday } from "../lib/api";
import { fadeUp, heroParent, childFadeUp } from "../lib/motion";
import Seo from "../components/Seo";

function useHomeZoomStack(containerRef) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const sections = Array.from(container.children).filter((child) => child.tagName === "SECTION");
    const vaultIndex = sections.findIndex((section) => section.id === "vault");
    const stackSections = sections.filter((section, index) => index !== vaultIndex && Math.abs(index - vaultIndex) > 1);
    const originalStyles = new Map(stackSections.map((section) => [section, {
      position: section.style.position,
      zIndex: section.style.zIndex,
      transform: section.style.transform,
      opacity: section.style.opacity,
      willChange: section.style.willChange,
      transition: section.style.transition,
    }]));
    const stackSet = new Set(stackSections);
    let frameId = 0;

    stackSections.forEach((section) => {
      section.style.position = "relative";
      section.style.zIndex = String(sections.indexOf(section) + 1);
    });

    const resetSection = (section) => {
      const original = originalStyles.get(section);
      section.style.position = original.position || "relative";
      section.style.transform = original.transform;
      section.style.opacity = original.opacity;
      section.style.willChange = original.willChange;
      section.style.transition = original.transition;
      section.style.top = "";
    };

    const updateStack = () => {
      frameId = 0;
      const viewportHeight = window.innerHeight;

      stackSections.forEach((section) => {
        const nextSection = sections[sections.indexOf(section) + 1];
        if (!stackSet.has(nextSection)) {
          resetSection(section);
          return;
        }

        const nextTop = nextSection.getBoundingClientRect().top;
        const progress = Math.max(0, Math.min(1, (viewportHeight - nextTop) / viewportHeight));

        if (progress <= 0 || progress >= 1) {
          resetSection(section);
          return;
        }

        section.style.position = "sticky";
        section.style.top = "0";
        section.style.transform = `translateZ(0) scale(${1 - progress * 0.07})`;
        section.style.opacity = String(1 - progress * 0.4);
        section.style.willChange = "transform, opacity";
        section.style.transition = "none";
      });
    };

    const requestUpdate = () => {
      if (!frameId) frameId = window.requestAnimationFrame(updateStack);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frameId) window.cancelAnimationFrame(frameId);
      stackSections.forEach((section) => {
        const original = originalStyles.get(section);
        section.style.position = original.position;
        section.style.zIndex = original.zIndex;
        section.style.transform = original.transform;
        section.style.opacity = original.opacity;
        section.style.willChange = original.willChange;
        section.style.transition = original.transition;
        section.style.top = "";
      });
    };
  }, [containerRef]);
}

export default function Home() {
  const homeRef = useRef(null);
  const [vault, setVault] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [bestsellersLoading, setBestsellersLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  useHomeZoomStack(homeRef);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getVaultToday().then((data) => !cancelled && setVault(Array.isArray(data) ? data : data?.products || [])).catch(() => {});
    getProducts({ bestseller: true, limit: 9 })
      .then((data) => !cancelled && setBestsellers(Array.isArray(data) ? data : data?.products || []))
      .catch(() => !cancelled && setBestsellers([]))
      .finally(() => !cancelled && setBestsellersLoading(false));
    return () => { cancelled = true; };
  }, []);

  return (
    <main ref={homeRef} className="bg-sand text-cocoa font-body overflow-hidden">
      <Seo title="Paara Jewellery" description="Discover thoughtfully designed jewellery made to be loved, inspired by the ocean and made for you." />
      <AnimatePresence>{showSplash && <SplashScreen />}</AnimatePresence>
      <Hero />
      <MeetOwner />
      <Vault products={vault} />
      <CustomerLove />
      <Collections />
      <ProductGrid title="Our Bestsellers" products={bestsellers} loading={bestsellersLoading} />
      <PaaraIRL />
      <WornByYou />
      <FinalStatement />
    </main>
  );
}

function SplashScreen() {
  return <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.035, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }} className="fixed inset-0 z-[100] bg-[#efe4d2] overflow-hidden grid place-items-center" aria-label="Loading Paara">
    <motion.span aria-hidden="true" className="absolute w-[32rem] h-[32rem] rounded-full border border-gold/25" animate={{ scale: [0.72, 1.14, 0.72], opacity: [0.18, 0.52, 0.18] }} transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }} />
    <motion.span aria-hidden="true" className="absolute w-[21rem] h-[21rem] rounded-full border border-cocoa/15" animate={{ scale: [0.76, 1.1, 0.76], opacity: [0.35, 0.08, 0.35] }} transition={{ duration: 2.2, delay: 0.22, ease: "easeInOut", repeat: Infinity }} />
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="relative z-10 text-center">
      <img src="/assets/paara-logo.png" alt="Paara." className="h-28 md:h-36 w-auto mx-auto" />
      <div className="mt-6 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[.3em] text-cocoa/60"><span className="w-8 h-px bg-gold" />Loading Paara.<span className="w-8 h-px bg-gold" /></div>
    </motion.div>
    <motion.span aria-hidden="true" className="absolute bottom-10 text-gold text-2xl" animate={{ y: [0, -7, 0], rotate: [0, 8, 0] }} transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}>✦</motion.span>
  </motion.div>;
}

function Hero() {
  return <section className="relative overflow-hidden">
    <motion.div className="relative h-[72vh] md:h-[88vh] bg-cocoa flex items-center" variants={heroParent} initial="hidden" animate="show">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      >
        <source src="/assets/hero-intro.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-black/5" />
      <div className="relative z-10 max-w-xl px-6 md:px-16 text-white">
        <motion.p variants={childFadeUp} className="text-xs uppercase tracking-[.35em] mb-5 text-white/80">Paara. Jewellery</motion.p>
        <motion.h1 variants={childFadeUp} className="font-display text-5xl md:text-7xl leading-[.95]">Jewellery<br />Made to be Loved</motion.h1>
        <motion.p variants={childFadeUp} className="mt-6 text-white/85 max-w-sm">Everyday heirlooms inspired by quiet coastal moments.</motion.p>
        <motion.div variants={childFadeUp}><Link to="/shop" className="inline-block mt-8 bg-gold px-8 py-3 text-xs tracking-[.2em] uppercase hover:bg-cocoa transition-colors">Shop the collection</Link></motion.div>
      </div>
    </motion.div>
  </section>;
}

function HeadingWave({ className = "" }) {
  return <svg className={`heading-wave ${className}`} viewBox="0 0 42 8" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M1 4c5-4 10-4 15 0s10 4 15 0 7-4 10 0" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinecap="round" /></svg>;
}

const cacheBustUrl = (url, version) => {
  if (!url || url.startsWith("data:")) return url;
  const value = version || Date.now();
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(value)}`;
};

function MeetOwner() {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [videoIndex, setVideoIndex] = useState(0);
  const founderVideos = ["/videos/founder-story.mp4"];
  const [ownerPhoto, setOwnerPhoto] = useState("");
  const [ownerPhotoVersion, setOwnerPhotoVersion] = useState("current");
  const [ownerPhotoFailed, setOwnerPhotoFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiGet(`/homepage/paara-irl?fresh=${Date.now()}`)
      .then((data) => {
        if (cancelled) return;
        setOwnerPhoto(data?.owner_image_url || "");
        setOwnerPhotoVersion(data?.updated_at || Date.now());
        setOwnerPhotoFailed(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const ownerPhotoSrc = !ownerPhotoFailed && ownerPhoto
    ? cacheBustUrl(ownerPhoto, ownerPhotoVersion)
    : "";
  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };
  const playNextVideo = () => setVideoIndex((index) => (index + 1) % founderVideos.length);
  return <section className="bg-shell/35 py-16 md:py-20">
    <div className="max-w-7xl mx-auto px-6 md:px-10">
      <div className="text-center mb-12 md:mb-14"><span className="heading-wave-wrap"><p className="font-display text-xl md:text-2xl text-gold">The Story Behind Paara</p><HeadingWave className="mt-3" /></span></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-9 md:gap-10 text-center sm:text-left">
          <div className="relative shrink-0">
            <div className="founder-pearl-ring relative w-52 h-52">
              {ownerPhotoSrc ? (
                <img src={ownerPhotoSrc} alt="Meet the Owner" onError={() => setOwnerPhotoFailed(true)} className="absolute inset-4 h-[calc(100%-2rem)] w-[calc(100%-2rem)] object-cover rounded-[48%_52%_45%_55%/55%_44%_56%_45%]" />
              ) : (
                <div className="absolute inset-4 grid place-items-center rounded-[48%_52%_45%_55%/55%_44%_56%_45%] bg-sand px-5 text-center text-xs text-cocoa/60">
                  Owner image unavailable
                </div>
              )}
            </div>
          </div>
          <div className="max-w-sm pt-1">
              <blockquote className="text-2xl md:text-[1.9rem] leading-[1.22] text-cocoa/85 italic font-medium" style={{ fontFamily: "Cormorant Garamond, serif" }}>“Paara started with a dream I couldn’t let go of. Today, every piece is a little part of that dream, created with love, care, and the hope that it becomes a part of someone else’s story too.”</blockquote>
            <p className="font-script mt-7 text-3xl md:text-4xl text-cocoa">— Dharshini</p>
            <p className="mt-1 text-[10px] uppercase tracking-[.24em] text-cocoa/60">Founder</p>
            <Link to="/our-story" className="inline-block mt-7 text-xs uppercase tracking-[.18em] text-gold border-b border-gold/70 pb-1">Read our story →</Link>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-[400px] rounded-[1.75rem] border border-gold/35 p-1.5 shadow-[0_20px_48px_rgba(75,45,25,.14)] overflow-hidden">
          <div className="relative overflow-hidden rounded-[1.35rem] bg-cocoa outline outline-1 outline-white/50 outline-offset-[-7px]">
            <video ref={videoRef} className="block w-full h-auto rounded-[1.35rem]" autoPlay loop={founderVideos.length === 1} muted playsInline onEnded={playNextVideo} src={founderVideos[videoIndex]} />
            <button type="button" onClick={togglePlayback} aria-label={playing ? "Pause founder story video" : "Play founder story video"} className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/75 text-cocoa backdrop-blur-sm transition hover:bg-white">{playing ? "Ⅱ" : "▶"}</button>
          </div>
          <svg aria-hidden="true" className="absolute -bottom-7 -left-5 h-16 w-20 text-gold/45" viewBox="0 0 80 64" fill="none"><path d="M11 53C18 31 22 15 39 9M25 57c2-18 16-35 34-42M40 57c7-13 19-20 32-22M11 53c9-1 15 2 19 8M25 57c8-2 15 0 20 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <svg aria-hidden="true" className="absolute -bottom-6 -right-5 h-14 w-16 text-gold/45" viewBox="0 0 64 56" fill="none"><path d="M8 46C9 20 24 7 37 7c12 0 19 13 19 34-15-8-30-7-48 5zM25 17c8 8 12 18 13 29" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
        </div>
      </div>
    </div>
  </section>;
}

function PearlRing() {
  const pearls = Array.from({ length: 28 }, (_, index) => {
    const count = 28;
    const angle = (index * 360) / count;
    const radians = (angle * Math.PI) / 180;
    const radius = 88;
    return { cx: 100 + radius * Math.cos(radians), cy: 100 + radius * Math.sin(radians) };
  });

  return <svg aria-hidden="true" className="absolute -inset-3 z-10 h-[calc(100%+24px)] w-[calc(100%+24px)] pointer-events-none" viewBox="0 0 200 200">
    <defs>
      <radialGradient id="realPearlBase" cx="38%" cy="30%" r="65%">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="14%" stopColor="#FFFDF2" />
        <stop offset="45%" stopColor="#E8D5B5" />
        <stop offset="78%" stopColor="#CBB28A" />
        <stop offset="100%" stopColor="#9E835B" />
      </radialGradient>
      <radialGradient id="nacreIridescence" cx="25%" cy="40%" r="50%">
        <stop offset="0%" stopColor="#FCE4EC" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#E1BEE7" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#E8D5B5" stopOpacity="0" />
      </radialGradient>
      <filter id="pearlShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#1A1108" floodOpacity="0.28" />
      </filter>
    </defs>
    {pearls.map((pearl, index) => <g key={index} filter="url(#pearlShadow)">
      <circle cx={pearl.cx} cy={pearl.cy} r="9.8" fill="url(#realPearlBase)" />
      <circle cx={pearl.cx} cy={pearl.cy} r="9.8" fill="url(#nacreIridescence)" />
      <circle cx={pearl.cx - 2.8} cy={pearl.cy - 2.8} r="2.2" fill="#FFFFFF" opacity="0.88" />
    </g>)}
  </svg>;
}

function Vault({ products }) {
  const heading = <div className="mb-9"><p className="text-xs uppercase tracking-[.3em] text-gold">Today's drop</p><span className="heading-wave-wrap"><h2 className="font-display text-4xl mt-2">The Vault</h2><HeadingWave className="mt-3" /></span></div>;
  return (
    <section id="vault" className="max-w-[1600px] mx-auto px-6 md:px-10 py-12">
      {heading}
      <VaultScrollStage>
        {products.slice(0, 3).map((product, index) => <ProductFlipCard key={product.id} product={product} index={index} disableReveal disableFlip navigateOnClick />)}
      </VaultScrollStage>
    </section>
  );
}

function CustomerLove() {
  const trackRef = useRef(null);
  const hoveringRef = useRef(false);
  useEffect(() => {
    const track = trackRef.current;
    if (!track || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let frameId = 0;
    let lastTime = performance.now();
    let offset = 0;
    let velocity = 30;
    const tick = (time) => {
      const elapsed = Math.min(100, time - lastTime);
      lastTime = time;
      const targetVelocity = hoveringRef.current ? 2 : 30;
      velocity += (targetVelocity - velocity) * Math.min(1, elapsed / 900);
      const loopWidth = track.scrollWidth / 2;
      if (loopWidth > 0) {
        offset = (offset + velocity * (elapsed / 1000)) % loopWidth;
        track.style.transform = `translate3d(${-offset}px, 0, 0)`;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const baseNotes = [
    "“The most beautiful little package to open.”",
    "“I wear my pearl hoops with everything.”",
    "“Delicate, special and so beautifully made.”",
    "“My new everyday favourite.”",
    "“It feels like a little treasure I reach for daily.”",
    "“The finish is so refined and quietly luxurious.”",
    "“A gift that feels personal, thoughtful and lasting.”",
    "“Wearing it makes even simple days feel special.”",
    "“The detail is beautiful, and the quality feels exceptional.”",
    "“Perfectly understated, with so much charm.”",
    "“Every piece feels like it was made to be treasured.”",
    "“The shell shape is so lovely and the feel is beautiful.”",
    "“I keep reaching for it because it goes with everything.”",
    "“An everyday piece that still feels special.”",
    "“The design is timeless and the finish is beautiful.”",
    "“I loved how it arrived and how effortlessly it fits in.”",
    "“It looks even more beautiful in person.”",
    "“A little piece of calm, elegance and joy.”",
    "“The quality and styling feel effortlessly elevated.”",
    "“It feels thoughtfully made and truly keepsake-worthy.”",
  ];
  const notes = Array.from({ length: 20 }, (_, index) => baseNotes[index % baseNotes.length]);
  const marqueeNotes = [...notes, ...notes];

  return <section className="customer-love-section relative overflow-hidden bg-[#efe4d2] bg-[url('/assets/img.png')] bg-cover bg-center bg-no-repeat px-0 py-5 md:py-6"><div className="absolute inset-0 bg-[#efe4d2]/35" /><div className="relative z-10 text-center px-6"><p className="text-xs uppercase tracking-[.3em] text-gold">Notes from our community</p><span className="heading-wave-wrap"><h2 className="font-display text-4xl mt-2">Customer Love</h2><HeadingWave className="mt-2" /></span></div><div className="relative z-10 love-marquee mt-5" onMouseEnter={() => { hoveringRef.current = true; }} onMouseLeave={() => { hoveringRef.current = false; }}><div ref={trackRef} className="love-track">{marqueeNotes.map((note, index) => <article key={`${note}-${index}`} className="shell-item relative w-[540px] aspect-[900/720] shrink-0"><img src="/assets/shell.png" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain pointer-events-none select-none" /><div className="shell-text absolute inset-0 z-10 flex flex-col items-center justify-start overflow-hidden px-5 py-8 text-center md:px-6 md:py-10"><p className="mt-[34%] w-[62%] overflow-hidden text-[1rem] md:text-[1.1rem] font-semibold leading-snug text-cocoa">{note}</p><p className="mt-4 text-[9px] tracking-[.2em] uppercase text-cocoa/90">Paara. customer</p></div></article>)}</div></div></section>;
}

function Collections() {
  const [tiles, setTiles] = useState([]);
  const [tilesVersion, setTilesVersion] = useState(0);
  const tileColors = { pearls: "#bf9972", gold: "#9e7544", ocean: "#6e9ba0" };

  useEffect(() => {
    let cancelled = false;
    apiGet(`/homepage/collection-tiles?fresh=${Date.now()}`)
      .then((data) => {
        if (cancelled) return;
        setTiles(Array.isArray(data) ? data : []);
        setTilesVersion(Date.now());
      })
      .catch(() => !cancelled && setTiles([]));
    return () => { cancelled = true; };
  }, []);

  return <section className="max-w-[1600px] mx-auto px-6 md:px-10 py-24"><motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} className="text-center max-w-xl mx-auto"><p className="text-xs uppercase tracking-[.3em] text-gold">Find your feeling</p><span className="heading-wave-wrap"><h2 className="font-display text-4xl md:text-5xl mt-3">Our Collections</h2><HeadingWave className="mt-3" /></span><p className="mt-4 text-cocoa/65">Turn a card to step into each little world.</p></motion.div><div className="grid md:grid-cols-3 gap-7 mt-12">{tiles.map((tile, index) => <motion.div key={tile.tile_key} initial={{ opacity: 0, x: index === 1 ? 0 : index === 0 ? -64 : 64, y: 18 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, amount: 0.28 }} transition={{ duration: 0.82, delay: index * 0.15, ease: [0.16, 1, 0.3, 1] }}><CollectionFlipCard collection={{ ...tile, name: tile.label, description: tile.subtitle, color: tileColors[tile.tile_key] || "#bf9972", imageVersion: tilesVersion }} /></motion.div>)}</div></section>;
}

function CollectionFlipCard({ collection }) {
  const [flipped, setFlipped] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const toggle = () => setFlipped((value) => !value);
  const imageUrl = collection.image_url || collection.products?.[0]?.image_url || "";
  const displayImageUrl = imageUrl ? `${imageUrl}${imageUrl.includes("?") ? "&" : "?"}v=${collection.imageVersion || "current"}` : "";
  const marqueeImages = Array.from(new Set([
    ...(displayImageUrl ? [displayImageUrl] : []),
    ...(collection.products || [])
      .map((product) => product.image_url)
      .filter(Boolean)
      .map((src) => src.startsWith("data:") ? src : `${src}${src.includes("?") ? "&" : "?"}v=${collection.imageVersion || "current"}`),
  ]));
  const marqueeCopies = [...marqueeImages, ...marqueeImages];
  useEffect(() => {
    setImageReady(false);
    if (!displayImageUrl) return undefined;
    const image = new Image();
    image.onload = () => setImageReady(true);
    image.onerror = () => setImageReady(false);
    image.src = displayImageUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [displayImageUrl]);

  return <div className="group [perspective:1500px]" onMouseEnter={() => setFlipped(true)} onMouseLeave={() => setFlipped(false)}>
    <div role="button" tabIndex={0} onClick={toggle} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); } }} aria-pressed={flipped} aria-label={`Explore ${collection.name} collection`} className="relative block w-full aspect-[4/5] text-left [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(.2,.75,.25,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold" style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
      <span className="absolute inset-0 overflow-hidden p-8 md:p-10 flex flex-col justify-between [backface-visibility:hidden]" style={{ background: `linear-gradient(145deg, ${collection.color}, #f0dfc3)`, backfaceVisibility: "hidden" }}><span className="text-[10px] uppercase tracking-[.28em] text-white/80">Paara. collection</span><span><span className="font-display text-5xl text-white block">{collection.name}</span><span className="mt-3 block text-xs uppercase tracking-[.2em] text-white/85">Flip to explore ↻</span></span><span className="text-white/70 text-3xl">✦</span></span>
      <span className="absolute inset-0 overflow-hidden bg-cocoa text-sand [backface-visibility:hidden] [transform:rotateY(180deg)]" style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}>
        {marqueeCopies.length > 0 && <span className="collection-marquee collection-marquee-full absolute inset-0"><span className="collection-track" style={{ width: `${marqueeCopies.length * 100}%`, animationPlayState: "running", willChange: "transform" }}>{marqueeCopies.map((src, index) => <img key={index} src={imageReady ? src : undefined} alt="" aria-hidden="true" className="collection-marquee-image object-cover" style={{ flex: `0 0 ${100 / marqueeCopies.length}%`, width: `${100 / marqueeCopies.length}%` }} />)}</span></span>}
        {marqueeCopies.length === 0 && <span className="absolute inset-0 grid place-items-center text-sm text-sand/80">Collection image unavailable</span>}
        <span className="absolute inset-0 bg-gradient-to-t from-cocoa via-cocoa/35 to-black/10" />
        <span className="relative z-10 h-full p-7 md:p-8 flex flex-col justify-end"><span className="font-display text-4xl">{collection.name}</span><span className="mt-2 text-sm text-sand/85 leading-relaxed max-w-[22rem]">{collection.description}</span><Link to={collection.link_path || `/collections?category=${collection.tile_key}`} onClick={(event) => event.stopPropagation()} className="mt-5 text-[10px] uppercase tracking-[.18em] border-b border-sand/70 pb-2 w-fit">Explore collection →</Link></span>
      </span>
    </div>
  </div>;
}

function ProductGrid({ title, products, loading }) {
  return <section className="w-full max-w-7xl mx-auto px-4 md:px-8 py-24"><div className="flex items-end justify-between mb-10"><div><span className="heading-wave-wrap"><h2 className="font-display text-4xl mt-2">{title}</h2><HeadingWave className="mt-3" /></span></div><Link to="/shop" className="text-xs uppercase tracking-[.2em] border-b border-cocoa pb-2">Shop all →</Link></div>{loading ? <div className="py-12 text-center text-sm text-cocoa/60">Loading pieces…</div> : products.length === 0 ? <div className="py-12 text-center text-sm text-cocoa/60">No bestsellers are available right now.</div> : <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-6xl mx-auto px-4 py-12 justify-items-center">{products.map((product, index) => <ProductFlipCard key={product.id} product={product} index={index} boutique bestseller disableFlip navigateOnClick />)}</div>}</section>;
}

function PaaraIRL() {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    apiGet(`/homepage/paara-irl?fresh=${Date.now()}`)
      .then((data) => !cancelled && setEntries(data ? [data] : []))
      .catch(() => !cancelled && setEntries([]));
    return () => { cancelled = true; };
  }, []);

  const featured = entries[0];
  const imageSrc = cacheBustUrl(featured?.image_url, featured?.updated_at || Date.now());
  return <section className="bg-cocoa text-sand py-24"><div className="max-w-5xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center"><div><p className="text-xs uppercase tracking-[.3em] text-gold">Paara. IRL</p><h2 className="font-display text-5xl mt-4 leading-tight">For sunlit plans and every plan after.</h2><Link to="/shop" className="inline-block mt-8 text-[10px] uppercase tracking-[.2em] border-b border-sand pb-2">Shop the mood →</Link></div>{featured && imageSrc ? <div className="aspect-square bg-shell/20 p-5"><img src={imageSrc} alt={featured.caption || "Paara jewellery styling"} className="w-full h-full object-cover" /></div> : <div className="aspect-square bg-shell/20 p-5 flex items-center justify-center text-center text-sm text-sand/70">More coming soon.</div>}</div></section>;
}

function WornByYou() {
  const [entries, setEntries] = useState([]);
  const [failedImages, setFailedImages] = useState({});

  useEffect(() => {
    let cancelled = false;
    apiGet(`/homepage/worn-by-you?fresh=${Date.now()}`)
      .then((data) => {
        if (cancelled) return;
        setEntries(Array.isArray(data) ? data : []);
      })
      .catch(() => !cancelled && setEntries([]));
    return () => { cancelled = true; };
  }, []);

  const slots = Array.from({ length: 3 }, (_, index) => entries[index] || null);
  return <section className="max-w-[1600px] mx-auto px-6 md:px-10 py-24"><motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 0.7 }} className="text-center"><p className="text-xs uppercase tracking-[.3em] text-gold">Your Paara. moments</p><h2 className="font-display text-4xl mt-3">Worn by You</h2></motion.div><div className="grid grid-cols-3 gap-3 md:gap-6 mt-10">{slots.map((entry, index) => { const hasImage = entry?.image_url && !failedImages[entry.id]; const imageSrc = cacheBustUrl(entry?.image_url, entry?.updated_at || entry?.cached_at || entry?.id); return <motion.div key={entry?.id || `empty-${index}`} initial={{ opacity: 0, x: index === 1 ? 0 : index === 0 ? -52 : 52, y: 30 }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.85, delay: index * 0.12, ease: [0.16, 1, 0.3, 1] }} className="aspect-[3/4] overflow-hidden bg-shell">{hasImage ? <img src={imageSrc} alt={entry.caption || "Customer wearing Paara jewellery"} onError={() => setFailedImages((current) => ({ ...current, [entry.id]: true }))} className="w-full h-full object-cover transition-transform duration-700 hover:scale-105" /> : <div className="h-full w-full flex flex-col items-center justify-center gap-3 bg-shell text-cocoa/55"><span aria-hidden="true" className="text-3xl text-gold/70">✦</span><span className="text-xs uppercase tracking-[.18em]">No image yet</span></div>}</motion.div>; })}</div></section>;
}
function FinalStatement() { return <section className="px-6 py-28 md:py-36 text-center bg-[#e6d4b9]"><p className="font-display text-5xl md:text-7xl max-w-4xl mx-auto leading-[1.05]">Made to be found.<br />Made to be loved.<br />Made for you.</p><span className="block mt-8 text-gold text-2xl">✦</span></section>; }
