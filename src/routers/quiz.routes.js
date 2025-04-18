import { Router } from "express";
import {
  createQuiz,
  editQuiz,
  getQuizzes,
  getUnattemptedQuizzes,
  submitQuizAttempt,
  toogleisActive,
  addQuizQuestion,
  deleteQuiz,
  deleteQuizQuestion,
  getSpecificQuiz,
  getLeaderboard,
} from "../controllers/quiz.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/createQuiz", createQuiz);
router.post("/addQuizQuestion/:quizId", addQuizQuestion);
router.get("/getQuizzes", getQuizzes);
router.get("/getSpecificQuiz/:quizId", getSpecificQuiz);
router.put("/editQuiz/:id", editQuiz);
router.put("/toogleisActive/:id/:isActive", toogleisActive);
router.post("/attemptQuiz", verifyJWT(["student"]), submitQuizAttempt);
router.get(
  "/getUnattemptedQuizzes",
  verifyJWT(["student"]),
  getUnattemptedQuizzes
);
router.get("/leaderboard", verifyJWT(["student"]), getLeaderboard);
router.delete("/deleteQuiz/:id", deleteQuiz);
router.delete("/deleteQuizQuestion/:questionId", deleteQuizQuestion);

export { router as quizRoutes };
