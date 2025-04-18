import { Router } from "express";
import {
  createEducationalVideo,
  getEducationalVideoById,
  getParentEducationalVideos,
  getStudentEducationalVideos,
  relatedEducationalVideos,
} from "../controllers/educationalVideo.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/createEducationalVideo",
  //   verifyJWT(["admin"]),
  createEducationalVideo
);
router.get(
  "/getStudentEducationalVideos",
  //   verifyJWT(["admin"]),
  getStudentEducationalVideos
);
router.get(
  "/getParentEducationalVideos",
  //   verifyJWT(["parent"]),
  getParentEducationalVideos
);

router.get(
  "/relatedEducationalVideos",
  // verifyJWT(["student", "parent", "admin"]),
  relatedEducationalVideos
);

router.get("/getEducationalVideo/:id", getEducationalVideoById);
export { router as educationalVideoRoutes };
