const { matrixDeviceApi } = require("../utils/commonApi");
const {
  getDeviceInfo,
  getUserCredentials,
  uploadFaceTemplate,
  uploadProfileImage,
} = require("../utils/commonfun");
const { REST_API_STATUSCODE } = require("../constants/enum");
const { pgClient } = require("../config/dbConfig");
const { downloadS3Image } = require("../utils/downloadS3Image");
// const { sendUserNotification } = require("../utils/pushNotifier");

const enrollUsers = async (req, res) => {
  try {
    const { user_id, enroll_type, type, created_id } = req.body;
    console.log("[enrollUsers] Starting enrollment process");
    console.log("[enrollUsers] Request body:", { user_id, enroll_type, type, created_id });

    //user_id- employee_id , enroll_type -face recognition, card, device_id
    let device_id = "CJ_DEV_001"
    console.log("[enrollUsers] Device ID:", device_id);

    // TEMPORARILY SKIPPING getDeviceInfo for testing - database query appears to be hanging
    console.log("[enrollUsers] Skipping getDeviceInfo call for testing purposes");
    // console.log("[enrollUsers] Calling getDeviceInfo...");
    // let deviceInfo;
    // try {
    //   deviceInfo = await getDeviceInfo(device_id);
    //   console.log("[enrollUsers] Device info retrieved:", deviceInfo);
    // } catch (error) {
    //   console.error("[enrollUsers] ERROR in getDeviceInfo:", error);
    //   console.error("[enrollUsers] Error details:", error.message);
    //   console.error("[enrollUsers] Error stack:", error.stack);
    //   throw error; // Re-throw to be caught by outer catch
    // }
    // if (!deviceInfo?.length) {
    //   console.log("[enrollUsers] ERROR: Device not found");
    //   return res.status(REST_API_STATUSCODE.notFound).send({
    //     statusCode: REST_API_STATUSCODE.notFound,
    //     message: "Device not found",
    //   });
    // }

    // Hardcoded IP for testing purposes
    const deviceIp = "192.168.1.23";
    console.log("[enrollUsers] Device IP address (hardcoded for testing):", deviceIp);

    const createUserProfile = async (userDetails, refId) => {
      console.log("[createUserProfile] Creating user profile:", { userDetails, refId });
      const createProfileUrl =
        deviceIp === "192.168.0.107"
          ? `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=0`
          : `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=1`;
      console.log("[createUserProfile] Profile URL:", createProfileUrl);
      const result = await matrixDeviceApi(createProfileUrl);
      console.log("[createUserProfile] API response:", result);
      return result;
    };

    //Enroll user
    const enrollUser = async (userType, enrollParams) => {
      console.log("[enrollUser] Starting enrollment:", { userType, enrollParams });
      const url = `http://${deviceIp}/device.cgi/enrolluser?action=enroll&user-id=${user_id}&${enrollParams}`;
      console.log("[enrollUser] Enrollment URL:", url);
      const response = await matrixDeviceApi(url);
      console.log("[enrollUser] Enrollment API response:", response);
      if (response.statusCode === REST_API_STATUSCODE.ok) {
        console.log("[enrollUser] Enrollment successful, checking database records");
        // Check and insert enrollment details if not present
        const getEnrollDetails = await pgClient.query(
          `SELECT * FROM enroll_device_details WHERE user_id = $1 AND device_id = $2 AND enroll_type = $3`,
          [user_id, device_id, enroll_type]
        );
        console.log("[enrollUser] Existing enrollment records:", getEnrollDetails.rowCount);

        if (getEnrollDetails.rowCount === 0) {
          console.log("[enrollUser] Inserting new enrollment record");
          await pgClient.query(
            `INSERT INTO enroll_device_details (device_id, user_id, user_type, enroll_type, created_at) VALUES ($1, $2, $3, $4, NOW())`,
            [device_id, user_id, userType, enroll_type]
          );
          console.log("[enrollUser] Enrollment record inserted successfully");
        } else {
          console.log("[enrollUser] Enrollment record already exists, skipping insert");
        }
        if (type === "Employee") {
          console.log("[enrollUser] Updating employee record");
          const updateQuery = await pgClient.query(
            `UPDATE employees 
   SET device_id = $1, is_enrolled = $2, enroll_type = $3
   WHERE employee_no = $4
   RETURNING *`,
            [
              `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
              true,
              `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
              }}`,
              user_id,
            ]
          );
          console.log("[enrollUser] Employee record updated:", updateQuery.rowCount, "rows affected");
        }


        console.log("[enrollUser] Enrollment process completed successfully");
        return res.status(response.statusCode).send({
          statusCode: response.statusCode,
          message: "Successfully enrolled user in the device",
        });
      } else {
        console.log("[enrollUser] ERROR: Enrollment failed with status:", response.statusCode);
        return res.status(response.statusCode).send({
          statusCode: response.statusCode,
          message: "Failed to enroll user in the device",
        });
      }
    };

    const uploadProfile = async (userId, imageUrl, deviceIP) => {
      console.log("[uploadProfile] Uploading profile image:", { userId, imageUrl, deviceIP });
      await uploadProfileImage({
        employeeId: userId,
        fileName: `${imageUrl}.jpg`,
        deviceIP,
      });
      console.log("[uploadProfile] Profile image uploaded successfully");
    };

    // Fetch user details and process based on type
    let userDetails;
    console.log("[enrollUsers] Processing user type:", type);
    switch (type.toLowerCase()) {
      case "employee":
        console.log("[enrollUsers] Fetching employee details for user_id:", user_id);
        try {
          console.log("[enrollUsers] Executing employee query...");
          userDetails = await pgClient.query(
            `SELECT * FROM employees WHERE employee_no = $1`,
            [user_id]
          );
          console.log("[enrollUsers] Employee query completed successfully");
          console.log("[enrollUsers] Employee query result:", userDetails.rowCount, "rows found");

          if (userDetails.rowCount === 0) {
            console.log("[enrollUsers] ERROR: No employee found with ID:", user_id);
            return res.status(REST_API_STATUSCODE.notFound).send({
              statusCode: REST_API_STATUSCODE.notFound,
              message: "Employee not found",
            });
          }

          console.log("[enrollUsers] Employee data:", userDetails.rows[0]);
          console.log("[enrollUsers] Downloading S3 image:", userDetails.rows[0].image_url);
        } catch (error) {
          console.error("[enrollUsers] ERROR in employee query:", error);
          console.error("[enrollUsers] Error message:", error.message);
          console.error("[enrollUsers] Error stack:", error.stack);
          return res.status(REST_API_STATUSCODE.serverError).send({
            statusCode: REST_API_STATUSCODE.serverError,
            message: "Database error while fetching employee details",
            error: error.message
          });
        }

        // Commented out for testing - no image processing needed
        // await downloadS3Image(
        //   userDetails.rows[0].image_url,
        //   `${userDetails.rows[0].employee_no}.jpg`
        // );
        console.log("[enrollUsers] Skipping S3 image download for testing");
        if (!userDetails.rows.length) {
          console.log("[enrollUsers] ERROR: Employee not found");
          return res.status(REST_API_STATUSCODE.notFound).send({
            statusCode: REST_API_STATUSCODE.notFound,
            message: "Employee not found",
          });
        }
        const employee = userDetails.rows[0];
        console.log("[enrollUsers] Employee details:", { id: employee.employee_no, name: employee.employee_name });
        // imageUrl = employee.imageUrl;
        // Commented out for testing - no image upload needed
        // await uploadProfile(user_id, user_id, device_id);
        console.log("[enrollUsers] Skipping profile image upload for testing");
        console.log("[enrollUsers] Creating user profile on device");
        await createUserProfile(
          { id: employee.employee_no, name: employee.employee_name },
          employee.ref_employee_id
        );
        // if (created_id) {
        //   await sendUserNotification(
        //     "Employee enrollment ",
        //     created_id,
        //     1,
        //     `Employee ${employee.name} has been enrolled successfully.`
        //   );
        // }
        if (enroll_type === "face_recognition") {
          console.log("[enrollUsers] Enrolling with Face Recognition");
          await enrollUser("Employee", "type=7&face-count=5");
        } else {
          console.log("[enrollUsers] Enrolling with Card");
          await enrollUser("Employee", "type=0&card-count=0");
        }
        break;

      default:
        console.log("[enrollUsers] ERROR: Invalid user type:", type);
        return res.status(REST_API_STATUSCODE.badRequest).send({
          statusCode: REST_API_STATUSCODE.badRequest,
          message: "Invalid user type",
        });
    }
  } catch (err) {
    console.error("[enrollUsers] ERROR: Exception caught:", err);
    console.error("[enrollUsers] Error stack:", err.stack);
    res.status(REST_API_STATUSCODE.serverError).send({
      statusCode: REST_API_STATUSCODE.serverError,
      message: "Internal server error",
    });
  }
};
const assignDevice = async (req, res) => {
  try {
    const {
      employee_id,
      type, // User type: Employee, Guest, Relations, Admin
      device_id, // Array of device IDs like ["RJT_DEV_001", "RJT_DEV_002"]
      ref_employee_id,
      name,
      enroll_type, // Array of enroll types like ["Face Recognition", "Card"]
    } = req.body;

    if (type == "Employee") {
      // console.log("Employee");
      await pgClient.query(
        `UPDATE employee_profiles 
     SET device_id = $1 
     WHERE employee_no = $2 
     RETURNING *`,
        [`{${device_id.join(",")}}`, employee_id]
      );
      const employeeDevices = await pgClient.query(
        `SELECT * FROM employee_profiles WHERE employee_no = $1`,
        [employee_id]
      );
      // console.log(
      //   employeeDevices.rows[0].device_id,
      //   "employeeDevices.rows[0].device_id"
      // );
      const deletedDevicesIds = employeeDevices.rows[0].device_id.filter(
        (item) => !device_id.includes(item)
      );
      if (deletedDevicesIds.length) {
        for (const deviceId of deletedDevicesIds) {
          const deviceInfo = await getDeviceInfo(deviceId);
          if (deviceInfo.length > 0) {
            const deviceIp = deviceInfo[0].ip_address;
            const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${employee_id}`;
            try {
              const response = await matrixDeviceApi(deleteProfileUrl);
              // console.log(
              //   `Deleted user profile from device: ${deviceId}, response:`,
              //   response.data
              // );
            } catch (err) {
              console.error(
                `Failed to delete profile from device: ${deviceId}`,
                err
              );
            }
          }
        }
      }
    }

    const getEnrollDetails = async (userId, enrollType) => {
      return pgClient.query(
        `SELECT * FROM enroll_device_details WHERE user_id = $1 AND enroll_type = $2`,
        [userId, enrollType]
      );
    };

    // Function to handle different enrollments
    const handleEnrollment = async (
      deviceInfo,
      userId,
      refId,
      name,
      enrollType,
      enrollDeviceInfo
    ) => {
      const ip = deviceInfo?.ip_address;

      if (enrollType === "Card") {
        // console.log(ip, "Processing card enrollment...");
        const getUserDetails = `http://${enrollDeviceInfo?.ip_address}/device.cgi/users?action=get&user-id=${userId}`;
        const response = await matrixDeviceApi(getUserDetails);

        if (response?.data) {
          const cardNumber = response.data.match(/card1=(\d+)/)[1];
          const url = `http://${ip}/device.cgi/users?action=set&user-id=${userId}&name=${name}&ref-user-id=${refId}&card1=${cardNumber}&user-active=1`;
          return matrixDeviceApi(url);
        }
      } else if (enrollType === "face_recognition") {
        // console.log("Processing face recognition enrollment...");
        let url;

        if (type === "Employee") {
          const employeeDetails = await pgClient.query(
            `SELECT * FROM employee_profiles WHERE employee_no = $1`,
            [employee_id]
          );

          if (
            employeeDetails.rows.length > 0 &&
            employeeDetails.rows[0].team_id !== 1
          ) {
            if (ip === "192.168.0.99") {
              url = `http://${ip}/device.cgi/users?action=set&user-id=${userId}&ref-user-id=${refId}&enable-fr=1&name=${name}&user-active=0`;
            }
          }
        }

        if (!url) {
          url = `http://${ip}/device.cgi/users?action=set&user-id=${userId}&ref-user-id=${refId}&enable-fr=1&name=${name}&user-active=${ip === "192.168.0.107" ? 0 : 1
            }`;
        }

        if (url) {
          await matrixDeviceApi(url);
        } else {
          console.error("URL is not defined. Check conditions.");
        }

        const faceCredentials = await getUserCredentials({
          deviceIP: enrollDeviceInfo?.ip_address,
          username: "admin",
          password: "1234",
          type: 5,
          userID: userId,
          faceIndex: 1,
          folderName: "faceTemplate",
        });

        if (faceCredentials) {
          setTimeout(() => {
            uploadFaceTemplate({
              deviceIP: ip,
              folderName: "faceTemplate",
              employeeId: userId,
              username: "admin",
              password: "1234",
              type: 5,
            });
          }, 2000);
          // await uploadProfileImage({
          //   employeeId: userId,
          //   fileName: `${userId}.jpg`,
          //   ip,
          // });
        }
      }
    };

    // Process devices and enrollments
    for (const device of device_id) {
      const deviceInfo = await getDeviceInfo(device);
      for (const type of enroll_type) {
        const enrollmentDetails = await getEnrollDetails(employee_id, type);

        if (enrollmentDetails.rows.length > 0) {
          const enrollDeviceInfo = await getDeviceInfo(
            enrollmentDetails.rows[0].device_id
          );

          await handleEnrollment(
            deviceInfo[0],
            employee_id,
            ref_employee_id,
            name,
            type,
            enrollDeviceInfo[0]
          );
        } else {
          console.log(`No enrollment details found for ${type}`);
        }
      }
    }

    res.status(200).send({ message: "Device assignment successful" });
  } catch (error) {
    console.error("Error during device assignment:", error);
    res.status(500).send({ message: "Error during device assignment", error });
  }
};

module.exports = { enrollUsers, assignDevice };

