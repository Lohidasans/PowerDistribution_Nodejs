module.exports = (sequelize, DataTypes) => {
    const OrderItem = sequelize.define(
        "order_items",
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            order_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_item_id: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            product_name: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            sku_id: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            quantity: {
                type: DataTypes.INTEGER,
                allowNull: false,
                defaultValue: 1,
            },
            image_url: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            offer_id: { // for the discount on particular pdt comes from offer table
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            // price breakup details
            rate: { // selling price for piece rate and net wt* material price for wt based
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            amount: {  // same as rate
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            discount: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            making_charge:{
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            wastage: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            stone_value: {
                type: DataTypes.DECIMAL(15, 2),
                allowNull: true,
            },
            tax: {  //Gst or Tax amount
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            total_amount: {//(amount+ making CHarge+ Tax)
                type: DataTypes.DECIMAL(15, 2),
                allowNull: false,
            },
            // Product details from the image
            purity: {
                type: DataTypes.STRING,  // e.g., "99.9%"
                allowNull: true,
            },
            gross_weight: {
                type: DataTypes.DECIMAL(10, 2),  // e.g., 46.25
                allowNull: true,
            },
            net_weight: {
                type: DataTypes.DECIMAL(10, 2),  // e.g., 46.25
                allowNull: true,
            },
            stone_weight: {
                type: DataTypes.DECIMAL(10, 2),  // e.g., 2.25
                allowNull: true,
            },
            measurement_details: { //Array of objects: [{label_name, value, measurement_type}]'
                type: DataTypes.JSONB, //[{"label_name": "Length", "value": "18", "measurement_type": "Inches" }]
                allowNull: true,
            },
        },
        {
        timestamps: true,
        createdAt: "created_at",
        updatedAt: "updated_at",
        paranoid: true,
        deletedAt: "deleted_at",
    }
    );

    return OrderItem;
};