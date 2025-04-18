import { Router } from "express";
import {
  createParent,
  editParent,
  getAllParents,
  loginParent,
  logoutParent,
} from "../controllers/parent.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", createParent);
router.post("/login", loginParent);
router.get("/logout", verifyJWT(["parent"]), logoutParent);
router.put("/editParent", verifyJWT(["parent"]), editParent);
router.get("/getAllParents", getAllParents);

export { router as parentRoutes };
