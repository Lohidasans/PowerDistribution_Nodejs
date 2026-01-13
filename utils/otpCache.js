const otpStore = new Map();

const setOTP = (mobile, otp) => {
  otpStore.set(mobile, {
    otp: otp.toString(),
    expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
  });
};

const getOTP = (mobile) => {
  const data = otpStore.get(mobile);
  if (!data) return null;

  if (Date.now() > data.expiresAt) {
    otpStore.delete(mobile);
    return null;
  }

  return data.otp;
};

const deleteOTP = (mobile) => {
  otpStore.delete(mobile);
};

module.exports = {
  setOTP,
  getOTP,
  deleteOTP
};
