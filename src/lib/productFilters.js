export const GENDERS = ["women", "men"];
export const SHOP_FOR = ["jewellery_sets", "couple_sets"];
export const FEATURES = ["anti-tarnish", "waterproof", "hypoallergenic"];
export const VIBES = ["everyday", "statement", "minimal"];

export const formatFilterLabel = (value) =>
  value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
