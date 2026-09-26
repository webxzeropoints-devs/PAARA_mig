import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import LoyaltyCard from "./LoyaltyCard";

const sparkleData = Array.from({ length: 10 }, (_, index) => {
  const angle = (Math.PI * 2 / 10) * index;
  const distance = 26 + (index % 5) * 5;
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance - 8, color: index % 2 ? "#A8483B" : "#D9AE68" };
});

export default function LoyaltyAnimationModal({ isOpen, onClose, onAnimationComplete, stampIndex }) {
  const completed = Number(stampIndex) >= 6;
  const [showStamp, setShowStamp] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShowStamp(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowStamp(true), 1600);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!showStamp || !onAnimationComplete) return undefined;
    const timer = window.setTimeout(onAnimationComplete, 800);
    return () => window.clearTimeout(timer);
  }, [showStamp, onAnimationComplete]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="paara-reward-modal fixed inset-0 z-[120] flex items-center justify-center p-5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true">
          <style>{`
            .paara-reward-modal{background:rgba(36,30,26,.85);font-family:Jost,sans-serif}.paara-modal-content{width:min(1000px,96vw);position:relative}.paara-close{position:absolute;top:max(16px,env(safe-area-inset-top));right:max(16px,env(safe-area-inset-right));z-index:10;display:grid;place-items:center;width:40px;height:40px;border:1px solid rgba(255,255,255,.55);border-radius:50%;background:rgba(36,30,26,.35);color:#fff;font:500 24px/1 Jost,sans-serif;cursor:pointer}.paara-close:hover{background:rgba(255,255,255,.14)}.paara-modal-card{transform-style:preserve-3d;position:relative}.paara-stamper{position:absolute;left:50%;top:50%;width:56px;height:88px;z-index:5;pointer-events:none;transform:translate(-50%,-140px) rotate(-14deg)}.paara-stamper svg{width:100%;height:100%}.paara-stamper-drop{animation:paara-stamp-down 620ms cubic-bezier(.4,0,.2,1) forwards}@keyframes paara-stamp-down{0%{transform:translate(-50%,-140px) rotate(-14deg);opacity:0}18%{opacity:1}46%{transform:translate(-50%,-6px) rotate(-2deg);opacity:1}54%{transform:translate(-50%,2px) rotate(0deg) scale(1.02,.96)}62%{transform:translate(-50%,-4px) rotate(-1deg) scale(1)}80%{transform:translate(-50%,-4px) rotate(-1deg);opacity:1}100%{transform:translate(-50%,-130px) rotate(-16deg);opacity:0}}.paara-sparkle{position:absolute;width:10px;height:10px;left:50%;top:50%;opacity:0;animation:paara-sparkle-out 640ms ease-out forwards}@keyframes paara-sparkle-out{0%{opacity:0;transform:translate(0,0) scale(.3) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(1) rotate(180deg)}}.paara-complete-glow{animation:paara-glow 1.2s ease-in-out infinite}@keyframes paara-glow{50%{filter:drop-shadow(0 0 18px rgba(217,174,104,.55))}}
          `}</style>
          <button type="button" className="paara-close" onClick={onClose} aria-label="Close loyalty animation" title="Close">×</button>
          <motion.div className="paara-modal-content" initial={{ opacity: 0, rotateX: 18, rotateY: -26, y: 30, scale: .9 }} animate={{ opacity: 1, rotateX: 0, rotateY: 0, y: 0, scale: 1 }} transition={{ delay: .3, type: "spring", stiffness: 120, damping: 18 }}>
            <motion.div className={`paara-modal-card ${completed && showStamp ? "paara-complete-glow" : ""}`}>
              <LoyaltyCard stampsCount={stampIndex} animateStamps stampAnimationDelay={1.3} />
              {showStamp && (
                <>
                  <div className="paara-stamper paara-stamper-drop"><svg viewBox="0 0 70 110"><rect x="26" y="0" width="18" height="34" rx="6" fill="#7a4b2e" /><rect x="21" y="30" width="28" height="10" rx="2" fill="#5b3a24" /><rect x="10" y="40" width="50" height="34" rx="3" fill="#c8cdd2" stroke="#9aa1a8" /><rect x="16" y="74" width="38" height="14" rx="2" fill="#efe3d8" stroke="#c9b9a6" /></svg></div>
                  {sparkleData.map((sparkle, index) => <span key={index} className="paara-sparkle" style={{ "--x": `${sparkle.x}px`, "--y": `${sparkle.y}px` }}><svg viewBox="0 0 10 10"><path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" fill={sparkle.color} /></svg></span>)}
                </>
              )}
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: showStamp ? 1 : 0, y: showStamp ? 0 : 8 }} transition={{ duration: .35 }} style={{ textAlign: "center", color: "#fff", marginTop: 18 }}>
              <div style={{ color: "#D9AE68", textTransform: "uppercase", letterSpacing: ".18em", fontSize: 12 }}>New stamp earned · {stampIndex}/6</div>
              <div style={{ marginTop: 8, fontSize: 14, opacity: .85 }}>{completed ? "Card Complete — your PAARA reward is ready." : "Your PAARA Loyalty Card has been updated."}</div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
