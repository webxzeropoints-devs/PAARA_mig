// /admin/profile — view avatar/name/email, change avatar URL, change email,
// change password, logout.

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { adminChangeEmail, adminChangePassword, adminChangeProfilePicture, adminRequest } from "../lib/api";
import { useAdmin } from "../lib/adminAuth.jsx";
import { isStrongPassword, PASSWORD_ERROR } from "../lib/validation";
import PasswordRequirements from "../components/PasswordRequirements";
import PasswordInput from "../components/PasswordInput";

export default function AdminProfile() {
  const { admin, updateProfile, logout } = useAdmin();
  const location = useLocation();
  const navigate = useNavigate();

  const [imageUrl, setImageUrl] = useState(admin?.profile_image_url || "");
  const [imageSaving, setImageSaving] = useState(false);
  const [imageMsg, setImageMsg] = useState("");

  const [newEmail, setNewEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const [setupRequired, setSetupRequired] = useState(Boolean(location.state?.initSetup || admin?.must_change_password));
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupConfirmPassword, setSetupConfirmPassword] = useState("");
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupMsg, setSetupMsg] = useState("");

  useEffect(() => {
    setImageUrl(admin?.profile_image_url || "");
    setSetupRequired(Boolean(location.state?.initSetup || admin?.must_change_password));
  }, [admin?.profile_image_url, admin?.must_change_password, location.state?.initSetup]);

  const saveAvatar = async (e) => {
    e.preventDefault();
    setImageMsg("");
    setImageSaving(true);
    try {
      const nextImageUrl = imageUrl.trim();
      if (!nextImageUrl) {
        throw new Error("Choose an image or paste an image URL.");
      }
      await adminChangeProfilePicture(nextImageUrl);
      await updateProfile({});
      setImageMsg("Saved.");
    } catch (err) {
      setImageMsg(err.message);
    } finally {
      setImageSaving(false);
    }
  };

  const submitEmail = async (e) => {
    e.preventDefault();
    setEmailMsg("");
    setEmailSaving(true);
    try {
      await adminChangeEmail(newEmail.trim().toLowerCase(), emailPw);
      await updateProfile({});
      setEmailMsg("Email updated.");
      setNewEmail("");
      setEmailPw("");
    } catch (err) {
      setEmailMsg(err.message);
    } finally {
      setEmailSaving(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwMsg("");
    if (!isStrongPassword(newPw)) {
      setPwMsg(PASSWORD_ERROR);
      return;
    }
    setPwSaving(true);
    try {
      await adminChangePassword(currentPw, newPw);
      await updateProfile({});
      setPwMsg("Password updated.");
      setCurrentPw("");
      setNewPw("");
    } catch (err) {
      setPwMsg(err.message);
    } finally {
      setPwSaving(false);
    }
  };

  const submitInitialSetup = async (e) => {
    e.preventDefault();
    setSetupMsg("");

    const trimmedEmail = setupEmail.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSetupMsg("Enter a valid email address.");
      return;
    }
    if (!isStrongPassword(setupPassword)) {
      setSetupMsg(PASSWORD_ERROR);
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setSetupMsg("Passwords do not match.");
      return;
    }

    setSetupSaving(true);
    try {
      const adminId = location.state?.adminId || admin?.id;
      if (!adminId) {
        throw new Error("Admin account info is missing.");
      }
      await adminRequest("/admin-auth/set-password", {
        admin_id: adminId,
        new_password: setupPassword,
        new_email: trimmedEmail.toLowerCase(),
      });
      await updateProfile({});
      setSetupRequired(false);
      setSetupEmail("");
      setSetupPassword("");
      setSetupConfirmPassword("");
      navigate("/admin/login", {
        replace: true,
        state: { message: "Admin setup complete. Please sign in with your new credentials." },
      });
    } catch (err) {
      setSetupMsg(err.message || "Could not complete setup.");
    } finally {
      setSetupSaving(false);
    }
  };

  const onLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <p className="text-[10px] uppercase tracking-[.28em] text-gold">Account</p>
        <h1 className="font-display text-4xl text-cocoa mt-2">Profile & Security</h1>
      </div>

      {setupRequired && (
        <Card title="Complete admin setup" subtitle="Set your real admin email and password before continuing.">
          <form onSubmit={submitInitialSetup} className="space-y-3">
            <input
              type="email"
              value={setupEmail}
              onChange={(e) => setSetupEmail(e.target.value)}
              placeholder="real-admin@yourcompany.com"
              required
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
            <PasswordInput
              value={setupPassword}
              onChange={(e) => setSetupPassword(e.target.value)}
              placeholder="New password"
              required
              minLength={12}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
            <PasswordRequirements password={setupPassword} />
            <PasswordInput
              value={setupConfirmPassword}
              onChange={(e) => setSetupConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              minLength={12}
              className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
            />
            <Row>
              <button type="submit" disabled={setupSaving} className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60">
                {setupSaving ? "Saving…" : "Save setup"}
              </button>
              {setupMsg && <p className="text-sm text-cocoa self-center">{setupMsg}</p>}
            </Row>
          </form>
        </Card>
      )}

      {/* Profile card */}
      <div className="rounded-sm border border-cocoa/10 bg-shell p-6 mb-8 flex items-center gap-5">
        <div className="h-20 w-20 rounded-full overflow-hidden border border-gold/40 bg-sand grid place-items-center text-2xl text-gold">
          {admin?.profile_image_url ? (
            <img src={admin.profile_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span>{(admin?.name || admin?.email || "A").slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="leading-tight">
          <p className="font-display text-2xl text-cocoa">{admin?.name || "Admin"}</p>
          <p className="text-sm text-cocoa/65">{admin?.email}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[.22em] text-gold">Role: Admin</p>
        </div>
      </div>

      {/* Change avatar */}
      <Card title="Change profile picture" subtitle="Upload a file or paste a public image URL.">
        <form onSubmit={saveAvatar} className="space-y-3">
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <label className="block text-xs uppercase tracking-widest text-cocoa/60">
            Upload image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!file.type.startsWith("image/")) {
                  setImageMsg("Please choose an image file.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setImageUrl(String(reader.result));
                reader.onerror = () => setImageMsg("Could not read that image.");
                reader.readAsDataURL(file);
              }}
              className="mt-2 block w-full text-sm text-cocoa"
            />
          </label>
          <Row>
            <button
              type="submit"
              disabled={imageSaving}
              className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60"
            >
              {imageSaving ? "Saving…" : "Save"}
            </button>
            {imageMsg && <p className="text-sm text-cocoa self-center">{imageMsg}</p>}
          </Row>
        </form>
      </Card>

      {/* Change email */}
      <Card title="Change email">
        <form onSubmit={submitEmail} className="space-y-3">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new-email@example.com"
            required
            className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <PasswordInput
            value={emailPw}
            onChange={(e) => setEmailPw(e.target.value)}
            placeholder="Current password"
            required
            autoComplete="current-password"
            className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <Row>
            <button
              type="submit"
              disabled={emailSaving}
              className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60"
            >
              {emailSaving ? "Saving…" : "Update email"}
            </button>
            {emailMsg && <p className="text-sm text-cocoa self-center">{emailMsg}</p>}
          </Row>
        </form>
      </Card>

      {/* Change password */}
      <Card title="Change password" subtitle="Minimum 8 characters.">
        <form onSubmit={submitPassword} className="space-y-3">
          <PasswordInput
            value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            placeholder="Current password"
            required
            autoComplete="current-password"
            className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <PasswordInput
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="New password"
            required
            autoComplete="new-password"
            className="w-full bg-transparent border-b border-cocoa/30 px-0 py-2 text-sm focus:outline-none focus:border-gold"
          />
          <PasswordRequirements password={newPw} />
          <Row>
            <button
              type="submit"
              disabled={pwSaving}
              className="px-5 py-2 text-xs uppercase tracking-widest bg-gold text-sand hover:bg-cocoa disabled:opacity-60"
            >
              {pwSaving ? "Saving…" : "Update password"}
            </button>
            {pwMsg && <p className="text-sm text-cocoa self-center">{pwMsg}</p>}
          </Row>
        </form>
      </Card>

      {/* Logout */}
      <Card title="Session">
        <button
          type="button"
          onClick={onLogout}
          className="px-5 py-2 text-xs uppercase tracking-widest border border-gold text-cocoa hover:bg-sand"
        >
          Log out
        </button>
      </Card>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <div className="rounded-sm border border-cocoa/10 bg-shell p-6 mb-6">
      <h2 className="font-display text-lg tracking-[.14em] text-cocoa mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-cocoa/60 mb-4">{subtitle}</p>}
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div className="flex items-center gap-4 flex-wrap">{children}</div>;
}
