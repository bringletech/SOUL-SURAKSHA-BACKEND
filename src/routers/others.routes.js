import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { getActiveDonations, getBlogViewsStats, getStats, getTopRatedTherapists } from "../controllers/others.controller.js";

const router = Router();

router.get('/stats', getStats);
router.get('/top-therapists', getTopRatedTherapists);
router.get('/blog-stats', getBlogViewsStats);
router.get('/active-donations', getActiveDonations);

export default router