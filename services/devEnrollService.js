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
    const { user_id, enroll_type, device_id, type, created_id } = req.body;
    //user_id- employee_id , enroll_type -face recognition, card, device_id
    const deviceInfo = await getDeviceInfo(device_id);
    if (!deviceInfo?.length) {
      return res.status(REST_API_STATUSCODE.notFound).send({
        statusCode: REST_API_STATUSCODE.notFound,
        message: "Device not found",
      });
    }

    const deviceIp = deviceInfo[0]?.ip_address;

    const createUserProfile = async (userDetails, refId) => {
      const createProfileUrl =
        deviceIp === "192.168.0.107"
          ? `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=0`
          : `http://${deviceIp}/device.cgi/users?action=set&user-id=${userDetails.id}&ref-user-id=${refId}&enable-fr=1&name=${userDetails.name}&user-active=1`;
      return await matrixDeviceApi(createProfileUrl);
    };

    //Enroll user
    const enrollUser = async (userType, enrollParams) => {
      const url = `http://${deviceIp}/device.cgi/enrolluser?action=enroll&user-id=${user_id}&${enrollParams}`;
      const response = await matrixDeviceApi(url);
      if (response.statusCode === REST_API_STATUSCODE.ok) {
        // Check and insert enrollment details if not present
        const getEnrollDetails = await pgClient.query(
          `SELECT * FROM enroll_device_details WHERE user_id = $1 AND device_id = $2 AND enroll_type = $3`,
          [user_id, device_id, enroll_type]
        );

        if (getEnrollDetails.rowCount === 0) {
          await pgClient.query(
            `INSERT INTO enroll_device_details (device_id, user_id, user_type, enroll_type) VALUES ($1, $2, $3, $4)`,
            [device_id, user_id, userType, enroll_type]
          );
        }
        if (type === "Employee") {
          const updateQuery = await pgClient.query(
            `UPDATE employees 
   SET device_id = $1, is_enrolled = $2, enroll_type = $3
   WHERE employee_id = $4
   RETURNING *`,
            [
              `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
              true,
              `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
              }}`,
              user_id,
            ]
          );
        }
        //       } else if (type === "AdminUser") {
        //         const updateQuery = await pgClient.query(
        //           `UPDATE users 
        //  SET device_id = $1, is_enrolled = $2, enroll_type = $3
        //  WHERE user_id = $4
        //  RETURNING *`,
        //           [
        //             `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
        //             true,
        //             `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
        //             }}`,
        //             user_id,
        //           ]
        //         );
        //       } else if (type === "Guest") {
        //         const updateQuery = await pgClient.query(
        //           `UPDATE guests
        //  SET device_id = $1, is_enrolled = $2, enroll_type = $3
        //  WHERE guest_id = $4
        //  RETURNING *`,
        //           [
        //             `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
        //             true,
        //             `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
        //             }}`,
        //             user_id,
        //           ]
        //         );
        //       } else if (type === "Relations") {
        //         const updateQuery = await pgClient.query(
        //           `UPDATE relations
        //  SET device_id = $1, is_enrolled = $2, enroll_type = $3
        //  WHERE relation_id = $4
        //  RETURNING *`,
        //           [
        //             `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
        //             true,
        //             `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
        //             }}`,
        //             user_id,
        //           ]
        //         );
        //       } else if (type === "GuestCard") {
        //         const updateQuery = await pgClient.query(
        //           `UPDATE guest_cards
        //  SET device_id = $1, is_enrolled = $2, enroll_type = $3
        //  WHERE guest_id = $4
        //  RETURNING *`,
        //           [
        //             `{${Array.isArray(device_id) ? device_id.join(",") : device_id}}`,
        //             true,
        //             `{${Array.isArray(enroll_type) ? enroll_type.join(",") : enroll_type
        //             }}`,
        //             user_id,
        //           ]
        //         );
        //       }

        return res.status(response.statusCode).send({
          statusCode: response.statusCode,
          message: "Successfully enrolled user in the device",
        });
      } else {
        return res.status(response.statusCode).send({
          statusCode: response.statusCode,
          message: "Failed to enroll user in the device",
        });
      }
    };

    const uploadProfile = async (userId, imageUrl, deviceIP) => {
      await uploadProfileImage({
        employeeId: userId,
        fileName: `${imageUrl}.jpg`,
        deviceIP,
      });
    };

    // Fetch user details and process based on type
    let userDetails;
    switch (type.toLowerCase()) {
      case "employee":
        // console.log("executing uploadProfileImage");
        userDetails = await pgClient.query(
          `SELECT * FROM employees WHERE employee_id = $1`,
          [user_id]
        );
        await downloadS3Image(
          userDetails.rows[0].image_url,
          `${userDetails.rows[0].employee_id}.jpg`
        );
        if (!userDetails.rows.length) {
          return res.status(REST_API_STATUSCODE.notFound).send({
            statusCode: REST_API_STATUSCODE.notFound,
            message: "Employee not found",
          });
        }
        const employee = userDetails.rows[0];
        // imageUrl = employee.imageUrl;
        await uploadProfile(user_id, user_id, device_id);
        await createUserProfile(
          { id: employee.employee_id, name: employee.name },
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
        if (enroll_type === "Face Recognition") {
          await enrollUser("Employee", "type=7&face-count=5");
        } else {
          await enrollUser("Employee", "type=0&card-count=0");
        }
        break;

      // case "guest":
      //   userDetails = await pgClient.query(
      //     `SELECT * FROM guests WHERE guest_id = $1`,
      //     [user_id]
      //   );
      //   if (!userDetails.rows.length) {
      //     return res.status(REST_API_STATUSCODE.notFound).send({
      //       statusCode: REST_API_STATUSCODE.notFound,
      //       message: "Guest not found",
      //     });
      //   }
      //   const guest = userDetails.rows[0];
      //   await createUserProfile(
      //     { id: guest.guest_id, name: guest.name },
      //     guest.ref_guest_id
      //   );
      //   if (created_id) {
      //     await sendUserNotification(
      //       "Guest enrollment ",
      //       created_id,
      //       1,
      //       `Guest ${guest.name} has been enrolled successfully.`
      //     );
      //   }
      //   if (enroll_type === "Face Recognition") {
      //     await enrollUser("Guest", "type=7&face-count=5");
      //   } else {
      //     await enrollUser("Guest", "type=0&card-count=0");
      //   }
      //   break;
      // case "guestcard":
      //   userDetails = await pgClient.query(
      //     `SELECT * FROM guest_cards WHERE guest_id = $1`,
      //     [user_id]
      //   );
      //   if (!userDetails.rows.length) {
      //     return res.status(REST_API_STATUSCODE.notFound).send({
      //       statusCode: REST_API_STATUSCODE.notFound,
      //       message: "Guest not found",
      //     });
      //   }
      //   const guestCard = userDetails.rows[0];
      //   await createUserProfile(
      //     { id: guestCard.guest_id, name: guestCard.name },
      //     guestCard.ref_guest_id
      //   );
      //   if (created_id) {
      //     await sendUserNotification(
      //       "Guest Card enrollment ",
      //       created_id,
      //       1,
      //       `Guest Card ${guestCard.name} has been enrolled successfully.`
      //     );
      //   }
      //   if (enroll_type === "Face Recognition") {
      //     await enrollUser("guestcard", "type=7&face-count=5");
      //   } else {
      //     await enrollUser("guestcard", "type=0&card-count=0");
      //   }
      //   break;

      // case "relations":
      //   userDetails = await pgClient.query(
      //     `SELECT * FROM relations WHERE relation_id = $1`,
      //     [user_id]
      //   );
      //   if (!userDetails.rows.length) {
      //     return res.status(REST_API_STATUSCODE.notFound).send({
      //       statusCode: REST_API_STATUSCODE.notFound,
      //       message: "Relation not found",
      //     });
      //   }
      //   const relation = userDetails.rows[0];
      //   await createUserProfile(
      //     { id: relation.relation_id, name: relation.name },
      //     relation.ref_relation_id
      //   );
      //   if (created_id) {
      //     await sendUserNotification(
      //       "Relation enrollment ",
      //       created_id,
      //       1,
      //       `Relation ${relation.name} has been enrolled in successfully.`
      //     );
      //   }
      //   if (enroll_type === "Face Recognition") {
      //     await enrollUser("Relations", "type=7&face-count=5");
      //   } else {
      //     await enrollUser("Relations", "type=0&card-count=0");
      //   }
      //   break;

      // case "adminuser":
      // userDetails = await pgClient.query(`SELECT * FROM users WHERE user_id = $1`, [
      //   user_id,
      // ]);
      // downloadS3Image(
      //   userDetails.rows[0].image_url,
      //   `${userDetails.rows[0].user_id}.jpg`
      // );
      // if (!userDetails.rows.length) {
      //   return res.status(REST_API_STATUSCODE.notFound).send({
      //     statusCode: REST_API_STATUSCODE.notFound,
      //     message: "Admin not found",
      //   });
      // }
      // const admin = userDetails.rows[0];
      // await uploadProfile(user_id, user_id, device_id);
      // await createUserProfile(
      //   { id: admin.user_id, name: admin.name },
      //   admin.user_ref_id
      // );
      // if (created_id) {
      //   await sendUserNotification(
      //     "Admin User enrollment ",
      //     created_id,
      //     1,
      //     `Admin User ${admin.name} has been enrolled successfully.`
      //   );
      // }
      // if (enroll_type === "Face Recognition") {
      //   await enrollUser("AdminUser", "type=7&face-count=5");
      // } else {
      //   await enrollUser("AdminUser", "type=0&card-count=0");
      // }
      // break;

      default:
        return res.status(REST_API_STATUSCODE.badRequest).send({
          statusCode: REST_API_STATUSCODE.badRequest,
          message: "Invalid user type",
        });
    }
  } catch (err) {
    console.error("Error in enrollUsers:", err);
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
     WHERE employee_id = $2 
     RETURNING *`,
        [`{${device_id.join(",")}}`, employee_id]
      );
      const employeeDevices = await pgClient.query(
        `SELECT * FROM employee_profiles WHERE employee_id = $1`,
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
    // } else if (type == "Guest") {
    //   // console.log("Guest");
    //   await pgClient.query(
    //     `UPDATE guests 
    //  SET device_id = $1 
    //  WHERE guest_id = $2 
    //  RETURNING *`,
    //     [`{${device_id.join(",")}}`, employee_id]
    //   );
    //   const guestDevices = await pgClient.query(
    //     `SELECT * FROM guests WHERE guest_id = $1`,
    //     [employee_id]
    //   );
    //   // console.log(
    //   //   guestDevices.rows[0].device_id,
    //   //   "employeeDevices.rows[0].device_id"
    //   // );
    //   const deletedGuestDevicesIds = guestDevices.rows[0].device_id.filter(
    //     (item) => !device_id.includes(item)
    //   );
    //   if (deletedGuestDevicesIds.length) {
    //     for (const deviceId of deletedGuestDevicesIds) {
    //       const deviceInfo = await getDeviceInfo(deviceId);
    //       if (deviceInfo.length > 0) {
    //         const deviceIp = deviceInfo[0].ip_address;
    //         const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${employee_id}`;
    //         try {
    //           const response = await matrixDeviceApi(deleteProfileUrl);
    //           // console.log(
    //           //   `Deleted user profile from device: ${deviceId}, response:`,
    //           //   response.data
    //           // );
    //         } catch (err) {
    //           console.error(
    //             `Failed to delete profile from device: ${deviceId}`,
    //             err
    //           );
    //         }
    //       }
    //     }
    //   }
    // } else if (type == "Relations") {
    //   // console.log("Relations");
    //   await pgClient.query(
    //     `UPDATE relations 
    //  SET device_id = $1 
    //  WHERE relation_id = $2 
    //  RETURNING *`,
    //     [`{${device_id.join(",")}}`, employee_id]
    //   );
    //   const relationDevices = await pgClient.query(
    //     `SELECT * FROM relations WHERE relation_id = $1`,
    //     [employee_id]
    //   );
    //   // console.log(
    //   //   relationDevices.rows[0].device_id,
    //   //   "relationDevices.rows[0].device_id"
    //   // );
    //   const deletedRelationDevicesIds =
    //     relationDevices.rows[0].device_id.filter(
    //       (item) => !device_id.includes(item)
    //     );
    //   if (deletedRelationDevicesIds.length) {
    //     for (const deviceId of deletedRelationDevicesIds) {
    //       const deviceInfo = await getDeviceInfo(deviceId);
    //       if (deviceInfo.length > 0) {
    //         const deviceIp = deviceInfo[0].ip_address;
    //         const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${employee_id}`;
    //         try {
    //           const response = await matrixDeviceApi(deleteProfileUrl);
    //           // console.log(
    //           //   `Deleted user profile from device: ${deviceId}, response:`,
    //           //   response.data
    //           // );
    //         } catch (err) {
    //           console.error(
    //             `Failed to delete profile from device: ${deviceId}`,
    //             err
    //           );
    //         }
    //       }
    //     }
    //   }
    // } else if (type == "GuestCard") {
    //   // console.log("GuestCard");
    //   await pgClient.query(
    //     `UPDATE guest_cards 
    //  SET device_id = $1 
    //  WHERE guest_id = $2 
    //  RETURNING *`,
    //     [`{${device_id.join(",")}}`, employee_id]
    //   );
    //   const guestCardDevices = await pgClient.query(
    //     `SELECT * FROM guest_cards WHERE guest_id = $1`,
    //     [employee_id]
    //   );
    //   // console.log(
    //   //   guestCardDevices.rows[0].device_id,
    //   //   "employeeDevices.rows[0].device_id"
    //   // );
    //   const deletedGuestDevicesIds = guestCardDevices.rows[0].device_id.filter(
    //     (item) => !device_id.includes(item)
    //   );
    //   if (deletedGuestDevicesIds.length) {
    //     for (const deviceId of deletedGuestDevicesIds) {
    //       const deviceInfo = await getDeviceInfo(deviceId);
    //       if (deviceInfo.length > 0) {
    //         const deviceIp = deviceInfo[0].ip_address;
    //         const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${employee_id}`;
    //         try {
    //           const response = await matrixDeviceApi(deleteProfileUrl);
    //           // console.log(
    //           //   `Deleted user profile from device: ${deviceId}, response:`,
    //           //   response.data
    //           // );
    //         } catch (err) {
    //           console.error(
    //             `Failed to delete profile from device: ${deviceId}`,
    //             err
    //           );
    //         }
    //       }
    //     }
    //   }
    // } else if (type == "AdminUser") {
    //   // console.log("Admin");
    //   await pgClient.query(
    //     `UPDATE users 
    //  SET device_id = $1 
    //  WHERE user_id = $2 
    //  RETURNING *`,
    //     [`{${device_id.join(",")}}`, employee_id]
    //   );
    //   const adminDevices = await pgClient.query(
    //     `SELECT * FROM users WHERE user_id = $1`,
    //     [employee_id]
    //   );

    //   const deletedAdminDevicesIds = adminDevices.rows[0].device_id.filter(
    //     (item) => !device_id.includes(item)
    //   );
    //   if (deletedAdminDevicesIds.length) {
    //     for (const deviceId of deletedAdminDevicesIds) {
    //       const deviceInfo = await getDeviceInfo(deviceId);
    //       if (deviceInfo.length > 0) {
    //         const deviceIp = deviceInfo[0].ip_address;
    //         const deleteProfileUrl = `http://${deviceIp}/device.cgi/users?action=delete&user-id=${employee_id}`;
    //         try {
    //           const response = await matrixDeviceApi(deleteProfileUrl);
    //           // console.log(
    //           //   `Deleted user profile from device: ${deviceId}, response:`,
    //           //   response.data
    //           // );
    //         } catch (err) {
    //           console.error(
    //             `Failed to delete profile from device: ${deviceId}`,
    //             err
    //           );
    //         }
    //       }
    //     }
    //   }
    // }
    // Function to get enrollment details based on type
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
      } else if (enrollType === "Face Recognition") {
        // console.log("Processing face recognition enrollment...");
        let url;

        if (type === "Employee") {
          const employeeDetails = await pgClient.query(
            `SELECT * FROM employee_profiles WHERE employee_id = $1`,
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

