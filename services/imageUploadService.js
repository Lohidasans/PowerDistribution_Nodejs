const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { s3Upload, fileUpload } = require("../utils/s3ImageUpload");
const commonService = require("../services/commonService");

// S3 Client (AWS SDK v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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

    const command = new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: filename,
    });

    await s3.send(command);

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
