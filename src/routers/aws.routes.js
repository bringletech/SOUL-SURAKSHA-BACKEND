import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { handleMultipleDelete, handleSingleDelete, handleSingleUpload } from "../controllers/aws.controller.js";

const router = Router();

router.get("/getputurl", handleSingleUpload);
router.delete("/deletefile", handleSingleDelete);
router.delete("/deletemultiple", handleMultipleDelete);

export default router
