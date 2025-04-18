import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { addReview } from "../controllers/review.controller.js";

const router = Router();

router.post("/addReview", verifyJWT(["student"]), addReview);

export default router
