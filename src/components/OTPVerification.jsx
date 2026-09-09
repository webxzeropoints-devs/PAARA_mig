import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import { fadeUp } from "../lib/motion";

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 600;
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Reusable demo OTP screen.
 *
 * Props:
 * - title, subtitle: copy shown above the input
 * - onVerified(): called once the emailed code is entered
 * - onBack(): optional, shown as a "back" link
 */
export default function OTPVerification({
  title = "Verify it's you",
  subtitle = "Enter the 6-digit code we've sent to your email.",
  onVerified,
  onResend,
  onBack,
}) {
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [expiresIn, setExpiresIn] = useState(OTP_TTL_SECONDS);
  const [resendIn, setResendIn] = useState(RESEND_COOLDOWN_SECONDS);
  const [verifying, setVerifying] = useState(false);
  const inputsRef = useRef([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
    const id = setInterval(() => {
      setExpiresIn((value) => Math.max(0, value - 1));
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const expired = expiresIn <= 0;

  const handleChange = (index) => (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(-1);
    setError("");
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      pasted.split("").forEach((char, i) => {
        next[i] = char;
      });
      return next;
    });
    inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleResend = () => {
    if (resendIn > 0) return;
    setDigits(Array(OTP_LENGTH).fill(""));
    setError("");
    setExpiresIn(OTP_TTL_SECONDS);
    setResendIn(RESEND_COOLDOWN_SECONDS);
    inputsRef.current[0]?.focus();
    Promise.resolve(onResend?.()).catch((err) => setError(err?.message || "Could not resend OTP."));
  };

  const handleVerify = async (e) => {
    e?.preventDefault();
    if (expired) {
      setError("This code has expired. Please resend a new one.");
      return;
    }
    const code = digits.join("");
    if (code.length < OTP_LENGTH) {
      setError("Enter all 6 digits.");
      return;
    }
    setVerifying(true);
    try {
      await onVerified?.(code);
    } catch (err) {
      setError(err?.message || "Invalid or expired code. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <motion.div initial="hidden" animate="show" variants={fadeUp} className="w-full max-w-md bg-sand/60 border border-cocoa/10 rounded-sm p-8 md:p-10 shadow-sm">
      <h1 className="font-display text-3xl md:text-4xl mb-1">{title}</h1>
      <p className="text-sm text-cocoa/60 mb-2">{subtitle}</p>
      <p className="text-[11px] text-cocoa/45 mb-8">Enter the 6-digit code sent to your email.</p>

      <form onSubmit={handleVerify} className="space-y-6">
        <div className="flex justify-between gap-2" onPaste={handlePaste}>
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputsRef.current[index] = el)}
              value={digit}
              onChange={handleChange(index)}
              onKeyDown={handleKeyDown(index)}
              inputMode="numeric"
              maxLength={1}
              aria-label={`OTP digit ${index + 1}`}
              autoFocus={index === 0}
              className="w-11 h-13 md:w-12 md:h-14 text-center text-lg bg-white/70 border border-cocoa/25 rounded-sm focus:border-gold outline-none transition-colors"
            />
          ))}
        </div>

        <p className={`text-xs ${expired ? "text-red-700" : "text-cocoa/55"}`}>
          {expired ? "Code expired." : `Code expires in ${mmss(expiresIn)}`}
        </p>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-sm">
            {error}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={verifying}
          whileTap={{ scale: 0.97 }}
          className="w-full bg-gold text-white py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors disabled:opacity-60"
        >
          {verifying ? "Verifying…" : "Verify"}
        </motion.button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={handleResend}
            disabled={resendIn > 0}
            className="uppercase tracking-widest text-gold hover:text-cocoa transition-colors disabled:text-cocoa/40 disabled:cursor-not-allowed"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
          </button>
          {onBack && (
            <button type="button" onClick={onBack} className="uppercase tracking-widest text-cocoa/60 hover:text-cocoa transition-colors">
              ← Back
            </button>
          )}
        </div>
      </form>
    </motion.div>
  );
}
