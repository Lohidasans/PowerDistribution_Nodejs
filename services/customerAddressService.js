const commonService = require("./commonService");
const { models, sequelize } = require("../models");

const enrichAddressLocationNames = async (addresses) => {
    if (!addresses || addresses.length === 0) {
        return [];
    }

    const countryIds = [
        ...new Set(
            addresses
                .map((address) => address.country_id)
                .filter((id) => id !== null && id !== undefined)
        ),
    ];

    const stateIds = [
        ...new Set(
            addresses
                .map((address) => address.state_id)
                .filter((id) => id !== null && id !== undefined)
        ),
    ];

    const districtIds = [
        ...new Set(
            addresses
                .map((address) => Number(address.district_id))
                .filter((id) => Number.isInteger(id))
        ),
    ];

    const [countries, states, districts] = await Promise.all([
        countryIds.length
            ? models.Country.findAll({
                where: { id: countryIds },
                attributes: ["id", "country_name"],
                raw: true,
            })
            : [],
        stateIds.length
            ? models.State.findAll({
                where: { id: stateIds },
                attributes: ["id", "state_name"],
                raw: true,
            })
            : [],
        districtIds.length
            ? models.District.findAll({
                where: { id: districtIds },
                attributes: ["id", "district_name"],
                raw: true,
            })
            : [],
    ]);

    const countryNameMap = new Map(
        countries.map((country) => [String(country.id), country.country_name])
    );

    const stateNameMap = new Map(
        states.map((state) => [String(state.id), state.state_name])
    );

    const districtNameMap = new Map(
        districts.map((district) => [String(district.id), district.district_name])
    );

    return addresses.map((address) => ({
        ...address,
        country_name: countryNameMap.get(String(address.country_id)) || null,
        state_name: stateNameMap.get(String(address.state_id)) || null,
        district_name: districtNameMap.get(String(address.district_id)) || null,
    }));
};

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

        // 4️. For online customers, sync address/location details onto the
        // customer profile the first time they add an address.
        const uniqueCustomerIds = [...new Set(addresses.map((a) => a.customer_id))];

        for (const customerId of uniqueCustomerIds) {
            const existingAddressCount = await models.CustomerAddress.count({
                where: { customer_id: customerId },
                transaction,
            });

            if (existingAddressCount > 0) continue;

            const customer = await models.Customer.findByPk(customerId, {
                transaction,
            });

            if (!customer || !customer.is_online) continue;

            const addrForCustomer =
                addresses.find(
                    (a) => a.customer_id === customerId && a.is_default === true
                ) || addresses.find((a) => a.customer_id === customerId);

            await customer.update(
                {
                    address: addrForCustomer.address_line,
                    country_id:
                        addrForCustomer.country_id !== undefined
                            ? +addrForCustomer.country_id
                            : null,
                    state_id:
                        addrForCustomer.state_id !== undefined
                            ? +addrForCustomer.state_id
                            : null,
                    district_id:
                        addrForCustomer.district_id !== undefined
                            ? +addrForCustomer.district_id
                            : null,
                    pin_code: addrForCustomer.pin_code,
                },
                { transaction }
            );
        }

        // 5️. Bulk create
        const createdAddresses = await models.CustomerAddress.bulkCreate(
            addresses,
            { transaction }
        );

        await transaction.commit();

        const enrichedAddresses = await enrichAddressLocationNames(
            createdAddresses.map((addr) => addr.toJSON())
        );

        return commonService.createdResponse(res, {
            addresses: enrichedAddresses,
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

        const enrichedAddresses = await enrichAddressLocationNames(
            rows.map((row) => row.toJSON())
        );

        return commonService.okResponse(res, { addresses: enrichedAddresses });
    } catch (err) {
        return commonService.handleError(res, err);
    }
};

// GET by ID
const getAddressById = async (req, res) => {
    try {
        const address = await models.CustomerAddress.findByPk(req.params.id);
        if (!address) {
            return commonService.okResponse(res, "Address not found");
        }

        const [enrichedAddress] = await enrichAddressLocationNames([
            address.toJSON(),
        ]);

        return commonService.okResponse(res, enrichedAddress);
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
