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
            variant_type: { type: "string" },
          },
          required: ["variant_type"],
        },
        VariantValue: {
          type: "object",
          properties: {
            variant_id: {
              type: "integer",
              description: "ID of the associated variant",
            },
            variant_value: { type: "string" },
          },
          required: ["variant_id", "variant_value"],
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
      },
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
