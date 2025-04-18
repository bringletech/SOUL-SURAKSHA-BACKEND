import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { prisma } from "../db/prismaClientConfig.js";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

export const getRecipientSocketId = (recipientId) => userSocketMap[recipientId];

const userSocketMap = {}; // userId: socketId

io.on("connection", (socket) => {
  console.log("user connected", socket.id);
  const userId = socket.handshake.query.userId;

  if (userId !== "undefined") {
    userSocketMap[userId] = socket.id;
  }
  io.emit("getOnlineUsers", Object.keys(userSocketMap)); // [1,2,3,4]

  // Handle marking messages as read
  socket.on("markMessageAsRead", async ({ conversationId, userId }) => {
    try {
      // Update all unread messages in this conversation
      await prisma.message.updateMany({
        where: {
          conversationId: conversationId,
          seen: false,
        },
        data: {
          seen: true,
        },
      });

      // Get the conversation to find both participants
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          messages: {
            where: { seen: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (conversation) {
        // Emit to both participants that messages were seen
        const senderSocketId = userSocketMap[conversation.studentId];
        const recipientSocketId = userSocketMap[conversation.therapistId];

        if (senderSocketId) {
          io.to(senderSocketId).emit("messagesSeen", { conversationId });
        }
        if (recipientSocketId) {
          io.to(recipientSocketId).emit("messagesSeen", { conversationId });
        }
      }
    } catch (error) {
      console.log("Error marking messages as read:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("user disconnected");
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, server, app };
