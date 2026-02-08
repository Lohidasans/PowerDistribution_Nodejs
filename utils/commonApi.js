const axios = require("axios");

const parseResponseToJson = (responseData) => {
  const lines = responseData
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);
  const keys = lines[0].split("|").map((key) => key.trim());
  const objects = lines.slice(1).map((line) => {
    const values = line.split("|").map((value) => (value ? value.trim() : ""));
    const obj = {};
    keys.forEach((key, index) => {
      obj[key.replace(/\r$/, "")] = values[index]
        ? values[index].replace(/\r$/, "")
        : "";
    });
    return obj;
  });
  return objects;
};

const matrixApi = async (urlParams) => {
  const url = `http://localhost/cosec/api.svc/v2/${urlParams}`;
  const authHeader = "Basic c2E6QWRtaW5AMTIz";

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: authHeader,
      },
    });
    const jsonData = parseResponseToJson(response.data);
    return {
      statusCode: 200,
      data: jsonData,
    };
  } catch (error) {
    return {
      statusCode: error.response ? error.response.status : 500,
      error: error.response ? error.response.data : error.message,
    };
  }
};
const matrixDeviceApi = async (bashUrl) => {
  // const url = `http://192.168.0.162/device.cgi/${urlParams}`;
  const auth = {
    username: "admin",
    password: "1234",
  };
  console.log("[matrixDeviceApi] Making request to:", bashUrl);
  console.log("[matrixDeviceApi] Using auth credentials:", { username: auth.username, password: "****" });

  try {
    const response = await axios.get(bashUrl, {
      auth,
    });
    console.log("[matrixDeviceApi] Request successful, status:", response.status);
    // console.log(response, "response");
    return {
      statusCode: 200,
      data: response.data,
    };
  } catch (error) {
    console.error("[matrixDeviceApi] Request failed");
    console.error("[matrixDeviceApi] Error status:", error.response ? error.response.status : "No response");
    console.error("[matrixDeviceApi] Error message:", error.message);
    if (error.response && error.response.status === 401) {
      console.error("[matrixDeviceApi] 401 Unauthorized - Check device credentials (username/password)");
    }
    return {
      statusCode: error.response ? error.response.status : 500,
      error: error.response ? error.response.data : error.message,
    };
  }
};

module.exports = { matrixApi, matrixDeviceApi };
