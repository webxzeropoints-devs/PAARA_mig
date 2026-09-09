import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

import { adminRequest } from "../lib/api";
import { fadeUp } from "../lib/motion";
import { isStrongPassword, PASSWORD_ERROR } from "../lib/validation";
import PasswordRequirements from "../components/PasswordRequirements";
import PasswordInput from "../components/PasswordInput";

export default function AdminSetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const adminId = location.state?.adminId || null;
  const email = location.state?.email || "";

  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!adminId) {
      setError("Missing account information. Please sign in again.");
      return;
    }

    const trimmedEmail = newEmail.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!isStrongPassword(password)) {
      setError(PASSWORD_ERROR);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await adminRequest("/admin-auth/set-password", {
        admin_id: adminId,
        new_password: password,
        new_email: trimmedEmail.toLowerCase(),
      });
      navigate("/admin/login", { state: { message: "Password and email update complete. Please log in." } });
    } catch (err) {
      setError(err.message || "Could not update password and email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sand text-cocoa font-body flex items-center justify-center px-5 py-12">
      <motion.div initial="hidden" animate="show" variants={fadeUp} className="w-full max-w-md rounded-sm border border-cocoa/10 bg-shell p-8 md:p-10 shadow-sm">
        <h1 className="font-display text-3xl md:text-4xl mb-1">Set your admin email and password</h1>
        <p className="text-sm text-cocoa/60 mb-8">
          {email ? `Welcome back, ${email}. The placeholder email is only for the setup step. Choose your real admin email and a secure password.` : "Choose your real admin email and a secure password before continuing."}
        </p>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">New admin email</span>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm text-cocoa placeholder-cocoa/35 transition-colors"
              placeholder="admin@yourcompany.com"
            />
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">New password</span>
            <PasswordInput
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm text-cocoa placeholder-cocoa/35 transition-colors"
            />
            <PasswordRequirements password={password} />
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-cocoa/60 mb-1.5">Confirm new password</span>
            <PasswordInput
              minLength={12}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-transparent border-b border-cocoa/30 focus:border-gold outline-none py-2 text-sm text-cocoa placeholder-cocoa/35 transition-colors"
            />
          </label>

          {error && <div className="text-xs text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-sm">{error}</div>}

          <button type="submit" disabled={loading} className="w-full bg-gold text-sand py-3 text-xs uppercase tracking-widest hover:bg-cocoa transition-colors disabled:opacity-60">
            {loading ? "Saving…" : "Save email & password"}
          </button>
        </form>

        <p className="text-xs text-cocoa/60 mt-6 text-center">
          <Link to="/admin/login" className="text-gold hover:text-cocoa transition-colors">← Back to admin sign in</Link>
        </p>
      </motion.div>
    </div>
  );
}
