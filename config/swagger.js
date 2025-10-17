const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Power Distribution API",
      version: "1.0.0",
      description: "Interactive API documentation",
    },
    servers: [{ url: "http://localhost:5000", description: "Local" }],
    components: {
      securitySchemes: {
        // enable later if JWT is added
        // bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiResponse: {
          type: "object",
          properties: {
            statusCode: { type: "integer" },
            message: { type: "string" },
            data: { type: "object" },
          },
        },
        ProductAdditionalDetailInput: {
          type: "object",
          properties: {
            label_name: { type: "string" },
            unit: { type: "string" },
            price: { type: "number", format: "float" },
            visibility: { type: "string", enum: ["Show", "Hide"] }
          },
          required: ["label_name"],
        },
        ProductItemDetailInput: {
          type: "object",
          properties: {
            sku_id: { type: "string" },
            variation_name: { type: "string" },
            variation_value: { oneOf: [{ type: "string" }, { type: "number" }] },
            gross_weight: { type: "number", format: "float" },
            net_weight: { type: "number", format: "float" },
            stone_weight: { type: "number", format: "float" },
            quantity: { type: "integer" },
            rate_per_gram: { type: "number", format: "float" },
            base_price: { type: "number", format: "float" },
            measurement_type: { type: "string", enum: ["cm", "mm"] },
            width: { type: "number", format: "float" },
            length: { type: "number", format: "float" },
            height: { type: "number", format: "float" },
            additional_details: {
              type: "array",
              items: { $ref: '#/components/schemas/ProductAdditionalDetailInput' }
            }
          }
        },
        ProductCreateInput: {
          type: "object",
          properties: {
            product_name: { type: "string" },
            description: { type: "string" },
            is_published: { type: "boolean" },
            image_urls: { type: "array", items: { type: "string" } },
            qr_image_url: { type: "string" },
            vendor_id: { type: "integer" },
            material_type_id: { type: "integer" },
            category_id: { type: "integer" },
            subcategory_id: { type: "integer" },
            grn_id: { type: "integer" },
            branch_id: { type: "integer" },
            hsn_code: { type: "string" },
            purity: { type: "number", format: "float" },
            product_type: { type: "string", enum: ["Weight Based", "Piece Rate"] },
            variation_type: { type: "string", enum: ["Without Variations", "With Variations"] },
            product_variation: { type: "string" },
            is_addOn: { type: "boolean" },
            item_details: {
              type: "array",
              items: { $ref: '#/components/schemas/ProductItemDetailInput' }
            }
          },
          required: [
            "product_name",
            "description",
            "vendor_id",
            "material_type_id",
            "category_id",
            "subcategory_id",
            "grn_id",
            "hsn_code",
            "purity",
            "product_type",
            "variation_type"
          ]
        },
        Branch: {
          type: "object",
          properties: {
            id: { type: "integer" },
            branch_no: { type: "string" },
            branch_name: { type: "string" },
            contact_person: { type: "string" },
            mobile: { type: "string" },
            email: { type: "string" },
            address: { type: "string" },
            state: { type: "string" },
            city: { type: "string" },
            pin_code: { type: "string" },
            gst_no: { type: "string" },
            signature_url: { type: "string" },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: ["branch_no", "branch_name"],
        },
        BankAccountInput: {
          type: "object",
          properties: {
            account_holder_name: { type: "string" },
            bank_name: { type: "string" },
            ifsc_code: { type: "string" },
            account_number: { type: "string" },
            bank_branch_name: { type: "string" },
            entity_type: {
              type: "string",
              enum: ["branch", "vendor", "employee"],
            },
            entity_id: { type: "integer" },
          },
          required: [
            "account_holder_name",
            "bank_name",
            "ifsc_code",
            "account_number",
          ],
        },
        KycDocumentInput: {
          type: "object",
          properties: {
            documents: {
              type: "array",
              description: "List of KYC documents to be uploaded",
              items: {
                type: "object",
                properties: {
                  doc_type: { type: "string" },
                  doc_number: { type: "string" },
                  file_url: { type: "string" },
                  entity_type: {
                    type: "string",
                    enum: ["branch", "vendor", "employee"],
                  },
                  entity_id: { type: "integer" },
                },
                required: ["doc_type", "entity_type", "entity_id"],
              },
            },
          },
          required: ["documents"],
        },
        KycUpdateByEntityInput: {
          type: "object",
          properties: {
            entity_type: { type: "string", enum: ["branch", "vendor", "employee"] },
            entity_id: { type: "integer" },
            documents: {
              type: "array",
              description: "Documents to update for the given entity. Each item must include id.",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  doc_type: { type: "string" },
                  doc_number: { type: "string" },
                  file_url: { type: "string" }
                },
                required: ["id"],
              },
            },
          },
          required: ["entity_type", "entity_id", "documents"],
        },
        MaterialType: {
          type: "object",
          properties: {
            material_type: { type: "string" },
            material_image_url: {
              type: "string",
              description: "Image URL for the material type",
            },
          },
          required: ["material_type"],
        },
        Category: {
          type: "object",
          properties: {
            material_type_id: {
              type: "integer",
              description: "ID of the associated material type",
            },
            category_name: { type: "string" },
            category_image_url: {
              type: "string",
              description: "Image URL for the category",
            },
            description: { type: "string" },
            sort_order: { type: "integer" },
            status: {
              type: "string",
              enum: ["Active", "Inactive"],
            },
          },
          required: ["material_type", "category_name"],
        },
        Subcategory: {
          type: "object",
          properties: {
            materialType_id: { type: "integer", description: "ID of the associated material type"},
            category_id: { type: "integer",description: "ID of the associated category",},
            subcategory_name: { type: "string" },
            subcategory_image_url: { type: "string",description: "Image URL for the subcategory",},
            reorder_level: { type: "integer" },
            making_changes: { type: "integer" },
            Margin: { type: "number", format: "float" },
          },
          required: ["materialType_id", "category_id", "subcategory_name"],
        },
        Variant: {
          type: "object",
          properties: {
            product_id: { type: "integer", description: "Optional: link variant to a product" },
            variant_type: { type: "string" },
            status: { type: "string", enum: ["Active", "Inactive"] }
          },
          required: ["variant_type"],
        },
        VariantCreateInput: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
            variant_type: { type: "string" },
            values: { type: "array", items: { type: "string" } }
          },
          required: ["variant_type", "values"],
        },
        VariantValue: {
          type: "object",
          properties: {
            variant_id: {
              type: "integer",
              description: "ID of the associated variant",
            },
            value: { type: "string" },
          },
          required: ["variant_id", "value"],
        },
        VariantCreateResponse: {
          type: "object",
          properties: {
            variant: { $ref: '#/components/schemas/Variant' },
            variant_values: {
              type: "array",
              items: { $ref: '#/components/schemas/VariantValue' }
            }
          }
        },
        VariantListItem: {
          type: "object",
          properties: {
            S_No: { type: "integer" },
            "Variant Type": { type: "string" },
            Values: { type: "string", description: "Comma separated values" }
          }
        },
        User: {
          type: "object",
          properties: {
            email: { type: "string" },
            password_hash: { type: "string" },
            entity_type: {
              type: "string",
              enum: ["branch", "vendor", "employee"],
            },
            entity_id: { type: "integer" },
            role_id: { type: "integer" },
          },
          required: ["email", "password_hash"],
        },
        VendorSpocDetails: {
          type: "object",
          properties: {
            vendor_id: { type: "integer" },
            contact_name: { type: "string" },
            designation: { type: "string" },
            mobile: { type: "string" },
          },
          required: ["vendor_id"],
        },
        Vendor: {
          type: "object",
          properties: {
            vendor_image_url: { type: "string" },
            vendor_code: { type: "string" },
            vendor_name: { type: "string" },
            proprietor_name: { type: "string" },
            email: { type: "string" },
            mobile: { type: "string" },
            pan_no: { type: "string" },
            gst_no: { type: "string" },
            address: { type: "string" },
            country: { type: "string" },
            state: { type: "string" },
            district: { type: "string" },
            pin_code: { type: "string" },
            opening_balance: { type: "number", format: "float" },
            opening_balance_type: { type: "string", enum: ["Debit", "Credit"] },
            payment_terms: { type: "string" },
            material_type: { type: "string" },
            branch_id: { type: "integer" },
            visibility: { type: "string", enum: ["Public", "Private"] },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: ["vendor_code", "vendor_name", "email"],
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "integer" },
            product_code: { type: "string" },
            product_name: { type: "string" },
            description: { type: "string" },
            is_published: { type: "boolean" },
            image_urls: {
              type: "array",
              items: { type: "string" },
              description: "List of product image URLs",
            },
            qr_image_url: { type: "string" },
            vendor_id: { type: "integer" },
            material_type_id: { type: "integer" },
            category_id: { type: "integer" },
            subcategory_id: { type: "integer" },
            grn_id: { type: "integer" },
            branch_id: { type: "integer" },
            sku_id: { type: "string" },
            hsn_code: { type: "string" },
            purity: { type: "number", format: "float" },
            product_type: { type: "string", enum: ["Weight Based", "Piece Rate"] },
            variation_type: { type: "string", enum: ["Without Variations", "With Variations"] },
            product_variation: { type: "string" },
            is_addOn: { type: "boolean" },
            total_grn_value: { type: "number", format: "float" },
            total_products: { type: "integer" },
            remaining_weight: { type: "number", format: "float" },
          },
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
