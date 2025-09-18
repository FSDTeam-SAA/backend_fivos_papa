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
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760278/WhatsApp_Image_2025-06-24_at_13.55.47_33b37d3e_auyufl.jpg",
  },
  {
    name: "INITIATE",
    up: 1,
    down: -30,
    retain: [-29, 0],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.47_61543db5_bmt0rp.jpg",
  },
  {
    name: "APPRENTICE",
    up: 31,
    down: 0,
    retain: [1, 30],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760278/WhatsApp_Image_2025-06-24_at_13.55.46_09e5ccc2_inab8i.jpg",
  },
  {
    name: "EXPLORER",
    up: 61,
    down: 0,
    retain: [1, 60],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.47_10ad1961_cbyovm.jpg",
  },
  {
    name: "VISIONARY",
    up: 81,
    down: 30,
    retain: [31, 80],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.47_159602ec_izzy2x.jpg",
  },
  {
    name: "ADEPT",
    up: 101,
    down: 30,
    retain: [31, 100],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.46_d3b5090c_jkdgn5.jpg",
  },
  {
    name: "SEER",
    up: 121,
    down: 60,
    retain: [61, 120],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760278/WhatsApp_Image_2025-06-24_at_13.55.47_872179ca_yjw7p8.jpg",
  },
  {
    name: "ORACLE",
    up: 141,
    down: 60,
    retain: [61, 140],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760774/Screenshot_2025-06-24_162548_sd6f7x.png",
  },
  {
    name: "MASTER REMOTE VIEWER",
    up: 161,
    down: 100,
    retain: [101, 160],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.47_9aa33538_wdmtfz.jpg",
  },
  {
    name: "ASCENDING MASTER",
    up: undefined,
    down: 120,
    retain: [121],
    image:
      "https://res.cloudinary.com/dbc8cfqkw/image/upload/v1750760279/WhatsApp_Image_2025-06-24_at_13.55.47_35818ccb_he4t79.jpg",
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
