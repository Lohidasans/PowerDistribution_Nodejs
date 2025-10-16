const AWS = require("aws-sdk");
const { s3Upload, fileUpload } = require("../utils/s3ImageUpload");
const commonService = require("../services/commonService");

// AWS is configured globally in utils/s3ImageUpload.js
const s3 = new AWS.S3();

// Upload Image
const uploadImage = async (req, res) => {
  console.log(req.files, "req.files");
  try {
    if (!req.files || req.files.length === 0) {
      return commonService.badRequest(res, "No files uploaded.");
    }

    const results = await s3Upload(req.files);
    return commonService.createdResponse(res, { images: results });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Delete Image
const deleteImage = async (req, res) => {
  try {
    const filename = req.params.filename;
    if (!filename) {
      return commonService.badRequest(res, "Filename is required.");
    }

    await s3
      .deleteObject({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filename,
      })
      .promise();

    return commonService.noContentResponse(res);
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

// Upload File
const uploadFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return commonService.badRequest(res, "No files uploaded.");
    }

    const results = await fileUpload(req.files);
    return commonService.createdResponse(res, { file: results });
  } catch (err) {
    return commonService.handleError(res, err);
  }
};

module.exports = { uploadImage, deleteImage, uploadFile };
