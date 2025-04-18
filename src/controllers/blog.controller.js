import { z } from "zod";
import { prisma } from "../db/prismaClientConfig.js";
import {
  extractImageUrls,
  generateBlogContext,
  timeAgo,
} from "../utils/Helper.js";
import {
  deleteMultipleObjectsFromS3,
  deleteSingleObjectFromS3,
} from "./aws.controller.js";

const BlogSchema = z.object({
  title: z
    .string()
    .min(2, { message: "Title must be at least 2 characters long" })
    .max(50, { message: "Title cannot exceed 50 characters" }),
  content: z.string().min(1, { message: "Blog content cannot be empty" }),
  blogCategory: z.string().optional(),
  tags: z.array(z.string()).optional(),
  image: z.string().optional(),
});

const BlogPaginationSchema = z.object({
  page: z.string().transform(Number).default("1"),
  limit: z.string().transform(Number).default("10"),
});

const createBlog = async (req, res) => {
  const { title, content, image, blogCategory, tags } = BlogSchema.parse(
    req.body
  );
  const summary = await generateBlogContext(content);
  try {
    const blog = await prisma.blog.create({
      data: {
        title,
        tags,
        content,
        summary,
        blogCategory,
        image,
      },
    });
    return res.status(200).json({
      message: "Blog created successfully",
      data: blog,
      status: true,
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({
      message: error.message,
      image: image,
      error: error,
      status: false,
    });
  }
};

const getBlogs = async (req, res) => {
  try {
    const { page, limit } = BlogPaginationSchema.parse(req.query);

    const pageNumber = Math.max(page, 1);
    const pageSize = Math.min(limit, 10);
    const skip = (pageNumber - 1) * pageSize;

    // Fix: Add count query to Promise.all
    const [blogs, totalBlogs] = await Promise.all([
      prisma.blog.findMany({
        take: pageSize,
        skip: skip,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          image: true,
          summary: true,
          title: true,
          createdAt: true,
        },
      }),
      prisma.blog.count(), // Add this count query
    ]);

    const totalPages = Math.ceil(totalBlogs / pageSize);
    const hasNextPage = pageNumber < totalPages;
    const hasPreviousPage = pageNumber > 1;

    return res.status(200).json({
      data: blogs.map((blog) => ({
        ...blog,
        timeAgo: timeAgo(blog.createdAt),
      })),
      pagination: {
        currentPage: pageNumber,
        pageSize,
        totalBlogs,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
      message: "Blogs retrieved successfully",
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
      message: "Error while retrieving blogs",
      error: error.message,
      status: false,
    });
  }
};

const getBlog = async (req, res) => {
  try {
    const { id, iscountView } = req.params;
    const user = req.user;
    const role = req.role;

    // Get blog and manage view count in a transaction
    const result = await prisma.$transaction(async (prisma) => {
      // First get the blog
      const blog = await prisma.blog.findUnique({
        where: { id },
        include: {
          viewBlog: true, // Include viewBlog to check if user has viewed this blog
        },
      });

      if (!blog) {
        return { blog: null };
      }

      // Check if we should count this view based on user authentication
      let isFirstView = false;
      let viewData = null;

      if (user && role === "admin") {
        return {
          blog: blog,
          isFirstView,
        };
      }

      if (user) {
        // Determine user type and ID
        let userType = null;
        let userId = null;

        if (role === "student") {
          userType = "student";
          userId = user.id;
        } else if (role === "parent") {
          userType = "parent";
          userId = user.id;
        } else if (role === "therapist") {
          userType = "therapist";
          userId = user.id;
        }

        if (userType && userId) {
          // Check if this user has already viewed this blog
          const existingView = await prisma.viewBlog.findFirst({
            where: {
              blogId: id,
              [userType + "Id"]: userId, // dynamically set the correct field name
            },
          });

          // If no existing view, this is the first view for this user
          if (!existingView) {
            isFirstView = true;

            // Create view record
            viewData = {
              blogId: id,
              [userType + "Id"]: userId,
            };

            // Create the view record
            await prisma.viewBlog.create({
              data: viewData,
            });

            // Increment the blog's view count
            if (iscountView === "true") {
              await prisma.blog.update({
                where: { id },
                data: {
                  viewCount: {
                    increment: 1,
                  },
                },
              });
            }
          }
        }
      }

      // Get the updated blog after potential view count increment
      const updatedBlog = isFirstView
        ? await prisma.blog.findUnique({ where: { id } })
        : blog;

      return {
        blog: updatedBlog,
        isFirstView,
      };
    });

    if (!result.blog) {
      return res.status(404).json({
        message: "Blog not found",
        status: false,
      });
    }

    const createdOn = new Date(result.blog.createdAt).toLocaleDateString(
      "en-us",
      {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Kolkata", // Indian timezone
      }
    );

    return res.status(200).json({
      data: {
        ...result.blog,
        // Don't manually increment viewCount here since it's already handled in the transaction
        createdOn,
        timeAgo: timeAgo(result.blog.createdAt),
      },
      message: "Blog retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error while retrieving blog",
      error: error.message,
      status: false,
    });
  }
};

const editBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, image, blogCategory, tags } = BlogSchema.parse(
      req.body
    );
    const summary = await generateBlogContext(content);
    const blog = await prisma.blog.update({
      where: {
        id,
      },
      data: {
        title,
        tags,
        content,
        summary,
        blogCategory,
        image,
      },
    });
    return res.status(200).json({
      message: "Blog updated successfully",
      data: blog,
      status: true,
    });
  } catch (error) {
    console.log("error", error);
    return res.status(500).json({
      message: error.message,
      error: error,
      status: false,
    });
  }
};

const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const blog = await prisma.blog.delete({
      where: {
        id,
      },
    });

    const imagesUrls = extractImageUrls(blog);

    if (blog.image) {
      await deleteSingleObjectFromS3(blog.image);
    }

    if (imagesUrls.length > 0) {
      if (imagesUrls.length === 1) {
        await deleteSingleObjectFromS3(imagesUrls[0]);
      } else {
        await deleteMultipleObjectsFromS3(imagesUrls);
      }
    }
    return res.status(200).json({
      message: "Blog deleted successfully",
      data: blog,
      status: true,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      message: "Error while deleting blog",
      error: error.message,
      status: false,
    });
  }
};

// Get top 5 most viewed blogs
const getTopViewedBlogs = async (req, res) => {
  try {
    const topBlogs = await prisma.blog.findMany({
      take: 5,
      orderBy: {
        viewCount: "desc",
      },
      select: {
        id: true,
        image: true,
      },
    });

    if (!topBlogs.length) {
      return res.status(404).json({
        success: false,
        message: "No blogs found",
      });
    }

    return res.status(200).json({
      success: true,
      data: topBlogs,
      message: "Top 5 viewed blogs retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching top viewed blogs",
      error: error,
    });
  }
};

const searchBlogs = async (req, res) => {
  try {
    const {
      search, // General search term
      sortBy = "date", // date, views, title
      order = "desc", // asc, desc
      page = 1, // Page number
      limit = 10, // Items per page
    } = req.query;

    // Build search conditions
    const queryConditions = {};

    // Full-text search across multiple fields
    if (search) {
      const searchQuery = search.toLowerCase();
      queryConditions.OR = [
        {
          title: {
            equals: search,
            mode: "insensitive",
          },
        },
        {
          summary: {
            equals: search,
            mode: "insensitive",
          },
        },
        {
          tags: {
            hasSome: [searchQuery],
          },
        },
      ];
    }

    // Determine sort configuration
    const sortConfig = {};
    switch (sortBy) {
      case "views":
        sortConfig.viewCount = order;
        break;
      case "title":
        sortConfig.title = order;
        break;
      default: // 'date'
        sortConfig.createdAt = order;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute main query
    const blogs = await prisma.blog.findMany({
      where: queryConditions,
      select: {
        id: true,
        title: true,
        summary: true,
        blogCategory: true,
        tags: true,
        image: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: sortConfig,
      skip,
      take: parseInt(limit),
    });

    // Get total count for pagination
    const totalCount = await prisma.blog.count({
      where: queryConditions,
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    if (blogs.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No blogs found matching your search criteria",
        data: [],
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalCount,
          hasNextPage,
          hasPrevPage,
        },
      });
    }

    // Return successful response
    return res.status(200).json({
      success: true,
      message: "Blogs fetched successfully",
      data: blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalCount,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("Error in searchBlogs:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export {
  createBlog,
  getBlogs,
  getBlog,
  getTopViewedBlogs,
  searchBlogs,
  editBlog,
  deleteBlog,
};
