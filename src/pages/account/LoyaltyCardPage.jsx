import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AccountPageLayout from "./AccountPageLayout";
import LoyaltyCard from "../../components/LoyaltyCard";
import Seo from "../../components/Seo";
import { getLoyaltyStatus, getToken, redeemLoyaltyReward } from "../../lib/api";

export default function LoyaltyCardPage() {
  const [loyalty, setLoyalty] = useState(null);
  const [error, setError] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const authed = Boolean(getToken());

  useEffect(() => {
    if (!authed) return;
    getLoyaltyStatus().then(setLoyalty).catch((err) => setError(err?.message || "Could not load your PAARA Loyalty Card."));
  }, [authed]);

  if (!authed) {
    return <AccountPageLayout title="Loyalty Card" subtitle="Your server-synced digital loyalty card."><Link to="/login" className="inline-block bg-gold px-7 py-3 text-xs uppercase tracking-widest text-white">Sign in to view your card</Link></AccountPageLayout>;
  }

  const count = loyalty?.stampCount || 0;
  const handleRedeem = async () => {
    setRedeeming(true);
    setError("");
    try {
      const result = await redeemLoyaltyReward();
      setLoyalty(result.state);
    } catch (err) {
      setError(err?.message || "Could not redeem your PAARA reward.");
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <AccountPageLayout title="Loyalty Card" subtitle="Earn one stamp on each qualifying delivered order of ₹599 or more.">
      <Seo title="Loyalty Card" description="View your PAARA Jewellery Loyalty Card and server-synced stamps." />
      {error && <p className="mb-5 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
      <div className="space-y-6">
        <LoyaltyCard stampsCount={count} animateOnMount />
        {!loyalty ? (
          <p className="max-w-xl text-sm text-cocoa/60">Loading your loyalty card balance…</p>
        ) : (
          <div className="max-w-xl border border-cocoa/10 bg-white/50 p-5 text-sm">
            <p className="font-display text-xl">{loyalty.rewardEligible ? "Reward unlocked" : `${6 - count} more stamp${6 - count === 1 ? "" : "s"} to unlock your reward`}</p>
            <p className="mt-2 text-cocoa/65">After six stamps, choose any jewellery from the store. Rewards cannot be exchanged for cash or combined with other offers.</p>
            {loyalty.rewardEligible && <button type="button" onClick={handleRedeem} disabled={redeeming} className="mt-4 bg-gold px-5 py-3 text-xs uppercase tracking-widest text-white disabled:opacity-50">{redeeming ? "Claiming…" : "Claim reward"}</button>}
            {loyalty.expiresAt && <p className="mt-3 text-xs text-cocoa/55">Current card valid until {new Date(loyalty.expiresAt).toLocaleDateString("en-IN")}.</p>}
          </div>
        )}
      </div>
    </AccountPageLayout>
  );
}
