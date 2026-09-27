import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AccountPageLayout from "./AccountPageLayout";
import LoyaltyCard from "../../components/LoyaltyCard";
import Seo from "../../components/Seo";
import { claimLoyaltyReward, getAddresses, getLoyaltyStatus, getToken } from "../../lib/api";

export default function LoyaltyCardPage() {
  const [loyalty, setLoyalty] = useState(null);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [addressLoading, setAddressLoading] = useState(true);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimedOrder, setClaimedOrder] = useState(null);
  const authed = Boolean(getToken());

  useEffect(() => {
    if (!authed) return;
    let active = true;
    const refreshLoyalty = () => {
      getLoyaltyStatus()
        .then((state) => {
          if (active) setLoyalty(state);
        })
        .catch((err) => {
          if (active) setError(err?.message || "Could not load your PAARA Loyalty Card.");
        });
    };
    refreshLoyalty();
    window.addEventListener("focus", refreshLoyalty);
    getAddresses()
      .then((savedAddresses) => {
        if (!active) return;
        const list = Array.isArray(savedAddresses) ? savedAddresses : [];
        setAddresses(list);
        setAddressId((current) => current || String(list.find((item) => item.is_default)?.id || list[0]?.id || ""));
      })
      .catch((err) => {
        if (active) setAddressError(err?.message || "Could not load your saved addresses.");
      })
      .finally(() => {
        if (active) setAddressLoading(false);
      });
    return () => {
      active = false;
      window.removeEventListener("focus", refreshLoyalty);
    };
  }, [authed]);

  useEffect(() => {
    if (!authed || !loyalty?.expiresAt) return undefined;

    const expiresAt = new Date(loyalty.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return undefined;

    const timer = window.setTimeout(() => {
      getLoyaltyStatus()
        .then(setLoyalty)
        .catch((err) => {
          setError(err?.message || "Could not refresh your expired loyalty card.");
        });
    }, Math.max(0, expiresAt - Date.now()));

    return () => window.clearTimeout(timer);
  }, [authed, loyalty?.expiresAt]);

  if (!authed) {
    return <AccountPageLayout title="Loyalty Card" subtitle="Your server-synced digital loyalty card."><Link to="/login" className="inline-block bg-gold px-7 py-3 text-xs uppercase tracking-widest text-white">Sign in to view your card</Link></AccountPageLayout>;
  }

  const count = loyalty?.stampCount || 0;
  const latestClaim = loyalty?.rewardHistory?.[0];
  const handleClaim = async () => {
    if (!addressId) {
      setError("Add a delivery address before claiming your reward.");
      return;
    }
    setClaiming(true);
    setError("");
    try {
      const result = await claimLoyaltyReward(Number(addressId));
      setLoyalty(result.state);
      setClaimedOrder(result.order || null);
    } catch (err) {
      setError(err?.message || "Could not claim your PAARA reward.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <AccountPageLayout title="Loyalty Card" subtitle={loyalty ? `Earn one stamp on each qualifying order of ₹${Number(loyalty.threshold).toLocaleString("en-IN")} or more.` : "Loading your loyalty threshold…"}>
      <Seo title="Loyalty Card" description="View your PAARA Jewellery Loyalty Card and server-synced stamps." />
      {error && <p className="mb-5 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
      {addressError && <p className="mb-5 bg-red-50 px-4 py-3 text-xs text-red-700">{addressError}</p>}
      <div className="space-y-6">
        <LoyaltyCard stampsCount={count} threshold={loyalty?.threshold} animateOnMount />
        {!loyalty ? (
          <p className="max-w-xl text-sm text-cocoa/60">Loading your loyalty card balance…</p>
        ) : (
          <div className="max-w-xl border border-cocoa/10 bg-white/50 p-5 text-sm">
            <p className="font-display text-xl">{loyalty.rewardEligible ? "Reward unlocked" : `${6 - count} more stamp${6 - count === 1 ? "" : "s"} to unlock your reward`}</p>
            {loyalty.rewardEligible && loyalty.rewardProduct ? (
              <div className="mt-4 flex items-center gap-4 border border-cocoa/10 bg-shell p-3">
                {loyalty.rewardProduct.image_url && <img src={loyalty.rewardProduct.image_url} alt={loyalty.rewardProduct.name} className="h-20 w-20 object-cover" />}
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-gold">Your complimentary gift</p>
                  <p className="mt-1 font-product-name text-cocoa">{loyalty.rewardProduct.name}</p>
                  <p className="mt-1 text-xs text-cocoa/60">Product and standard delivery are free.</p>
                </div>
              </div>
            ) : loyalty.rewardEligible ? (
              <p className="mt-3 text-cocoa/65">Your reward is unlocked. PAARA is selecting your jewellery gift; check back soon.</p>
            ) : (
              <p className="mt-2 text-cocoa/65">Complete six stamps within six months to receive the jewellery gift selected by PAARA. The reward cannot be exchanged for cash.</p>
            )}
            {loyalty.rewardEligible && loyalty.rewardProduct && !claimedOrder && (
              <>
                {addresses.length > 0 ? (
                  <label className="mt-4 block text-xs uppercase tracking-widest text-cocoa/60">
                    Deliver to
                    <select value={addressId} onChange={(event) => setAddressId(event.target.value)} className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-2 text-sm normal-case tracking-normal text-cocoa">
                      {addresses.map((address) => <option key={address.id} value={address.id}>{address.line1}, {address.city}, {address.state} {address.pincode}{address.is_default ? " (Default)" : ""}</option>)}
                    </select>
                  </label>
                ) : addressLoading ? (
                  <p className="mt-4 text-xs text-cocoa/55">Loading your saved delivery addresses…</p>
                ) : addressError ? (
                  <p className="mt-4 text-xs text-cocoa/60">Your saved addresses could not be loaded. Refresh this page to try again.</p>
                ) : (
                  <Link to="/account/addresses" className="mt-4 inline-block text-sm text-gold underline">Add a delivery address to claim</Link>
                )}
                <button type="button" onClick={handleClaim} disabled={claiming || addresses.length === 0 || !addressId} className="mt-4 block bg-gold px-5 py-3 text-xs uppercase tracking-widest text-white disabled:opacity-50">{claiming ? "Placing free order…" : "Claim product"}</button>
              </>
            )}
            {(claimedOrder || latestClaim?.order_number) && (
              <div className="mt-4 border border-gold/40 bg-gold/10 p-4">
                <p className="font-display text-lg">Your gift order is confirmed</p>
                <p className="mt-1 text-sm">Order {claimedOrder?.order_number || latestClaim.order_number} · ₹0</p>
                {latestClaim?.order_status && <p className="mt-1 text-xs text-cocoa/60">Delivery status: {latestClaim.order_status}</p>}
                <p className="mt-1 text-xs text-cocoa/60">Delivery will be handled like your other PAARA orders.</p>
                <Link to={`/account/track-order?order=${encodeURIComponent(claimedOrder?.order_number || latestClaim.order_number)}`} className="mt-3 inline-block text-xs uppercase tracking-widest text-gold underline">Track delivery</Link>
              </div>
            )}
            {loyalty.expiresAt && <p className="mt-3 text-xs text-cocoa/55">Current card valid until {new Date(loyalty.expiresAt).toLocaleDateString("en-IN")}.</p>}
          </div>
        )}
      </div>
    </AccountPageLayout>
  );
}
