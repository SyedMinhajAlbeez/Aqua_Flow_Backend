// utils/otpService.js
const otpStore = new Map(); // Production mein Redis use karo

const sendOTP = async (phone) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = Date.now() + 5 * 60 * 1000; // 5 min

  otpStore.set(phone, { otp, expires });

  // ← Yahan SMS bhejo (Twilio, MSG91, etc.)
  console.log(`OTP for ${phone}: ${otp}`); // Test ke liye
  return true;
};

const verifyOTP = async (phone, otp) => {
  const record = otpStore.get(phone);
  if (!record) return false;
  if (Date.now() > record.expires) return false;
  if (record.otp !== otp) return false;

  otpStore.delete(phone);
  return true;
};

module.exports = { sendOTP, verifyOTP };
