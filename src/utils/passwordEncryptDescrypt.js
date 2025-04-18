import bcrypt from "bcrypt";

const encryptPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

const decryptPassword = async (password, savedPassword) => {
  return await bcrypt.compare(password, savedPassword);
};

export { encryptPassword, decryptPassword };
