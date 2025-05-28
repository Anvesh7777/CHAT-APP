const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config(); // ✅ Load env vars

const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();
const server = http.createServer(app);

// ✅ Set allowed frontend origin
const allowedOrigin = process.env.FRONTEND_URL || "https://chat-app-eight-eta-57.vercel.app";

// ✅ Initialize Socket.IO with production-safe CORS & compatibility
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST"],
  },
  allowEIO3: true, // ✅ For older client compatibility
});

const onlineUsers = new Set();

io.on('connection', async (socket) => {
  console.log("🔌 New client connected:", socket.id);

  try {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.warn("⚠️ No token provided");
      return socket.disconnect();
    }

    const user = await getUserDetailsFromToken(token);
    if (!user || !user._id) {
      console.warn("❌ Invalid user token");
      return socket.disconnect();
    }

    const userIdStr = user._id.toString();
    socket.join(userIdStr);
    onlineUsers.add(userIdStr);

    io.emit('onlineUser', Array.from(onlineUsers));

    /** ------------------------ LISTENERS ------------------------ **/

    socket.on('message-page', async (targetUserId) => {
      const targetUser = await UserModel.findById(targetUserId).select('-password');
      if (!targetUser) return;

      const payload = {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        profile_pic: targetUser.profile_pic,
        online: onlineUsers.has(targetUserId),
      };

      socket.emit('message-user', payload);

      const conversation = await ConversationModel.findOne({
        $or: [
          { sender: user._id, receiver: targetUserId },
          { sender: targetUserId, receiver: user._id },
        ],
      }).populate('messages');

      socket.emit('message', conversation?.messages || []);
    });

    socket.on('new message', async (data) => {
      let conversation = await ConversationModel.findOne({
        $or: [
          { sender: data.sender, receiver: data.receiver },
          { sender: data.receiver, receiver: data.sender },
        ],
      });

      if (!conversation) {
        conversation = await new ConversationModel({
          sender: data.sender,
          receiver: data.receiver,
        }).save();
      }

      const message = await new MessageModel({
        text: data.text,
        imageUrl: data.imageUrl,
        videoUrl: data.videoUrl,
        msgByUserId: data.msgByUserId,
      }).save();

      await ConversationModel.findByIdAndUpdate(conversation._id, {
        $push: { messages: message._id },
      });

      const updatedConversation = await ConversationModel.findOne({
        _id: conversation._id,
      }).populate('messages');

      io.to(data.sender).emit('message', updatedConversation?.messages || []);
      io.to(data.receiver).emit('message', updatedConversation?.messages || []);

      const convSender = await getConversation(data.sender);
      const convReceiver = await getConversation(data.receiver);

      io.to(data.sender).emit('conversation', convSender);
      io.to(data.receiver).emit('conversation', convReceiver);
    });

    socket.on('sidebar', async (currentUserId) => {
      const conversations = await getConversation(currentUserId);
      socket.emit('conversation', conversations);
    });

    socket.on('seen', async (msgByUserId) => {
      const conversation = await ConversationModel.findOne({
        $or: [
          { sender: user._id, receiver: msgByUserId },
          { sender: msgByUserId, receiver: user._id },
        ],
      });

      if (conversation?.messages?.length) {
        await MessageModel.updateMany(
          {
            _id: { $in: conversation.messages },
            msgByUserId: msgByUserId,
          },
          { $set: { seen: true } }
        );
      }

      const updatedSender = await getConversation(userIdStr);
      const updatedReceiver = await getConversation(msgByUserId);

      io.to(userIdStr).emit('conversation', updatedSender);
      io.to(msgByUserId).emit('conversation', updatedReceiver);
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userIdStr);
      io.emit('onlineUser', Array.from(onlineUsers));
      console.log("❌ Disconnected:", userIdStr);
    });

  } catch (err) {
    console.error("🔥 Socket error:", err.message || err);
    socket.disconnect();
  }
});

module.exports = {
  app,
  server,
};
