import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { createAdminAccount, loginAdmin, updateDetails } from "../controllers/admin.controller.js";

const router = Router();

router.post("/create", createAdminAccount);
router.post("/login", loginAdmin);
router.put("/update", verifyJWT(["admin"]), updateDetails);

export default router
