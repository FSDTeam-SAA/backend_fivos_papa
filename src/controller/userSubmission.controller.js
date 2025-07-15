import mongoose from "mongoose";
import { TMCTarget } from "../model/tmcTarget.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";
import { User } from "../model/user.model.js";
import { updateUserTier } from "./tier.controller.js";
import { Notification } from "../model/notification.model.js";
import { emitNotification } from "../jobs/notificationJob.js";

// P value
const erf = (x) => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x);
  const y =
    1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return sign * y;
};

// Calculate p-value
const calculatePValue = (successfulChallenges, totalChallenges) => {
  if (totalChallenges === 0) return 1; // Avoid division by zero, return max p-value
  if (successfulChallenges === 0) return 1; // If no success, p-value is 1
  if (successfulChallenges === totalChallenges) return 0.0001; // If 100% success, p-value is very small

  const p0 = 0.5; // Null hypothesis probability (50% chance)
  const pHat = successfulChallenges / totalChallenges; // Observed success rate
  const SE = Math.sqrt((p0 * (1 - p0)) / totalChallenges); // Standard error
  const Z = (pHat - p0) / SE; // Z-score

  // Calculate two-tailed p-value using cumulative standard normal probability
  const pValue = 2 * (1 - cumulativeStdNormalProbability(Z));

  return pValue;
};

// Cumulative standard normal probability
const cumulativeStdNormalProbability = (z) => {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
};

// Check if user's tier should be updated and also renew the cycle
export const checkTierUpdate = async (userId) => {
  try {
    const userSubmission = await UserSubmission.findOne({ userId });
    if (!userSubmission) {
      return { status: false, message: "User submission not found" };
    }

    const gamesCompleted = userSubmission.completedChallenges;
    const cycleStartDate =
      userSubmission.lastChallengeDate || userSubmission.createdAt;
    const daysInCycle = Math.floor(
      (new Date() - cycleStartDate) / (1000 * 60 * 60 * 24)
    );
    const shouldEndCycle = gamesCompleted >= 10 || daysInCycle >= 15;

    if (!shouldEndCycle) {
      return {
        status: true,
        message: "Cycle not yet complete",
        data: {
          gamesCompleted,
          daysInCycle,
          cycleComplete: false,
        },
      };
    }

    const updateResult = await updateUserTier(userId);

    if (!updateResult || !updateResult.previousPoints) {
      return {
        status: false,
        message: "Failed to update user tier. Missing data.",
      };
    }

    await emitNotification(io, {
      userId,
      message: `Your cycle has been renewed. Your previous total points ${updateResult.previousPoints}, your previous tier is ${updateResult.previousTier} and your new tier is ${updateResult.newTier}.`,
    });

    return {
      status: true,
      message: "Cycle completed. Points reset and new cycle started.",
      data: {
        ...updateResult,
        cycleComplete: true,
      },
    };
  } catch (error) {
    throw error;
  }
};

// Submit TMC game
export const submitTMCGame = async (req, res, next) => {
  const { firstChoiceImage, secondChoiceImage, TMCTargetId } = req.body;
  const userId = req.user._id;

  try {
    // Get current user to check targetsLeft
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Check if user has targets left
    if (currentUser.targetsLeft <= 0) {
      return res.status(403).json({
        status: false,
        message: "No targets left in current cycle",
        cycleComplete: true,
        nextCycleStarts: "Immediately after tier update",
      });
    }

    let points = 0;

    // Find or create user submission
    let userSubmission = await UserSubmission.findOne({ userId });
    if (!userSubmission) {
      userSubmission = new UserSubmission({
        userId,
        completedChallenges: 0,
        totalPoints: 0,
        participatedTMCTargets: [],
        participatedARVTargets: [],
        lastChallengeDate: new Date(),
      });
      await userSubmission.save();
    }

    // Prevent duplicate submission
    const alreadySubmitted = userSubmission.participatedTMCTargets.some(
      (entry) => entry.TMCId.toString() === TMCTargetId
    );

    if (alreadySubmitted) {
      return res.status(409).json({
        status: false,
        message: "You have already submitted for this TMC game",
      });
    }

    // Find the TMC target
    const TMC = await TMCTarget.findById(TMCTargetId);

    if (!TMC) {
      return res
        .status(404)
        .json({ status: false, message: "TMC target not found" });
    }

    const currentTime = new Date();

    if (TMC.startTime.getTime() < currentTime.getTime()) {
      return res.status(403).json({
        status: false,
        message: "Game time has ended",
        details: {
          lastSubmissionTime: TMC.startTime,
          currentTime: currentTime,
        },
      });
    }

    // Calculate points based on choices
    if (TMC.targetImage === firstChoiceImage) {
      points = 25;
    } else if (TMC.targetImage === secondChoiceImage) {
      points = 10;
    } else {
      points = -10;
    }

    // Update user submission
    userSubmission.participatedTMCTargets.push({
      TMCId: TMCTargetId,
      firstChoiceImage,
      secondChoiceImage,
      points,
      submissionTime: currentTime,
    });

    userSubmission.completedChallenges += 1;
    userSubmission.totalPoints += points;
    userSubmission.lastChallengeDate = new Date();

    await userSubmission.save();

    // Update user profile using save() to ensure pre('save') runs
    const updatedUser = await User.findById(userId);
    updatedUser.totalPoints = userSubmission.totalPoints;
    updatedUser.targetsLeft -= 1;
    await updatedUser.save();

    // Check for tier update
    const tierUpdate = await checkTierUpdate(userId);

    return res.status(200).json({
      status: true,
      message: "TMC game submitted successfully",
      points,
      currentTier: updatedUser.tierRank,
      totalPoints: updatedUser.totalPoints,
      targetsLeft: updatedUser.targetsLeft,
      nextTierPoint: updatedUser.nextTierPoint,
      gamesCompleted: userSubmission.completedChallenges,
      tierUpdate,
    });
  } catch (error) {
    next(error);
  }
};

// Submit ARV game
export const submitARVGame = async (req, res, next) => {
  try {
    const { submittedImage, ARVTargetId } = req.body;
    const userId = req.user._id;

    const ARV = await ARVTarget.findById(ARVTargetId);
    if (!ARV) {
      return res.status(404).json({ message: "ARV target not found" });
    }

    const currentTime = new Date();
    if (ARV.gameTime.getTime() < currentTime.getTime()) {
      return res.status(403).json({
        message: "Game time has ended",
        details: {
          lastSubmissionTime: ARV.gameTime,
          currentTime: currentTime,
        },
      });
    }

    let userSubmission =
      (await UserSubmission.findOne({ userId })) ||
      new UserSubmission({ userId, tierRank: "NOVICE SEEKER" });

    // Prevent duplicate submission
    const alreadySubmitted = userSubmission.participatedARVTargets.some(
      (entry) => entry.ARVId.toString() === ARVTargetId
    );

    if (alreadySubmitted) {
      return res.status(409).json({
        status: false,
        message: "You have already submitted for this ARV game",
      });
    }

    // Get current user to check targetsLeft
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Check if user has targets left
    if (currentUser.targetsLeft <= 0) {
      return res.status(403).json({
        status: false,
        message: "No targets left in current cycle",
        cycleComplete: true,
        nextCycleStarts: "Immediately after tier update",
      });
    }

    userSubmission.participatedARVTargets.push({
      ARVId: ARVTargetId,
      submittedImage,
      points: 0,
      submissionTime: currentTime,
    });

    userSubmission.completedChallenges += 1;
    await userSubmission.save();

    // Update user profile using save() to ensure pre('save') runs
    const updatedUser = await User.findById(userId);
    updatedUser.totalPoints = userSubmission.totalPoints;
    updatedUser.targetsLeft -= 1;
    await updatedUser.save();

    return res.status(200).json({
      success: true,
      message: "ARV game submitted successfully",
      data: {
        revealTime: ARV.revealTime,
        outcomeTime: ARV.outcomeTime,
        gameTime: ARV.gameTime,
        submissionStatus: {
          canSubmit: true,
          until: ARV.gameTime,
        },
      },
      targetsLeft: updatedUser.targetsLeft,
      nextTierPoint: updatedUser.nextTierPoint,
    });
  } catch (error) {
    next(error);
  }
};

// Get completed targets for  user for admin dashboard
export const getCompletedTargets = async (req, res, next) => {
  try {
    // Fetch all user submissions
    const allSubmissions = await UserSubmission.find({});

    // Initialize counters
    let totalTMCCompleted = 0;
    let totalARVCompleted = 0;

    // Count completed TMC and ARV targets
    allSubmissions.forEach((submission) => {
      totalTMCCompleted += submission.participatedTMCTargets.length;
      totalARVCompleted += submission.participatedARVTargets.length;
    });

    // Calculate total completed targets
    const totalCompletedTargets = totalTMCCompleted + totalARVCompleted;

    return res.status(200).json({
      status: true,
      message: "Completed targets count retrieved successfully",
      data: totalCompletedTargets,
    });
  } catch (error) {
    next(error);
  }
};

// Get completed targets count for a specific user with success rate
export const getCompletedTargetsCount = async (req, res, next) => {
  const userId = req.user._id;
  try {
    const userSubmission = await UserSubmission.findOne({ userId });

    if (!userSubmission) {
      return res.status(404).json({
        status: true,
        message: "No submissions found",
      });
    }

    // Count successful TMC targets where points > 0
    const successfulTMCTargets = userSubmission.participatedTMCTargets.filter(
      (target) => target.points > 0
    ).length;

    // Count successful ARV targets where points > 0
    const successfulARVTargets = userSubmission.participatedARVTargets.filter(
      (target) => target.points > 0
    ).length;

    const totalCompletedTargets =
      userSubmission.participatedTMCTargets.length +
      userSubmission.participatedARVTargets.length;
    const successfulCompletedTargets =
      successfulTMCTargets + successfulARVTargets;

    // Avoid division by zero
    const successRate =
      totalCompletedTargets > 0
        ? (successfulCompletedTargets / totalCompletedTargets) * 100
        : 0;

    return res.status(200).json({
      status: true,
      message:
        "Completed targets count and success rate retrieved successfully",
      data: {
        totalCompletedTargets,
        successfulCompletedTargets,
        successRate: successRate.toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get previous TMC results for a user
export const getPreviousTMCResults = async (req, res) => {
  const userId = req.user._id;
  const { currentTMCTargetId } = req.params;

  try {
    const userSubmission = await UserSubmission.findOne({ userId });

    if (!userSubmission) {
      return res.status(404).json({ message: "No submissions found" });
    }

    const previousTMCResults = userSubmission.participatedTMCTargets.filter(
      (target) => target.TMCId.toString() !== currentTMCTargetId
    );

    return res.status(200).json({
      status: true,
      ujala: "yasgyduy",
      message: "Previous TMC Results fetched successfully",
      data: previousTMCResults,
    });
  } catch (error) {
    next(error);
  }
};

// Get previous ARV results for a user
export const getPreviousARVResults = async (req, res) => {
  const userId = req.user._id;
  const { currentARVTargetId } = req.params;

  try {
    const userSubmission = await UserSubmission.findOne({ userId });

    if (!userSubmission) {
      return res.status(404).json({ message: "No submissions found" });
    }

    const previousARVResults = userSubmission.participatedARVTargets.filter(
      (target) => target.ARVId.toString() !== currentARVTargetId
    );

    return res.status(200).json({
      status: true,
      message: "Previous ARV Results fetched successfully",
      data: previousARVResults,
    });
  } catch (error) {
    next(error);
  }
};

// Get TMC target result
export const getTMCTargetResult = async (req, res, next) => {
  const { TMCTargetId } = req.params;
  const userId = req.user._id;

  try {
    // Find UserSubmission for the user
    const result = await UserSubmission.findOne(
      { userId, "participatedTMCTargets.TMCId": TMCTargetId },
      { participatedTMCTargets: 1, _id: 0 }
    );

    // If no result found, return a proper error message
    if (!result || !result.participatedTMCTargets.length) {
      return res.status(404).json({
        status: false,
        message: "No submission found for this TMC Target.",
      });
    }

    // Extract the specific participated TMC target
    const targetResult = result.participatedTMCTargets[0];

    // If TMCId is still null after population, the referenced document might not exist
    if (!targetResult.TMCId) {
      return res.status(404).json({
        status: false,
        message: "The referenced TMC Target no longer exists.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "TMC Result fetched successfully",
      data: targetResult,
    });
  } catch (error) {
    next(error);
  }
};

// Get ARV target result
export const getARVTargetResult = async (req, res, next) => {
  const { ARVTargetId } = req.params;
  const userId = req.user._id;

  try {
    const userSubmission = await UserSubmission.findOne(
      {
        userId,
        "participatedARVTargets.ARVId": ARVTargetId,
      },
      { participatedARVTargets: 1, _id: 0 }
    );

    if (!userSubmission) {
      return res.status(404).json({
        status: false,
        message: "No submission found for this ARV Target.",
      });
    }

    const arvTarget = await ARVTarget.findById(ARVTargetId, {
      resultImage: 1,
      _id: 0,
    });

    if (!arvTarget) {
      return res.status(404).json({
        status: false,
        message: "ARV Target not found.",
      });
    }

    const participatedTarget = userSubmission.participatedARVTargets.find(
      (target) => target.ARVId.toString() === ARVTargetId
    );

    return res.status(200).json({
      status: true,
      message: "ARV Result fetched successfully",
      data: {
        ...participatedTarget.toObject(),
        resultImage: arvTarget.resultImage,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Update ARV target points
export const updateARVTargetPoints = async (req, res, next) => {
  const { ARVTargetId } = req.params;
  const userId = req.user._id;

  try {
    let points;
    const ARV = await ARVTarget.findById(ARVTargetId);
    if (!ARV) {
      return res
        .status(404)
        .json({ status: false, message: "ARV target not found" });
    }

    const result = await UserSubmission.findOne(
      {
        userId,
        "participatedARVTargets.ARVId": ARVTargetId,
      },
      { "participatedARVTargets.$": 1, _id: 0 }
    );

    const { submittedImage } = result.participatedARVTargets[0];

    // Calculate points
    points = ARV.resultImage === submittedImage ? 25 : -10;

    // Update points inside UserSubmission -> participatedARVTargets
    const userSubmission = await UserSubmission.findOneAndUpdate(
      { userId, "participatedARVTargets.ARVId": ARVTargetId },
      {
        $set: { "participatedARVTargets.$.points": points },
        $inc: { totalPoints: points },
      },
      { new: true }
    );

    if (!userSubmission) {
      return res
        .status(404)
        .json({ status: false, message: "User submission not found" });
    }

    // Update User totalPoints using save() to ensure pre('save') runs
    const updatedUser = await User.findById(userId);
    updatedUser.totalPoints += points;
    await updatedUser.save();

    // Check for tier update
    const tierUpdate = await checkTierUpdate(userId);

    return res.status(200).json({
      status: true,
      message: "Points updated successfully",
      points,
      totalPoints: updatedUser.totalPoints,
      tierUpdate: tierUpdate || { changed: false },
    });
  } catch (error) {
    next(error);
  }
};

// Update TMC analytics
export const updateTMCAnalytics = async (req, res, next) => {
  const userId = req.user._id;

  try {
    const tmcStats = await UserSubmission.aggregate([
      { $match: { userId } },
      { $unwind: "$participatedTMCTargets" },
      {
        $group: {
          _id: "$userId",
          totalChallenges: { $sum: 1 },
          successfulChallenges: {
            $sum: {
              $cond: [{ $gt: ["$participatedTMCTargets.points", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    const totalChallenges =
      tmcStats.length > 0 ? tmcStats[0].totalChallenges : 0;
    const successfulChallenges =
      tmcStats.length > 0 ? tmcStats[0].successfulChallenges : 0;

    const successRate =
      totalChallenges > 0 ? (successfulChallenges / totalChallenges) * 100 : 0;

    const pValue = calculatePValue(successfulChallenges, totalChallenges);

    await User.findByIdAndUpdate(userId, {
      TMCSuccessRate: successRate,
      TMCpValue: pValue,
    });

    return res.status(200).json({
      status: true,
      message: "TMC analytics updated successfully",
      data: { successRate, pValue },
    });
  } catch (error) {
    next(error);
  }
};

// Update ARV analytics
export const updateARVAnalytics = async (req, res, next) => {
  const userId = req.user._id;

  try {
    const arvStats = await UserSubmission.aggregate([
      { $match: { userId } },
      { $unwind: "$participatedARVTargets" },
      {
        $group: {
          _id: "$userId",
          totalChallenges: { $sum: 1 },
          successfulChallenges: {
            $sum: {
              $cond: [{ $gt: ["$participatedARVTargets.points", 0] }, 1, 0],
            },
          },
        },
      },
    ]);

    const totalChallenges =
      arvStats.length > 0 ? arvStats[0].totalChallenges : 0;
    const successfulChallenges =
      arvStats.length > 0 ? arvStats[0].successfulChallenges : 0;

    const successRate =
      totalChallenges > 0 ? (successfulChallenges / totalChallenges) * 100 : 0;

    const pValue = calculatePValue(successfulChallenges, totalChallenges);

    await User.findByIdAndUpdate(userId, {
      ARVSuccessRate: successRate,
      ARVpValue: pValue,
    });

    return res.status(200).json({
      status: true,
      message: "ARV analytics updated successfully",
      data: { successRate, pValue },
    });
  } catch (error) {
    next(error);
  }
};

// Get graph data for ARV and TMC for a single user
export const getARVTMCGraphData = async (req, res, next) => {
  const { userId } = req.params;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  try {
    // TMC aggregation
    const tmcData = await UserSubmission.aggregate([
      {
        $match: {
          userId: userObjectId,
          "participatedTMCTargets.submissionTime": { $ne: null },
        },
      },
      { $unwind: "$participatedTMCTargets" },
      {
        $group: {
          _id: { month: { $month: "$participatedTMCTargets.submissionTime" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // ARV aggregation
    const arvData = await UserSubmission.aggregate([
      {
        $match: {
          userId: userObjectId,
          "participatedARVTargets.submissionTime": { $ne: null },
        },
      },
      { $unwind: "$participatedARVTargets" },
      {
        $group: {
          _id: { month: { $month: "$participatedARVTargets.submissionTime" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Convert data to map for easy lookup
    const tmcMap = Object.fromEntries(
      tmcData.map((item) => [item._id.month, item.count])
    );
    const arvMap = Object.fromEntries(
      arvData.map((item) => [item._id.month, item.count])
    );

    // Build final data for all 12 months
    const result = monthNames.map((name, index) => ({
      month: name,
      TMC: tmcMap[index + 1] || 0,
      ARV: arvMap[index + 1] || 0,
    }));

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

//get total graph data for arv and tmc
export const getTotalARVTMCGraphData = async (req, res, next) => {
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  try {
    // TMC aggregation
    const tmcData = await UserSubmission.aggregate([
      {
        $match: {
          "participatedTMCTargets.submissionTime": { $ne: null },
        },
      },
      { $unwind: "$participatedTMCTargets" },
      {
        $group: {
          _id: {
            year: { $year: "$participatedTMCTargets.submissionTime" },
            month: { $month: "$participatedTMCTargets.submissionTime" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // ARV aggregation
    const arvData = await UserSubmission.aggregate([
      {
        $match: {
          "participatedTMCTargets.submissionTime": { $ne: null },
        },
      },
      { $unwind: "$participatedARVTargets" },
      {
        $group: {
          _id: {
            year: { $year: "$participatedARVTargets.submissionTime" },
            month: { $month: "$participatedARVTargets.submissionTime" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Fill ARV counts
    arvData.forEach((item) => {
      const monthIndex = item._id.month - 1;
      graphData[monthIndex].arv = item.count;
    });

    return res.status(200).json({
      status: true,
      message: "Graph data fetched successfully",
      data: graphData,
    });
  } catch (error) {
    next(error);
  }
};

// Check if a user participated in the TMC or ARV or not
export const getUserParticipationTMC = async (req, res, next) => {
  const { userId, TMCTargetId } = req.params;

  try {
    const result = await UserSubmission.findOne(
      { userId, "participatedTMCTargets.TMCId": TMCTargetId },
      { "participatedTMCTargets.$": 1 }
    ).populate("participatedTMCTargets.TMCId");

    if (!result) {
      return res.status(404).json({
        status: false,
        message: "User has not participated in this TMC.",
      });
    }

    const participatedTMCTarget = result.participatedTMCTargets?.[0];

    return res.status(200).json({
      status: true,
      data: participatedTMCTarget,
      message: "User has participated in this TMC.",
    });
  } catch (error) {
    next(error);
  }
};

export const getUserParticipationARV = async (req, res, next) => {
  const { userId, ARVTargetId } = req.params;

  try {
    const result = await UserSubmission.findOne(
      { userId, "participatedARVTargets.ARVId": ARVTargetId },
      { "participatedARVTargets.$": 1 }
    ).populate("participatedARVTargets.ARVId");

    if (!result) {
      return res.status(404).json({
        status: false,
        message: "User has not participated in this ARV.",
      });
    }

    const participatedARVTarget = result.participatedARVTargets?.[0];

    return res.status(200).json({
      status: true,
      data: participatedARVTarget,
      message: "User has participated in this ARV.",
    });
  } catch (error) {
    next(error);
  }
};
