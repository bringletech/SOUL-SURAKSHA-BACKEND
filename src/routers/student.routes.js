import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  createStudent,
  editStudent,
  getStudentProfile,
  loginStudent,
  logoutStudent,
  getAllStudents,
  getStudentProfileDetails,
} from "../controllers/student.controller.js";

const router = Router();

router.post("/register", createStudent);
router.post("/login", loginStudent);
router.post("/logout", verifyJWT(["student"]), logoutStudent);
router.get("/profile", verifyJWT(["student"]), getStudentProfile);
router.put("/editStudent", verifyJWT(["student"]), editStudent);
router.get("/getAllStudents", getAllStudents);
router.get(
  "/getStudentProfileDetails/:id",
  verifyJWT(["student"]),
  getStudentProfileDetails
);

export { router as studentRoutes };
