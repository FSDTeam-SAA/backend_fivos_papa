import { User } from "../model/user.model.js";
import jwt from "jsonwebtoken";
import { generateOTP } from "../utils/otp.util.js";
import { sendMail } from "../utils/email.util.js";

// Generate access and refresh tokens
const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    console.log("Error generating access and refresh tokens", error.message);
  }
};
// User register
const registerUser = async (req, res) => {
  try {
    const { email, screenName, fullName, country, dob, password } = req.body;

    // Validate required fields
    if (!email || !screenName || !fullName || !country || !dob || !password) {
      return res
        .status(500)
        .json({ status: false, message: "All fields are required." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(500)
        .json({ status: false, message: "User already exists." });
    }

    // Create user
    const user = await User.create({
      email,
      screenName,
      fullName,
      country,
      dob,
      password,
    });

    // Remove pass from response
    const createdUser = await User.findById(user._id).select(
      "-password -tierRank -point -tmcScore -arvScore -combinedScore -leaderboardPosition -completedTargets -successRate -sessions"
    );

    return res.status(201).json({
      status: true,
      message: "User registered successfully",
      data: createdUser,
    });
  } catch (error) {
    console.error("Error registering user:", error.message);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Login user
const loginUser = async (req, res) => {
  // get user details
  const { email, password } = req.body;

  // check email is provided or not
  if (!email) {
    return res
      .status(400)
      .json({ status: false, message: "Please provide email" });
  }

  // check if user exist or not with email
  const user = await User.findOne({
    email,
    role: "user",
  });

  // if user not found then throw error
  if (!user) {
    return res.status(404).json({
      status: false,
      message: "User not found with provided email",
    });
  }

  // compare the password
  const isPasswordCorrect = await user.isPasswordValid(password);
  if (!isPasswordCorrect) {
    return res.status(400).json({
      status: false,
      message: "Incorrect password",
    });
  }

  await User.findByIdAndUpdate(user._id, {
    $push: {
      sessions: {
        sessionStartTime: new Date(),
      },
    },
    lastActive: new Date(),
  });

  // implement access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  // remove password and refreshToken filed from response
  const loggedUser = await User.findById(user._id).select(
    "-password -refreshToken -tierRank -point -tmcScore -arvScore -combinedScore -leaderboardPosition -completedTargets -successRate -sessions"
  );

  res.setHeader("Authorization", `Bearer ${accessToken}`);

  return res.status(200).json({
    status: true,
    message: "User logged in successfully",
    data: loggedUser,
    token: accessToken,
  });
};

// logout user
const logoutUser = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res
        .status(400)
        .json({ status: false, message: "User not found." });
    }

    // End current session
    await User.updateOne(
      {
        _id: user._id,
        "sessions.sessionEndTime": { $exists: false },
      },
      {
        $set: {
          "sessions.$[elem].sessionEndTime": new Date(),
          "sessions.$[elem].duration":
            new Date() -
            user.sessions.find((s) => !s.sessionEndTime).sessionStartTime,
        },
      },
      {
        arrayFilters: [{ "elem.sessionEndTime": { $exists: false } }],
      }
    );

    // Remove refreshToken from the database
    await User.findByIdAndUpdate(user._id, { refreshToken: null });

    return res
      .status(200)
      .json({ status: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Error while logout: ", error);
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// Refresh accessToken
const refreshAccessToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res
      .status(400)
      .json({ status: false, message: "Refresh token not provided." });
  }

  try {
    // Find user by refreshToken
    const user = await User.findOne({ refreshToken });

    if (!user) {
      return res
        .status(403)
        .json({ status: false, message: "Invalid refresh token." });
    }

    // Verify refresh token
    const decodedToken = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    if (!decodedToken || decodedToken._id !== user._id.toString()) {
      return res
        .status(403)
        .json({ status: false, message: "Invalid refresh token." });
    }

    // Generate new access and refresh tokens
    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id);

    // Set access token in response header
    res.setHeader("Authorization", `Bearer ${accessToken}`);

    return res.status(200).json({
      status: true,
      message: "Access token refreshed successfully",
      data: accessToken,
    });
  } catch (error) {
    console.error("Error in refresh access token:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Sent otp in email
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ status: false, message: "Email is required" });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Generate a random 6-digit otp
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // set the otp in database
    user.otp = otp;
    user.otpExpiration = otpExpires;
    await user.save();

    // Send the OTP to the users
    await sendMail(email, otp);

    return res.status(201).json({
      status: true,
      message: "Your OTP has been sent",
    });
  } catch (error) {
    console.error("Error in forgotPassword:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    // check the user and the otp is inalid or expire
    const user = await User.findOne({ otp });
    if (user.otp !== otp || new Date() > user.otpExpiration) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid or expired OTP" });
    }

    // If verified then undefine otp details from database
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.json({ status: true, message: "OTP verified successfully" });
  } catch (error) {
    console.log("Error in verifyOtp:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Resend OTP
const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: false,
        message: "Email is required to resend OTP",
      });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Generate new OTP and expiration time
    const newOtp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    // Update OTP in the database
    user.otp = newOtp;
    user.otpExpiration = otpExpires;
    await user.save();

    await sendMail(user.email, newOtp);

    return res.status(200).json({
      status: true,
      message: "OTP has been resent successfully",
    });
  } catch (error) {
    console.error("Error while resending OTP:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Reset pass
const resetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // update the password
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      status: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.log("Error while reseting password: ", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Start session
const startSession = async (req, res, next) => {
  const { userId } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $push: { sessions: { sessionStartTime: Date.now() } },
      },
      { new: true }
    );

    console.log("User after session start:", updatedUser);

    return res.json({ status: true, message: "Session started successfully" });
  } catch (error) {
    next(error);
  }
};

// End session
const endSession = async (req, res, next) => {
  const { userId } = req.body;
  try {
    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "sessions.$[elem].sessionEndTime": Date.now(),
        },
      },
      {
        arrayFilters: [{ "elem.sessionEndTime": { $exists: false } }],
      }
    );
    res.json({ status: true, message: "Session ended successfully" });
  } catch (error) {
    next(error);
  }
};

// Heartbeat request
const sendHeartbeat = async (req, res, next) => {
  const { userId } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { lastActive: Date.now() } },
      { new: true }
    );

    console.log("Heartbeat Updated User:", updatedUser);

    res.json({ status: true, message: "Heartbeat received" });
  } catch (error) {
    next(error);
  }
};

// Update user points and track challenges
const updateUserPoints = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { challengeScore } = req.body;

    let user = await User.findById(userId);

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User profile not found" });
    }

    // Update last activity
    user.lastActive = new Date();

    // Add challenge score to history
    user.challengeHistory.push({ score: challengeScore });

    // Keep only last 10 challenges
    if (user.challengeHistory.length > 10) {
      user.challengeHistory.shift();
    }

    // Calculate total points from last 10 challenges
    user.totalPoints = user.challengeHistory.reduce(
      (acc, ch) => acc + ch.score,
      0
    );

    // Save profile & trigger tier update middleware
    await user.save();

    return res.status(200).json({
      status: true,
      message: "User points updated successfully",
      user: user.user,
      totalPoints: user.totalPoints,
      tierRank: user.tierRank,
    });
  } catch (error) {
    next(error);
  }
};
export {
  registerUser,
  generateAccessAndRefreshTokens,
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
};
