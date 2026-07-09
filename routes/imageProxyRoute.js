const express = require("express");
const axios = require("axios");

const router = express.Router();

// Only our own image bucket may be proxied (SSRF guard).
const ALLOWED_HOSTS = ["retailerpimages.s3.ap-south-1.amazonaws.com"];

/**
 * Streams an S3 image through our own origin so the frontend (html2canvas PDF
 * export) can read it without depending on the S3 bucket's CORS config. The
 * global cors() middleware adds Access-Control-Allow-Origin to this response.
 *   GET /api/v1/image-proxy?url=<s3-image-url>
 */
router.get("/image-proxy", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ message: "url query param is required" });
    }

    let target;
    try {
      target = new URL(String(url));
    } catch {
      return res.status(400).json({ message: "Invalid url" });
    }

    if (!ALLOWED_HOSTS.includes(target.hostname)) {
      return res.status(400).json({ message: "Host not allowed" });
    }

    const response = await axios.get(target.href, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    res.set(
      "Content-Type",
      response.headers["content-type"] || "image/png"
    );
    res.set("Cache-Control", "public, max-age=86400");
    return res.send(Buffer.from(response.data));
  } catch (err) {
    console.error("Image proxy failed:", err.message);
    return res.status(502).json({ message: "Failed to fetch image" });
  }
});

module.exports = router;
