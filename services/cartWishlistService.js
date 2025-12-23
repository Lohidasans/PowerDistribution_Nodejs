const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const enumType = require("../constants/enum");

// Add to Wishlist / Cart - Create
const addItem = async (req, res) => {
    try {
        const {
            user_id,
            product_id,
            product_item_id,
            order_item_type,
            quantity = 1,
            product_name,
            net_weight,
            sku_id,
            thumbnail_image,
            estimated_price,
        } = req.body;

        if (![enumType.ITEM_TYPE.WISHLIST, enumType.ITEM_TYPE.CART].includes(order_item_type)) {
            return commonService.badRequest(res, "Invalid order_item_type");
        }

        const is_wishlisted = order_item_type === enumType.ITEM_TYPE.WISHLIST;
        const is_in_cart = order_item_type === enumType.ITEM_TYPE.CART;

        const existing = await models.CartWishlistItem.findOne({
            where: {
                user_id,
                product_item_id,
                order_item_type,
            },
            paranoid: false,
        });

        // Row exists (active OR deleted) → RESTORE / UPDATE
        if (existing) {
            if (existing.deleted_at) {
                await existing.restore();
            }

            await existing.update({
                product_id,
                quantity,
                net_weight,
                product_name,
                sku_id,
                thumbnail_image,
                estimated_price,
                is_wishlisted,
                is_in_cart,
                deleted_at: null,
            });

            return commonService.okResponse(res, {
                item: existing,
                message: "Same Item Already exists.",
            });
        }

        //  Create new row
        const row = await models.CartWishlistItem.create({
            user_id,
            product_id,
            product_item_id,
            order_item_type,
            quantity,
            net_weight,
            product_name,
            sku_id,
            thumbnail_image,
            estimated_price,
            is_wishlisted,
            is_in_cart,
        });

        return commonService.createdResponse(res, { item: row });

    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Move item between Wishlist ↔ Cart - Update
const moveItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { order_item_type } = req.body;

        if (![enumType.ITEM_TYPE.WISHLIST, enumType.ITEM_TYPE.CART].includes(order_item_type)) {
            return commonService.badRequest(
                res,
                "Invalid order_item_type. Use 1 for Wishlist, 2 for Cart"
            );
        }

        const item = await models.CartWishlistItem.findByPk(id);
        if (!item) {
            return commonService.notFound(res, "Item not found");
        }

        // No-op check
        if (item.order_item_type === order_item_type) {
            return commonService.badRequest(
                res,
                "Item is already in the requested state"
            );
        }

        await item.update({ order_item_type });

        return commonService.okResponse(res, { item });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Update Quantity (Cart only)
const updateQuantity = async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity } = req.body;

        if (quantity <= 0) {
            return commonService.badRequest(res, "Quantity must be greater than 0");
        }

        const item = await models.CartWishlistItem.findByPk(id);
        if (!item || item.order_item_type !== ITEM_TYPE.CART) {
            return commonService.badRequest(res, "Invalid cart item");
        }

        await item.update({ quantity });

        return commonService.okResponse(res, { item });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Remove item (soft delete)
const removeItem = async (req, res) => {
    try {
        const item = await models.CartWishlistItem.findByPk(req.params.id);
        if (!item) {
            return commonService.notFound(res, "Item not found");
        }

        await item.destroy();
        return commonService.noContentResponse(res);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// List Wishlist or Cart
const listItems = async (req, res) => {
    try {
        const { user_id, type } = req.query;

        if (!type) {
            return commonService.badRequest(res, "type is required");
        }

        const itemType = Number(type);

        if (![enumType.ITEM_TYPE.WISHLIST, enumType.ITEM_TYPE.CART].includes(itemType)) {
            return commonService.badRequest(res, "Invalid type");
        }

        const whereClause = {
            order_item_type: itemType,
            deleted_at: null, // respect soft delete
        };

        // user_id is optional
        if (user_id) {
            whereClause.user_id = Number(user_id);
        }

        // filter by correct boolean flag
        if (itemType === enumType.ITEM_TYPE.WISHLIST) {
            whereClause.is_wishlisted = true;
        }

        if (itemType === enumType.ITEM_TYPE.CART) {
            whereClause.is_in_cart = true;
        }

        const rows = await models.CartWishlistItem.findAll({
            where: whereClause,
            order: [["created_at", "DESC"]],
        });

        return commonService.okResponse(res, { items: rows });

    } catch (err) {
        return commonService.handleError(res, err);
    }
};


// Toggle Wishlist by Product ID - Update
const updateWishlistByProduct = async (req, res) => {
    try {
        const { product_id } = req.params;
        const { is_wishlisted, user_id, product_item_id } = req.body;

        const WISHLIST_TYPE = enumType.ITEM_TYPE.WISHLIST;

        // Find existing record (even if soft-deleted)
        const existing = await models.CartWishlistItem.findOne({
            where: {
                user_id,
                product_id,
                product_item_id,
                order_item_type: WISHLIST_TYPE,
            },
            paranoid: false
        });

        // Do NOT create new record
        if (!existing) {
            return commonService.badRequest(res, "Wishlist record does not exist");
        }

        // ADD TO WISHLIST
        if (is_wishlisted) {
            await existing.update({
                is_wishlisted: true,
                deleted_at: null
            });

            return commonService.okResponse(res, {
                is_wishlisted: true,
                message: "Wishlist updated"
            });
        }

        // REMOVE FROM WISHLIST
        await existing.update({
            is_wishlisted: false,
            deleted_at: new Date()
        });

        return commonService.okResponse(res, {
            is_wishlisted: false,
            message: "Removed from wishlist"
        });

    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Toggle Cart by Product ID - Update
const updateCartByProduct = async (req, res) => {
    try {
        const { product_id } = req.params;
        const { is_in_cart, user_id, product_item_id } = req.body;

        const WISHLIST_TYPE = enumType.ITEM_TYPE.CART;

        // Find existing record (even if soft-deleted)
        const existing = await models.CartWishlistItem.findOne({
            where: {
                user_id,
                product_id,
                product_item_id,
                order_item_type: WISHLIST_TYPE,
            },
            paranoid: false
        });

        // Do NOT create new record
        if (!existing) {
            return commonService.badRequest(res, "Cart record does not exist");
        }

        // ADD TO WISHLIST
        if (is_in_cart) {
            await existing.update({
                is_in_cart: true,
                deleted_at: null
            });

            return commonService.okResponse(res, {
                is_in_cart: true,
                message: "Cart updated"
            });
        }

        // REMOVE FROM WISHLIST
        await existing.update({
            is_in_cart: false,
            deleted_at: new Date()
        });

        return commonService.okResponse(res, {
            is_in_cart: false,
            message: "Removed from Cart"
        });

    } catch (err) {
        return commonService.handleError(res, err);
    }
};




module.exports = {
    addItem,
    moveItem,
    updateQuantity,
    removeItem,
    listItems,
    updateWishlistByProduct,
    updateCartByProduct
};
