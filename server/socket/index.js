const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
require('dotenv').config();

const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken');
const UserModel = require('../models/UserModel');
const { ConversationModel, MessageModel } = require('../models/ConversationModel');
const getConversation = require('../helpers/getConversation');

// Create new express app instance only for socket server
const app = express();
const server = http.createServer(app);

// Initialize socket.io with CORS settings
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});

const onlineUsers = new Set();

io.on('connection', async (socket) => {
  console.log("User connected:", socket.id);

  try {
    const token = socket.handshake.auth.token;
    const user = await getUserDetailsFromToken(token);

    if (!user || !user._id) {
      console.warn("Invalid token, disconnecting...");
      return socket.disconnect();
    }

    const userIdStr = user._id.toString();
    socket.join(userIdStr);
    onlineUsers.add(userIdStr);

    io.emit('onlineUser', Array.from(onlineUsers));

    socket.on('message-page', async (targetUserId) => {
      try {
        const targetUser = await UserModel.findById(targetUserId).select('-password');
        if (!targetUser) return;

        socket.emit('message-user', {
          _id: targetUser._id,
          name: targetUser.name,
          email: targetUser.email,
          profile_pic: targetUser.profile_pic,
          online: onlineUsers.has(targetUserId),
        });

        const conversation = await ConversationModel.findOne({
          $or: [
            { sender: user._id, receiver: targetUserId },
            { sender: targetUserId, receiver: user._id },
          ],
        }).populate('messages').sort({ updatedAt: -1 });

        socket.emit('message', conversation?.messages || []);
      } catch (err) {
        console.error("Error in 'message-page':", err);
      }
    });

    socket.on('new message', async (data) => {
      try {
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
      } catch (err) {
        console.error("Error in 'new message':", err);
      }
    });

    socket.on('sidebar', async (currentUserId) => {
      try {
        const conversations = await getConversation(currentUserId);
        socket.emit('conversation', conversations);
      } catch (err) {
        console.error("Error in 'sidebar':", err);
      }
    });

    socket.on('seen', async (msgByUserId) => {
      try {
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
      } catch (err) {
        console.error("Error in 'seen':", err);
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userIdStr);
      console.log("User disconnected:", socket.id);
      io.emit('onlineUser', Array.from(onlineUsers));
    });
  } catch (err) {
    console.error("Connection error:", err);
    socket.disconnect();
  }
});

module.exports = {
  server, // ✅ Only export server
};
