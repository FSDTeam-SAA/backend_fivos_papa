import express from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  forgotPassword,
  verifyOtp,
  resendOTP,
  resetPassword,
  startSession,
  endSession,
  sendHeartbeat,
  updateUserPoints,
} from "../controller/user.controller.js";
import { verifyJWT } from "../middleware/auth.middleware.js";

const router = express.Router();

// Register User Route
router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", verifyJWT, logoutUser);
router.post("/refresh-access-token", refreshAccessToken);
router.post("/forget-password", forgotPassword);
router.post("/verifyOTP", verifyOtp);
router.post("/resendOTP", resendOTP);
router.post("/reset-password", resetPassword);

// Track the user time
router.post("/start-session", verifyJWT, startSession);
router.post("/end-session", verifyJWT, endSession);
router.post("/heartbeat", verifyJWT, sendHeartbeat);

// Update game points with tier rank
router.patch("/update-points", verifyJWT, updateUserPoints);

export default router;
