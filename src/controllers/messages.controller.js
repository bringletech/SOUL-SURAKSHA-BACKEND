import { prisma } from "../db/prismaClientConfig.js";
import { getRecipientSocketId, io } from "../socket/socket.js";

const sendMessage = async (req, res) => {
  try {
    const { recipientId, message } = req.body;
    const senderId = req.user.id;
    const senderType =
      req.user.userType !== "parent" && req.user.userType === "student"
        ? "STUDENT"
        : "THERAPIST";

    // First find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          {
            AND: [{ studentId: senderId }, { therapistId: recipientId }],
          },
          {
            AND: [{ studentId: recipientId }, { therapistId: senderId }],
          },
        ],
      },
    });

    // If no conversation exists, create one
    if (!conversation) {
      const conversationData =
        senderType === "STUDENT"
          ? {
              studentId: senderId,
              therapistId: recipientId,
              status: "Pending",
            }
          : {
              studentId: recipientId,
              therapistId: senderId,
              status: "Pending",
            };

      conversation = await prisma.conversation.create({
        data: conversationData,
      });
    }

    // Create the new message
    const newMessage = await prisma.message.create({
      data: {
        content: message,
        senderId: senderId,
        senderType: senderType,
        conversationId: conversation.id,
      },
    });

    // Update conversation's lastMessageAt
    await prisma.conversation.update({
      where: {
        id: conversation.id,
      },
      data: {
        lastMessageAt: new Date(),
        lastMessage: message,
      },
    });

    const recipientSocketId = getRecipientSocketId(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("newMessage", newMessage);
    }

    return res.status(200).json({
      data: newMessage,
      message: "Message sent successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Failed to send message",
      status: false,
    });
  }
};

const getMessages = async (req, res) => {
  const { otherUserId } = req.params;
  const { page = 1, limit = 30 } = req.query; // Get pagination parameters from query
  const userId = req.user?.id;
  const userType =
    req.user.userType !== "parent" && req.user.userType === "therapist"
      ? "THERAPIST"
      : "STUDENT";

  try {
    // Find conversation based on user types
    const conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          {
            AND: [
              { studentId: userType === "STUDENT" ? userId : otherUserId },
              { therapistId: userType === "THERAPIST" ? userId : otherUserId },
            ],
          },
          {
            AND: [
              { studentId: userType === "THERAPIST" ? otherUserId : userId },
              { therapistId: userType === "STUDENT" ? otherUserId : userId },
            ],
          },
        ],
      },
    });

    if (!conversation) {
      return res
        .status(404)
        .json({ message: "Conversation not found", status: false });
    }

    // Calculate skip value for pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get total count of messages
    const totalMessages = await prisma.message.count({
      where: {
        conversationId: conversation.id,
      },
    });

    // Get paginated messages for this conversation
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: "desc", // Changed to desc to get latest messages first
      },
      skip,
      take: parseInt(limit),
      select: {
        id: true,
        content: true,
        senderId: true,
        senderType: true,
        seen: true,
        createdAt: true, // Added createdAt for frontend reference
      },
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalMessages / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    res.status(200).json({
      data: {
        messages: messages.reverse(), // Reverse to maintain chronological order
        userType,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalMessages,
          hasNextPage,
          hasPreviousPage,
          messagesPerPage: parseInt(limit),
        },
      },
      message: "Messages retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error in getMessages:", error);
    res.status(500).json({
      error: error.message,
      status: false,
      message: "Failed to retrieve messages",
    });
  }
};

const getConversation = async (req, res) => {
  const userId = req.user.id;
  const userType = req.user?.userType?.toUpperCase();

  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        AND: [
          // User type condition
          userType === "STUDENT"
            ? { studentId: userId }
            : { therapistId: userId, status: "Accepted" },
        ],
      },
      include: {
        // Only include therapist data if user is a student
        ...(userType === "STUDENT" && {
          therapist: {
            select: {
              id: true,
              userName: true,
              therapistImage: true,
              email: true,
            },
          },
        }),
        // Only include student data if user is not a student (i.e., is a therapist)
        ...(userType !== "STUDENT" && {
          student: {
            select: {
              id: true,
              fullName: true,
              studentImage: true,
              email: true,
            },
          },
        }),
        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
        _count: {
          select: {
            messages: {
              where: {
                seen: false,
                NOT: {
                  senderId: userId, // Don't count user's own messages
                },
              },
            },
          },
        },
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    });

    // Transform the response to include unread count
    const transformedConversations = conversations.map((conv) => ({
      ...conv,
      unreadCount: conv._count.messages,
      _count: undefined, // Remove the _count field from response
    }));

    res.status(200).json({
      data: transformedConversations,
      message: "Conversations retrieved successfully",
      status: true,
    });
  } catch (error) {
    console.error("Error in getConversations:", error);
    res.status(500).json({
      error: error.message,
      message: "Failed to retrieve conversations",
      status: false,
    });
  }
};

const getPendingConversationsOfSpecificTherapist = async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        AND: [{ therapistId: req.user?.id }, { status: "Pending" }],
      },
      include: {
        student: {
          select: {
            studentImage: true,
            fullName: true,
          },
        },
      },
    });

    return res.status(200).json({
      data: conversations,
      message: "Conversations retrieved successfully",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Failed to retrieve conversations",
      status: false,
    });
  }
};

const checkConversationExists = async (req, res) => {
  const { id } = req.params;
  try {
    console.log("req.user: >>", req.user);
    console.log("id: >>", id);
    const conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          {
            AND: [{ studentId: id }, { therapistId: req.user?.id }],
          },
          {
            AND: [{ studentId: req.user?.id }, { therapistId: id }],
          },
        ],
      },
      include: {
        therapist: {
          select: {
            userName: true,
            therapistImage: true,
          },
        },
      },
    });

    console.log("conversation: >>", conversation);

    if (!conversation) {
      return res.status(200).json({
        message: "Conversation Not Exists !!",
        exists: false,
        status: true,
      });
    }

    return res.status(200).json({
      convId: conversation.id,
      userId: id,
      message: "Conversation Exists",
      exists: true,
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Failed to retrieve conversations",
      status: false,
    });
  }
};

const handleReq = async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body.status === "accept" ? "Accepted" : "Dismiss";

    const conversation = await prisma.conversation.update({
      where: {
        id,
      },
      data: {
        status,
      },
    });

    if (!conversation) {
      return res.status(500).json({
        message: "Conversation Not Exists !!",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Conversation Status Updated Successfully !!",
      status: true,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      message: "Failed to change status",
      status: false,
    });
  }
};

export {
  sendMessage,
  getMessages,
  getConversation,
  getPendingConversationsOfSpecificTherapist,
  checkConversationExists,
  handleReq,
};
