const sendSms = async ({
  mobile,
  message,
}) => {
  console.log(`SMS => ${mobile} : ${message}`);

  // MSG91
  // Twilio
  // TextLocal
  // AWS SNS
};

module.exports = {
  sendSms,
};