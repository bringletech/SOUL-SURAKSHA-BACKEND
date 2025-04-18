import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  createUser,
  createUserAndGetOtp,
  editUser,
  getCurrentUser,
  googleOauthHandler,
  loginUser,
  verifyOtp,
  sendEmailOtp,
  verifyEmailOtp,
  googleOauthMobileHandler,
} from "../controllers/user.controller.js";
import { validateUserType } from "../middleware/validateUserType.js";

const router = Router();

router.get(
  "/getcurrentuser",
  verifyJWT(["student", "therapist", "parent", "admin"]),
  getCurrentUser
);
router.post("/createUser", validateUserType, createUser);
router.post("/loginUser", validateUserType, loginUser);
router.put(
  "/editUser",
  validateUserType,
  verifyJWT(["student", "therapist", "parent"]),
  editUser
);

router.get("/googleAuth", googleOauthHandler);
router.post("/googleOauthMobile", googleOauthMobileHandler);
router.post("/createUserAndGetOtp", createUserAndGetOtp);
router.post("/verifyOtp", verifyOtp);
router.post("/send-email-otp", sendEmailOtp);
router.post("/verify-email-otp", verifyEmailOtp);

export { router as userRoutes };
