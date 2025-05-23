const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const dotenv = require('dotenv');

dotenv.config(); // ✅ Load .env early

const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

const app = express();
const server = http.createServer(app);

// ✅ Hardcoded or env based
const allowedOrigin = process.env.FRONTEND_URL || "https://chat-app-eight-eta-57.vercel.app";

// ✅ Initialize socket.io with correct CORS
const io = new Server(server, {
  cors: {
    origin: allowedOrigin,
    credentials: true,
  },
});

const onlineUsers = new Set();

io.on('connection', async (socket) => {
  console.log("User connected:", socket.id);

  try {
    const token = socket.handshake.auth.token;
    const user = await getUserDetailsFromToken(token);
    if (!user || !user._id) return socket.disconnect();

    const userIdStr = user._id.toString();
    socket.join(userIdStr);
    onlineUsers.add(userIdStr);

    io.emit('onlineUser', Array.from(onlineUsers));

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
      }).populate('messages').sort({ updatedAt: -1 });

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
        $or: [
          { sender: data.sender, receiver: data.receiver },
          { sender: data.receiver, receiver: data.sender },
        ],
      }).populate('messages').sort({ updatedAt: -1 });

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
    });
  } catch (err) {
    console.error("Socket connection error:", err);
    socket.disconnect();
  }
});

module.exports = {
  app,
  server,
};
