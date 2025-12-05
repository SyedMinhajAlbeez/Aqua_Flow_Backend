// utils/otpService.js
const otpStore = new Map(); // Production mein Redis use karo

const TEST_OTP = "123456"; // Development testing ke liye hardcoded
const IS_DEV = process.env.NODE_ENV === "development"; // Environment check

const sendOTP = async (phone, isResend = false) => {
  const now = Date.now();
  const otp = IS_DEV
    ? TEST_OTP
    : Math.floor(100000 + Math.random() * 900000).toString();
  const expires = now + 5 * 60 * 1000; // 5 min

  // Resend check: Agar last sent 20 sec se pehle tha, to false return (spam prevent)
  const existing = otpStore.get(phone);
  if (isResend && existing && now - existing.sentAt < 20 * 1000) {
    return false; // Too soon for resend
  }

  otpStore.set(phone, { otp, expires, sentAt: now });

  // Test mein hardcoded OTP dikhao, production mein SMS bhejo
  if (IS_DEV) {
    console.log(`🔐 DEV MODE - OTP for ${phone}: ${otp}`);
  } else {
    // ← Production: Yahan SMS bhejo (Twilio, MSG91, etc.)
    console.log(`📱 SMS bhejo ${phone} ko`);
    // sendSMS(phone, `Your OTP is: ${otp}`);
  }

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
