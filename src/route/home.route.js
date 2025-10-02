import express from "express";
import { verifyJWT } from "../middleware/auth.middleware.js";
import { getHomeCounts } from "../controller/home.controller.js";

const router = express.Router();

// Home page counts
router.get("/counts",verifyJWT, getHomeCounts);

export default router;
