const axios = require("axios");
const fs = require("fs");
const path = require("path");

const downloadS3Image = async (imageUrl, fileName) => {
  // console.log("Downloading image...", imageUrl, fileName);
  const localPath = path.resolve(__dirname, "images", fileName);
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  async function downloadImage(url, savePath) {
    const writer = fs.createWriteStream(savePath);
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    response.data.pipe(writer);
    // console.log(response.data);
    return new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });
  }

  downloadImage(imageUrl, localPath)
    .then(() => {
      console.log(`Image downloaded and saved to ${localPath}`);
    })
    .catch((err) => {
      console.error("Error downloading the image:", err.message);
    });
};

module.exports = { downloadS3Image };
