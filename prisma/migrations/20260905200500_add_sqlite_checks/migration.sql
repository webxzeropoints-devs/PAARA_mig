ALTER TABLE "categories"
  ADD CONSTRAINT "categories_gender_check"
  CHECK ("gender" IN ('men', 'women', 'unisex'));

ALTER TABLE "password_reset_otps"
  ADD CONSTRAINT "password_reset_otps_user_type_check"
  CHECK ("user_type" IN ('customer', 'admin'));

ALTER TABLE "loyalty_cards"
  ADD CONSTRAINT "loyalty_cards_stamp_count_check"
  CHECK ("stamp_count" BETWEEN 0 AND 6);

ALTER TABLE "gift_card_rules"
  ADD CONSTRAINT "gift_card_rules_gift_card_value_check"
  CHECK ("gift_card_value" > 0);

ALTER TABLE "coupons"
  ADD CONSTRAINT "coupons_discount_type_check"
  CHECK ("discount_type" IN ('percent', 'flat'));

ALTER TABLE "collection_tiles"
  ADD CONSTRAINT "collection_tiles_tile_key_check"
  CHECK ("tile_key" IN ('pearls', 'gold', 'ocean'));

ALTER TABLE "tile_products"
  ADD CONSTRAINT "tile_products_tile_key_check"
  CHECK ("tile_key" IN ('pearls', 'gold', 'ocean'));
