const mongoose = require('mongoose');

async function connectDB() {
  try {
    // Connect to MongoDB using URI from environment variables
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Successful connection message
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    // Connection error message
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1); // Exit process if DB connection fails
  }

  // Listen for any future connection errors
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
  });
}

module.exports = connectDB;
