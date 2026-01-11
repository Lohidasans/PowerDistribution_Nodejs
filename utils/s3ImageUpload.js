const {
  S3Client,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");

// Create S3 client (v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper to sanitize file names
const sanitizeFileName = (name) => {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
};

exports.s3Upload = async (files) => {
  try {
    const params = files.map((file) => {
      const sanitizedName = sanitizeFileName(file.originalname);

      return {
        Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
        Key: sanitizedName,
        Body: file.buffer,
        ContentType: file.mimetype,
      };
    });

    console.log(
      "Uploading files to S3:",
      params.map((p) => ({ Bucket: p.Bucket, Key: p.Key }))
    );

    const results = await Promise.all(
      params.map(async (param) => {
        const command = new PutObjectCommand(param);
        await s3.send(command);

        return {
          bucket: param.Bucket,
          key: param.Key,
          url: `https://${param.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${param.Key}`,
        };
      })
    );

    return results;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw error;
  }
};

exports.fileUpload = async (files) => {
  const params = files.map((file) => {
    const sanitizedName = sanitizeFileName(file.originalname);

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
      Key: sanitizedName,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    if (process.env.AWS_ACL) {
      uploadParams.ACL = process.env.AWS_ACL; // only if your bucket allows ACL
    }

    return uploadParams;
  });

  return await Promise.all(
    params.map(async (param) => {
      const command = new PutObjectCommand(param);
      await s3.send(command);

      return {
        bucket: param.Bucket,
        key: param.Key,
        url: `https://${param.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${param.Key}`,
      };
    })
  );
};

exports.pdfUpload = async (fileContent, invoiceNumber) => {
  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME || "retailerpimages",
    Key: `${invoiceNumber}.pdf`,
    Body: fileContent,
    ContentType: "application/pdf",
  };

  if (process.env.AWS_ACL) {
    uploadParams.ACL = process.env.AWS_ACL;
  }

  const command = new PutObjectCommand(uploadParams);
  await s3.send(command);

  return [
    {
      bucket: uploadParams.Bucket,
      key: uploadParams.Key,
      url: `https://${uploadParams.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${uploadParams.Key}`,
    },
  ];
};
