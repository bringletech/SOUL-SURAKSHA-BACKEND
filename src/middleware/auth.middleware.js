import jwt from "jsonwebtoken";
import { prisma } from "../db/prismaClientConfig.js";

export const verifyJWT = (roles) => async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    console.log("token", token);

    if (!token) {
      return res.status(401).json({
        message: "Access token not found",
        status: false,
      });
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    console.log("decodedToken", decodedToken);

    if (!decodedToken?.id || !decodedToken?.userType) {
      return res.status(401).json({
        message: "Invalid token format",
        status: false,
      });
    }

    let user;
    let role;
    if (roles.includes("student")) {
      user = await prisma.student.findUnique({
        where: { id: decodedToken?.id },
      });
      if (user) {
        user = {
          ...user,
          storiesCount: await prisma.story.count({
            where: {
              studentId: user?.id,
            },
          }),
        };
      }

      role = "student";
      if (!user && roles.includes("therapist")) {
        user = await prisma.therapist.findUnique({
          where: { id: decodedToken?.id },
          include: {
            Review: {
              select: {
                title: true,
                review: true,
                rating: true,
                createdAt: true,
                Student: {
                  select: {
                    fullName: true,
                  },
                },
              },
              orderBy: {
                createdAt: "desc",
              },
            },
          },
        });

        role = "therapist";
      }
      if (!user && roles.includes("parent")) {
        user = await prisma.parent.findUnique({
          where: { id: decodedToken?.id },
        });
        role = "parent";
      }
      if (!user && roles.includes("admin")) {
        user = await prisma.admin.findUnique({
          where: { id: decodedToken?.id },
        });
        role = "admin";
      }
    } else if (roles.includes("therapist")) {
      user = await prisma.therapist.findUnique({
        where: { id: decodedToken?.id },
        include: {
          Review: {
            select: {
              title: true,
              review: true,
              rating: true,
              createdAt: true,
              Student: {
                select: {
                  fullName: true,
                },
              },
            },
            orderBy: {
              createdAt: "desc",
            },
          },
        },
      });
      role = "therapist";
      if (!user && roles.includes("parent")) {
        user = await prisma.parent.findUnique({
          where: { id: decodedToken?.id },
        });
        role = "parent";
      }
      if (!user && roles.includes("admin")) {
        user = await prisma.admin.findUnique({
          where: { id: decodedToken?.id },
        });
        role = "admin";
      }
    } else if (roles.includes("parent")) {
      user = await prisma.parent.findUnique({
        where: { id: decodedToken?.id },
      });
      role = "parent";
      if (!user && roles.includes("admin")) {
        user = await prisma.admin.findUnique({
          where: { id: decodedToken?.id },
        });
        role = "admin";
      }
    } else if (roles.includes("admin")) {
      user = await prisma.admin.findUnique({
        where: { id: decodedToken?.id },
      });
      role = "admin";
    }

    if (!user) {
      return res.status(401).json({
        message: "User not found",
        status: false,
      });
    }

    req.user = { ...user, userType: decodedToken.userType };
    req.role = role;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        message: "Invalid or expired token",
        status: false,
      });
    }

    console.error("JWT Verification Error:", error);
    return res.status(500).json({
      message: "Error while authenticating user",
      status: false,
    });
  }
};
