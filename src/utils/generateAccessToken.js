import jwt from "jsonwebtoken";

const generateAccessToken = (id, email, userType) => {
  return jwt.sign(
    {
      id: id,
      email: email,
      userType: userType,
    },
    process.env.ACCESS_TOKEN_SECRET,
  );
};

export { generateAccessToken };
