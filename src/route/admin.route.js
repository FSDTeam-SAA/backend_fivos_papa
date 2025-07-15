import express from "express";
import {
  adminLogin,
  forgotPassword,
  verifyOtp,
  resendOTP,
  resetPassword,
  updateAdminProfile,
  changePasswordAdmin,
  getGameParticipationStats,
  getAverageSessionDuration,
  getProfileCompleteness,
  getUserSessionDurations,
  getAllUsers,
  getActiveUsersCount,
  getContactUs,
  getAllContactUs,
  deleteContactUs,
  replyContactUs,
} from "../controller/admin.controller.js";
import { stopQueue, resetQueue } from "../controller/arvTarget.controller.js";
import { getCompletedTargets } from "../controller/userSubmission.controller.js";
import {
  getAllCompletedTargets,
  getAllCompletedTargetsCount,
} from "../controller/completedTargets.controller.js";
import { isAdmin } from "../middleware/role.middleware.js";
import { verifyJWT } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
const router = express.Router();

// Admin Login Route
router.post("/login", adminLogin);
router.post("/forget-password", forgotPassword);
router.post("/verifyOTP", verifyOtp);
router.post("/resendOTP", resendOTP);
router.post("/reset-password", resetPassword);

// Admin Profile Route
router.patch(
  "/profile",
  verifyJWT,
  isAdmin,
  upload.single("avatar"),
  updateAdminProfile
);
router.get("/profile-completeness", verifyJWT, isAdmin, getProfileCompleteness);

// Change Password Route
router.patch("/change-password", verifyJWT, isAdmin, changePasswordAdmin);

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<DASHBOARD>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// Get session duration
router.get(
  "/session-durations/:userId",
  verifyJWT,
  isAdmin,
  getUserSessionDurations
);
router.get(
  "/average-session-duration",
  verifyJWT,
  isAdmin,
  getAverageSessionDuration
);
// Get all users
router.get("/all-users", verifyJWT, isAdmin, getAllUsers);
// Get active users count
router.get("/active-users-count", verifyJWT, isAdmin, getActiveUsersCount);

// Get game participation stats
router.get("/game-graph", getGameParticipationStats);

// Get completed targets for a user
router.get("/completedTargets", verifyJWT, getCompletedTargets);

//get all completed targets
router.get(
  "/get-all-completed-targets",
  verifyJWT,
  isAdmin,
  getAllCompletedTargets
);

//get count of total completed targets
router.get(
  "/get-all-completed-targets-count",
  verifyJWT,
  isAdmin,
  getAllCompletedTargetsCount
);

// <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<CONTACT US>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
router.get("/all-contact-us", verifyJWT, isAdmin, getAllContactUs);
router.get("/contact-us/:id", verifyJWT, isAdmin, getContactUs);
router.post("/contact-us/reply/:id", verifyJWT, isAdmin, replyContactUs);
router.delete("/contact-us/:id", verifyJWT, isAdmin, deleteContactUs);

router.patch("/stop-queue", stopQueue);
router.patch("/reset-queue", resetQueue);

export default router;
