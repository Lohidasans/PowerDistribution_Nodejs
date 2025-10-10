const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Power Distribution API',
      version: '1.0.0',
      description: 'Interactive API documentation',
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Local' },
    ],
    components: {
      securitySchemes: {
        // enable later if JWT is added
        // bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            statusCode: { type: 'integer' },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        Branch: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            branch_no: { type: 'string' },
            branch_name: { type: 'string' },
            contact_person: { type: 'string' },
            mobile: { type: 'string' },
            email: { type: 'string' },
            address: { type: 'string' },
            state: { type: 'string' },
            city: { type: 'string' },
            pin_code: { type: 'string' },
            gst_no: { type: 'string' },
            signature_url: { type: 'string' },
            status: { type: 'string', enum: ['Active', 'Inactive'] },
          },
          required: ['branch_no', 'branch_name'],
        },
      },
    },
  },
  apis: [
    './routes/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
