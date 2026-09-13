import { motion } from "framer-motion";
import { useMemo, useState } from "react";

const colors = {
  cream: "#F3E4DA",
  shell: "#E6C9B9",
  blush: "#EAD2C4",
  ink: "#241E1A",
  rose: "#A8483B",
  roseDark: "#7E332A",
  line: "#D8B9A4",
};

const heartPath = "M32 52 C 8 36, 4 20, 16 10 C 24 4, 32 8, 32 16 C 32 8, 40 4, 48 10 C 60 20, 56 36, 32 52 Z";

function Shell({ right = false }) {
  return (
    <>
      <svg aria-hidden="true" className={`paara-shell-fill ${right ? "paara-shell-right" : ""}`} viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="100" />
      </svg>
      <svg aria-hidden="true" className={`paara-shell ${right ? "paara-shell-outline-right" : ""}`} viewBox="0 0 150 150">
        <path d="M75 140 C 30 140, 10 100, 20 60 C 30 20, 60 10, 75 10 C 90 10, 120 20, 130 60 C 140 100, 120 140, 75 140 Z" />
        <path d="M75 140 L75 30 M55 140 L60 45 M95 140 L90 45 M35 120 L48 55 M115 120 L102 55" />
      </svg>
    </>
  );
}

function StampMark({ index }) {
  return (
    <svg viewBox="0 0 90 90" className="paara-stamp-mark">
      <defs>
        <filter id={`paara-rough-${index}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="noise" seed={index * 7} />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" />
        </filter>
      </defs>
      <g filter={`url(#paara-rough-${index})`} fill="none" stroke={colors.roseDark} strokeWidth="2">
        <circle cx="45" cy="45" r="34" />
        <path d="M45 66 C 20 52, 14 34, 24 24 C 30 18, 45 22, 45 30 C 45 22, 60 18, 66 24 C 76 34, 70 52, 45 66 Z" transform="translate(0,-4) scale(0.72)" />
        <text x="45" y="52" textAnchor="middle" fontFamily="Alex Brush, cursive" fontSize="22" fill={colors.roseDark} stroke="none">paara</text>
      </g>
    </svg>
  );
}

export default function LoyaltyCard({ stampsCount = 0, animateStamps = false, stampAnimationDelay = 0 }) {
  const count = Math.min(Math.max(Number(stampsCount) || 0, 0), 6);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const tilts = useMemo(() => Array.from({ length: 6 }, (_, index) => ((index * 1.7) % 8) - 4), []);

  const handleMouseMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTilt({
      rotateX: ((rect.top + rect.height / 2 - event.clientY) / rect.height) * 14,
      rotateY: ((event.clientX - rect.left - rect.width / 2) / rect.width) * 14,
    });
  };

  return (
    <div className="paara-card-perspective">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Alex+Brush&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=Jost:wght@400;500;600&display=swap');
        .paara-card-perspective{--cream:#F3E4DA;--shell:#E6C9B9;--blush:#EAD2C4;--ink:#241E1A;--rose:#A8483B;--rose-dark:#7E332A;--line:#D8B9A4;width:100%;perspective:1400px}
        .paara-card{position:relative;width:100%;aspect-ratio:1000/540;background:var(--cream);border-radius:16px;box-shadow:0 30px 60px -20px rgba(60,40,25,.35),0 2px 0 rgba(255,255,255,.5) inset;overflow:hidden;display:flex;flex-direction:column;transform-style:preserve-3d;will-change:transform;font-family:Jost,sans-serif;color:var(--ink)}
        .paara-card-top{flex:1;display:flex;position:relative;overflow:hidden}
        .paara-shell,.paara-shell-fill{position:absolute;pointer-events:none}.paara-shell{fill:none;stroke:var(--shell);stroke-width:1.3;opacity:.85;top:-4%;left:2%;width:26%;height:55%}.paara-shell-fill{fill:var(--shell);opacity:.55;top:-8%;left:-6%;width:34%;height:60%}.paara-shell-right{top:-10%;left:auto;right:-4%;width:30%;height:62%}.paara-shell-outline-right{top:-2%;left:auto;right:0;width:24%;height:50%}
        .paara-left{flex:1;padding:5% 2% 2% 3%;position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;z-index:1}.paara-brand{font:76px/1 'Alex Brush',cursive}.paara-title-row{display:flex;align-items:baseline;gap:12px;margin-top:1.4%}.paara-diamond{color:var(--rose);font-size:15px}.paara-title{font:600 28px 'Cormorant Garamond',serif;letter-spacing:.1em}.paara-sub{font-size:16px;font-weight:500;margin-top:1.6%}.paara-hearts{display:flex;gap:2.2%;margin-top:3.5%;width:100%;z-index:2}.paara-slot{position:relative;flex:1 1 0;max-width:132px;aspect-ratio:64/58}.paara-outline{width:100%;height:100%;overflow:visible}.paara-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 40px 'Cormorant Garamond',serif}.paara-slot.next .paara-outline path{stroke:var(--rose)}.paara-stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}.paara-stamp-mark{width:135%;height:135%;overflow:visible}.paara-reward{margin-top:3%;font:italic 17px 'Cormorant Garamond',serif;color:#4a3d32}.paara-divider{width:1px;background:var(--line);margin:5% 0}.paara-right{width:230px;flex-shrink:0;padding:6% 4%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6%;z-index:2}.paara-gift{width:58px;height:58px;border:1.4px solid var(--rose);border-radius:50%;display:grid;place-items:center}.paara-gift svg,.paara-small-heart{width:52%;height:52%;stroke:var(--rose);fill:none;stroke-width:1.6}.paara-pick{font:600 21px/1.3 'Cormorant Garamond',serif;letter-spacing:.03em}.paara-pick span{color:var(--rose-dark)}.paara-small-heart{width:20px;height:20px;stroke:var(--ink)}.paara-info{background:var(--blush);display:flex;align-items:center;padding:1.6% 3%;gap:2%;font-size:11px}.paara-info-block{flex:1;display:flex;align-items:center;gap:10px}.paara-info-icon{width:26px;height:26px;stroke:var(--ink);fill:none;stroke-width:1.6;flex-shrink:0}.paara-info-text{display:flex;flex-direction:column;line-height:1.25}.paara-info-text strong{font-weight:600}.paara-info-divider{width:1px;align-self:stretch;background:var(--line)}.paara-thanks{text-align:right;flex:1.3}.paara-thanks strong{display:block;font:600 italic 15px 'Cormorant Garamond',serif}.paara-thanks span{font-size:10px;letter-spacing:.02em}
        @media(max-width:680px){.paara-card{aspect-ratio:auto}.paara-card-top{flex-direction:column}.paara-divider{width:auto;height:1px;margin:0 6%}.paara-right{width:100%;flex-direction:row;justify-content:center;padding:4% 6%;gap:16px}.paara-info{flex-wrap:wrap;row-gap:10px}.paara-thanks{flex-basis:100%;text-align:center}.paara-info-divider{display:none}.paara-brand{font-size:clamp(52px,16vw,76px)}.paara-title{font-size:clamp(16px,5vw,28px)}.paara-sub{font-size:clamp(11px,3vw,16px)}.paara-num{font-size:clamp(20px,7vw,40px)}}
      `}</style>
      <motion.div
        className="paara-card"
        initial={{ opacity: 0, rotateX: 18, rotateY: -26, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, rotateX: tilt.rotateX, rotateY: tilt.rotateY, y: 0, scale: 1 }}
        transition={{ duration: 1, ease: [0.16, 0.9, 0.2, 1] }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTilt({ rotateX: 0, rotateY: 0 })}
      >
        <div className="paara-card-top">
          <Shell />
          <Shell right />
          <div className="paara-left">
            <div className="paara-brand">Paara<span style={{ fontSize: "60%" }}>.</span></div>
            <div className="paara-title-row"><span className="paara-diamond">✦</span><span className="paara-title">REWARDS CARD</span><span className="paara-diamond">✦</span></div>
            <div className="paara-sub">Spend <b>₹19</b> or more and earn 1 stamp</div>
            <div className="paara-hearts">
              {Array.from({ length: 6 }, (_, index) => {
                const stamped = index < count;
                return (
                  <motion.div
                    key={index}
                    className={`paara-slot ${stamped ? "stamped" : ""} ${index === count ? "next" : ""}`}
                    initial={animateStamps && stamped ? { scale: 0 } : false}
                    animate={animateStamps && stamped ? { scale: [0, 1.15, 1] } : { scale: 1 }}
                    transition={animateStamps && stamped ? { delay: stampAnimationDelay + index * 0.34, duration: .42, ease: [0.22, 1.2, .36, 1] } : undefined}
                    style={{ transform: `rotate(${tilts[index]}deg)` }}
                  >
                    <svg className="paara-outline" viewBox="0 0 64 58"><path d={heartPath} fill="none" stroke="#B99A7C" strokeWidth="1.6" strokeDasharray="3.5 3" /></svg>
                    <div className="paara-num" style={{ opacity: stamped ? 0 : 1 }}>{index + 1}</div>
                    {stamped && <div className="paara-stamp"><StampMark index={index + 1} /></div>}
                  </motion.div>
                );
              })}
            </div>
            <div className="paara-reward">Timeless Shine. Everyday You. ♡</div>
          </div>
          <div className="paara-divider" />
          <div className="paara-right">
            <div className="paara-gift"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="1.4" /><path d="M3 12h18M12 8v12M8 8c0-2 1.5-4 4-4s4 2 4 4" /></svg></div>
            <div className="paara-pick">PICK ANY<br /><span>JEWELLERY</span><br />YOU LIKE<br />FROM OUR STORE!</div>
            <svg className="paara-small-heart" viewBox="0 0 24 24"><path d="M12 21 C 4 14, 2 8, 7 5 C 10 3, 12 5, 12 8 C 12 5, 14 3, 17 5 C 22 8, 20 14, 12 21 Z" /></svg>
          </div>
        </div>
        <div className="paara-info">
          <div className="paara-info-block"><svg className="paara-info-icon" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M12 14v3M10.5 15.5h3" /></svg><div className="paara-info-text"><strong>VALID FOR: 6 MONTHS</strong><span>from the date of first stamp</span></div></div>
          <div className="paara-info-divider" />
          <div className="paara-thanks"><strong>Thank you ♡</strong><span>FOR BEING PART OF THE PAARA FAMILY!</span></div>
        </div>
      </motion.div>
    </div>
  );
}
