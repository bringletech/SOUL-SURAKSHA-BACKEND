import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import { deleteSingleObjectFromS3 } from "./aws.controller.js";

const CreateEducationalVideoSchema = z.object({
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(50, { message: "Title cannot exceed 50 characters" }),
  description: z
    .string()
    .min(2, { message: "Description must be at least 2 characters long" })
    .max(1000, { message: "Description cannot exceed 1000 characters" }),
  thumbnailUrl: z.string().url({ message: "Invalid URL format" }),
  videoUrl: z.string().url({ message: "Invalid URL format" }),
  IsForStudent: z.boolean(),
});

const createEducationalVideo = async (req, res) => {
  try {
    const { title, description, thumbnailUrl, videoUrl, IsForStudent } =
      CreateEducationalVideoSchema.parse(req.body);

    const newEducationalVideo = await prisma.educationalVideo.create({
      data: {
        title,
        description,
        thumbnailUrl,
        videoUrl,
        IsForStudent,
      },
    });
    if (!newEducationalVideo) {
      return res.status(400).json({ message: "Video creation failed" });
    }
    return res.status(200).json({ message: "Video created successfully" });
  } catch (error) {
    if (req.body.thumbnailUrl) deleteSingleObjectFromS3(req.body.thumbnailUrl);
    if (req.body.videoUrl) deleteSingleObjectFromS3(req.body.videoUrl);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation error",
        errors: error.errors,
        status: false,
      });
    }
    console.error(error);
    return res.status(500).json({
      message: "Something went wrong",
      status: false,
    });
  }
};

const getStudentEducationalVideos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalCount = await prisma.educationalVideo.count({
      where: { IsForStudent: true },
    });

    const educationalVideos = await prisma.educationalVideo.findMany({
      where: { IsForStudent: true },
      select: {
        id: true,
        thumbnailUrl: true,
        title: true,
        description: true,
      },
      skip,
      take: limit,
    });

    if (!educationalVideos || educationalVideos.length === 0) {
      return res.status(404).json({
        message: "Educational videos not found",
        status: false,
      });
    }

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      data: educationalVideos,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
      },
      message: "Educational videos retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.log("Error retrieving educational videos:", error);
    return res.status(500).json({
      message: "Error retrieving educational videos",
      error: error.message,
      status: false,
    });
  }
};

const getParentEducationalVideos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalCount = await prisma.educationalVideo.count({
      where: { IsForStudent: false },
    });

    const educationalVideos = await prisma.educationalVideo.findMany({
      where: { IsForStudent: false },
      select: {
        id: true,
        thumbnailUrl: true,
        title: true,
        description: true,
      },
      skip,
      take: limit,
    });

    if (!educationalVideos || educationalVideos.length === 0) {
      return res.status(404).json({
        message: "Educational videos not found",
        status: false,
      });
    }

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      data: educationalVideos,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
      },
      message: "Educational videos retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.log("Error retrieving educational videos:", error);
    return res.status(500).json({
      message: "Error retrieving educational videos",
      error: error.message,
      status: false,
    });
  }
};

const getEducationalVideoById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "Video ID is required",
        status: false,
      });
    }

    const video = await prisma.educationalVideo.findUnique({
      where: { id },
    });

    if (!video) {
      return res.status(404).json({
        message: "Video not found",
        status: false,
      });
    }

    return res.status(200).json({
      data: video,
      message: "Video retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error retrieving video:", error);
    return res.status(500).json({
      message: "Error retrieving video",
      error: error.message,
      status: false,
    });
  }
};

const relatedEducationalVideos = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const IsForStudent = req.query.IsForStudent === "true" ? true : false;
    const skip = (page - 1) * limit;

    // Get total count for pagination info
    const totalCount = await prisma.educationalVideo.count({
      where: { IsForStudent },
    });

    const educationalVideos = await prisma.educationalVideo.findMany({
      where: { IsForStudent },
      select: {
        id: true,
        thumbnailUrl: true,
        title: true,
        description: true,
      },
      skip,
      take: limit,
    });

    if (!educationalVideos || educationalVideos.length === 0) {
      return res.status(404).json({
        message: "Educational videos not found",
        status: false,
      });
    }

    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      data: educationalVideos,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNextPage,
        hasPrevPage,
      },
      message: "Educational videos retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.log("Error retrieving educational videos:", error);
    return res.status(500).json({
      message: "Error retrieving educational videos",
      error: error.message,
      status: false,
    });
  }
};

export {
  createEducationalVideo,
  getStudentEducationalVideos,
  getParentEducationalVideos,
  getEducationalVideoById,
  relatedEducationalVideos,
};
