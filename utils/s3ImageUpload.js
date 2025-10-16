const AWS = require("aws-sdk");

// Configure AWS globally to avoid repeated configuration
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "ap-south-1",
});

const s3 = new AWS.S3();

exports.s3Upload = async (files) => {
  try {
    const params = files.map((file) => {
      const sanitizedName = file.originalname
        .replace(/\s+/g, "_")
        .replace(/[^a-zA-Z0-9._-]/g, "");
      return {
        Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
        Key: sanitizedName,
        Body: file.buffer,
      };
    });

    console.log(
      "Uploading files to S3:",
      params.map((p) => ({ Bucket: p.Bucket, Key: p.Key }))
    );
    return await Promise.all(params.map((param) => s3.upload(param).promise()));
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};

exports.fileUpload = async (files) => {
  const params = files?.map((file) => {
    const sanitizedName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9._-]/g, "");

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
      Key: sanitizedName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    // Only add ACL if it's configured in environment
    if (process.env.AWS_ACL) {
      uploadParams.ACL = process.env.AWS_ACL;
    }

    return uploadParams;
  });
  return await Promise.all(params.map((param) => s3.upload(param).promise()));
};

exports.pdfUpload = async (fileContent, invoiceNumber) => {
  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
    Key: `${invoiceNumber}.pdf`,
    Body: fileContent,
    ContentType: "application/pdf",
  };

  // Only add ACL if it's configured in environment
  if (process.env.AWS_ACL) {
    uploadParams.ACL = process.env.AWS_ACL;
  }

  const paramsArray = [uploadParams];
  return await Promise.all(
    paramsArray.map((params) => s3.upload(params).promise())
  );
};
