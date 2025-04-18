import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  approveTherapist,
  createTherapist,
  editTherapist,
  getAllTherapist,
  getSpecificTherapist,
  getUnverifiedTherapist,
  getUnverifiedTherapists,
  loginTherapist,
  logoutTherapist,
} from "../controllers/therapist.controller.js";

const router = Router();

router.post("/createTherapist", createTherapist);
router.post("/login", loginTherapist);
router.get("/logout", verifyJWT(["therapist"]), logoutTherapist);
router.put("/editTherapist", verifyJWT(["therapist"]), editTherapist);
router.get("/getAllTherapist", getAllTherapist);
router.get("/getSpecificTherapist/:id", getSpecificTherapist);
router.get(
  "/getUnverifiedTherapists",
  //   verifyJWT(["admin"]),
  getUnverifiedTherapists
);
router.get(
  "/getUnverifiedTherapist/:id",
  //   verifyJWT(["admin"]),
  getUnverifiedTherapist
);

router.put(
  "/approvetherapist/:id",
  //  verifyJWT(["admin"]),
  approveTherapist
);
export default router;
