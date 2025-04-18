import { Router } from "express";
import {
  createBlog,
  deleteBlog,
  editBlog,
  getBlog,
  getBlogs,
  getTopViewedBlogs,
  searchBlogs,
} from "../controllers/blog.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/createBlog", createBlog);
router.get("/getBlogs", getBlogs);
router.get(
  "/getBlog/:id/:iscountView",
  verifyJWT(["student", "therapist", "parent"]),
  getBlog
);
router.get("/getTopViewedBlogs", getTopViewedBlogs);
router.get("/searchBlogs", searchBlogs);
router.put("/editBlog/:id", editBlog);
router.delete("/deleteBlog/:id", deleteBlog);
export { router as blogRoutes };
