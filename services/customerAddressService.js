const commonService = require("./commonService");
const { models, sequelize } = require("../models");

// CREATE address
const createAddress = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { addresses = [] } = req.body;

        if (!Array.isArray(addresses) || addresses.length === 0) {
            return commonService.badRequest(res, "addresses array is required");
        }

        // 1️. Validate required fields
        for (const addr of addresses) {
            if (
                !addr.customer_id ||
                !addr.name ||
                !addr.mobile_number ||
                !addr.address_line
            ) {
                return commonService.badRequest(
                    res,
                    "Required fields missing in one or more addresses"
                );
            }
        }

        // 2️. Validate only ONE default per customer in payload
        const defaultCountMap = {};

        for (const addr of addresses) {
            if (addr.is_default === true) {
                defaultCountMap[addr.customer_id] =
                    (defaultCountMap[addr.customer_id] || 0) + 1;

                if (defaultCountMap[addr.customer_id] > 1) {
                    return commonService.badRequest(
                        res,
                        `Only one default address is allowed for customer_id ${addr.customer_id}`
                    );
                }
            }
        }

        // 3️. Unset existing default if new default is provided
        const defaultAddress = addresses.find(a => a.is_default === true);

        if (defaultAddress) {
            await models.CustomerAddress.update(
                { is_default: false },
                {
                    where: { customer_id: defaultAddress.customer_id },
                    transaction,
                }
            );
        }

        // 4️. Bulk create
        const createdAddresses = await models.CustomerAddress.bulkCreate(
            addresses,
            { transaction }
        );

        await transaction.commit();

        return commonService.createdResponse(res, {
            addresses: createdAddresses,
        });
    } catch (err) {
        await transaction.rollback();
        return commonService.handleError(res, err);
    }
};


// LIST addresses
const getAddresses = async (req, res) => {
    try {
        const { customer_id } = req.query;
        const where = {};

        if (customer_id) where.customer_id = customer_id;

        const rows = await models.CustomerAddress.findAll({
            where,
            order: [
                ["is_default", "DESC"],
                ["created_at", "DESC"],
            ],
        });

        return commonService.okResponse(res, { addresses: rows });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// GET by ID
const getAddressById = async (req, res) => {
    try {
        const address = await models.CustomerAddress.findByPk(req.params.id);
        if (!address) {
            return commonService.notFound(res, "Address not found");
        }
        return commonService.okResponse(res, address);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// UPDATE address
const bulkUpdateAddresses = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { addresses = [] } = req.body;

        if (!Array.isArray(addresses) || addresses.length === 0) {
            return commonService.badRequest(
                res,
                "addresses array is required"
            );
        }

        // Validate IDs
        for (const addr of addresses) {
            if (!addr.id) {
                return commonService.badRequest(
                    res,
                    "Each address must have an id"
                );
            }
        }

        // Check if any address is marked as default
        const defaultAddress = addresses.find(a => a.is_default === true);

        if (defaultAddress) {
            const existingAddress = await models.CustomerAddress.findByPk(
                defaultAddress.id,
                { transaction }
            );

            if (!existingAddress) {
                return commonService.notFound(res, "Address not found");
            }

            // Unset previous defaults for this customer
            await models.CustomerAddress.update(
                { is_default: false },
                {
                    where: {
                        customer_id: existingAddress.customer_id,
                    },
                    transaction,
                }
            );
        }

        // Bulk update (one by one, but inside same transaction)
        const updatedAddresses = [];

        for (const addr of addresses) {
            const address = await models.CustomerAddress.findByPk(addr.id, {
                transaction,
            });

            if (!address) {
                return commonService.notFound(
                    res,
                    `Address not found (ID: ${addr.id})`
                );
            }

            await address.update(addr, { transaction });
            updatedAddresses.push(address);
        }

        await transaction.commit();

        return commonService.okResponse(res, {
            addresses: updatedAddresses,
        });
    } catch (err) {
        await transaction.rollback();
        return commonService.handleError(res, err);
    }
};

// DELETE address (soft delete)
const deleteAddress = async (req, res) => {
    try {
        const address = await models.CustomerAddress.findByPk(req.params.id);
        if (!address) {
            return commonService.notFound(res, "Address not found");
        }

        await address.destroy();
        return commonService.noContentResponse(res);
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

module.exports = {
    createAddress,
    getAddresses,
    getAddressById,
    bulkUpdateAddresses,
    deleteAddress,
};
