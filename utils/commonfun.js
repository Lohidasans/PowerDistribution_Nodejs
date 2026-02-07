const { models, sequelize } = require("../models/index");
const { pgClient } = require("../config/dbConfig");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { matrixDeviceApi } = require("./commonApi");

const generateDeliveryChallanNoFunc = async () => {
  const last = await models.DeliveryChellan.findOne({
    attributes: ["delivery_challan_no"],
    order: [["id", "DESC"]],
    paranoid: false,
  });

  // If no record OR invalid / zero value → start from DC001
  if (
    !last ||
    !last.delivery_challan_no ||
    !/^DC\d+$/.test(last.delivery_challan_no)
  ) {
    return "DC001";
  }

  const numericPart = parseInt(
    last.delivery_challan_no.replace(/^DC/, ""),
    10
  );

  // If DB has DC000 or invalid number
  const nextNumber = numericPart >= 1 ? numericPart + 1 : 1;

  return `DC${String(nextNumber).padStart(3, "0")}`;
};

// const sharp = require("sharp");
const convertDateFormat = (date) => {
  const [day, month, year] = date?.split("/");
  return `${year}-${month}-${day}`;
};
const insertRecords = async (records, deviceId, role) => {
  if (records.length === 0) return;

  try {
    let query;
    switch (role) {
      case "Employee":
        query = `INSERT INTO employee_trackings (ref_employee_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "Admin":
        query = `INSERT INTO office_user_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "AdminOUT":
        query = `INSERT INTO office_user_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "Security":
        query = `INSERT INTO security_trackings (ref_employee_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "EmployeeOut":
        query = `INSERT INTO employee_out_trackings (ref_employee_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "OutPass":
        query = `INSERT INTO outpass_trackings (ref_employee_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "CastingIN":
        query = `INSERT INTO casting_user_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "CastingOUT":
        query = `INSERT INTO casting_user_out_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "GuestIN":
        query = `INSERT INTO guest_in_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
      case "GuestOUT":
        query = `INSERT INTO guest_out_trackings (ref_user_id, seq_number, date, time, device_id) VALUES `;
        break;
    }

    const values = [];
    const valuePlaceholders = records.map((_, i) => {
      values.push(_.detail1, _.seqNo, _.date, _.time, deviceId);
      return `($${values.length - 4}, $${values.length - 3}, $${
        values.length - 2
      }, $${values.length - 1}, $${values.length})`;
    });

    query += valuePlaceholders.join(", ") + " RETURNING *;";
    const res = await pgClient.query(query, values);
    // console.log(`Inserted ${res.rowCount} records for ${role}`);
  } catch (err) {
    console.error(err);
  }
};

const getMaxSeqNumber = async (deviceId, role) => {
  const roleTableMap = {
    Employee: "employee_trackings",
    Admin: "office_user_trackings",
    AdminOUT: "office_user_out_trackings",
    Security: "security_trackings",
    EmployeeOut: "employee_out_trackings",
    OutPass: "outpass_trackings",
    CastingIN: "casting_user_trackings",
    CastingOUT: "casting_user_out_trackings",
    GuestIN: "guest_in_trackings",
    GuestOUT: "guest_out_trackings",
  };

  const tableName = roleTableMap[role];
  if (!tableName) {
    throw new Error(`Invalid role: ${role}`);
  }

  const query = `SELECT MAX(seq_number) as max_seq_number FROM ${tableName} WHERE device_id = $1`;

  try {
    const res = await pgClient.query(query, [deviceId]);
    return res.rows[0].max_seq_number || 0; // Return 0 if no records found
  } catch (err) {
    console.error(`Error getting max seq number for role ${role}:`, err);
    throw err;
  }
};

const parseData = (data) => {
  const lines = data?.split("\r\n");
  const records = [];
  let record = {};

  lines?.forEach((line) => {
    if (line) {
      const [key, value] = line?.split("=");
      switch (key) {
        case "seq-No":
          record.seqNo = value;
          break;
        case "date":
          record.date = convertDateFormat(value);
          break;
        case "time":
          record.time = value;
          break;
        case "event-id":
          record.eventId = value;
          break;
        case "detail-1":
          record.detail1 = value;
          break;
      }
    } else {
      if (record.eventId === "101") {
        records?.push(record);
      }
      record = {};
    }
  });

  return records;
};

const getDeviceInfo = async (deviceId) => {
  try {
    const res = await pgClient.query(
      "SELECT * FROM device_infos WHERE device_id = $1",
      [deviceId]
    );
    // console.log(res.rows);
    return res.rows;
  } catch (err) {
    console.error(err);
  }
};

async function getUserCredentials({
  deviceIP,
  username,
  password,
  type,
  userID,
  faceIndex,
  folderName,
}) {
  try {
    // Define the folder and file path
    const folderPath = path.join(__dirname, folderName);
    const filePath = path.join(folderPath, userID);
    // console.log(deviceIP, "deviceIP", type);
    // Ensure the folder exists, or create it
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
    let url;
    if (type === 5) {
      url = `http://${deviceIP}/device.cgi/credential?action=get&type=${type}&user-id=${userID}&face-index=${faceIndex}`;
      // console.log(url, "urllohi");
    } else {
      url = `http://${deviceIP}/device.cgi/credential?action=get&type=${type}&user-id=${userID}&palm-index=${faceIndex}`;
    }

    const response = await axios.get(url, {
      auth: {
        username: "admin",
        password: "1234",
      },
      responseType: "arraybuffer",
    });

    fs.writeFileSync(filePath, response.data);
    // console.log(`File saved to ${filePath}`);
    return response;
  } catch (error) {
    console.error("Error fetching user credentials:", error.message);
  }
}

// getUserCredentials();
// getUserCredentials({
//   deviceIP: "192.168.1.1", // replace with actual IP
//   username: "admin", // replace with actual username
//   password: "adminPass", // replace with actual password
//   type: "face", // replace with the type, e.g., 'face'
//   userID: "123456", // replace with the actual user ID
//   faceIndex: 1, // replace with actual face index
//   folderName:"faceTemplate"
// });
const uploadFaceTemplate = async ({
  deviceIP,
  folderName,
  employeeId,
  username,
  password,
  type,
}) => {
  const filePath = path.join(__dirname, folderName, employeeId);
  // console.log(filePath, "filePath");
  const form = new FormData();
  form.append("data", fs.createReadStream(filePath));
  // console.log(deviceIP, "deviceIP");
  const url = `http://${deviceIP}/device.cgi/credential?action=set&type=${type}&user-id=${employeeId}`;

  // Send POST request
  axios
    .post(url, form, {
      auth: {
        username: username,
        password: password,
      },
      headers: {
        ...form.getHeaders(),
      },
    })
    .then((response) => {
      console.log("Success:", response.data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
};

// uploadFaceTemplate({
//   deviceIP: "192.168.1.1",
//   folderName: "faceTemplate",
//   employeeId: "RJTE001",
//   username: "admin",
//   password: "1234",
//   type: "Face Recognition",
// });

const uploadProfileImage = async ({ employeeId, fileName, deviceIP }) => {
  try {
    const newFileName = `${employeeId}.jpg`;

    // Navigate to the parent directory of `utils` and access the `images` folder
    const inputFilePath = path.join(__dirname, "images", fileName);
    const outputFilePath = path.join(__dirname, "images", newFileName);

    // Log the file paths for debugging purposes
    // console.log("Input file path:", inputFilePath);
    // console.log("Output file path:", outputFilePath);

    // Check if the input file exists
    if (!fs.existsSync(inputFilePath)) {
      console.error("File does not exist:", inputFilePath);
      return;
    }

    // Convert and resize the image using sharp
    // await sharp(inputFilePath)
    //   .resize({ width: 300 })
    //   .jpeg({ quality: 80 })
    //   .toFile(outputFilePath);

    // Check the file size
    const stats = fs.statSync(outputFilePath);
    if (stats.size > 50000) {
      throw new Error(
        "File size exceeds 50KB. Please adjust the quality or dimensions."
      );
    }

    // Read the converted image file
    const image = fs.readFileSync(outputFilePath);

    // Make the HTTP request to upload the image
    const response = await axios.post(
      `http://${deviceIP}/device.cgi/userphoto?action=set&user-id=${employeeId}&photo-format=1`,
      image,
      {
        headers: {
          "Content-Type": "image/jpg",
          "Content-Length": image.length,
        },
        auth: {
          username: "admin",
          password: "1234",
        },
      }
    );

    // Log the response from the server
    // console.log("Response Status:", response.status);
    // console.log("Response Body:", response.data);
  } catch (error) {
    // Log any errors encountered during the process
    console.error("Error uploading image:", error);
  }
};

const updateUserProfileOnDevices = async (
  userDetails,
  refId,
  deviceIds,
  type
) => {
 
  try {
    const updatePromises = deviceIds.map(async (deviceId) => {
      const deviceInfo = await getDeviceInfo(deviceId);
      if (deviceInfo && deviceInfo.length > 0) {
        const deviceIp = deviceInfo[0].ip_address;
        let response;
        if (type === "UPDATE") {
          //Employee Out Device user-active=0 need to change ip address
          let userActive;

          if (deviceIp === "192.168.0.107" || deviceIp === "192.168.0.99") {
            userActive = 0;
          } else {
            userActive = 1;
          }

          const updateProfileUrl = `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=${userActive}`;

          // const updateProfileUrl =
          //   deviceIp === "192.168.0.107"
          //     ? `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=0`
          //     : `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=1`;
          response = await matrixDeviceApi(updateProfileUrl);
        } else if (type === "DELETE") {
          const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${userDetails.id}`;
          response = await matrixDeviceApi(deleteProfileUrl);
        }
        if (response.success) {
          // console.log(`Successfully updated device: ${deviceId}`);
        } else {
          console.error(`Failed to update device: ${deviceId}`, response.error);
        }
      } else {
        console.error(`No device info found for device: ${deviceId}`);
      }
    });

    await Promise.all(updatePromises);
    // console.log("All device updates completed.");
  } catch (error) {
    console.error("Error updating devices:", error);
  }
};
const isAdult = (dob) => {
  const currentDate = new Date();
  const birthDate = new Date(dob);
  let age = currentDate.getFullYear() - birthDate.getFullYear();
  const monthDifference = currentDate.getMonth() - birthDate.getMonth();
  if (
    monthDifference < 0 ||
    (monthDifference === 0 && currentDate.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age >= 18;
};

module.exports = {
  parseData,
  getMaxSeqNumber,
  insertRecords,
  convertDateFormat,
  getDeviceInfo,
  getUserCredentials,
  uploadFaceTemplate,
  uploadProfileImage,
  updateUserProfileOnDevices,
  isAdult,
  generateDeliveryChallanNoFunc
};


