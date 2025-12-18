const { models, sequelize } = require("../models");
const commonService = require("./commonService");
const { Op } = require("sequelize");
const type = require("../constants/enum");

// Add to Wishlist / Cart
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

        if (![type.ITEM_TYPE.WISHLIST, type.ITEM_TYPE.CART].includes(order_item_type)) {
            return commonService.badRequest(res, "Invalid order_item_type");
        }

        // Prevent duplicates
        const existing = await models.CartWishlistItem.findOne({
            where: {
                user_id,
                product_item_id,
                order_item_type,
                deleted_at: null,
            },
            paranoid: false,
        });

        if (existing) {
            return commonService.badRequest(res, "Item already exists");
        }

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
        });

        return commonService.createdResponse(res, { item: row });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// Move item between Wishlist ↔ Cart
const moveItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { order_item_type } = req.body;

        if (![type.ITEM_TYPE.WISHLIST, type.ITEM_TYPE.CART].includes(order_item_type)) {
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

        const whereClause = {
            order_item_type: Number(type),
        };

        // user_id is optional
        if (user_id) {
            whereClause.user_id = Number(user_id);
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


module.exports = {
    addItem,
    moveItem,
    updateQuantity,
    removeItem,
    listItems,
};
