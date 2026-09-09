import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Seo from "../../components/Seo";
import { useCart } from "../../lib/cart.jsx";
import { useWishlist } from "../../lib/wishlist.jsx";
import { getProducts, getToken } from "../../lib/api";

const Product = () => {
  const navigate = useNavigate();
  const { collectionType } = useParams();

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("featured");
  const [cartMessage, setCartMessage] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { addItem } = useCart();
  const { isSaved, toggle: toggleSaved } = useWishlist();

  const navigateFromMobileMenu = (path) => {
    setIsMobileMenuOpen(false);
    navigate(path);
  };

  const seaBackground =
    "https://img.freepik.com/premium-photo/banner-summer-background-with-white-sand-seashell-starfish-beach_756748-104227.jpg?w=2000";

  /* ==========================================================
     COLLECTION INFORMATION
  ========================================================== */

  const collectionInfo = {
    everyday: {
      name: "Everyday",
      subtitle: "Little pieces for every day",
      eyebrow: "THE EVERYDAY COLLECTION",
      quote: "Little treasures for the moments that quietly matter.",
      description:
        "Delicate jewellery inspired by quiet mornings, ocean pearls and the beauty of everyday moments.",
    },

    festive: {
      name: "Festive",
      subtitle: "Made for moments worth celebrating",
      eyebrow: "THE FESTIVE COLLECTION",
      quote: "Some moments deserve a little more sparkle.",
      description:
        "Elegant statement pieces created for celebrations, glowing evenings and unforgettable memories.",
    },

    minimal: {
      name: "Minimal",
      subtitle: "Simple. Elegant. You.",
      eyebrow: "THE MINIMAL COLLECTION",
      quote: "Elegance lives in the details left untouched.",
      description:
        "Quiet silhouettes and refined forms designed for a timeless expression of personal style.",
    },

    "for-her": {
      name: "For Her",
      subtitle: "She'll love this",
      eyebrow: "FOR HER",
      quote: "For the woman who carries her own light.",
      description:
        "Soft pearls, feminine curves and ocean-inspired details created for the women who make every day beautiful.",
    },

    "for-him": {
      name: "For Him",
      subtitle: "Just for him",
      eyebrow: "FOR HIM",
      quote: "Steady as the shore. Deep as the sea.",
      description:
        "Refined jewellery with sculpted forms, natural textures and understated character.",
    },

    "new-arrivals": {
      name: "New Arrivals",
      subtitle: "Something new to love",
      eyebrow: "NEW ARRIVALS",
      quote: "A new tide brings something beautiful.",
      description:
        "Fresh designs and newly discovered treasures inspired by the colours and textures of the coast.",
    },
  };

  const activeCollection =
    collectionInfo[collectionType] || collectionInfo.everyday;

  /* ==========================================================
     PRODUCT DATABASE
  ========================================================== */

  const fallbackProducts = [
    /* ================= EVERYDAY ================= */

    {
      id: 1,
      slug: "ocean-pearl-necklace",
      name: "Ocean Pearl Necklace",
      category: "everyday",
      price: 2499,
      oldPrice: 2999,
      rating: 4.9,
      reviews: 128,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "BESTSELLER",
      image:
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=85",
      description:
        "A delicate pearl necklace inspired by the calm beauty of the ocean. Finished with a warm golden chain and a luminous central pearl.",
    },

    {
      id: 2,
      slug: "shell-drop-earrings",
      name: "Shell Drop Earrings",
      category: "everyday",
      price: 1899,
      oldPrice: 2299,
      rating: 4.8,
      reviews: 96,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium"],
      badge: "LOVED",
      image:
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=85",
      description:
        "Elegant drop earrings shaped by the softness of seashells and finished with freshwater pearls for an effortless coastal glow.",
    },

    {
      id: 3,
      slug: "pearl-tide-ring",
      name: "Pearl Tide Ring",
      category: "everyday",
      price: 1699,
      oldPrice: 1999,
      rating: 4.8,
      reviews: 112,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "POPULAR",
      image:
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&q=85",
      description:
        "A graceful open ring accented with luminous pearls, inspired by shells resting along the shoreline.",
    },

    {
      id: 4,
      slug: "coastal-charm-bracelet",
      name: "Coastal Charm Bracelet",
      category: "everyday",
      price: 2299,
      oldPrice: 2699,
      rating: 4.7,
      reviews: 88,
      material: "Stainless Steel",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "",
      image:
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85",
      description:
        "A fine bracelet carrying subtle ocean-inspired charms, designed to layer beautifully with your everyday pieces.",
    },

    /* ================= FESTIVE ================= */

    {
      id: 5,
      slug: "moonlight-pearl-set",
      name: "Moonlight Pearl Set",
      category: "festive",
      price: 4499,
      oldPrice: 5499,
      rating: 4.9,
      reviews: 74,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "NEW",
      image:
        "https://images.unsplash.com/photo-1617038260897-41a31f74343d?auto=format&fit=crop&w=1200&q=85",
      description:
        "A luminous pearl set designed for festive evenings, inspired by moonlight shimmering over the sea.",
    },

    {
      id: 6,
      slug: "golden-shell-choker",
      name: "Golden Shell Choker",
      category: "festive",
      price: 3899,
      oldPrice: 4599,
      rating: 4.8,
      reviews: 63,
      material: "Brass",
      finish: "22K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "TRENDING",
      image:
        "https://images.unsplash.com/photo-1596944924616-7b3848851e2b?auto=format&fit=crop&w=1200&q=85",
      description:
        "A statement choker combining organic shell forms with warm gold tones for an elegant festive silhouette.",
    },

    {
      id: 7,
      slug: "sunset-pearl-earrings",
      name: "Sunset Pearl Earrings",
      category: "festive",
      price: 3199,
      oldPrice: 3799,
      rating: 4.9,
      reviews: 57,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "BESTSELLER",
      image:
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=1200&q=85",
      description:
        "Statement pearl drops that capture the soft golden hues of an ocean sunset.",
    },

    {
      id: 8,
      slug: "seafoam-layer-necklace",
      name: "Seafoam Layer Necklace",
      category: "festive",
      price: 3599,
      oldPrice: 4199,
      rating: 4.7,
      reviews: 48,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "",
      image:
        "https://images.unsplash.com/photo-1611085583191-a3b181a88401?auto=format&fit=crop&w=1200&q=85",
      description:
        "A graceful layered necklace with pearl accents designed to add depth and glow to your festive look.",
    },

    /* ================= MINIMAL ================= */

    {
      id: 9,
      slug: "quiet-tide-chain",
      name: "Quiet Tide Chain",
      category: "minimal",
      price: 1799,
      oldPrice: 2099,
      rating: 4.7,
      reviews: 84,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium"],
      badge: "MINIMAL",
      image:
        "https://images.unsplash.com/photo-1599643477877-530eb83abc8e?auto=format&fit=crop&w=1200&q=85",
      description:
        "A fine chain inspired by the quiet rhythm of the shoreline, perfect for everyday layering.",
    },

    {
      id: 10,
      slug: "single-pearl-stud",
      name: "Single Pearl Studs",
      category: "minimal",
      price: 1299,
      oldPrice: 1599,
      rating: 4.8,
      reviews: 104,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small"],
      badge: "ESSENTIAL",
      image:
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85",
      description:
        "A beautifully simple pair of pearl studs designed for those who believe in understated elegance.",
    },

    {
      id: 11,
      slug: "sand-bar-ring",
      name: "Sand Bar Ring",
      category: "minimal",
      price: 1499,
      oldPrice: 1799,
      rating: 4.6,
      reviews: 61,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "",
      image:
        "https://images.unsplash.com/photo-1627293509201-cd1e10e8a2e1?auto=format&fit=crop&w=1200&q=85",
      description:
        "A clean sculpted ring inspired by the soft curves formed by waves across the sand.",
    },

    {
      id: 12,
      slug: "shoreline-bracelet",
      name: "Shoreline Bracelet",
      category: "minimal",
      price: 1999,
      oldPrice: 2299,
      rating: 4.7,
      reviews: 55,
      material: "Stainless Steel",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "",
      image:
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=1200&q=85",
      description:
        "A fine bracelet with a clean silhouette inspired by the meeting point of water and sand.",
    },

    /* ================= FOR HER ================= */

    {
      id: 13,
      slug: "her-ocean-pearl-pendant",
      name: "Her Ocean Pearl Pendant",
      category: "for-her",
      price: 2899,
      oldPrice: 3499,
      rating: 5.0,
      reviews: 141,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium"],
      badge: "FOR HER",
      image: "/images/products/women/chain1.jpg",
      description:
        "A romantic pearl pendant designed to feel like a tiny piece of moonlight captured from the ocean.",
    },

    {
      id: 14,
      slug: "her-shell-earrings",
      name: "Her Shell Earrings",
      category: "for-her",
      price: 2399,
      oldPrice: 2899,
      rating: 4.9,
      reviews: 91,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "GIFT FAVOURITE",
      image: "/images/products/women/chain2.jpg",
      description:
        "Delicate shell-inspired earrings with luminous pearls, made for the woman who carries her own light.",
    },

    {
      id: 15,
      slug: "her-pearl-bloom-ring",
      name: "Pearl Bloom Ring",
      category: "for-her",
      price: 2199,
      oldPrice: 2599,
      rating: 4.8,
      reviews: 72,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "",
      image: "/images/products/women/chain3.jpg",
      description:
        "A delicate ring inspired by flowers, pearls and the soft elegance of a coastal morning.",
    },

    {
      id: 16,
      slug: "her-love-charm-bracelet",
      name: "Her Love Charm Bracelet",
      category: "for-her",
      price: 2699,
      oldPrice: 3199,
      rating: 4.9,
      reviews: 83,
      material: "Stainless Steel",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium"],
      badge: "ROMANTIC",
      image: "/images/products/women/chain4.jpg",
      description:
        "A meaningful charm bracelet carrying tiny symbols of love and the calm beauty of the ocean.",
    },

    {
      id: 31, slug: "her-solitaire-pendant", name: "Solitaire Pendant", category: "for-her",
      price: 2799, oldPrice: 3199, rating: 4.9, reviews: 66, material: "925 Sterling Silver",
      finish: "18K Gold Plated", availability: true, sizes: ["Small", "Medium"], badge: "",
      image: "/images/products/women/chain5.jpg",
      description: "A single luminous stone pendant on a delicate gold chain.",
    },
    {
      id: 32, slug: "her-flower-pendant", name: "Flower Pendant", category: "for-her",
      price: 2999, oldPrice: 3499, rating: 4.9, reviews: 58, material: "925 Sterling Silver",
      finish: "18K Gold Plated", availability: true, sizes: ["Small", "Medium"], badge: "NEW",
      image: "/images/products/women/chain6.jpg",
      description: "A floral pendant with a soft, light-catching finish.",
    },
    {
      id: 33, slug: "her-clover-pendant", name: "Clover Pendant", category: "for-her",
      price: 2899, oldPrice: 3299, rating: 4.8, reviews: 54, material: "925 Sterling Silver",
      finish: "18K Gold Plated", availability: true, sizes: ["Small", "Medium"], badge: "",
      image: "/images/products/women/chain7.jpg",
      description: "An elegant clover pendant with subtle crystal accents.",
    },
    {
      id: 34, slug: "her-orbit-pendant", name: "Orbit Pendant", category: "for-her",
      price: 3099, oldPrice: 3599, rating: 4.9, reviews: 61, material: "925 Sterling Silver",
      finish: "18K Gold Plated", availability: true, sizes: ["Small", "Medium"], badge: "POPULAR",
      image: "/images/products/women/chain8.jpg",
      description: "A sculpted orbit pendant with a bright, refined finish.",
    },
    {
      id: 35, slug: "her-double-stone-pendant", name: "Double Stone Pendant", category: "for-her",
      price: 3199, oldPrice: 3699, rating: 4.9, reviews: 73, material: "925 Sterling Silver",
      finish: "18K Gold Plated", availability: true, sizes: ["Small", "Medium"], badge: "",
      image: "/images/products/women/chain9.jpg",
      description: "A double-stone pendant designed for a warm, understated glow.",
    },
    {
      id: 36, slug: "her-rose-gold-drop-pendant", name: "Rose Gold Drop Pendant", category: "for-her",
      price: 3299, oldPrice: 3799, rating: 4.9, reviews: 68, material: "925 Sterling Silver",
      finish: "Rose Gold", availability: true, sizes: ["Small", "Medium"], badge: "FOR HER",
      image: "/images/products/women/chain10.jpg",
      description: "A rose-gold drop pendant finished with delicate sparkle.",
    },

    {
      id: 37, slug: "her-spherical-studs", name: "Spherical Studs", category: "for-her",
      price: 2199, oldPrice: 2599, rating: 4.8, reviews: 48, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "NEW",
      image: "/images/products/earrings/☆★.jpg",
      description: "Sparkling spherical studs with a refined, everyday finish.",
    },
    {
      id: 38, slug: "her-classic-studs", name: "Classic Studs", category: "for-her",
      price: 1999, oldPrice: 2399, rating: 4.8, reviews: 43, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "",
      image: "/images/products/earrings/180284791331464120.jpg",
      description: "Simple, polished studs designed for effortless daily wear.",
    },
    {
      id: 39, slug: "her-textured-earrings", name: "Textured Earrings", category: "for-her",
      price: 2299, oldPrice: 2699, rating: 4.7, reviews: 39, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "",
      image: "/images/products/earrings/25332816647584589.jpg",
      description: "Textured earrings with a warm gold-toned finish.",
    },
    {
      id: 40, slug: "her-green-diamond-studs", name: "Green Diamond Studs", category: "for-her",
      price: 2499, oldPrice: 2899, rating: 4.9, reviews: 56, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "POPULAR",
      image: "/images/products/earrings/Deal_ Karatcart Women Green American Diamond Stud Earrings.jpg",
      description: "Green stone studs made to add a bright note to everyday looks.",
    },
    {
      id: 41, slug: "her-pearl-heart-drops", name: "Pearl Heart Drops", category: "for-her",
      price: 2699, oldPrice: 3099, rating: 4.9, reviews: 64, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "GIFT FAVOURITE",
      image: "/images/products/earrings/NAMASTE YAARI Elegant Pearl Heart & Bow Drop Earrings for Women _ Korean Gold-Plated White Bowknot Dangle Studs _ Cute Romantic Gift Jewelry for Girls.jpg",
      description: "Romantic pearl heart drops finished with a delicate bow detail.",
    },
    {
      id: 42, slug: "her-bold-hoops", name: "Bold Hoops", category: "for-her",
      price: 2799, oldPrice: 3199, rating: 4.8, reviews: 52, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "",
      image: "/images/products/earrings/NEW IN—Bold hoops and delicate studs for your….jpg",
      description: "A bold hoop silhouette balanced with a polished finish.",
    },
    {
      id: 43, slug: "her-screw-back-studs", name: "Screw Back Studs", category: "for-her",
      price: 2099, oldPrice: 2499, rating: 4.8, reviews: 46, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "",
      image: "/images/products/earrings/Screw Back Studs.jpg",
      description: "Secure screw-back studs with a clean, polished look.",
    },
    {
      id: 44, slug: "her-stone-earrings", name: "Stone Earrings", category: "for-her",
      price: 2399, oldPrice: 2799, rating: 4.7, reviews: 41, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "",
      image: "/images/products/earrings/Stone earrings (1).jpg",
      description: "Stone-set earrings with a subtle, luminous finish.",
    },
    {
      id: 45, slug: "her-stone-drop-earrings", name: "Stone Drop Earrings", category: "for-her",
      price: 2599, oldPrice: 2999, rating: 4.9, reviews: 59, material: "Stainless Steel",
      finish: "Gold Plated", availability: true, sizes: ["One Size"], badge: "FOR HER",
      image: "/images/products/earrings/Stone earrings.jpg",
      description: "Luminous stone drops created for an elevated everyday look.",
    },

    /* ================= FOR HIM ================= */

    {
      id: 17,
      slug: "him-ocean-chain",
      name: "Him Ocean Chain",
      category: "for-him",
      price: 2999,
      oldPrice: 3499,
      rating: 4.8,
      reviews: 69,
      material: "Stainless Steel",
      finish: "Brushed Gold",
      availability: true,
      sizes: ["Medium", "Large"],
      badge: "FOR HIM",
      image: "/images/products/men/chain1.jpg",
      description:
        "A bold yet refined chain inspired by the strength and stillness of the open sea.",
    },

    {
      id: 18,
      slug: "him-coastal-band",
      name: "Coastal Band",
      category: "for-him",
      price: 2199,
      oldPrice: 2599,
      rating: 4.7,
      reviews: 56,
      material: "Titanium Steel",
      finish: "Matte Silver",
      availability: true,
      sizes: ["Medium", "Large"],
      badge: "",
      image: "/images/products/men/chain2.jpg",
      description:
        "A minimal masculine band with a clean finish and coastal-inspired character.",
    },

    {
      id: 19,
      slug: "him-tide-bracelet",
      name: "Tide Bracelet",
      category: "for-him",
      price: 2499,
      oldPrice: 2999,
      rating: 4.8,
      reviews: 63,
      material: "Stainless Steel",
      finish: "Brushed Steel",
      availability: true,
      sizes: ["Medium", "Large"],
      badge: "POPULAR",
      image: "/images/products/men/chain3.jpg",
      description:
        "A structured bracelet inspired by the movement of waves and the strength of coastal stone.",
    },

    {
      id: 20,
      slug: "him-shell-tag-necklace",
      name: "Shell Tag Necklace",
      category: "for-him",
      price: 2799,
      oldPrice: 3199,
      rating: 4.7,
      reviews: 42,
      material: "Stainless Steel",
      finish: "Matte Black",
      availability: true,
      sizes: ["Medium"],
      badge: "",
      image: "/images/products/men/chain4.jpg",
      description:
        "A masculine pendant necklace with an organic shell-inspired tag and understated finish.",
    },

    {
      id: 25, slug: "him-silver-link-chain", name: "Silver Link Chain", category: "for-him",
      price: 2699, oldPrice: 3099, rating: 4.8, reviews: 47, material: "Stainless Steel",
      finish: "Polished Silver", availability: true, sizes: ["Medium", "Large"], badge: "",
      image: "/images/products/men/chain5.jpg",
      description: "A polished silver link chain with a confident, everyday profile.",
    },
    {
      id: 26, slug: "him-box-chain", name: "Box Chain", category: "for-him",
      price: 2399, oldPrice: 2799, rating: 4.7, reviews: 39, material: "Stainless Steel",
      finish: "Polished Silver", availability: true, sizes: ["Medium", "Large"], badge: "",
      image: "/images/products/men/chain6.jpg",
      description: "A clean box chain designed for understated daily wear.",
    },
    {
      id: 27, slug: "him-star-pendant-chain", name: "Star Pendant Chain", category: "for-him",
      price: 2899, oldPrice: 3299, rating: 4.9, reviews: 51, material: "Stainless Steel",
      finish: "Oxidised Silver", availability: true, sizes: ["Medium", "Large"], badge: "NEW",
      image: "/images/products/men/chain7.jpg",
      description: "A slim chain finished with a subtle star pendant.",
    },
    {
      id: 28, slug: "him-cross-chain", name: "Cross Chain", category: "for-him",
      price: 2999, oldPrice: 3499, rating: 4.8, reviews: 44, material: "Stainless Steel",
      finish: "Antique Silver", availability: true, sizes: ["Medium", "Large"], badge: "",
      image: "/images/products/men/chain8.jpg",
      description: "An ornate cross pendant chain with a detailed silver finish.",
    },
    {
      id: 29, slug: "him-crystal-cross-chain", name: "Crystal Cross Chain", category: "for-him",
      price: 3199, oldPrice: 3699, rating: 4.9, reviews: 58, material: "Stainless Steel",
      finish: "Crystal Silver", availability: true, sizes: ["Medium", "Large"], badge: "POPULAR",
      image: "/images/products/men/chain9.jpg",
      description: "A refined cross pendant accented with a bright crystal finish.",
    },
    {
      id: 30, slug: "him-gold-curb-chain", name: "Gold Curb Chain", category: "for-him",
      price: 3299, oldPrice: 3799, rating: 4.9, reviews: 62, material: "Stainless Steel",
      finish: "Gold Tone", availability: true, sizes: ["Medium", "Large"], badge: "FOR HIM",
      image: "/images/products/men/chain10.jpg",
      description: "A bold gold curb chain made to stand out on its own.",
    },

    /* ================= NEW ARRIVALS ================= */

    {
      id: 21,
      slug: "new-pearl-cascade",
      name: "Pearl Cascade",
      category: "new-arrivals",
      price: 3299,
      oldPrice: 3899,
      rating: 5.0,
      reviews: 31,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "NEW",
      image:
        "https://images.unsplash.com/photo-1611085583191-a3b181a88401?auto=format&fit=crop&w=1200&q=85",
      description:
        "A new pearl silhouette designed to move softly like a cascade of ocean foam.",
    },

    {
      id: 22,
      slug: "new-tidal-loop",
      name: "Tidal Loop Earrings",
      category: "new-arrivals",
      price: 2499,
      oldPrice: 2999,
      rating: 4.9,
      reviews: 29,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Medium"],
      badge: "JUST IN",
      image:
        "https://images.unsplash.com/photo-1635767798638-3e25273a8236?auto=format&fit=crop&w=1200&q=85",
      description:
        "Sculpted earrings inspired by the circular movement of waves around the shore.",
    },

    {
      id: 23,
      slug: "new-shore-pearl-ring",
      name: "Shore Pearl Ring",
      category: "new-arrivals",
      price: 1999,
      oldPrice: 2399,
      rating: 4.8,
      reviews: 38,
      material: "925 Sterling Silver",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "NEW",
      image:
        "https://images.unsplash.com/photo-1573408301185-9146fe634ad0?auto=format&fit=crop&w=1200&q=85",
      description:
        "A fresh interpretation of a classic pearl ring with a refined coastal silhouette.",
    },

    {
      id: 24,
      slug: "new-sea-glow-bracelet",
      name: "Sea Glow Bracelet",
      category: "new-arrivals",
      price: 2799,
      oldPrice: 3299,
      rating: 4.9,
      reviews: 27,
      material: "Stainless Steel",
      finish: "18K Gold Plated",
      availability: true,
      sizes: ["Small", "Medium", "Large"],
      badge: "NEW",
      image:
        "https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=1200&q=85",
      description:
        "A delicate new bracelet designed around the warm glow of sunlight touching the sea.",
    },
  ];

  const [catalogProducts, setCatalogProducts] = useState(null);

  useEffect(() => {
    const filters = {
      ...(collectionType === "for-her" ? { gender: "women" } : {}),
      ...(collectionType === "for-him" ? { gender: "men" } : {}),
      ...(collectionType === "everyday" ? { vibe: "everyday" } : {}),
      ...(collectionType === "minimal" ? { vibe: "minimal" } : {}),
      ...(collectionType === "new-arrivals" ? { sort: "newest" } : {}),
    };

    let cancelled = false;
    getProducts(filters)
      .then((data) => {
        if (cancelled) return;
        const apiProducts = Array.isArray(data) ? data : [];
        setCatalogProducts(apiProducts.map((product) => ({
          ...product,
          category: collectionType,
          image: product.images?.[0],
          availability: Number(product.stock) > 0,
          material: product.material || "",
          rating: product.rating || 0,
        })));
      })
      .catch(() => {
        if (!cancelled) setCatalogProducts(null);
      });

    return () => {
      cancelled = true;
    };
  }, [collectionType]);

  const products = catalogProducts || [];

  /* ==========================================================
     CURRENT COLLECTION PRODUCTS
  ========================================================== */

  const collectionProducts = useMemo(() => {
    if (collectionType === "all") {
      return products;
    }

    return products.filter(
      (product) => product.category === collectionType
    );
  }, [collectionType, products]);

  /* ==========================================================
     SEARCH + SORT
  ========================================================== */

  const filteredProducts = useMemo(() => {
    let result = [...collectionProducts];

    if (search.trim()) {
      const searchTerm = search.toLowerCase();

      result = result.filter((product) => {
        return (
          product.name.toLowerCase().includes(searchTerm) ||
          product.category.toLowerCase().includes(searchTerm) ||
          product.material.toLowerCase().includes(searchTerm)
        );
      });
    }

    if (sortBy === "price-low") {
      result.sort((a, b) => a.price - b.price);
    }

    if (sortBy === "price-high") {
      result.sort((a, b) => b.price - a.price);
    }

    if (sortBy === "rating") {
      result.sort((a, b) => b.rating - a.rating);
    }

    if (sortBy === "newest") {
      result.sort((a, b) => b.id - a.id);
    }

    return result;
  }, [collectionProducts, search, sortBy]);

  /* ==========================================================
     WISHLIST
  ========================================================== */

  const toggleWishlist = (id, event) => {
    event.stopPropagation();

    if (!getToken()) {
      navigate("/login");
      return;
    }
    toggleSaved(id).catch((error) => {
      console.error("[paara] wishlist update failed", error);
    });
  };

  /* ==========================================================
     ADD TO CART
  ========================================================== */

  const addToCart = (product, event) => {
    event.stopPropagation();

    if (Number(product.stock) <= 0) return;
    addItem(product.id, 1, product);
    setCartMessage(`${product.name} added to your bag`);

    setTimeout(() => {
      setCartMessage("");
    }, 2200);
  };

  /* ==========================================================
     OPEN PRODUCT DETAILS
  ========================================================== */

  const openProduct = (product) => {
    navigate(`/product/${product.slug}`, {
      state: {
        collectionType: product.category,
      },
    });
  };

  /* ==========================================================
     CATEGORY NAVIGATION
  ========================================================== */

  const categories = [
    {
      name: "Everyday",
      type: "everyday",
    },
    {
      name: "Festive",
      type: "festive",
    },
    {
      name: "Minimal",
      type: "minimal",
    },
    {
      name: "For Her",
      type: "for-her",
    },
    {
      name: "For Him",
      type: "for-him",
    },
    {
      name: "New Arrivals",
      type: "new-arrivals",
    },
  ];

  return (
    <>
      <div
        className="paara-products-page"
        style={{
          "--sea-bg": `url("${seaBackground}")`,
        }}
      >
        <Seo title="Shop Jewellery" description="Shop Paara Jewellery collections, new arrivals and everyday pieces." />
        {/* ====================================================
            NAVBAR
        ===================================================== */}

        <header className="product-navbar">
          <div className="brand-area">
            <button
              className="logo-button"
              onClick={() => navigate("/collections")}
            >
              <span className="logo-script">
                Paara
              </span>

              <small>JEWELLERY</small>
            </button>
          </div>

          <nav className="main-nav">
            <button onClick={() => navigate("/collections")}>
              Home
            </button>

            <button
              className="active"
              onClick={() => navigate("/collections")}
            >
              Collections
            </button>

            <button
              onClick={() => navigate("/collections")}
            >
              Shop
            </button>

            <button>Our Story</button>

          </nav>

          <div className="navbar-actions">
            <button title="Search">⌕</button>

            <button title="Wishlist">
              ♡
              {wishlist.length > 0 && (
                <span className="nav-count">
                  {wishlist.length}
                </span>
              )}
            </button>

            <button title="Bag">♧</button>

            <button
              type="button"
              title="Menu"
              aria-label="Open menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="product-mobile-menu"
              onClick={() => setIsMobileMenuOpen((isOpen) => !isOpen)}
            >
              ☰
            </button>
          </div>
        </header>

        <div
          className={`product-mobile-menu ${isMobileMenuOpen ? "is-open" : ""}`}
          aria-hidden={!isMobileMenuOpen}
        >
          <button
            type="button"
            className="product-mobile-menu-backdrop"
            aria-label="Close menu"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <nav id="product-mobile-menu" className="product-mobile-menu-panel" aria-label="Mobile navigation">
            <button
              type="button"
              className="product-mobile-menu-close"
              aria-label="Close menu"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              ✕
            </button>
            <button type="button" onClick={() => navigateFromMobileMenu("/collections")}>Home</button>
            <button type="button" onClick={() => navigateFromMobileMenu("/collections")}>Collections</button>
            <button type="button" onClick={() => navigateFromMobileMenu("/shop")}>Shop</button>
          </nav>
        </div>

        {/* ====================================================
            HERO
        ===================================================== */}

        <section className="product-hero">
          <div className="hero-background" />

          <div className="hero-water-layer" />

          <div className="floating-shell shell-left">
            🐚
          </div>

          <div className="floating-shell shell-right">
            🐚
          </div>

          <div className="product-hero-content">
            <span className="hero-eyebrow">
              {activeCollection.eyebrow}
            </span>

            <h1>
              {activeCollection.name}
            </h1>

            <div className="hero-line">
              <span />
              <small>✦</small>
              <span />
            </div>

            <p className="hero-quote">
              {activeCollection.quote}
            </p>

            <p className="hero-description">
              {activeCollection.description}
            </p>
          </div>
        </section>

        {/* ====================================================
            CATEGORY STRIP
        ===================================================== */}

        <section className="category-strip">
          <div className="category-scroll">
            {categories.map((category) => (
              <button
                key={category.type}
                className={
                  category.type === collectionType
                    ? "category active"
                    : "category"
                }
                onClick={() =>
                  navigate(`/collections?category=${category.type}`)
                }
              >
                {category.name}
              </button>
            ))}
          </div>
        </section>

        {/* ====================================================
            PAGE HEADER
        ===================================================== */}

        <section className="products-heading">
          <div>
            <span>
              {activeCollection.eyebrow}
            </span>

            <h2>
              {activeCollection.name}
            </h2>

            <p>
              {activeCollection.subtitle}
            </p>
          </div>

          <div className="heading-decoration">
            <span />
            <small>🐚</small>
            <span />
          </div>
        </section>

        {/* ====================================================
            TOOLBAR
        ===================================================== */}

        <section className="product-toolbar-wrapper">
          <div className="product-toolbar">
            <div className="product-count">
              {filteredProducts.length}{" "}
              {filteredProducts.length === 1
                ? "PIECE"
                : "PIECES"}
            </div>

            <div className="toolbar-right">
              <div className="search-box">
                <span>⌕</span>

                <input
                  type="text"
                  placeholder="Search jewellery..."
                  value={search}
                  onChange={(event) =>
                    setSearch(event.target.value)
                  }
                />
              </div>

              <select
                value={sortBy}
                onChange={(event) =>
                  setSortBy(event.target.value)
                }
              >
                <option value="featured">
                  Featured
                </option>

                <option value="newest">
                  Newest
                </option>

                <option value="price-low">
                  Price: Low to High
                </option>

                <option value="price-high">
                  Price: High to Low
                </option>

                <option value="rating">
                  Top Rated
                </option>
              </select>
            </div>
          </div>
        </section>

        {/* ====================================================
            PRODUCT GRID
        ===================================================== */}

        <main className="product-grid-section">
          <div className="product-grid">
            {filteredProducts.map((product) => {
              const isWishlisted = isSaved(product.id);

              return (
                <article
                  className="product-card"
                  key={product.id}
                >
                  <div
                    className="product-image-wrapper"
                    onClick={() => openProduct(product)}
                  >
                    <div className="product-image-bg">
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
                      />
                    </div>

                    {product.badge && (
                      <span className="product-badge">
                        {product.badge}
                      </span>
                    )}

                    <button
                      className={`wishlist-button ${
                        isWishlisted ? "liked" : ""
                      }`}
                      onClick={(event) =>
                        toggleWishlist(
                          product.id,
                          event
                        )
                      }
                      aria-label="Add to wishlist"
                    >
                      {isWishlisted ? "♥" : "♡"}
                    </button>

                    <div className="image-hover-overlay">
                      <span>
                        VIEW PRODUCT
                      </span>
                    </div>
                  </div>

                  <div className="product-card-info">
                    <div className="product-category">
                      {product.category
                        .replace("-", " ")
                        .toUpperCase()}
                    </div>

                    <h3
                      className="font-product-name"
                      onClick={() =>
                        openProduct(product)
                      }
                    >
                      {product.name}
                    </h3>

                    <div className="rating">
                      <span className="stars">
                        ★★★★★
                      </span>

                      <span className="review-count">
                        ({product.reviews})
                      </span>
                    </div>

                    <div className="price-row">
                      <span className="current-price font-numeric">
                        ₹
                        {product.price.toLocaleString(
                          "en-IN"
                        )}
                      </span>

                      <span className="old-price font-numeric">
                        {product.oldPrice != null
                          ? `₹${Number(product.oldPrice).toLocaleString("en-IN")}`
                          : ""}
                      </span>
                    </div>

                    <button
                      className="add-cart-button"
                      disabled={Number(product.stock) <= 0}
                      onClick={(event) =>
                        addToCart(product, event)
                      }
                    >
                      {Number(product.stock) <= 0 ? "OUT OF STOCK" : "ADD TO CART"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="empty-state">
              <div className="empty-shell">
                🐚
              </div>

              <h3>
                Nothing found beneath this tide
              </h3>

              <p>
                Try another search or explore one of
                our other collections.
              </p>

              <button
                onClick={() => {
                  setSearch("");
                  navigate("/collections?category=everyday");
                }}
              >
                EXPLORE EVERYDAY
              </button>
            </div>
          )}
        </main>

        {/* ====================================================
            OCEAN STORY STRIP
        ===================================================== */}

        <section className="ocean-story">
          <div className="ocean-story-image" />

          <div className="ocean-story-overlay" />

          <div className="ocean-story-content">
            <span>
              INSPIRED BY THE SEA
            </span>

            <h2>
              Every piece
              <br />
              carries a little ocean.
            </h2>

            <p>
              Pearls, shells, sunlight and saltwater —
              nature is the heart of Paara.
            </p>

            <div className="wave-symbol">
              <span />
              <b>🐚</b>
              <span />
            </div>
          </div>
        </section>

        {/* ====================================================
            TRUST BAR
        ===================================================== */}

        <section className="trust-bar">
          <div className="trust-item">
            <span className="trust-icon">
              ◇
            </span>

            <div>
              <strong>
                100% BIS Hallmarked
              </strong>

              <small>
                Crafted with care
              </small>
            </div>
          </div>

          <div className="trust-item">
            <span className="trust-icon">
              ↻
            </span>

            <div>
              <strong>
                Easy 7-Day Returns
              </strong>

              <small>
                Shop with confidence
              </small>
            </div>
          </div>

          <div className="trust-item">
            <span className="trust-icon">
              ▱
            </span>

            <div>
              <strong>
                Free Shipping Above ₹999
              </strong>

              <small>
                Delivered to your door
              </small>
            </div>
          </div>

          <div className="trust-item">
            <span className="trust-icon">
              ♢
            </span>

            <div>
              <strong>
                Secure Payments
              </strong>

              <small>
                Safe & trusted checkout
              </small>
            </div>
          </div>
        </section>

        {/* ====================================================
            FOOTER
        ===================================================== */}

        <footer className="products-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <div className="footer-logo">
                Paara
              </div>

              <small>JEWELLERY</small>

              <p>
                Jewellery made to be loved.
                <br />
                Inspired by the ocean.
                <br />
                Made for you.
              </p>
            </div>

            <div className="footer-links">
              <h4>SHOP</h4>

              <button
                onClick={() =>
                  navigate("/collections")
                }
              >
                Collections
              </button>

              <button>
                All Products
              </button>

              <button>
                New Arrivals
              </button>

              <button>
                Best Sellers
              </button>
            </div>

            <div className="footer-links">
              <h4>COMPANY</h4>

              <button>
                Our Story
              </button>

              <button>
                Sustainability
              </button>

              <button>
                Contact Us
              </button>
            </div>

            <div className="footer-links">
              <h4>HELP</h4>

              <button>
                FAQs
              </button>

              <button>
                Shipping & Delivery
              </button>

              <button onClick={() => navigate("/return-policy")}>
                Returns & Exchanges
              </button>

              <button>
                Jewellery Care
              </button>
            </div>

            <div className="footer-newsletter">
              <h4>
                STAY CONNECTED
              </h4>

              <p>
                Join our little corner of the ocean.
              </p>

              <div className="newsletter">
                <input
                  type="email"
                  placeholder="Enter your email"
                />

                <button>
                  →
                </button>
              </div>

              <div className="social">
                <span>◎</span>
                <span>f</span>
                <span>p</span>
                <span>▶</span>
              </div>
            </div>
          </div>

          <div className="copyright">
            <span>
              © 2026 Paara Jewellery. All Rights Reserved.
            </span>

            <span>
              Crafted with ♡ by the ocean.
            </span>
          </div>
        </footer>

        {/* ====================================================
            CART FEEDBACK
        ===================================================== */}

        {cartMessage && (
          <div className="cart-toast">
            <span>✓</span>

            <div>
              <strong>
                Added to bag
              </strong>

              <small>
                {cartMessage.replace(
                  " added to your bag",
                  ""
                )}
              </small>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================
          ALL CSS INSIDE JSX
      ======================================================== */}

      <style>{`
        @import url(
          'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap'
        );

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          background: #f7f2ea;
          color: #322c25;
          font-family: "DM Sans", sans-serif;
        }

        button,
        input,
        select {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        .paara-products-page {
          min-height: 100vh;
          background:
            radial-gradient(
              circle at 10% 14%,
              rgba(93, 167, 168, 0.07),
              transparent 24%
            ),
            radial-gradient(
              circle at 92% 58%,
              rgba(203, 171, 124, 0.10),
              transparent 24%
            ),
            #f8f4ed;
          overflow: hidden;
        }

        /* =====================================================
           NAVBAR
        ====================================================== */

        .product-navbar {
          height: 78px;
          padding: 0 5%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(251, 248, 242, 0.96);
          border-bottom: 1px solid rgba(123, 102, 74, 0.14);
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(18px);
        }

        .logo-button {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          color: inherit;
          background: transparent;
          border: 0;
        }

        .logo-script,
        .footer-logo {
          font-family: "Cormorant Garamond", serif;
          font-style: italic;
          font-weight: 500;
          color: #8b6838;
          font-size: 39px;
          letter-spacing: -2px;
          line-height: 28px;
        }

        .logo-button small,
        .footer-brand small {
          margin-left: 13px;
          margin-top: 8px;
          letter-spacing: 3px;
          color: #6e6256;
          font-size: 7px;
        }

        .main-nav {
          display: flex;
          align-items: center;
          gap: 35px;
        }

        .main-nav button {
          border: 0;
          background: transparent;
          padding: 8px 0;
          color: #655b51;
          font-size: 11px;
          position: relative;
        }

        .main-nav button:hover,
        .main-nav button.active {
          color: #a1763d;
        }

        .main-nav button.active::after {
          content: "";
          position: absolute;
          width: 17px;
          height: 1px;
          left: 50%;
          transform: translateX(-50%);
          bottom: 0;
          background: #ae8346;
        }

        .navbar-actions {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .navbar-actions button {
          position: relative;
          width: 29px;
          height: 29px;
          display: grid;
          place-items: center;
          background: transparent;
          border: 0;
          color: #665d54;
          font-size: 19px;
          transition:
            color .3s ease,
            transform .3s ease;
        }

        .navbar-actions button:hover {
          color: #a57940;
          transform: translateY(-2px);
        }

        .product-mobile-menu {
          position: fixed;
          inset: 0;
          z-index: 200;
          pointer-events: none;
          opacity: 0;
          transition: opacity .3s ease;
        }

        .product-mobile-menu.is-open {
          pointer-events: auto;
          opacity: 1;
        }

        .product-mobile-menu-backdrop {
          position: absolute;
          inset: 0;
          border: 0;
          background: rgba(74, 54, 38, .3);
        }

        .product-mobile-menu-panel {
          position: absolute;
          top: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          gap: 20px;
          width: min(22rem, 85vw);
          height: 100%;
          padding: 24px;
          background: #fbf8f2;
          box-shadow: -12px 0 30px rgba(74, 54, 38, .16);
          transform: translateX(100%);
          transition: transform .3s ease;
        }

        .product-mobile-menu.is-open .product-mobile-menu-panel {
          transform: translateX(0);
        }

        .product-mobile-menu-panel button {
          border: 0;
          padding: 0;
          background: transparent;
          color: #655b51;
          text-align: left;
          font-size: 15px;
        }

        .product-mobile-menu-panel .product-mobile-menu-close {
          align-self: flex-end;
          font-size: 20px;
        }

        .nav-count {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 15px;
          height: 15px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: #a67b41;
          color: white;
          font-size: 8px;
        }

        /* =====================================================
           HERO
        ====================================================== */

        .product-hero {
          min-height: 445px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          overflow: hidden;
          background:
            linear-gradient(
              rgba(241, 242, 233, .77),
              rgba(245, 239, 226, .88)
            ),
            var(--sea-bg);
          background-size: cover;
          background-position: center;
        }

        .hero-background {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 50% 13%,
              rgba(255,255,255,.45),
              transparent 24%
            ),
            linear-gradient(
              to bottom,
              transparent,
              rgba(248,240,226,.3)
            );
        }

        .hero-water-layer {
          position: absolute;
          width: 850px;
          height: 250px;
          right: -200px;
          bottom: -130px;
          border-radius: 50%;
          background: rgba(74, 170, 178, .10);
          transform: rotate(-8deg);
        }

        .product-hero-content {
          position: relative;
          z-index: 3;
          max-width: 790px;
          padding: 75px 20px;
          animation: pageAppear .85s ease both;
        }

        .hero-eyebrow {
          color: #a47d47;
          letter-spacing: 5px;
          font-size: 9px;
        }

        .product-hero h1 {
          margin: 13px 0 13px;
          font-family: "Cormorant Garamond", serif;
          font-weight: 500;
          font-size: clamp(60px, 7vw, 91px);
          line-height: .86;
          color: #332c25;
          letter-spacing: -3px;
        }

        .hero-line {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin: 20px auto;
          width: 170px;
        }

        .hero-line span {
          width: 65px;
          height: 1px;
          background: rgba(164, 126, 70, .43);
        }

        .hero-line small {
          color: #a77d43;
        }

        .hero-quote {
          margin: 0 auto 9px;
          max-width: 670px;
          font-family: "Cormorant Garamond", serif;
          font-style: italic;
          font-size: 22px;
          line-height: 1.4;
          color: #4f473d;
        }

        .hero-description {
          max-width: 560px;
          margin: auto;
          color: #71675d;
          font-size: 12px;
          line-height: 1.8;
        }

        .floating-shell {
          position: absolute;
          z-index: 2;
          font-size: 80px;
          opacity: .45;
          animation: floatShell 7s ease-in-out infinite;
        }

        .shell-left {
          left: 5%;
          bottom: 38px;
          transform: rotate(-18deg);
        }

        .shell-right {
          right: 6%;
          top: 70px;
          font-size: 50px;
          animation-delay: 1.2s;
        }

        /* =====================================================
           CATEGORY STRIP
        ====================================================== */

        .category-strip {
          border-top: 1px solid rgba(129, 103, 70, .13);
          border-bottom: 1px solid rgba(129, 103, 70, .13);
          background: rgba(252,249,243,.82);
          position: sticky;
          top: 78px;
          z-index: 80;
          backdrop-filter: blur(18px);
        }

        .category-scroll {
          max-width: 1200px;
          margin: auto;
          padding: 0 22px;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow-x: auto;
          scrollbar-width: none;
        }

        .category-scroll::-webkit-scrollbar {
          display: none;
        }

        .category {
          flex: 0 0 auto;
          position: relative;
          padding: 18px 22px;
          border: 0;
          background: transparent;
          color: #73695f;
          font-size: 10px;
          letter-spacing: 1.5px;
          transition:
            color .25s ease,
            transform .25s ease;
        }

        .category:hover {
          color: #a5783e;
          transform: translateY(-1px);
        }

        .category.active {
          color: #9e743c;
        }

        .category.active::after {
          content: "";
          position: absolute;
          width: 24px;
          height: 1px;
          background: #ac8046;
          bottom: 7px;
          left: 50%;
          transform: translateX(-50%);
        }

        /* =====================================================
           HEADING
        ====================================================== */

        .products-heading {
          max-width: 1300px;
          margin: 0 auto;
          padding: 78px 5% 38px;
          text-align: center;
        }

        .products-heading span {
          color: #9e7642;
          font-size: 9px;
          letter-spacing: 4px;
        }

        .products-heading h2 {
          margin: 10px 0 0;
          font-family: "Cormorant Garamond", serif;
          font-weight: 500;
          color: #342e27;
          font-size: clamp(48px, 5vw, 67px);
          line-height: .95;
        }

        .products-heading p {
          color: #71675d;
          font-size: 12px;
          margin: 10px 0 22px;
        }

        .heading-decoration {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 10px;
        }

        .heading-decoration span {
          width: 62px;
          height: 1px;
          background: rgba(165, 129, 76, .38);
        }

        .heading-decoration small {
          font-size: 15px;
          color: #a88048;
        }

        /* =====================================================
           TOOLBAR
        ====================================================== */

        .product-toolbar-wrapper {
          max-width: 1300px;
          margin: 0 auto;
          padding: 0 5% 28px;
        }

        .product-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          padding-bottom: 17px;
          border-bottom: 1px solid rgba(125, 103, 75, .16);
        }

        .product-count {
          color: #85796b;
          font-size: 9px;
          letter-spacing: 2px;
        }

        .toolbar-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .search-box {
          width: 235px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid #cbbba4;
          padding: 7px 3px;
        }

        .search-box span {
          color: #91734b;
          font-size: 16px;
        }

        .search-box input {
          flex: 1;
          min-width: 0;
          outline: none;
          border: 0;
          background: transparent;
          color: #50473f;
          font-size: 10px;
        }

        .search-box input::placeholder {
          color: #9b9187;
        }

        .toolbar-right select {
          border: 1px solid rgba(129, 107, 78, .22);
          background: #fbf8f2;
          color: #665c52;
          padding: 9px 14px;
          outline: none;
          font-size: 10px;
        }

        /* =====================================================
           PRODUCTS
        ====================================================== */

        .product-grid-section {
          max-width: 1400px;
          padding: 0 5% 100px;
          margin: auto;
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 25px;
        }

        .product-card {
          min-width: 0;
          position: relative;
          animation: cardAppear .65s ease both;
        }

        .product-card:nth-child(2) {
          animation-delay: .05s;
        }

        .product-card:nth-child(3) {
          animation-delay: .1s;
        }

        .product-card:nth-child(4) {
          animation-delay: .15s;
        }

        .product-image-wrapper {
          position: relative;
          overflow: hidden;
          cursor: pointer;
          background:
            linear-gradient(
              145deg,
              #f7f1e8,
              #e9e1d3
            );
          border: 1px solid rgba(133, 107, 72, .12);
        }

        .product-image-bg {
          aspect-ratio: 4 / 4.8;
          position: relative;
          overflow: hidden;
          background:
            radial-gradient(
              circle at 50% 45%,
              rgba(255,255,255,.9),
              transparent 55%
            ),
            #f4eee5;
        }

        .product-image-bg::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            linear-gradient(
              145deg,
              rgba(255,255,255,.15),
              transparent 38%,
              rgba(76,173,180,.08)
            );
        }

        .product-image-bg img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition:
            transform .75s cubic-bezier(.22,.61,.36,1);
        }

        .product-image-wrapper:hover
        .product-image-bg img {
          transform: scale(1.055);
        }

        .product-badge {
          position: absolute;
          top: 14px;
          left: 14px;
          padding: 6px 10px;
          background: rgba(250,247,239,.92);
          color: #8b6a3d;
          font-size: 7px;
          letter-spacing: 1.5px;
          border: 1px solid rgba(155, 122, 69, .14);
          backdrop-filter: blur(8px);
        }

        .wishlist-button {
          position: absolute;
          z-index: 4;
          top: 12px;
          right: 12px;
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          border: 1px solid rgba(145, 119, 81, .16);
          background: rgba(251,248,243,.9);
          color: #6c6155;
          font-size: 19px;
          transition:
            transform .25s ease,
            color .25s ease,
            background .25s ease;
          backdrop-filter: blur(8px);
        }

        .wishlist-button:hover {
          transform: scale(1.08);
        }

        .wishlist-button.liked {
          color: #9d5d4f;
          animation: heartPop .3s ease;
        }

        .image-hover-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 22px;
          background:
            linear-gradient(
              to top,
              rgba(42, 47, 42, .38),
              transparent 40%
            );
          opacity: 0;
          transition: opacity .35s ease;
        }

        .image-hover-overlay span {
          padding: 11px 17px;
          border: 1px solid rgba(255,255,255,.52);
          background: rgba(250,248,241,.08);
          backdrop-filter: blur(8px);
          color: white;
          font-size: 8px;
          letter-spacing: 2px;
        }

        .product-image-wrapper:hover
        .image-hover-overlay {
          opacity: 1;
        }

        .product-card-info {
          padding: 17px 5px 8px;
          text-align: center;
        }

        .product-category {
          color: #a17843;
          font-size: 7px;
          letter-spacing: 2px;
          margin-bottom: 6px;
        }

        .product-card-info h3 {
          margin: 0;
          color: #3a332b;
          font-family: "Cormorant Garamond", serif;
          font-size: 23px;
          font-weight: 600;
          line-height: 1.05;
          cursor: pointer;
        }

        .rating {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
        }

        .stars {
          color: #b88642;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .review-count {
          color: #8c8278;
          font-size: 8px;
        }

        .price-row {
          margin-top: 8px;
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }

        .current-price {
          color: #41392f;
          font-size: 13px;
          font-weight: 500;
        }

        .old-price {
          color: #999086;
          text-decoration: line-through;
          font-size: 10px;
        }

        .add-cart-button {
          margin-top: 13px;
          width: 100%;
          max-width: 175px;
          border: 1px solid #c8ad83;
          background: transparent;
          color: #926c3c;
          padding: 10px 12px;
          font-size: 8px;
          letter-spacing: 1.6px;
          transition:
            background .3s ease,
            color .3s ease,
            border-color .3s ease;
        }

        .add-cart-button:hover {
          background: #ad8249;
          border-color: #ad8249;
          color: white;
        }

        /* =====================================================
           EMPTY
        ====================================================== */

        .empty-state {
          padding: 100px 20px;
          text-align: center;
        }

        .empty-shell {
          font-size: 55px;
          opacity: .65;
        }

        .empty-state h3 {
          margin: 20px 0 8px;
          font-family: "Cormorant Garamond", serif;
          font-size: 38px;
          font-weight: 500;
        }

        .empty-state p {
          color: #766b60;
          font-size: 12px;
          line-height: 1.7;
        }

        .empty-state button {
          margin-top: 20px;
          border: 1px solid #bd9d70;
          padding: 12px 18px;
          color: #966e3b;
          background: transparent;
          font-size: 8px;
          letter-spacing: 1.8px;
        }

        /* =====================================================
           OCEAN STORY
        ====================================================== */

        .ocean-story {
          min-height: 430px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .ocean-story-image {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(
              rgba(23,79,82,.73),
              rgba(31,90,92,.80)
            ),
            var(--sea-bg);
          background-size: cover;
          background-position: center;
        }

        .ocean-story-overlay {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              circle at 50% 30%,
              rgba(255,255,255,.15),
              transparent 25%
            );
        }

        .ocean-story-content {
          position: relative;
          z-index: 2;
          text-align: center;
          color: white;
          max-width: 650px;
          padding: 80px 24px;
        }

        .ocean-story-content > span {
          font-size: 9px;
          letter-spacing: 4px;
          opacity: .85;
        }

        .ocean-story-content h2 {
          margin: 19px 0 18px;
          font-family: "Cormorant Garamond", serif;
          font-size: clamp(48px,5vw,72px);
          font-weight: 500;
          line-height: .94;
        }

        .ocean-story-content p {
          margin: auto;
          max-width: 480px;
          font-family: "Cormorant Garamond", serif;
          font-size: 19px;
          line-height: 1.5;
          opacity: .91;
        }

        .wave-symbol {
          margin-top: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }

        .wave-symbol span {
          width: 65px;
          height: 1px;
          background: rgba(255,255,255,.35);
        }

        .wave-symbol b {
          font-weight: 400;
          font-size: 16px;
        }

        /* =====================================================
           TRUST BAR
        ====================================================== */

        .trust-bar {
          max-width: 1250px;
          margin: auto;
          padding: 36px 5%;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 25px;
          border-bottom: 1px solid rgba(122, 100, 72, .13);
        }

        .trust-item {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 13px;
        }

        .trust-icon {
          width: 38px;
          height: 38px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border: 1px solid rgba(169, 132, 74, .42);
          border-radius: 50%;
          color: #a2783d;
          font-size: 15px;
        }

        .trust-item strong {
          display: block;
          color: #554b41;
          font-size: 9px;
          font-weight: 500;
        }

        .trust-item small {
          display: block;
          margin-top: 3px;
          color: #8d8377;
          font-size: 8px;
        }

        /* =====================================================
           FOOTER
        ====================================================== */

        .products-footer {
          position: relative;
          background: #f3ede4;
          padding: 72px 6% 24px;
        }

        .footer-inner {
          max-width: 1400px;
          margin: auto;
          display: grid;
          grid-template-columns:
            1.45fr 1fr 1fr 1.15fr 1.45fr;
          gap: 35px;
        }

        .footer-logo {
          font-size: 47px;
        }

        .footer-brand p {
          color: #71675d;
          font-size: 10px;
          line-height: 1.85;
          margin-top: 22px;
        }

        .footer-links {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
        }

        .footer-links h4,
        .footer-newsletter h4 {
          margin: 3px 0 16px;
          font-size: 8px;
          letter-spacing: 2.6px;
          color: #786248;
          font-weight: 500;
        }

        .footer-links button {
          padding: 4px 0;
          border: 0;
          background: transparent;
          color: #71675d;
          font-size: 10px;
          text-align: left;
        }

        .footer-links button:hover {
          color: #a6783d;
        }

        .footer-newsletter p {
          margin: 0 0 11px;
          color: #71675d;
          font-size: 10px;
        }

        .newsletter {
          max-width: 245px;
          border-bottom: 1px solid #c6ac85;
          display: flex;
        }

        .newsletter input {
          min-width: 0;
          flex: 1;
          border: 0;
          outline: none;
          background: transparent;
          padding: 10px 3px;
          font-size: 9px;
        }

        .newsletter button {
          border: 0;
          background: transparent;
          color: #9a713d;
        }

        .social {
          display: flex;
          gap: 12px;
          margin-top: 16px;
          color: #72695f;
        }

        .copyright {
          max-width: 1400px;
          margin: 43px auto 0;
          padding-top: 17px;
          border-top: 1px solid rgba(120, 98, 68, .14);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          color: #8b8175;
          font-size: 8px;
        }

        /* =====================================================
           CART TOAST
        ====================================================== */

        .cart-toast {
          position: fixed;
          z-index: 500;
          right: 24px;
          bottom: 24px;
          min-width: 255px;
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 14px 17px;
          background: rgba(252,249,244,.96);
          border: 1px solid rgba(154, 121, 71, .19);
          box-shadow:
            0 20px 45px rgba(58, 47, 34, .16);
          backdrop-filter: blur(18px);
          animation: toastIn .4s ease both;
        }

        .cart-toast > span {
          width: 31px;
          height: 31px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #aa8147;
          color: white;
          font-size: 13px;
        }

        .cart-toast strong {
          display: block;
          font-size: 10px;
          color: #554b41;
        }

        .cart-toast small {
          display: block;
          margin-top: 3px;
          color: #8d8174;
          font-size: 8px;
        }

        /* =====================================================
           ANIMATIONS
        ====================================================== */

        @keyframes pageAppear {
          from {
            opacity: 0;
            transform: translateY(18px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes cardAppear {
          from {
            opacity: 0;
            transform: translateY(16px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes floatShell {
          0%,
          100% {
            transform: translateY(0) rotate(-8deg);
          }

          50% {
            transform: translateY(-10px) rotate(4deg);
          }
        }

        @keyframes heartPop {
          0% {
            transform: scale(1);
          }

          45% {
            transform: scale(1.25);
          }

          100% {
            transform: scale(1);
          }
        }

        @keyframes toastIn {
          from {
            opacity: 0;
            transform: translateY(15px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        /* =====================================================
           TABLET
        ====================================================== */

        @media (max-width: 1100px) {
          .main-nav {
            gap: 20px;
          }

          .product-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .trust-bar {
            grid-template-columns: repeat(2, 1fr);
          }

          .footer-inner {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        /* =====================================================
           MOBILE
        ====================================================== */

        @media (max-width: 760px) {
          .product-navbar {
            height: 70px;
            padding: 0 18px;
          }

          .main-nav {
            display: none;
          }

          .logo-script {
            font-size: 32px;
          }

          .navbar-actions {
            gap: 7px;
          }

          .navbar-actions button {
            font-size: 17px;
          }

          .product-hero {
            min-height: 455px;
          }

          .product-hero h1 {
            font-size: 59px;
          }

          .hero-quote {
            font-size: 19px;
          }

          .floating-shell {
            opacity: .3;
          }

          .shell-left {
            left: -3%;
          }

          .shell-right {
            right: -2%;
          }

          .category-strip {
            top: 70px;
          }

          .category-scroll {
            justify-content: flex-start;
          }

          .category {
            padding-left: 16px;
            padding-right: 16px;
          }

          .products-heading {
            padding-top: 60px;
          }

          .product-toolbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .toolbar-right {
            width: 100%;
            flex-direction: column;
            align-items: stretch;
          }

          .search-box {
            width: 100%;
          }

          .toolbar-right select {
            width: 100%;
          }

          .product-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }

          .product-card-info h3 {
            font-size: 19px;
          }

          .product-image-wrapper {
            border-radius: 0;
          }

          .image-hover-overlay {
            display: none;
          }

          .add-cart-button {
            font-size: 7px;
            padding: 9px 5px;
          }

          .trust-bar {
            grid-template-columns: 1fr;
          }

          .trust-item {
            justify-content: flex-start;
          }

          .footer-inner {
            grid-template-columns: 1fr 1fr;
            gap: 35px 25px;
          }

          .footer-brand,
          .footer-newsletter {
            grid-column: 1 / -1;
          }

          .copyright {
            flex-direction: column;
            align-items: flex-start;
            line-height: 1.6;
          }
        }

        @media (max-width: 430px) {
          .navbar-actions button:nth-child(1) {
            display: none;
          }

          .product-grid {
            gap: 12px;
          }

          .product-image-bg {
            aspect-ratio: 4 / 5;
          }

          .product-badge {
            top: 9px;
            left: 9px;
            padding: 5px 6px;
          }

          .wishlist-button {
            top: 8px;
            right: 8px;
            width: 29px;
            height: 29px;
            font-size: 16px;
          }

          .product-card-info {
            padding-top: 13px;
          }

          .product-card-info h3 {
            font-size: 17px;
          }

          .stars {
            font-size: 7px;
          }

          .current-price {
            font-size: 11px;
          }

          .old-price {
            font-size: 8px;
          }

          .add-cart-button {
            max-width: none;
          }

          .footer-inner {
            grid-template-columns: 1fr;
          }

          .cart-toast {
            left: 15px;
            right: 15px;
            bottom: 15px;
            min-width: 0;
          }
        }
      `}</style>
    </>
  );
};

export default Product;
