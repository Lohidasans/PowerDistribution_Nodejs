const swaggerJsdoc = require("swagger-jsdoc");
const state = require("../models/state");

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
            visibility: { type: "string", enum: ["Show", "Hide"] },
          },
          required: ["label_name"],
        },
        ProductItemDetailInput: {
          type: "object",
          properties: {
            sku_id: { type: "string" },
            variation_name: { type: "string" },
            variation_value: {
              oneOf: [{ type: "string" }, { type: "number" }],
            },
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
              items: {
                $ref: "#/components/schemas/ProductAdditionalDetailInput",
              },
            },
          },
        },
        ProductAddonListResponse: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  sku_id: { type: "string" },
                  product_name: { type: "string" },
                  description: { type: "string" },
                  image_urls: { type: "array", items: { type: "string" } },
                  material_type: { type: "string" },
                  material_image_url: { type: "string" },
                  category_name: { type: "string" },
                  category_image_url: { type: "string" },
                  subcategory_name: { type: "string" },
                  subcategory_image_url: { type: "string" }
                }
              }
            }
          }
        },
        ProductListDetailsResponse: {
          type: "object",
          properties: {
            products: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  product_code: { type: "string" },
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
                  sku_id: { type: "string" },
                  hsn_code: { type: "string" },
                  purity: { type: "number", format: "float" },
                  product_type: { type: "string" },
                  variation_type: { type: "string" },
                  product_variations: { type: "string" },
                  is_addOn: { type: "boolean" },
                  total_grn_value: { type: "number", format: "float" },
                  total_products: { type: "integer" },
                  remaining_weight: { type: "number", format: "float" },
                  created_at: { type: "string", format: "date-time" },
                  updated_at: { type: "string", format: "date-time" },
                  deleted_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  variation_count: { type: "integer" },
                  material_type: { type: "string" },
                },
              },
            },
          },
        },
        ProductAddOnCreateInput: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
            addon_product_id: { type: "integer" },
          },
          required: ["product_id", "addon_product_id"],
        },
        ProductAddOnBulkCreateInput: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
            addon_product_ids: {
              type: "array",
              items: { type: "integer" },
              description: "Array of product IDs to map as add-ons",
            },
          },
          required: ["product_id", "addon_product_ids"],
        },
        ProductAddOn: {
          type: "object",
          properties: {
            id: { type: "integer" },
            product_id: { type: "integer" },
            addon_product_id: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            deleted_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        VendorCreateInput: {
          type: "object",
          properties: {
            vendor_image_url: { type: "string" },
            vendor_code: { type: "string" },
            vendor_name: { type: "string" },
            proprietor_name: { type: "string" },
            email: { type: "string", format: "email" },
            mobile: { type: "string" },
            pan_no: { type: "string" },
            gst_no: { type: "string" },
            address: { type: "string" },
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            opening_balance: { type: "number", format: "float" },
            opening_balance_type: { type: "string", enum: ["Credit", "Debit"] },
            payment_terms: {
              type: "string",
              enum: ["10days", "15days", "20days", "25days", "30days"],
            },
            material_type_ids: { type: "array", items: { type: "integer" } },
            visibilities: { type: "array", items: { type: "integer" } },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: ["vendor_code", "vendor_name", "email"],
        },
        // Nested helpers for create/update across services
        BankAccountNestedInput: {
          type: "object",
          properties: {
            account_holder_name: { type: "string" },
            bank_name: { type: "string" },
            ifsc_code: { type: "string" },
            account_number: { type: "string" },
            bank_branch_name: { type: "string" }
          },
          required: ["account_holder_name", "bank_name", "ifsc_code", "account_number"]
        },
        LoginNestedCreateInput: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password_hash: { type: "string" },
            role_id: { type: "integer" }
          },
          required: ["email", "password_hash"]
        },
        LoginNestedUpdateInput: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            password_hash: { type: "string" },
            role_id: { type: "integer" }
          }
        },
        KycNestedCreateItem: {
          type: "object",
          properties: {
            doc_type: { type: "string" },
            doc_number: { type: "string" },
            file_url: { type: "string" }
          },
          required: ["doc_type"]
        },
        KycNestedUpdateItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            doc_type: { type: "string" },
            doc_number: { type: "string" },
            file_url: { type: "string" }
          },
          required: ["id"]
        },
        VendorSpocNestedCreateItem: {
          type: "object",
          properties: {
            contact_name: { type: "string" },
            designation: { type: "string" },
            mobile: { type: "string" }
          }
        },
        VendorSpocNestedUpdateItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            contact_name: { type: "string" },
            designation: { type: "string" },
            mobile: { type: "string" }
          },
          required: ["id"]
        },
        // Full Vendor payloads (tabs: bank, kyc, spoc, login)
        VendorFullCreateInput: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/VendorCreateInput" },
            {
              type: "object",
              properties: {
                bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
                kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedCreateItem" } },
                spoc_details: { type: "array", items: { $ref: "#/components/schemas/VendorSpocNestedCreateItem" } },
                login: { $ref: "#/components/schemas/LoginNestedCreateInput" }
              }
            }
          ]
        },
        VendorFullUpdateInput: {
          type: "object",
          properties: {
            // vendor core fields are optional on update
            vendor_image_url: { type: "string" },
            vendor_code: { type: "string" },
            vendor_name: { type: "string" },
            proprietor_name: { type: "string" },
            email: { type: "string" },
            mobile: { type: "string" },
            pan_no: { type: "string" },
            gst_no: { type: "string" },
            address: { type: "string" },
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            opening_balance: { type: "number", format: "float" },
            opening_balance_type: { type: "string", enum: ["Debit", "Credit"] },
            payment_terms: { type: "string", enum: ["10days", "15days", "20days", "25days", "30days"] },
            material_type_ids: { type: "array", items: { type: "integer" } },
            visibilities: { type: "array", items: { type: "integer" } },
            status: { type: "string", enum: ["Active", "Inactive"] },
            bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
            kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedUpdateItem" } },
            spoc_details: { type: "array", items: { $ref: "#/components/schemas/VendorSpocNestedUpdateItem" } },
            login: { $ref: "#/components/schemas/LoginNestedUpdateInput" }
          }
        },
        EmployeeCreateInput: {
          type: "object",
          properties: {
            profile_image_url: { type: "string" },
            employee_no: { type: "string" },
            employee_name: { type: "string" },
            department_id: { type: "integer" },
            role_id: { type: "integer" },
            joining_date: { type: "string", format: "date" },
            employment_type: {
              type: "string",
              enum: ["Full-Time", "Part-Time", "Contract"],
            },
            gender: { type: "string", enum: ["Male", "Female", "Other"] },
            date_of_birth: { type: "string", format: "date" },
            branch_id: { type: "integer" },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: [
            "employee_no",
            "employee_name",
            "department_id",
            "role_id",
            "joining_date",
            "employment_type",
            "gender",
            "date_of_birth",
            "branch_id",
          ],
        },
        EmployeeExperienceNestedCreateItem: {
          type: "object",
          properties: {
            organization_name: { type: "string" },
            role: { type: "string" },
            duration_from: { type: "string", format: "date" },
            duration_to: { type: "string", format: "date" },
            location: { type: "string" }
          },
          required: ["organization_name", "role", "duration_from", "duration_to"]
        },
        EmployeeExperienceNestedUpdateItem: {
          type: "object",
          properties: {
            id: { type: "integer" },
            organization_name: { type: "string" },
            role: { type: "string" },
            duration_from: { type: "string", format: "date" },
            duration_to: { type: "string", format: "date" },
            location: { type: "string" }
          },
          required: ["id"]
        },
        EmployeeFullCreateInput: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/EmployeeCreateInput" },
            {
              type: "object",
              properties: {
                contact: { $ref: "#/components/schemas/EmployeeContactCreateInput" },
                bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
                kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedCreateItem" } },
                experiences: { type: "array", items: { $ref: "#/components/schemas/EmployeeExperienceNestedCreateItem" } },
                login: { $ref: "#/components/schemas/LoginNestedCreateInput" }
              }
            }
          ]
        },
        EmployeeFullUpdateInput: {
          type: "object",
          properties: {
            profile_image_url: { type: "string" },
            employee_no: { type: "string" },
            employee_name: { type: "string" },
            department_id: { type: "integer" },
            role_id: { type: "integer" },
            joining_date: { type: "string", format: "date" },
            employment_type: { type: "string", enum: ["Full-Time", "Part-Time", "Contract"] },
            gender: { type: "string", enum: ["Male", "Female", "Other"] },
            date_of_birth: { type: "string", format: "date" },
            branch_id: { type: "integer" },
            status: { type: "string", enum: ["Active", "Inactive"] },
            contact: { $ref: "#/components/schemas/EmployeeContactCreateInput" },
            bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
            kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedUpdateItem" } },
            experiences: { type: "array", items: { $ref: "#/components/schemas/EmployeeExperienceNestedUpdateItem" } },
            login: { $ref: "#/components/schemas/LoginNestedUpdateInput" }
          }
        },
        EmployeeContactCreateInput: {
          type: "object",
          properties: {
            employee_id: { type: "integer" },
            mobile_number: { type: "string" },
            email_id: { type: "string", format: "email" },
            address: { type: "string" },
            country_id: { type: "string" },
            state_id: { type: "string" },
            district_id: { type: "string" },
            pin_code: { type: "string" },
            emergency_contact_person: { type: "string" },
            relationship: {
              type: "string",
              enum: ["Father", "Mother", "Guardian"],
            },
            emergency_contact_number: { type: "string" },
          },
          required: [
            "employee_id",
            "mobile_number",
            "email_id",
            "address",
            "country_id",
            "state_id",
            "pin_code",
            "emergency_contact_person",
            "relationship",
            "emergency_contact_number",
          ],
        },
        EmployeeExperienceBulkCreateInput: {
          type: "object",
          properties: {
            employee_id: { type: "integer" },
            experiences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  organization_name: { type: "string" },
                  role: { type: "string" },
                  duration_from: { type: "string", format: "date" },
                  duration_to: { type: "string", format: "date" },
                  location: { type: "string" },
                },
                required: [
                  "organization_name",
                  "role",
                  "duration_from",
                  "duration_to",
                ],
              },
            },
          },
          required: ["employee_id", "experiences"],
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
            product_type: {
              type: "string",
              enum: ["Weight Based", "Piece Rate"],
            },
            variation_type: {
              type: "string",
              enum: ["Without Variations", "With Variations"],
            },
            product_variation: { type: "string" },
            is_addOn: { type: "boolean" },
            item_details: {
              type: "array",
              items: { $ref: "#/components/schemas/ProductItemDetailInput" },
            },
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
            "variation_type",
          ],
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
            district_id: { type: "integer" },
            state_id: { type: "integer" },
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
            entity_type: {
              type: "string",
              enum: ["branch", "vendor", "employee"],
            },
            entity_id: { type: "integer" },
            documents: {
              type: "array",
              description:
                "Documents to update for the given entity. Each item must include id.",
              items: {
                type: "object",
                properties: {
                  id: { type: "integer" },
                  doc_type: { type: "string" },
                  doc_number: { type: "string" },
                  file_url: { type: "string" },
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
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: ["material_type_id", "category_name"],
        },
        Subcategory: {
          type: "object",
          properties: {
            materialType_id: {
              type: "integer",
              description: "ID of the associated material type",
            },
            category_id: {
              type: "integer",
              description: "ID of the associated category",
            },
            subcategory_name: { type: "string" },
            subcategory_image_url: {
              type: "string",
              description: "Image URL for the subcategory",
            },
            reorder_level: { type: "integer" },
            making_changes: { type: "integer" },
            margin: { type: "number", format: "float" },
          },
          required: ["materialType_id", "category_id", "subcategory_name"],
        },
        Variant: {
          type: "object",
          properties: {
            product_id: {
              type: "integer",
              description: "Optional: link variant to a product",
            },
            variant_type: { type: "string" },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: ["variant_type"],
        },
        VariantCreateInput: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
            variant_type: { type: "string" },
            values: { type: "array", items: { type: "string" } },
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
            variant: { $ref: "#/components/schemas/Variant" },
            variant_values: {
              type: "array",
              items: { $ref: "#/components/schemas/VariantValue" },
            },
          },
        },
        VariantListItem: {
          type: "object",
          properties: {
            S_No: { type: "integer" },
            "Variant Type": { type: "string" },
            Values: { type: "string", description: "Comma separated values" },
          },
        },
        SkuResponse: {
          type: "object",
          properties: {
            sku_id: { type: "string", example: "SKU-GN-0007" },
          },
        },
        ProductDetailRowsResponse: {
          type: "object",
          properties: {
            rows: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_id: { type: "integer" },
                  product_name: { type: "string" },
                  sku_id: { type: "string" },
                  description: { type: "string" },
                  image_urls: { type: "array", items: { type: "string" } },
                  purity: { type: "number", format: "float" },
                  product_type: { type: "string" },
                  variation_type: { type: "string" },
                  is_addOn: { type: "boolean" },
                  total_grn_value: { type: "number", format: "float" },
                  total_products: { type: "integer" },
                  remaining_weight: { type: "number", format: "float" },
                  material_type: { type: "string" },
                  item_id: { type: "integer" },
                  item_sku_id: { type: "string" },
                  width: { type: "number", format: "float" },
                  length: { type: "number", format: "float" },
                  height: { type: "number", format: "float" },
                  measurement_type: { type: "string" },
                  gross_weight: { type: "number", format: "float" },
                  net_weight: { type: "number", format: "float" },
                  quantity: { type: "integer" },
                  rate_per_gram: { type: "number", format: "float" },
                  base_price: { type: "number", format: "float" },
                  making_charge_type: { type: "string" },
                  making_charge: { type: "number", format: "float" },
                  wastage_type: { type: "string" },
                  wastage: { type: "number", format: "float" },
                  label_name: { type: "string" },
                  unit: { type: "string" },
                  addon_price: { type: "number", format: "float" },
                  visibility: { type: "string" },
                },
              },
            },
          },
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
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            opening_balance: { type: "number", format: "float" },
            opening_balance_type: { type: "string", enum: ["Debit", "Credit"] },
            payment_terms: {
              type: "string",
              enum: ["10days", "15days", "20days", "25days", "30days"],
            },
            material_type_ids: { type: "array", items: { type: "integer" } },
            visibilities: { type: "array", items: { type: "integer" } },
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
            product_type: {
              type: "string",
              enum: ["Weight Based", "Piece Rate"],
            },
            variation_type: {
              type: "string",
              enum: ["Without Variations", "With Variations"],
            },
            product_variation: { type: "string" },
            is_addOn: { type: "boolean" },
            total_grn_value: { type: "number", format: "float" },
            total_products: { type: "integer" },
            remaining_weight: { type: "number", format: "float" },
          },
        },
        Country: {
          type: "object",
          properties: {
            country_name: { type: "string" },
            short_name: { type: "string" },
            currency_symbol: { type: "string" },
            country_code: { type: "string" },
            country_image_url: { type: "string" },
          },
          required: ["country_name", "short_name", "currency_symbol"],
        },
        State: {
          type: "object",
          properties: {
            country_id: {
              type: "integer",
              description: "ID of the associated country",
            },
            state_code: { type: "string" },
            state_name: { type: "string" },
          },
          required: ["country_id", "state_code", "state_name"],
        },
        District: {
          type: "object",
          properties: {
            country_id: {
              type: "integer",
              description: "ID of the associated country",
            },
            state_id: {
              type: "integer",
              description: "ID of the associated state",
            },
            short_name: { type: "string" },
            district_name: { type: "string" },
          },
          required: ["country_id", "state_id", "short_name", "district_name"],
        },
        Customer: {
          type: "object",
          properties: {
            id: { type: "integer" },
            customer_code: { type: "string", example: "Cus-0001" },
            customer_name: { type: "string" },
            mobile_number: { type: "string" },
            address: { type: "string" },
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            deleted_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        CustomerCreateInput: {
          type: "object",
          properties: {
            customer_code: { type: "string", nullable: true },
            customer_name: { type: "string" },
            mobile_number: { type: "string" },
            address: { type: "string" },
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
          },
          required: [
            "customer_name",
            "mobile_number",
            "address",
            "country_id",
            "state_id",
            "district_id",
            "pin_code",
          ],
        },
        CustomerUpdateInput: {
          type: "object",
          properties: {
            customer_code: { type: "string", nullable: true },
            customer_name: { type: "string" },
            mobile_number: { type: "string" },
            address: { type: "string" },
            country_id: { type: "integer" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
          },
        },
        CustomerCodeResponse: {
          type: "object",
          properties: {
            customer_code: { type: "string", example: "Cus-0001" },
          },
        },
        // Sales Invoice Bill Schemas
        SalesInvoiceBillHeader: {
          type: "object",
          properties: {
            invoice_no: { type: "string", description: "Auto or manual invoice number" },
            invoice_date: { type: "string", format: "date" },
            invoice_time: { type: "string" },
            employee_id: { type: "integer" },
            customer_id: { type: "integer", nullable: true },
            branch_id: { type: "integer", nullable: true },
            cgst_percent: { type: "number", format: "float", nullable: true },
            sgst_percent: { type: "number", format: "float", nullable: true },
            cgst_amount: { type: "number", format: "float" },
            sgst_amount: { type: "number", format: "float" },
            discount_amount: { type: "number", format: "float", nullable: true },
            round_off: { type: "number", format: "float", nullable: true },
            status: { type: "string", enum: ["Draft", "Printed", "Paid", "Cancelled"] },
            notes: { type: "string", nullable: true }
          }
        },
        SalesInvoiceBillItem: {
          type: "object",
          properties: {
            product_id: { type: "integer" },
            product_item_detail_id: { type: "integer", nullable: true },
            hsn_code: { type: "string", nullable: true },
            product_name_snapshot: { type: "string", nullable: true },
            purity_snapshot: { type: "number", format: "float", nullable: true },
            quantity: { type: "integer" },
            rate: { type: "number", format: "float" },
            discount_amount: { type: "number", format: "float", nullable: true },
            amount: { type: "number", format: "float" },
            cgst_percent: { type: "number", format: "float", nullable: true },
            sgst_percent: { type: "number", format: "float", nullable: true },
            cgst_amount: { type: "number", format: "float" },
            sgst_amount: { type: "number", format: "float" },
            notes: { type: "string", nullable: true }
          }
        },
        SalesInvoiceBillCreateRequest: {
          type: "object",
          properties: {
            header: { $ref: "#/components/schemas/SalesInvoiceBillHeader" },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/SalesInvoiceBillItem" }
            }
          },
          required: ["header", "items"]
        },
        SalesInvoiceBillResponse: {
          type: "object",
          properties: {
            invoice: { type: "object" },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/SalesInvoiceBillItem" }
            }
          }
        },
        EmployeeCreateInput: {
          type: "object",
          properties: {
            profile_image_url: { type: "string" },
            employee_no: { type: "string" },
            employee_name: { type: "string" },
            department_id: { type: "integer" },
            role_id: { type: "integer" },
            joining_date: { type: "string", format: "date" },
            employment_type: {
              type: "string",
              enum: ["Full-Time", "Part-Time", "Contract"],
            },
            gender: { type: "string", enum: ["Male", "Female", "Other"] },
            date_of_birth: { type: "string", format: "date" },
            branch_id: { type: "integer" },
            status: { type: "string", enum: ["Active", "Inactive"] },
          },
          required: [
            "employee_no",
            "employee_name",
            "department_id",
            "role_id",
            "joining_date",
            "employment_type",
            "gender",
            "date_of_birth",
            "branch_id",
          ],
        },
        EmployeeContactCreateInput: {
          type: "object",
          properties: {
            employee_id: { type: "integer" },
            mobile_number: { type: "string" },
            email_id: { type: "string", format: "email" },
            address: { type: "string" },
            country_id: { type: "string" },
            state_id: { type: "string" },
            district_id: { type: "string" },
            pin_code: { type: "string" },
            emergency_contact_person: { type: "string" },
            relationship: {
              type: "string",
              enum: ["Father", "Mother", "Guardian"],
            },
            emergency_contact_number: { type: "string" },
          },
          required: [
            "employee_id",
            "mobile_number",
            "email_id",
            "address",
            "country_id",
            "state_id",
            "pin_code",
            "emergency_contact_person",
            "relationship",
            "emergency_contact_number",
          ],
        },
        SuperAdminProfileCreateInput: {
          type: "object",
          properties: {
            company_name: { type: "string" },
            proprietor: { type: "string" },
            mobile: { type: "string" },
            email: { type: "string", format: "email" },
            address: { type: "string" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            branch_sequence_type: {type: "integer", enum: ["prefix", "suffix"],},
            branch_sequence_value: { type: "string" },
            joining_date: { type: "string", format: "date" },
          },
          required: [
            "company_name",
            "proprietor",
            "mobile",
            "email",
            "address",
            "state_id",
            "district_id",
            "pin_code",
            "branch_sequence_type",
            "branch_sequence_value",
            "joining_date",
          ],
        },
        SuperAdminFullCreateInput: {
          type: "object",
          allOf: [
            { $ref: "#/components/schemas/SuperAdminProfileCreateInput" },
            {
              type: "object",
              properties: {
                bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
                kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedCreateItem" } },
                logins: {
                  type: "array",
                  items: { $ref: "#/components/schemas/LoginNestedCreateInput" },
                  description: "Array of login users to create for superadmin"
                }
              }
            }
          ]
        },
        SuperAdminFullUpdateInput: {
          type: "object",
          properties: {
            company_name: { type: "string" },
            proprietor: { type: "string" },
            mobile: { type: "string" },
            email: { type: "string", format: "email" },
            address: { type: "string" },
            state_id: { type: "integer" },
            district_id: { type: "integer" },
            pin_code: { type: "string" },
            branch_sequence_type: { type: "string", enum: ["prefix", "suffix"] },
            branch_sequence_value: { type: "string" },
            joining_date: { type: "string", format: "date" },
            bank_account: { $ref: "#/components/schemas/BankAccountNestedInput" },
            kyc_documents: { type: "array", items: { $ref: "#/components/schemas/KycNestedUpdateItem" } },
            logins: {
              type: "array",
              items: {
                type: "object",
                allOf: [
                  { $ref: "#/components/schemas/LoginNestedUpdateInput" },
                  { type: "object", properties: { id: { type: "integer" } }, required: ["id"] }
                ]
              },
              description: "Update-only; each item must include id"
            }
          }
        },
      },
    },
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
