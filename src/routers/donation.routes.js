import { Router } from "express";
import {
  createDonation,
  createDonationRecord,
  createOrder,
  deleteDonation,
  getActiveDonations,
  getCompletedDonations,
  getInavtiveDonations,
  getSpecificDonation,
  getSpecificUserDonationRecord,
  updateDonation,
} from "../controllers/donation.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/createDonation", createDonation);
router.get("/getActiveDonations", getActiveDonations);
router.get("/getCompletedDonations", getCompletedDonations);
router.put("/updateDonation/:id", updateDonation);
router.delete("/deleteDonation/:id", deleteDonation);
router.get("/getSpecificDonation/:id", getSpecificDonation);
router.get(
  "/getSpecificUserDonationRecord",
  verifyJWT(["therapist", "parent"]),
  getSpecificUserDonationRecord
);
router.get(
  "/getInavtiveDonations",
  verifyJWT(["therapist", "admin", "parent"]),
  getInavtiveDonations
);
router.post("/createOrder", verifyJWT(["therapist", "parent"]), createOrder);
router.post(
  "/createDonationRecord",
  verifyJWT(["therapist", "parent"]),
  createDonationRecord
);

export { router as donationRoutes };
