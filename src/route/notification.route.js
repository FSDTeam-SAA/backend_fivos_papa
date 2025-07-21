import express from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import {
  getNotifications,
  createNotification,
  deleteNotification,
} from "../controller/notification.controller.js";

const router = express.Router();

router.post("/create-notifications/:userId?", verifyJWT, createNotification);
router.get("/get-notifications/:userId", verifyJWT, getNotifications);
router.delete("/delete-notification/:notificationId", deleteNotification);

export default router;
