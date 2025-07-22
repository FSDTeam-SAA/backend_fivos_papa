import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      match: [/\S+@\S+\.\S+/, "Invalid email format"],
    },
    screenName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
    },
    country: {
      type: String,
      default: "",
    },
    dob: {
      type: Date,
    },
    password: {
      type: String,
    },
    city: {
      type: String,
      default: "",
    },
    tierRank: {
      type: String,
      default: "NOVICE SEEKER",
      enum: [
        "NOVICE SEEKER",
        "INITIATE",
        "APPRENTICE",
        "EXPLORER",
        "VISIONARY",
        "ADEPT",
        "SEER",
        "ORACLE",
        "MASTER REMOTE VIEWER",
        "ASCENDING MASTER",
      ],
    },
    totalPoints: {
      type: Number,
      default: 0,
      index: true,
    },
    leaderboardPosition: {
      type: Number,
      default: 0,
      index: true,
    },
    targetsLeft: {
      type: Number,
      default: 10,
    },
    TMCSuccessRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    TMCpValue: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    ARVSuccessRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    ARVpValue: {
      type: Number,
      default: 0,
      min: 0,
      max: 1,
    },
    timeLeft: {
      type: Date,
    },
    phoneNumber: {
      type: String,
    },
    gender: {
      type: String,
      enum: ["male", "female", "Male", "Female"], // Allow both cases
      default: null, // Optional field
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otpExpiration: {
      type: Date,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    facebookId: {
      type: String,
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    refreshToken: {
      type: String,
    },
    sessions: [
      {
        sessionStartTime: {
          type: Date,
          default: Date.now,
        },
        sessionEndTime: { type: Date },
      },
    ],
    challengeHistory: [
      {
        date: { type: Date, default: Date.now },
        score: { type: Number, required: true },
      },
    ],
    lastActive: { type: Date },
    nextTierPoint: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Normalize gender to lowercase before validation
userSchema.pre("validate", function (next) {
  if (this.gender) {
    this.gender = this.gender.toLowerCase();
  }
  next();
});

// Middleware to calculate nextTierPoint based on points
userSchema.pre("save", function (next) {
  const points = this.totalPoints;
  const tierTable = [
    { name: "NOVICE SEEKER", pointsRequired: 1 },
    { name: "INITIATE", pointsRequired: 31 },
    { name: "APPRENTICE", pointsRequired: 61 },
    { name: "EXPLORER", pointsRequired: 81 },
    { name: "VISIONARY", pointsRequired: 101 },
    { name: "ADEPT", pointsRequired: 121 },
    { name: "SEER", pointsRequired: 141 },
    { name: "ORACLE", pointsRequired: 161 },
    { name: "MASTER REMOTE VIEWER", pointsRequired: 181 },
    { name: "ASCENDING MASTER", pointsRequired: null },
  ];

  // Find current tier index
  let currentTierIndex = tierTable.findIndex(
    (tier) => tier.name === this.tierRank
  );
  if (currentTierIndex === -1) {
    console.warn(
      `Invalid tierRank: ${this.tierRank}, defaulting to NOVICE SEEKER`
    );
    currentTierIndex = 0;
  }

  // Get the next tier
  const nextTierIndex =
    currentTierIndex + 1 < tierTable.length
      ? currentTierIndex + 1
      : currentTierIndex;
  const nextTier = tierTable[nextTierIndex];

  // Calculate nextTierPoint
  let nextTierPoint;
  if (nextTier.pointsRequired === null) {
    nextTierPoint = 0; // No next tier (ASCENDING MASTER)
  } else if (
    typeof nextTier.pointsRequired !== "number" ||
    typeof points !== "number"
  ) {
    console.error(
      `Invalid points data: pointsRequired=${nextTier.pointsRequired}, points=${points}`
    );
    nextTierPoint = 0; // Fallback to 0 on error
  } else {
    nextTierPoint = Math.max(nextTier.pointsRequired - points, 0);
  }

  this.nextTierPoint = nextTierPoint;

  // Log for debugging
  // console.log({
  //   tierRank: this.tierRank,
  //   totalPoints: points,
  //   currentTierIndex,
  //   nextTier: nextTier.name,
  //   nextTierPointsRequired: nextTier.pointsRequired,
  //   nextTierPoint,
  //   gender: this.gender
  // });

  next();
});

// Hashing password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Password comparison method (bcrypt)
userSchema.methods.isPasswordValid = function (password) {
  if (!password || !this.password) {
    throw new Error("Password or hashed password is missing");
  }

  return bcrypt.compare(password, this.password);
};

// Generate ACCESS_TOKEN
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

// Generate REFRESH_TOKEN
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// Update session
userSchema.methods.updateSession = async function () {
  const now = new Date();
  this.lastActive = now;

  const activeSession = this.sessions.find((s) => !s.sessionEndTime);

  if (!activeSession) {
    this.sessions.push({
      sessionStartTime: now,
    });
  }

  await this.save();
  return this;
};

export const User = mongoose.model("User", userSchema);
