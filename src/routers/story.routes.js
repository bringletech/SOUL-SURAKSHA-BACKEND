import { Router } from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  addComment,
  createStory,
  deleteStory,
  editStory,
  getCurrentUserStories,
  getReportedStories,
  getReportedStory,
  getStories,
  getSpecificStory,
  getStoryComments,
  getTopThreeLikedStoryes,
  reportStory,
  toggleStoryLike,
  toggleFavoriteStory,
  hideStory,
  getFavoriteStories,
} from "../controllers/story.controller.js";

const router = Router();

router.post("/createstory", verifyJWT(["student"]), createStory);
router.get(
  "/getStories",
  verifyJWT(["student", "parent", "therapist"]),
  getStories
);
router.put("/editstory/:storyId", verifyJWT(["student"]), editStory);
router.delete("/deletestory/:storyId", verifyJWT(["student"]), deleteStory);
router.post(
  "/addcomment/:storyId",
  verifyJWT(["student", "therapist", "parent"]),
  addComment
);
router.get(
  "/getCurrentUserStories",
  verifyJWT(["student"]),
  getCurrentUserStories
);
router.get("/getSpecificStory/:storyId", getSpecificStory);
router.post(
  "/like/:storyId",
  verifyJWT(["student", "therapist", "parent"]),
  toggleStoryLike
);
router.get("/getStoryComments", getStoryComments);
router.get("/getTopThreeLikedStoryes", getTopThreeLikedStoryes);

router.get("/getReportedStories", getReportedStories);
router.get("/getReportedStory/:id", getReportedStory);
router.post(
  "/reportStory/:storyId",
  verifyJWT(["student", "therapist", "parent"]),
  reportStory
);
router.post(
  "/toggleFavoriteStory/:id",
  verifyJWT(["student", "therapist", "parent"]),
  toggleFavoriteStory
);
router.post(
  "/hideStory/:storyId",
  verifyJWT(["student", "therapist", "parent"]),
  hideStory
);
router.get("/getFavoriteStories", verifyJWT(["student"]), getFavoriteStories);
export { router as storyRoutes };
