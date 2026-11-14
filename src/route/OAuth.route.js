import express from "express";
import {
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

  googleAuth,
  googleCallback,
  facebookAuth,
  facebookCallback,
} from "../controller/OAuth.controller.js";

const router = express.Router();

// Google
router.get("/google", googleAuth);
router.get("/google/callback", googleCallback);

// Facebook
router.get("/facebook", facebookAuth);
router.get("/facebook/callback", facebookCallback);

export default router;

