import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import { timeAgo } from "../utils/Helper.js";
import { deleteSingleObjectFromS3 } from "./aws.controller.js";

// Zod validation schema for creating a post
const CreateStorySchema = z.object({
  content: z
    .string()
    .min(1, { message: "Story content cannot be empty" })
    .max(2500, { message: "Story content cannot exceed 2500 characters" }),
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(100, { message: "Title cannot exceed 100 characters" })
    .optional(),

  image: z.string().optional(),

  audio: z.string().optional(),
  audioDuration: z.number().optional(),
});

const ChunkStorySchema = z.object({
  content: z.string().min(1, { message: "Chunk content cannot be empty" }),
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(100, { message: "Title cannot exceed 100 characters" })
    .optional(),
  image: z.string().optional(),
  audio: z.string().optional(),
  audioDuration: z.number().optional(),
  isChunk: z.boolean().default(true),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
  storyId: z.string().optional(), // Required for all chunks except the first one
});
// Zod schema for pagination query parameters
const StoryPaginationSchema = z.object({
  page: z.string().transform(Number).default("1"),
  limit: z.string().transform(Number).default("10"),
});

// Zod validation schema for editing a post
const EditStorySchema = z.object({
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(50, { message: "Title cannot exceed 50 characters" })
    .optional(),
  content: z.string().min(1, { message: "Story content cannot be empty" }),
  image: z.string().optional(),
  audio: z.string().optional(),
  audioDuration: z.number().optional(),
  imageBeforeChange: z.string().optional(),
  audioBeforeChange: z.string().optional(),

  // Chunk-related fields
  isChunk: z.boolean().optional(),
  chunkIndex: z.number().int().min(0).optional(),
  totalChunks: z.number().int().min(1).optional(),
  storyId: z.string().optional(),
});

const createStory = async (req, res) => {
  try {
    // Extract and validate input using Zod
    const studentId = req.user?.id;

    // For chunked content, we'll check if we're receiving a chunk or a complete story
    const isChunk = req.body.isChunk === true;
    const chunkIndex = req.body.chunkIndex || 0;
    const totalChunks = req.body.totalChunks || 1;
    const storyId = req.body.storyId; // Only provided for chunks after the first one

    const { title, content, image, audioDuration, audio } = isChunk
      ? ChunkStorySchema.parse(req.body)
      : CreateStorySchema.parse(req.body);

    // Verify that the author (user) exists
    const authorExists = await prisma.student.findUnique({
      where: {
        id: studentId,
      },
    });

    if (!authorExists) {
      return res.status(403).json({
        message: "You are not authorized to create a post",
        status: false,
      });
    }

    // Handle story creation or chunk append based on the isChunk flag
    if (!isChunk) {
      // Regular story creation (unchanged)
      const createdPost = await prisma.story.create({
        data: {
          title,
          content,
          image: image || "",
          audio: audio || "",
          audioDuration: audioDuration || 0,
          studentId,
        },
        select: {
          id: true,
          title: true,
          content: true,
          image: true,
          audio: true,
          audioDuration: true,
          createdAt: true,
          studentId: true,
        },
      });

      return res.status(201).json({
        data: createdPost,
        message: "Story created successfully",
        status: true,
      });
    } else {
      // Handle chunked content
      if (chunkIndex === 0) {
        // First chunk - create a new story
        const newStory = await prisma.story.create({
          data: {
            title: title || "Draft Story",
            content: content,
            image: image || "",
            audio: audio || "",
            audioDuration: audioDuration || 0,
            studentId,
            isComplete: false,
          },
          select: {
            id: true,
            title: true,
            content: true,
            image: true,
            audio: true,
            audioDuration: true,
            createdAt: true,
            studentId: true,
          },
        });

        // Also create a StoryChunk record to track chunks
        await prisma.storyChunk.create({
          data: {
            storyId: newStory.id,
            chunkIndex: 0,
            content: content,
            receivedChunks: 1,
            totalChunks,
          },
        });

        return res.status(201).json({
          data: {
            ...newStory,
            chunksReceived: 1,
            totalChunks,
          },
          message: "First chunk received successfully",
          status: true,
        });
      } else {
        // Subsequent chunks - append to existing story
        if (!storyId) {
          return res.status(400).json({
            message: "Story ID is required for chunk uploads",
            status: false,
          });
        }

        // Verify story exists and belongs to this student
        const existingStory = await prisma.story.findFirst({
          where: {
            id: storyId,
            studentId,
            isComplete: false,
          },
        });

        if (!existingStory) {
          return res.status(404).json({
            message: "Story not found or already completed",
            status: false,
          });
        }

        // Update the story chunk tracking
        const chunkTracker = await prisma.storyChunk.findUnique({
          where: {
            storyId,
          },
        });

        if (!chunkTracker) {
          return res.status(404).json({
            message: "Story chunk tracking information not found",
            status: false,
          });
        }

        // Update the story with the new content
        const updatedStory = await prisma.story.update({
          where: {
            id: storyId,
          },
          data: {
            content: existingStory.content + content,
            // Update title and other fields if provided in the final chunk
            ...(chunkIndex === totalChunks - 1
              ? {
                  title: title || existingStory.title,
                  image: image || existingStory.image,
                  audio: audio || existingStory.audio,
                  audioDuration: audioDuration || existingStory.audioDuration,
                  isComplete: true,
                }
              : {}),
          },
          select: {
            id: true,
            title: true,
            content: true,
            image: true,
            audio: true,
            audioDuration: true,
            createdAt: true,
            studentId: true,
          },
        });

        // Update the chunk tracker
        await prisma.storyChunk.update({
          where: {
            storyId,
          },
          data: {
            receivedChunks: chunkTracker.receivedChunks + 1,
            content: chunkTracker.content + content,
            isComplete: chunkIndex === totalChunks - 1,
          },
        });

        return res.status(200).json({
          data: {
            ...updatedStory,
            chunksReceived: chunkTracker.receivedChunks + 1,
            totalChunks,
            isComplete: chunkIndex === totalChunks - 1,
          },
          message:
            chunkIndex === totalChunks - 1
              ? "Story completed successfully"
              : `Chunk ${
                  chunkIndex + 1
                } of ${totalChunks} received successfully`,
          status: true,
        });
      }
    }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while creating post",
      error: error.message,
      status: false,
    });
  }
};

const getStories = async (req, res) => {
  try {
    // Validate and parse query parameters
    const { page, limit } = StoryPaginationSchema.parse(req.query);
    const userId = req.user?.id || null;
    const role = req.user?.userType || req.role || null;

    // Calculate pagination details
    const pageNumber = Math.max(page, 1);
    const pageSize = Math.min(limit, 10); // Ensure max 10 posts per request
    const skip = (pageNumber - 1) * pageSize;

    // Create filters to exclude stories reported or hidden by the current user
    let filterConditions = {};

    if (userId && role) {
      // Define which stories to exclude based on user role
      filterConditions = {
        AND: [
          // Filter out reported stories
          {
            NOT: {
              reports: {
                some:
                  role === "student"
                    ? { studentReporterId: userId }
                    : role === "parent"
                    ? { parentReporterId: userId }
                    : role === "therapist"
                    ? { therapistReporterId: userId }
                    : undefined,
              },
            },
          },
          // Filter out hidden stories
          {
            NOT: {
              hidenStories: {
                some:
                  role === "student"
                    ? { studentId: userId }
                    : role === "parent"
                    ? { parentId: userId }
                    : role === "therapist"
                    ? { therapistId: userId }
                    : undefined,
              },
            },
          },
        ],
      };
    }

    // Fetch posts with pagination and detailed relations
    const [stories, totalStories] = await Promise.all([
      prisma.story.findMany({
        where: filterConditions, // Apply both report and hidden filters
        take: pageSize,
        skip: skip,
        orderBy: {
          createdAt: "desc", // Most recent stories first
        },
        include: {
          student: {
            select: {
              id: true,
              userName: true,
              studentImage: true,
            },
          },
          // Only include likes check if user is logged in
          ...(userId && {
            likes: {
              where: {
                OR: [
                  { studentId: role === "student" ? userId : undefined },
                  { parentId: role === "parent" ? userId : undefined },
                  { therapistId: role === "therapist" ? userId : undefined },
                ],
              },
              select: {
                id: true,
              },
            },
          }),
          ...(userId && {
            favorites: {
              where: {
                OR: [
                  { studentId: role === "student" ? userId : undefined },
                  { parentId: role === "parent" ? userId : undefined },
                  { therapistId: role === "therapist" ? userId : undefined },
                ],
              },
              select: {
                id: true,
              },
            },
          }),
          _count: {
            select: {
              comments: true,
              likes: true,
            },
          },
        },
      }),
      prisma.story.count({
        where: filterConditions, // Apply the same filters for accurate count
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalStories / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    return res.status(200).json({
      data: stories.map((story) => ({
        ...story,
        timeAgo: timeAgo(story.createdAt),
        commentCount: story._count.comments,
        likeCount: story._count.likes,
        isLiked: userId ? story.likes?.length > 0 : false,
        isFavorite: userId ? story.favorites?.length > 0 : false,
      })),
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalStories,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      message: "Stories retrieved successfully",
      status: true,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while retrieving story",
      error: error.message,
      status: false,
    });
  }
};

const getCurrentUserStories = async (req, res) => {
  try {
    // Validate and parse query parameters
    const { page, limit } = StoryPaginationSchema.parse(req.query);

    // Calculate pagination details
    const pageNumber = Math.max(page, 1);
    const pageSize = Math.min(limit, 10); // Ensure max 10 posts per request
    const skip = (pageNumber - 1) * pageSize;

    // Get the current user's ID from the authenticated session
    const userId = req.user.id;

    // Fetch current user's stories with pagination and detailed relations
    const [stories, totalStories] = await Promise.all([
      prisma.story.findMany({
        where: {
          studentId: userId, // Filter stories by current user's ID
        },
        take: pageSize,
        skip: skip,
        orderBy: {
          createdAt: "desc", // Most recent stories first
        },
        include: {
          student: {
            select: {
              userName: true,
              studentImage: true,
            },
          },
          comments: {
            select: {
              content: true,
              createdAt: true,
              student: {
                select: {
                  studentImage: true,
                  userName: true,
                },
              },
            },
          },
          _count: {
            select: {
              comments: true,
              likes: true,
            },
          },
        },
      }),
      prisma.story.count({
        where: {
          studentId: userId, // Count only current user's stories
        },
      }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalStories / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    return res.status(200).json({
      data: stories.map((story) => ({
        ...story,
        comments: story?.comments?.map((comment) => ({
          content: comment?.content,
          studentImage: comment.student?.studentImage,
          userName: comment.student?.userName,
          timeAgo: timeAgo(comment?.createdAt),
        })),
        timeAgo: timeAgo(story?.createdAt),
        commentCount: story._count?.comments,
        likeCount: story._count?.likes,
      })),
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalStories,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      message: "Your stories retrieved successfully",
      status: true,
    });
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while retrieving your stories",
      error: error.message,
      status: false,
    });
  }
};

const editStory = async (req, res) => {
  try {
    // Extract user ID from authenticated request
    const userId = req.user.id; // Assumes you have authentication middleware
    const storyId = req.params.storyId;

    // Check if this is a chunked update
    const isChunk = req.body.isChunk === true;
    const chunkIndex = req.body.chunkIndex || 0;
    const totalChunks = req.body.totalChunks || 1;

    // Validate input using Zod
    const validatedData = EditStorySchema.parse({
      ...req.body,
      storyId: storyId,
    });

    // First, verify the story exists and belongs to the user
    const existingStory = await prisma.story.findUnique({
      where: {
        id: storyId,
        studentId: userId,
      },
      select: {
        id: true,
        studentId: true,
        content: true,
        title: true,
        image: true,
        audio: true,
        audioDuration: true,
      },
    });

    // Check if story exists
    if (!existingStory) {
      return res.status(404).json({
        message: "Story not found or you are not authorized to edit this post",
        status: false,
      });
    }

    // Handle file deletion if needed
    if (validatedData.imageBeforeChange) {
      await deleteSingleObjectFromS3(validatedData.imageBeforeChange);
    }

    if (validatedData.audioBeforeChange) {
      await deleteSingleObjectFromS3(validatedData.audioBeforeChange);
    }

    // Handle chunked or regular update differently
    if (!isChunk) {
      // Regular update (without chunking)
      // Prepare update data (only include fields that are provided)
      const updateData = {};
      if (validatedData.content !== undefined)
        updateData.content = validatedData.content;
      if (validatedData.image !== undefined)
        updateData.image = validatedData.image;
      if (validatedData.title !== undefined)
        updateData.title = validatedData.title;
      if (validatedData.audio !== undefined)
        updateData.audio = validatedData.audio;
      if (validatedData.audioDuration !== undefined)
        updateData.audioDuration = validatedData.audioDuration;

      // If no update fields provided, return error
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          message: "No update fields provided",
          status: false,
        });
      }

      // Update the story
      const updatedStory = await prisma.story.update({
        where: { id: storyId },
        data: updateData,
        select: {
          id: true,
          title: true,
          content: true,
          image: true,
          audio: true,
          audioDuration: true,
          createdAt: true,
          student: {
            select: {
              id: true,
              userName: true,
            },
          },
        },
      });

      return res.status(200).json({
        data: updatedStory,
        message: "Story updated successfully",
        status: true,
      });
    } else {
      // Handle chunked update
      // Check if this is the first chunk
      if (chunkIndex === 0) {
        // For the first chunk, we'll replace the content
        // Find or create the StoryChunk tracking record
        const chunkTracker = await prisma.storyChunk.findUnique({
          where: { storyId },
        });

        if (chunkTracker) {
          // Reset the existing tracker for a new update
          await prisma.storyChunk.update({
            where: { storyId },
            data: {
              content: validatedData.content,
              receivedChunks: 1,
              totalChunks,
              isComplete: totalChunks === 1,
            },
          });
        } else {
          // Create a new tracker
          await prisma.storyChunk.create({
            data: {
              storyId,
              chunkIndex: 0,
              content: validatedData.content,
              receivedChunks: 1,
              totalChunks,
              isComplete: totalChunks === 1,
            },
          });
        }

        // Update the story with initial content
        const updateData = {
          content: validatedData.content,
          isComplete: totalChunks === 1,
        };

        // Add other fields if provided
        if (validatedData.title) updateData.title = validatedData.title;
        if (validatedData.image !== undefined)
          updateData.image = validatedData.image;
        if (validatedData.audio !== undefined)
          updateData.audio = validatedData.audio;
        if (validatedData.audioDuration !== undefined)
          updateData.audioDuration = validatedData.audioDuration;

        const updatedStory = await prisma.story.update({
          where: { id: storyId },
          data: updateData,
          select: {
            id: true,
            title: true,
            content: true,
            image: true,
            audio: true,
            audioDuration: true,
            createdAt: true,
          },
        });

        return res.status(200).json({
          data: {
            ...updatedStory,
            chunksReceived: 1,
            totalChunks,
            isComplete: totalChunks === 1,
          },
          message:
            totalChunks === 1
              ? "Story updated successfully"
              : "First chunk received successfully",
          status: true,
        });
      } else {
        // For subsequent chunks, we'll append content
        // First, get the chunk tracker
        const chunkTracker = await prisma.storyChunk.findUnique({
          where: { storyId },
        });

        if (!chunkTracker) {
          return res.status(404).json({
            message: "Story chunk tracking information not found",
            status: false,
          });
        }

        // Update the chunk tracker
        const updatedTracker = await prisma.storyChunk.update({
          where: { storyId },
          data: {
            content: chunkTracker.content + validatedData.content,
            receivedChunks: chunkTracker.receivedChunks + 1,
            isComplete: chunkIndex === totalChunks - 1,
          },
        });

        // Update the story with the appended content
        const updateData = {
          content: chunkTracker.content + validatedData.content,
          isComplete: chunkIndex === totalChunks - 1,
        };

        // For the final chunk, update metadata if provided
        if (chunkIndex === totalChunks - 1) {
          if (validatedData.title) updateData.title = validatedData.title;
          if (validatedData.image !== undefined)
            updateData.image = validatedData.image;
          if (validatedData.audio !== undefined)
            updateData.audio = validatedData.audio;
          if (validatedData.audioDuration !== undefined)
            updateData.audioDuration = validatedData.audioDuration;
        }

        const updatedStory = await prisma.story.update({
          where: { id: storyId },
          data: updateData,
          select: {
            id: true,
            title: true,
            content: true,
            image: true,
            audio: true,
            audioDuration: true,
            createdAt: true,
          },
        });

        return res.status(200).json({
          data: {
            ...updatedStory,
            chunksReceived: updatedTracker.receivedChunks,
            totalChunks,
            isComplete: chunkIndex === totalChunks - 1,
          },
          message:
            chunkIndex === totalChunks - 1
              ? "Story updated successfully"
              : `Chunk ${
                  chunkIndex + 1
                } of ${totalChunks} received successfully`,
          status: true,
        });
      }
    }
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Validation Error",
        errors: error.errors.map((e) => e.message),
        status: false,
      });
    }

    // Handle Prisma not found errors
    if (error.code === "P2025") {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    // Handle other errors
    console.error(error);
    return res.status(500).json({
      message: "Error while updating story",
      error: error.message,
      status: false,
    });
  }
};

const deleteStory = async (req, res) => {
  try {
    const { storyId } = req.params;

    // First, verify the story exists and belongs to the user
    const existingStory = await prisma.story.findUnique({
      where: {
        id: storyId,
        studentId: req.user.id,
      },
      select: {
        id: true,
        studentId: true,
        image: true,
        audio: true,
      },
    });

    // Check if story exists
    if (!existingStory) {
      return res.status(404).json({
        message:
          "Story not found or you are not authorized to delete this post",
        status: false,
      });
    }

    // Use a transaction to delete all related records and the story itself
    await prisma.$transaction([
      prisma.storyChunk.deleteMany({ where: { storyId } }),
      prisma.comment.deleteMany({ where: { storyId } }),
      prisma.like.deleteMany({ where: { storyId } }),
      prisma.story.delete({ where: { id: storyId } }),
    ]);

    // Clean up S3 resources
    if (existingStory.image) {
      await deleteSingleObjectFromS3(existingStory.image);
    }
    if (existingStory.audio) {
      await deleteSingleObjectFromS3(existingStory.audio);
    }

    return res.status(200).json({
      message: "Story deleted successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while deleting post",
      error: error.message,
      status: false,
    });
  }
};

const addComment = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { comment } = req.body;
    const userRole = req.role;
    const userId = req.user.id;

    // Find the story
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    // Create the comment
    const newComment = await prisma.comment.create({
      data: {
        content: comment,
        ...(userRole === "student"
          ? { studentId: userId }
          : userRole === "parent"
          ? { parentId: userId }
          : {
              therapistId: userId,
            }),
        storyId: storyId,
      },
      select: {
        content: true,
        createdAt: true,

        ...(userRole === "student"
          ? {
              student: {
                select: {
                  id: true,
                  userName: true,
                  studentImage: true,
                },
              },
            }
          : userRole === "parent"
          ? {
              parent: {
                select: {
                  id: true,
                  // userName: true,
                  parentImage: true,
                },
              },
            }
          : {
              therapist: {
                select: {
                  id: true,
                  userName: true,
                  therapistImage: true,
                },
              },
            }),
      },
    });

    let newCommentData;
    if (userRole === "student") {
      newCommentData = {
        id: newComment.student.id,
        name: newComment.student.userName,
        image: newComment.student.studentImage,
        createdAt: newComment.createdAt,
        content: newComment.content,
      };
    }
    if (userRole === "parent") {
      newCommentData = {
        id: newComment.parent.id,
        // name: newComment.parent.userName,
        image: newComment.parent.parentImage,
        createdAt: newComment.createdAt,
        content: newComment.content,
      };
    }
    if (userRole === "therapist") {
      newCommentData = {
        id: newComment.therapist.id,
        name: newComment.therapist.userName,
        image: newComment.therapist.therapistImage,
        createdAt: newComment.createdAt,
        content: newComment.content,
      };
    }
    return res.status(200).json({
      data: {
        user: newCommentData,
        content: newComment.content,
        createdAt: newComment.createdAt,
        userType: userRole.toUpperCase(),
      },
      message: "Comment added successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while adding comment",
      error: error.message,
      status: false,
    });
  }
};

const getStoryComments = async (req, res) => {
  try {
    const { storyId, page = 1, limit = 10 } = req.query;

    // Convert to numbers and validate
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Validate page and limit
    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return res.status(400).json({
        message: "Invalid pagination parameters",
        status: false,
      });
    }

    // Calculate skip value for pagination
    const skip = (pageNum - 1) * limitNum;

    // Get total count of comments
    const totalComments = await prisma.comment.count({
      where: { storyId },
    });

    // Get paginated comments
    const storyComments = await prisma.story.findFirstOrThrow({
      where: { id: storyId },
      select: {
        comments: {
          skip,
          take: limitNum,
          select: {
            id: true,
            content: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                userName: true,
                studentImage: true,
              },
            },
            parent: {
              select: {
                id: true,
                // userName: true,
                parentImage: true,
              },
            },
            therapist: {
              select: {
                id: true,
                userName: true,
                therapistImage: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc", // Most recent comments first
          },
        },
      },
    });

    // Transform the comments to include userType and normalize the user data
    const transformedComments = storyComments.comments.map((comment) => {
      let userData = null;
      let userType = null;

      if (comment.student) {
        userData = {
          id: comment.student.id,
          name: comment.student.userName,
          image: comment.student.studentImage,
        };
        userType = "STUDENT";
      } else if (comment.parent) {
        userData = {
          id: comment.parent.id,
          // name: comment.parent.userName,
          image: comment.parent.parentImage,
        };
        userType = "PARENT";
      } else if (comment.therapist) {
        userData = {
          id: comment.therapist.id,
          name: comment.therapist.userName,
          image: comment.therapist.therapistImage,
        };
        userType = "THERAPIST";
      }

      return {
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        userType,
        user: userData,
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalComments / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return res.status(200).json({
      data: transformedComments,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalComments,
        hasNextPage,
        hasPrevPage,
        limit: limitNum,
      },
      message: "Comments retrieved successfully",
      status: true,
    });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    return res.status(500).json({
      message: "Error while getting comments",
      error: error.message,
      status: false,
    });
  }
};
const toggleStoryLike = async (req, res) => {
  try {
    const { storyId } = req.params;
    const userId = req.user.id;
    const userRole = req.role;

    // Verify story exists
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    // Check for existing like
    const existingLike = await prisma.like.findFirst({
      where: {
        storyId,
        ...(userRole === "student"
          ? { studentId: userId }
          : userRole === "parent"
          ? { parentId: userId }
          : {
              therapistId: userId,
            }),
      },
    });

    if (existingLike) {
      // Unlike if like exists
      await prisma.like.delete({
        where: { id: existingLike.id },
      });

      return res.status(200).json({
        message: "Successfully unliked the story",
        status: true,
        liked: false,
      });
    }

    // Create new like
    await prisma.like.create({
      data: {
        storyId,
        ...(userRole === "student"
          ? { studentId: userId }
          : userRole === "parent"
          ? { parentId: userId }
          : {
              therapistId: userId,
            }),
      },
    });

    return res.status(200).json({
      message: "Successfully liked the story",
      status: true,
      liked: true,
    });
  } catch (error) {
    console.error("Toggle Like Error:", error);
    return res.status(500).json({
      message: "Error while toggling like",
      status: false,
      error: error.message,
    });
  }
};

const getTopThreeLikedStoryes = async (req, res) => {
  try {
    const stories = await prisma.story.findMany({
      take: 3,
      orderBy: {
        likes: {
          _count: "desc",
        },
      },
      select: {
        image: true,
        title: true,
        content: true,
        student: {
          select: {
            studentImage: true,
            userName: true,
          },
        },
        _count: {
          select: {
            likes: true,
          },
        },
      },
    });
    return res.status(200).json({
      data: stories,
      message: "Top 3 liked stories retrieved successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error while retrieving top 3 liked stories",
      error: error.message,
      status: false,
    });
  }
};
const getSpecificStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    // console.log(storyId);
    const userId = req.user?.id; // Assuming you want to ensure the user owns the story

    // Fetch the story by ID, ensuring it belongs to the logged-in user
    const story = await prisma.story.findUnique({
      where: {
        id: storyId,
        studentId: userId, // Ensure the story belongs to the user
      },
      select: {
        id: true,
        title: true,
        content: true,
        image: true,
        audio: true,
        audioDuration: true,
        createdAt: true,
        student: {
          select: {
            id: true,
            fullName: true,
            userName: true,
            studentImage: true,
          },
        },
        comments: {
          select: {
            id: true,
            content: true,
            createdAt: true,
            student: {
              select: {
                id: true,
                fullName: true,
                userName: true,
                studentImage: true,
              },
            },
          },
        },
        likes: {
          select: {
            id: true,
            student: {
              select: {
                id: true,
                fullName: true,
                userName: true,
                studentImage: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    // If the story doesn't exist or doesn't belong to the user, return a 404 error
    if (!story) {
      return res.status(404).json({
        message: "Story not found or you are not authorized to view it",
        status: false,
      });
    }

    // Format the story with additional data
    const formattedStory = {
      id: story.id,
      title: story.title,
      content: story.content,
      image: story.image,
      audio: story.audio,
      audioDuration: story.audioDuration,
      createdAt: story.createdAt,
      timeAgo: timeAgo(story.createdAt),
      student: story.student,
      comments: story.comments.map((comment) => ({
        ...comment,
        timeAgo: timeAgo(comment.createdAt),
      })),
      commentsCount: story._count.comments,
      likes: story.likes,
      likesCount: story._count.likes,
    };

    // Return the formatted story data
    return res.status(200).json({
      data: formattedStory,
      message: "Story retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while retrieving story",
      error: error.message,
      status: false,
    });
  }
};

const reportStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const { reason } = req.body;
    const user = req.user;

    // Verify the story exists
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }
    // Determine reporter type based on userType from the JWT middleware
    const reportData = {
      storyId,
      reason,
    };

    // Add the appropriate reporter ID based on user type
    if (user.userType === "student") {
      reportData.studentReporterId = user.id;
    } else if (user.userType === "parent") {
      reportData.parentReporterId = user.id;
    } else if (user.userType === "therapist") {
      reportData.therapistReporterId = user.id;
    } else {
      return res.status(400).json({
        message: "Invalid user type for reporting",
        status: false,
      });
    }

    // Create the report
    const reportedStory = await prisma.report.create({
      data: reportData,
    });

    return res.status(201).json({
      message: "Story reported successfully",
      status: true,
      report: reportedStory,
    });
  } catch (error) {
    console.error("Error reporting story:", error);
    return res.status(500).json({
      message: "Failed to report story",
      status: false,
      error: error.message,
    });
  }
};

const toggleFavoriteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const { userType } = req.user;
    const userId = req.user.id;
    const story = await prisma.story.findUnique({
      where: { id },
    });

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    // Determine user field based on userType
    let userField = {};
    if (userType === "student") {
      userField = { studentId: userId };
    } else if (userType === "therapist") {
      userField = { therapistId: userId };
    } else if (userType === "parent") {
      userField = { parentId: userId };
    } else {
      return res.status(400).json({
        message: "Invalid user type",
        status: false,
      });
    }

    // Check if already favorited
    const existingFavorite = await prisma.favorites.findFirst({
      where: {
        storyId: id,
        ...userField,
      },
    });

    if (existingFavorite) {
      await prisma.favorites.delete({
        where: {
          id: existingFavorite.id,
        },
      });
      return res.status(200).json({
        message: "Story removed from favorites successfully",
        isFavorite: false,
        status: true,
      });
    }

    // Add to favorites
    const favoriteStory = await prisma.favorites.create({
      data: {
        storyId: id,
        ...userField,
      },
    });

    return res.status(201).json({
      message: "Story added to favorites successfully",
      isFavorite: true,
      status: true,
      favoriteStory,
    });
  } catch (error) {
    console.log("Error adding favorite story:", error);
    res.status(500).json({
      message: "Failed to add favorite story",
      status: false,
      error: error.message,
    });
  }
};

const hideStory = async (req, res) => {
  try {
    const { storyId } = req.params;
    const user = req.user;

    // Verify the story exists
    const story = await prisma.story.findUnique({
      where: { id: storyId },
    });

    if (!story) {
      return res.status(404).json({
        message: "Story not found",
        status: false,
      });
    }

    // Check if this user has already hidden this story
    const existingHide = await prisma.hidenStories.findFirst({
      where: {
        storyId,
        OR: [
          { studentId: user.userType === "student" ? user.id : undefined },
          { parentId: user.userType === "parent" ? user.id : undefined },
          { therapistId: user.userType === "therapist" ? user.id : undefined },
        ],
      },
    });

    if (existingHide) {
      return res.status(400).json({
        message: "Story is already hidden for this user",
        status: false,
      });
    }

    // Determine the user type and create the hide record
    const hideData = {
      storyId,
    };

    // Add the appropriate user ID based on user type
    if (user.userType === "student") {
      hideData.studentId = user.id;
    } else if (user.userType === "parent") {
      hideData.parentId = user.id;
    } else if (user.userType === "therapist") {
      hideData.therapistId = user.id;
    } else {
      return res.status(400).json({
        message: "Invalid user type for hiding stories",
        status: false,
      });
    }

    // Create the hide entry
    const hiddenStory = await prisma.hidenStories.create({
      data: hideData,
    });

    return res.status(201).json({
      message: "Story hidden successfully",
      status: true,
      hidden: hiddenStory,
    });
  } catch (error) {
    console.error("Error hiding story:", error);
    return res.status(500).json({
      message: "Failed to hide story",
      status: false,
      error: error.message,
    });
  }
};

const getReportedStories = async (req, res) => {
  try {
    const reportedStories = await prisma.report.findMany({
      where: {
        isNew: true,
      },
      select: {
        id: true,
        reason: true,
        createdAt: true,
        story: {
          select: {
            id: true,
          },
        },
        studentReporter: {
          select: {
            userName: true,
          },
        },
        parentReporter: {
          select: {
            fullName: true,
          },
        },
        therapistReporter: {
          select: {
            userName: true,
          },
        },
      },
    });

    return res.status(200).json({
      data: reportedStories,
      message: "Reported stories retrieved successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get reported stories",
      status: false,
      error: error.message,
    });
  }
};

const getReportedStory = async (req, res) => {
  try {
    const { id } = req.params;

    const reportedStory = await prisma.story.findUnique({
      where: {
        id,
      },
      select: {
        image: true,
        title: true,
        content: true,
        audio: true,
        audioDuration: true,
        student: {
          select: {
            studentImage: true,
            userName: true,
          },
        },
        _count: {
          select: {
            reports: true,
          },
        },
      },
    });

    if (reportedStory) {
      return res.status(200).json({
        data: reportedStory,
        message: "Reported story retrieved successfully",
        status: true,
      });
    } else {
      return res.status(404).json({
        message: "Reported story not found",
        status: false,
      });
    }
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get reported story",
      status: false,
      error: error.message,
    });
  }
};

const getFavoriteStories = async (req, res) => {
  try {
    const { page, limit } = StoryPaginationSchema.parse(req.query);
    const userId = req.user?.id || null;
    const role = req.user?.userType || req.role || null;

    // Validate user is authenticated
    if (!userId || !role) {
      return res.status(401).json({
        message: "Authentication required to view favorite stories",
        status: false,
      });
    }

    // Calculate pagination details
    const pageNumber = Math.max(page, 1);
    const pageSize = Math.min(limit, 10); // Ensure max 10 posts per request
    const skip = (pageNumber - 1) * pageSize;

    // Create user role-specific condition
    const userCondition = {
      ...(role === "student" && { studentId: userId }),
      ...(role === "parent" && { parentId: userId }),
      ...(role === "therapist" && { therapistId: userId }),
    };

    // First find favorite entries for the user
    const [favoriteEntries, totalFavorites] = await Promise.all([
      prisma.favorites.findMany({
        where: userCondition,
        take: pageSize,
        skip: skip,
        orderBy: {
          createdAt: "desc", // Most recent favorites first
        },
        include: {
          story: {
            include: {
              student: {
                select: {
                  id: true,
                  userName: true,
                  studentImage: true,
                },
              },
              likes: {
                where: userCondition,
                select: {
                  id: true,
                },
              },
              _count: {
                select: {
                  comments: true,
                  likes: true,
                },
              },
            },
          },
        },
      }),
      prisma.favorites.count({
        where: userCondition,
      }),
    ]);

    // Extract and format stories from favorite entries
    const stories = favoriteEntries.map((entry) => {
      const story = entry.story;
      return {
        ...story,
        timeAgo: timeAgo(story.createdAt),
        commentCount: story._count.comments,
        likeCount: story._count.likes,
        isLiked: story.likes?.length > 0,
        isFavorite: true, // These are all favorites by definition
      };
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalFavorites / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    return res.status(200).json({
      data: stories,
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalStories: totalFavorites,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      message: "Favorite stories retrieved successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to get favorite stories",
      status: false,
      error: error.message,
    });
  }
};
export {
  createStory,
  getStories,
  getCurrentUserStories,
  editStory,
  deleteStory,
  addComment,
  getStoryComments,
  toggleStoryLike,
  getTopThreeLikedStoryes,
  getSpecificStory, // Export the new function
  reportStory,
  hideStory,
  toggleFavoriteStory,
  getReportedStories,
  getReportedStory,
  getFavoriteStories,
};
