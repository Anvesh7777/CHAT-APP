const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/connectDB');
const router = require('./routes/index');
const cookiesParser = require('cookie-parser');
const { app, server } = require('./socket/index');

// ✅ Define allowedOrigin before using it
const allowedOrigin = process.env.FRONTEND_URL;

app.use(cors({
    origin: allowedOrigin,
    credentials: true
}));

console.log("✅ CORS allowed origin:", allowedOrigin);

app.use(express.json());
app.use(cookiesParser());

const PORT = process.env.PORT || 8080;

// ✅ Root test route
app.get('/', (req, res) => {
    res.json({ message: "Server running at " + PORT });
});

// ✅ All API routes
app.use('/api', router);

// ✅ Connect to DB and start the server
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log("🚀 Server running at", PORT);
    });
});
