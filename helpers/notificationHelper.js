const { models } = require("../models");
const smsService = require("../services/smsService");

const sendCustomerNotification = async ({
  customerId,
  title,
  message,
  type = "INFO",
  transaction = null,
}) => {
  const customer = await models.Customer.findByPk(
    customerId,
    { transaction }
  );

  if (!customer) {
    throw new Error("Customer not found");
  }

  // Save notification history
  await models.Notification.create(
    {
      customer_id: customer.id,
      title,
      message,
      notification_type: type,
      is_read: false,
    },
    { transaction }
  );

  // Send SMS
  if (customer.mobile_number) {
    await smsService.sendSms({
      mobile: customer.mobile_number,
      message,
    });
  }

  return true;
};

module.exports = {
  sendCustomerNotification,
};