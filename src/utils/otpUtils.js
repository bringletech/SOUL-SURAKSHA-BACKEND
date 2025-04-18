export const generateOTP = () => {
  return Math.floor(1000 + Math.random() * 9000).toString(); // Generate 4-digit OTP
};
