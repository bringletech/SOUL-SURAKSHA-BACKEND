import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { checkConversationExists, getConversation, getMessages, getPendingConversationsOfSpecificTherapist, handleReq, sendMessage } from "../controllers/messages.controller.js";

const router = Router();

router.post("/sendMessage", verifyJWT(["student", "therapist"]), sendMessage);
router.get("/getMessages/:otherUserId", verifyJWT(["student", "therapist"]), getMessages);
router.get("/getConversation", verifyJWT(["student", "therapist"]), getConversation);
router.get("/getPendingConversationsOfSpecificTherapist", verifyJWT(["therapist"]), getPendingConversationsOfSpecificTherapist);
router.get("/checkConversationExists/:id", verifyJWT(["student"]), checkConversationExists);
router.put("/handleReq/:id", verifyJWT(["therapist"]), handleReq);

export default router
