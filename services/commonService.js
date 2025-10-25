const enMessage = require("../constants/en.json");
const status = require("../constants/enum");

// Generic function to find an entity by ID
const findById = async (Model, id, res) => {
    const entity = await Model.findByPk(id);
    if (!entity) {
      res.status(status.REST_API_STATUSCODE.notFound).send({
        statusCode: status.REST_API_STATUSCODE.notFound,
        message: enMessage.failure.notFound,
      });
      return null; // Prevents further execution
    }
    return entity;
  };
  
// Standardized OK Response
const okResponse = (res, data = null) => {
  return res.status(status.REST_API_STATUSCODE.ok).send({
    statusCode: status.REST_API_STATUSCODE.ok,
    message: enMessage.success,
    ...(data && { data }),
  });
};

// Standardized Created Response
const createdResponse = (res, data = null) => {
  return res.status(status.REST_API_STATUSCODE.created).send({
    statusCode: status.REST_API_STATUSCODE.created,
    message: enMessage.success,
    ...(data && { data }),
  });
};

// Standardized Bad Request Response
const badRequest = (res, message) => {
  return res.status(status.REST_API_STATUSCODE.badRequest).send({
    statusCode: status.REST_API_STATUSCODE.badRequest,
    message,
  });
};

// Standardized No Content Response (For Deletes)
const noContentResponse = (res) => {
  return res.status(status.REST_API_STATUSCODE.noContent).send({
    statusCode: status.REST_API_STATUSCODE.noContent,
    message: enMessage.success,
  });
};

// Global Error Handler
const handleError = (res, err) => {
  console.error(err);
  return res.status(status.REST_API_STATUSCODE.internalServerError).send({
    statusCode: status.REST_API_STATUSCODE.internalServerError,
    message: enMessage.failure.internalError,
    error: err.message || err,
  });
};

// Standardized Not Found Response
const notFound = (res, message) => {
  return res.status(status.REST_API_STATUSCODE.notFound).send({
    statusCode: status.REST_API_STATUSCODE.notFound,
    message,
  });
};

module.exports = {
  findById,
  okResponse,
  createdResponse,
  badRequest,
  noContentResponse,
  handleError,
  notFound
};
