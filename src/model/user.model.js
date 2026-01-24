import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const tierTable = [
  {
    name: "NOVICE SEEKER",
    up: 1,
    down: undefined,
    retain: [0],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817170/Novice_qo2vkf.png",
  },
  {
    name: "INITIATE",
    up: 1,
    down: -30,
    retain: [-29, 0],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817170/Initiate_h47rzj.png",
  },
  {
    name: "APPRENTICE",
    up: 31,
    down: 0,
    retain: [1, 30],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817170/Apprentice_r4iqju.png",
  },
  {
    name: "EXPLORER",
    up: 61,
    down: 0,
    retain: [1, 60],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817170/Explorer_co0vqx.png",
  },
  {
    name: "VISIONARY",
    up: 81,
    down: 30,
    retain: [31, 80],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817169/Visionary_eowvuz.png",
  },
  {
    name: "ADEPT",
    up: 101,
    down: 30,
    retain: [31, 100],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817169/Adept_arjrue.png",
  },
  {
    name: "SEER",
    up: 121,
    down: 60,
    retain: [61, 120],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817169/Seer_lova5e.png",
  },
  {
    name: "ORACLE",
    up: 141,
    down: 60,
    retain: [61, 140],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817168/Oracle_ceju2r.png",
  },
  {
    name: "MASTER REMOTE VIEWER",
    up: 161,
    down: 100,
    retain: [101, 160],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817169/Master_sk9p6h.png",
  },
  {
    name: "ASCENDING MASTER",
    up: undefined,
    down: 120,
    retain: [121],
    image:
      "https://res.cloudinary.com/dgza9pfm9/image/upload/v1768817169/Assending_grptyk.png",
  },
];

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
  },
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

  // Find current tier index
  let currentTierIndex = tierTable.findIndex(
    (tier) => tier.name === this.tierRank,
  );

  if (currentTierIndex === -1) {
    console.warn(
      `Invalid tierRank: ${this.tierRank}, defaulting to NOVICE SEEKER`,
    );
    currentTierIndex = 0;
  }

  const currentTier = tierTable[currentTierIndex];

  // Validate totalPoints
  if (typeof points !== "number" || isNaN(points)) {
    console.error(`Invalid totalPoints value: ${points}`);
    this.nextTierPoint = 0;
    return next();
  }

  // Get next tier
  const nextTierIndex =
    currentTierIndex + 1 < tierTable.length
      ? currentTierIndex + 1
      : currentTierIndex;
  const nextTier = tierTable[nextTierIndex];

  // Calculate points needed for next tier
  let nextTierPoint;
  if (!nextTier.up || typeof nextTier.up !== "number") {
    nextTierPoint = 0;
  } else {
    nextTierPoint = Math.max(nextTier.up - points, 0);
  }

  this.nextTierPoint = nextTierPoint;

  this.tierImage = currentTier.image;

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
    },
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
    },
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
