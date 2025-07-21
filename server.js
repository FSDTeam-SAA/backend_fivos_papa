import express from "express";
import { dbconfig } from "./src/db/index.js";
import dotenv from "dotenv";
import errorHandler from "./src/middleware/errorHandler.middleware.js";
import { notFoundHandler } from "./src/middleware/notFoundHandler.middleware.js";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import "./src/jobs/notificationJob.js";
import { initCronJobs } from "./src/utils/cronJobs.util.js";

dotenv.config();

const app = express();
const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true,
  },
});

// Passport Session Setup
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

const PORT = process.env.PORT || 5001;

// Middleware
app.use(express.json());

app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("joinGameRoom", (gameCode) => {
    socket.join(`game_${gameCode}`);
    console.log(`Client joined game room: ${gameCode}`);
  });

  socket.on("joinUserRoom", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`Client joined user room: ${userId}`);
  });

  socket.on("joinAdminRoom", () => {
    socket.join("admin");
    console.log(`Client joined admin room`);
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

app.set("io", io);

// Import routes
import profileRoute from "./src/route/profile.route.js";
import userRoute from "./src/route/user.route.js";
import adminRoute from "./src/route/admin.route.js";
import categoryImageRoute from "./src/route/categoryImage.route.js";
import privacyPolicyRoute from "./src/route/privacyPolicy.route.js";
import ARVTargetRoute from "./src/route/arvTarget.route.js";
import TMCTargetRoute from "./src/route/TMCTarget.route.js";
import runningEventsRoute from "./src/route/runningEvents.route.js";
import leaderboardRoute from "./src/route/leaderboard.route.js";
import userSubmissionRoute from "./src/route/userSubmission.route.js";
import termsCondition from "./src/route/termsCondition.route.js";
import aboutUsRoute from "./src/route/aboutUs.route.js";
import OAuthRoute from "./src/route/OAuth.route.js";
import contactUsRoute from "./src/route/contactUs.route.js";
import notificationRoute from "./src/route/notification.route.js";
import homeRoute from "./src/route/home.route.js";
import { GameQueue } from "./src/model/gameQueue.model.js";

// set
app.use("/api/v1/user", userRoute);
app.use("/api/v1/notifications", notificationRoute);
app.use("/api/v1/profile", profileRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/category", categoryImageRoute);
app.use("/api/v1/ARVTarget", ARVTargetRoute);
app.use("/api/v1/privacy-policy", privacyPolicyRoute);
app.use("/api/v1/TMCTarget", TMCTargetRoute);
app.use("/api/v1/runningEvents", runningEventsRoute);
app.use("/api/v1/leaderboard", leaderboardRoute);
app.use("/api/v1/userSubmission", userSubmissionRoute);
app.use("/api/v1/terms-and-condition", termsCondition);
app.use("/api/v1/about-us", aboutUsRoute);
app.use("/api/v1", OAuthRoute);
app.use("/api/v1", contactUsRoute);
app.use("/api/v1/home", homeRoute);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize cron jobs
initCronJobs(io);

// Start server
async function initializeApp() {
  server.listen(PORT, async () => {
    try {
      await dbconfig();
      console.log(`Server is running at http://localhost:${PORT}`);

      // Initialize GameQueue
      const queueId = "67da824e62d5a1b8cfece4c8";
      const existingQueue = await GameQueue.findById(queueId);
      if (!existingQueue) {
        await GameQueue.create({
          _id: queueId,
          TMCTargets: [],
          ARVTargets: [],
          isTMCQueueActive: false,
          isARVQueueActive: false,
        });
      }
    } catch (error) {
      console.error("Database connection failed:", error);
      process.exit(1);
    }
  });
}

initializeApp();
