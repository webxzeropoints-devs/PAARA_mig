import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  claimLoyaltyRewardByToken,
  getAddresses,
  getLoyaltyRewardClaim,
  getToken,
} from "../../lib/api";
import AccountPageLayout from "./AccountPageLayout";

export default function LoyaltyRewardClaimPage() {
  const { token = "" } = useParams();
  const location = useLocation();
  const authed = Boolean(getToken());
  const [claim, setClaim] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState("");
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    let active = true;
    getLoyaltyRewardClaim(token)
      .then((result) => {
        if (!active) return;
        setClaim(result);
        if (result.claimed && result.orderNumber) {
          setOrder({
            order_number: result.orderNumber,
            status: result.orderStatus,
          });
        }
      })
      .catch((err) => {
        if (active) setError(err?.message || "This reward claim link is invalid or has expired.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!authed) return undefined;
    let active = true;
    getAddresses()
      .then((result) => {
        if (!active) return;
        const list = Array.isArray(result) ? result : [];
        setAddresses(list);
        setAddressId((current) => current || String(
          list.find((address) => address.is_default)?.id || list[0]?.id || ""
        ));
      })
      .catch((err) => {
        if (active) setError(err?.message || "Could not load your saved delivery addresses.");
      });
    return () => {
      active = false;
    };
  }, [authed]);

  const handleClaim = async () => {
    if (!addressId) {
      setError("Add a delivery address before claiming your reward.");
      return;
    }
    setClaiming(true);
    setError("");
    try {
      const result = await claimLoyaltyRewardByToken(token, Number(addressId));
      setOrder(result.order || null);
    } catch (err) {
      setError(err?.message || "Could not claim your PAARA reward.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <AccountPageLayout title="Your PAARA Reward" subtitle="A little something to celebrate your loyalty.">
      <Helmet>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <section className="max-w-2xl border border-gold/30 bg-white/70 p-6 sm:p-8">
        {loading ? (
          <p className="text-sm text-cocoa/65" role="status">Loading your reward…</p>
        ) : error && !claim ? (
          <>
            <p className="font-display text-2xl text-cocoa">This claim link is unavailable</p>
            <p className="mt-3 text-sm leading-relaxed text-cocoa/65">{error}</p>
            <Link to="/account/loyalty" className="mt-6 inline-flex bg-gold px-6 py-3 text-xs uppercase tracking-widest text-white">View loyalty card</Link>
          </>
        ) : claim ? (
          <>
            <p className="text-[10px] uppercase tracking-[.28em] text-gold">Six stamps. One special gift.</p>
            <h1 className="mt-2 font-display text-3xl text-cocoa">Claim your reward</h1>
            {claim.imageUrl && (
              <img src={claim.imageUrl} alt={claim.rewardName} className="mt-6 max-h-72 w-full object-contain bg-sand" />
            )}
            <p className="mt-5 text-sm text-cocoa/65">Your selected PAARA Jewellery reward</p>
            <p className="mt-1 font-product-name text-xl text-cocoa">{claim.rewardName}</p>
            <p className="mt-4 text-sm leading-relaxed text-cocoa/70">
              Sign in to your PAARA account and choose a saved delivery address. The reward and standard delivery are complimentary.
            </p>
            <p className="mt-4 border-t border-cocoa/10 pt-4 text-xs leading-relaxed text-cocoa/55">
              {claim.terms} Valid until {new Date(claim.expiresAt).toLocaleDateString("en-IN")}.
            </p>
            {error && <p className="mt-4 bg-red-50 px-4 py-3 text-xs text-red-700" role="alert">{error}</p>}
            {order ? (
              <div className="mt-6 border border-gold/40 bg-gold/10 p-4">
                <p className="font-display text-xl text-cocoa">Your gift order is confirmed</p>
                <p className="mt-2 text-sm text-cocoa/70">Order {order.order_number} · ₹0</p>
                <Link to={`/account/track-order?order=${encodeURIComponent(order.order_number)}`} className="mt-4 inline-block text-xs uppercase tracking-widest text-gold underline">Track delivery</Link>
              </div>
            ) : !authed ? (
              <Link
                to="/login"
                state={{ redirectTo: location.pathname }}
                className="mt-6 inline-flex bg-gold px-6 py-3 text-xs uppercase tracking-widest text-white transition-colors hover:bg-cocoa"
              >
                Sign in to claim
              </Link>
            ) : addresses.length > 0 ? (
              <>
                <label className="mt-6 block text-xs uppercase tracking-widest text-cocoa/60">
                  Deliver to
                  <select value={addressId} onChange={(event) => setAddressId(event.target.value)} className="mt-2 w-full border border-cocoa/20 bg-sand px-3 py-3 text-sm normal-case tracking-normal text-cocoa">
                    {addresses.map((address) => (
                      <option key={address.id} value={address.id}>
                        {address.line1}, {address.city}, {address.state} {address.pincode}{address.is_default ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleClaim} disabled={claiming || !addressId} className="mt-5 bg-gold px-7 py-3 text-xs uppercase tracking-widest text-white transition-colors hover:bg-cocoa disabled:opacity-50">
                  {claiming ? "Placing your free order…" : "Claim Yours"}
                </button>
              </>
            ) : (
              <Link to="/account/addresses" className="mt-6 inline-flex bg-gold px-6 py-3 text-xs uppercase tracking-widest text-white">
                Add a delivery address
              </Link>
            )}
          </>
        ) : null}
      </section>
    </AccountPageLayout>
  );
}
