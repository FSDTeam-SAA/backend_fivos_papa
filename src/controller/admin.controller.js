import mongoose from "mongoose";
import { generateAccessAndRefreshTokens } from "../controller/user.controller.js";
import { User } from "../model/user.model.js";
import { sendMail, sendContactReply } from "../utils/email.util.js";
import { generateOTP } from "../utils/otp.util.js";
import { ContactUs } from "../model/contactUs.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";
import moment from "moment";

// <<<<<<<<<<<<<<<<<<<<<<<<<<<AUTHENTICATION>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// Admin login controller
const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email, role: "admin" }).select(
      "-tierRank -point -totalPoints -TMCSuccessRate -TMCpValue -ARVSuccessRate -ARVpValue -sessions -challengeHistory -totalPoints -tmcScore -arvScore -combinedScore -leaderboardPosition -completedTargets -successRate -emailVerified -role -refreshToken -otpExpiration -createdAt -updatedAt -__v"
    );
    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "Admin not found" });
    }

    const isPasswordValid = await user.isPasswordValid(password);
    if (!isPasswordValid) {
      return res
        .status(401)
        .json({ status: false, message: "Password invalid" });
    }

    const { accessToken } = await generateAccessAndRefreshTokens(user._id);

    await user.save();

    res.setHeader("Authorization", `Bearer ${accessToken}`);

    return res.status(200).json({
      status: true,
      message: "Admin login successful",
      data: user,
      accessToken,
    });
  } catch (error) {
    console.log("Error while login in admin dashboard: ", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// Sent otp in email from admin
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

// Vrify OTP from admin
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

// Resend OTP from admin
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

// Reset pass from admin
const resetPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

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
    console.log("Error while resetting password: ", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Save and update the adminProfile from admin
const updateAdminProfile = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminId = req.user._id;
    const { fullName, screenName, phoneNumber, country, city } = req.body;

    const admin = await User.findOne({ _id: adminId, role: "admin" }).session(
      session
    );
    if (!admin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({
        status: false,
        message: "Unauthorized access",
      });
    }

    // Update only provided fields
    if (fullName !== undefined) admin.fullName = fullName;
    if (screenName !== undefined) admin.screenName = screenName;
    if (phoneNumber !== undefined) admin.phoneNumber = phoneNumber;
    if (country !== undefined) admin.country = country;
    if (city !== undefined) admin.city = city;

    const updatedProfile = await admin.save({ session });

    await session.commitTransaction();
    session.endSession();

    const profile = await User.findById(updatedProfile._id);

    return res.status(200).json({
      status: true,
      message: "Profile updated successfully",
      updatedProfile: profile,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    next(error);
  }
};

// Get admin profile
const getAdminProfile = async (req, res) => {
  try {
    const adminId = req.user._id;
    const admin = await User.findById(adminId).select("-password");
    if (!admin) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }
    return res.status(200).json({
      status: true,
      message: "Admin profile retrieved successfully",
      data: admin,
    });
  } catch (error) {
    console.error("Error getting admin profile:", error);
    return res.status(500).json({ status: false, message: error.message });
  }
};

// Profile completeness
export const getProfileCompleteness = async (req, res) => {
  try {
    const userId = req.user._id;
    const profile = await User.findById(userId).select(
      "screenName fullName phoneNumber country city"
    );

    if (!profile) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const fieldsToCheck = [
      "screenName",
      "fullName",
      "phoneNumber",
      "country",
      "city",
    ];
    const completedFields = fieldsToCheck.filter(
      (field) => !!profile[field]
    ).length;
    const completeness = Math.round(
      (completedFields / fieldsToCheck.length) * 100
    );

    return res.status(200).json({ completeness });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Change password for admin
const changePasswordAdmin = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    const adminId = req.user._id;
    const admin = await User.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        status: false,
        message: "Admin not found",
      });
    }

    // check the pass
    const isMatch = await admin.isPasswordValid(currentPassword);

    if (!isMatch) {
      return res.status(400).json({
        status: false,
        message: "Incorrect current password",
      });
    }

    // check if new password and confirm new password match
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        status: false,
        message: "New password and confirm new password does not match",
      });
    }

    // update the password
    admin.password = newPassword;
    await admin.save();

    return res.status(200).json({
      status: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.log("Error while changing password: ", error);
    return res.status(500).json({
      status: false,
      message: error.message,
    });
  }
};

// <<<<<<<<<<<<<<<<<<<<<<<<<<<DASHBOARD>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// Get user session durations for admin
const getUserSessionDurations = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const sessionDurations = user.sessions.map((session) => {
      const startTime = session.sessionStartTime;
      const endTime = session.sessionEndTime || Date.now();
      const duration = endTime - startTime;
      return {
        sessionId: session._id,
        duration: duration,
        durationInMinutes: Math.floor(duration / (1000 * 60)),
      };
    });

    return res.status(200).json({
      status: true,
      message: "User avg time retrieved successfully",
      data: sessionDurations,
    });
  } catch (error) {
    console.error("Error getting user session durations:", error);
    next(error);
  }
};

// Calculate average session duration for admin
const getAverageSessionDuration = async (_, res, next) => {
  try {
    const result = await User.aggregate([
      { $unwind: "$sessions" },

      {
        $project: {
          duration: {
            $subtract: [
              { $ifNull: ["$sessions.sessionEndTime", new Date()] },
              "$sessions.sessionStartTime",
            ],
          },
        },
      },

      {
        $group: {
          _id: null,
          totalDuration: { $sum: "$duration" },
          totalSessions: { $sum: 1 },
        },
      },

      {
        $project: {
          _id: 0,
          averageDurationInMinutes: {
            $floor: { $divide: [{ $divide: ["$totalDuration", 1000] }, 60] },
          },
        },
      },
    ]);

    if (result.length === 0) {
      return res.status(200).json({
        status: true,
        message: "Average session duration retrieved successfully",
        data: { averageDurationInMinutes: 0 },
      });
    }

    return res.status(200).json({
      status: true,
      message: "Average session duration retrieved successfully",
      data: result[0],
    });
  } catch (error) {
    console.error("Error calculating average session duration:", error);
    next(error);
  }
};

// Get all user for admin
const getAllUsers = async (_, res, next) => {
  try {
    const users = await User.countDocuments({
      role: "user",
    });
    return res.status(200).json({
      status: true,
      message: "Fetched all users for admin",
      data: users,
    });
  } catch (error) {
    console.error("Error getting all users:", error);
    next(error);
  }
};

// Get all active users for admin
const getActiveUsersCount = async (_, res, next) => {
  const activeThreshold = 5 * 60 * 1000;
  try {
    const activeUsers = await User.aggregate([
      {
        $match: {
          $or: [
            { lastActive: { $gte: new Date(Date.now() - activeThreshold) } },
            {
              $and: [
                {
                  "sessions.sessionStartTime": {
                    $gte: new Date(Date.now() - activeThreshold),
                  },
                },
                { "sessions.sessionEndTime": { $exists: false } },
              ],
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Fetched active users count for admin",
      data: activeUsers.length,
    });
  } catch (error) {
    console.error("Error getting active users count:", error);
    next(error);
  }
};

// <<<<<<<<<<<<<<<<<<<<<<<CONTACT US>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
// get all contact us for admin
const getAllContactUs = async (_, res, next) => {
  try {
    const getAllContactUs = await ContactUs.find();
    if (!getAllContactUs) {
      return res
        .status(404)
        .json({ status: false, message: "Contact us not found" });
    }
    return res.status(200).json({
      status: true,
      message: "Fetched all contact us",
      data: getAllContactUs,
    });
  } catch (error) {
    next(error);
  }
};

const getContactUs = async (req, res, next) => {
  const { id } = req.params;

  try {
    const contactUs = await ContactUs.findById(id);

    if (!contactUs) {
      return res
        .status(404)
        .json({ status: false, message: "Contact us not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Fetched contact us",
      data: contactUs,
    });
  } catch (error) {
    next(error);
  }
};

const deleteContactUs = async (req, res, next) => {
  const { id } = req.params;

  try {
    const contactUs = await ContactUs.findByIdAndDelete(id);

    if (!contactUs) {
      return res
        .status(404)
        .json({ status: false, message: "Contact us not found" });
    }

    return res.status(200).json({
      status: true,
      message: "Contact us deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

const replyContactUs = async (req, res, next) => {
  const { id } = req.params;
  const { replyMessage } = req.body;

  try {
    const contactUs = await ContactUs.findById(id);

    if (!contactUs) {
      return res
        .status(404)
        .json({ status: false, message: "Contact us not found" });
    }

    await sendContactReply(contactUs.email, contactUs.name, replyMessage);

    // Update the contact us entry to mark it as replied
    contactUs.replied = true;
    contactUs.replyMessage = replyMessage;
    contactUs.replySubject = "Reply to your contact us submission";
    await contactUs.save();

    return res.status(200).json({
      status: true,
      message: "Reply sent successfully",
    });
  } catch (error) {
    console.error("Error replying to contact us:", error);
    next(error);
  }
};

export const getGameParticipationStats = async (req, res) => {
  try {
    const now = moment();
    const months = [];

    for (let i = 0; i < 12; i++) {
      const monthStart = moment(now).month(i).startOf("month");
      const monthEnd = moment(now).month(i).endOf("month");

      // Count TMC participations by month
      const tmcParticipations = await UserSubmission.aggregate([
        { $unwind: "$participatedTMCTargets" },
        {
          $match: {
            "participatedTMCTargets.submissionTime": {
              $gte: monthStart.toDate(),
              $lte: monthEnd.toDate(),
            },
          },
        },
        {
          $count: "totalParticipations",
        },
      ]);

      // Count ARV participations by month
      const arvParticipations = await UserSubmission.aggregate([
        { $unwind: "$participatedARVTargets" },
        {
          $match: {
            "participatedARVTargets.submissionTime": {
              $gte: monthStart.toDate(),
              $lte: monthEnd.toDate(),
            },
          },
        },
        {
          $count: "totalParticipations",
        },
      ]);

      months.push({
        month: monthStart.format("MMM"),
        TMC: tmcParticipations[0]?.totalParticipations || 0,
        ARV: arvParticipations[0]?.totalParticipations || 0,
      });
    }

    return res.status(200).json(months);
  } catch (err) {
    console.error("Error in game participation stats:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export {
  adminLogin,
  forgotPassword,
  verifyOtp,
  resendOTP,
  resetPassword,
  updateAdminProfile,
  changePasswordAdmin,
  getAverageSessionDuration,
  getUserSessionDurations,
  getAllUsers,
  getActiveUsersCount,
  getContactUs,
  getAdminProfile,
  getAllContactUs,
  deleteContactUs,
  replyContactUs,
};
