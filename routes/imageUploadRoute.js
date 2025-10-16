const express = require("express");
const multer = require("multer");
const imageUploadService = require("../services/imageUploadService");

const imageUploadRoute = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

imageUploadRoute.post(
  "/upload",
  upload.array("files"),
  imageUploadService.uploadImage
);
imageUploadRoute.post(
  "/file/upload",
  upload.array("files"),
  imageUploadService.uploadFile
);
imageUploadRoute.delete("/upload/:filename", imageUploadService.deleteImage);

module.exports = imageUploadRoute;
