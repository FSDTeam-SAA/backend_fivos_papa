import mongoose from "mongoose";
import { User } from "../model/user.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";

const tierTable = [
  { name: "NOVICE SEEKER", up: 1, down: undefined, retain: [0] },
  { name: "INITIATE", up: 1, down: -30, retain: [-29, 0] },
  { name: "APPRENTICE", up: 31, down: 0, retain: [1, 30] },
  { name: "EXPLORER", up: 61, down: 0, retain: [1, 60] },
  { name: "VISIONARY", up: 81, down: 30, retain: [31, 80] },
  { name: "ADEPT", up: 101, down: 30, retain: [31, 100] },
  { name: "SEER", up: 121, down: 60, retain: [61, 120] },
  { name: "ORACLE", up: 141, down: 60, retain: [61, 140] },
  { name: "MASTER REMOTE VIEWER", up: 161, down: 100, retain: [101, 160] },
  { name: "ASCENDING MASTER", up: undefined, down: 120, retain: [121] },
];

export const getNextUserTierInfo = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const currentPoints = user.totalPoints;
    const currentIndex = tierTable.findIndex(
      (tier) => tier.name === user.tierRank
    );
    if (currentIndex === -1) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid tierRank" });
    }

    const currentTier = tierTable[currentIndex];
    const prevTier = tierTable[currentIndex - 1];
    const nextTier = tierTable[currentIndex + 1];

    const pointsToNextTier =
      nextTier?.up !== undefined
        ? Math.max(nextTier.up - currentPoints, 0)
        : null;
    const pointsToDropTier =
      currentTier.down !== undefined
        ? Math.max(currentPoints - currentTier.down, 0)
        : null;

    return res.status(200).json({
      status: true,
      message: "User tier data fetched",
      data: {
        totalPoints: currentPoints,
        currentTier: currentTier.name,
        previousTier: prevTier?.name || null,
        nextTier: nextTier?.name || null,
        tierDetails: {
          name: currentTier.name,
          retain: currentTier.retain,
          up: currentTier.up,
          down: currentTier.down,
        },
        pointsToNextTier,
        pointsToDropTier,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUserTier = async (userId) => {
  const session = await mongoose.startSession();
  try {
    let result = null; // Initialize result to null
    await session.withTransaction(async () => {
      const [user, userSubmission] = await Promise.all([
        User.findById(userId).session(session),
        UserSubmission.findOne({ userId }).session(session),
      ]);

      if (!user || !userSubmission) {
        throw new Error("User data not found");
      }

      let finalPoints = userSubmission.totalPoints;
      const daysInCycle = Math.floor(
        (new Date() -
          (userSubmission.lastChallengeDate || userSubmission.createdAt)) /
          (1000 * 60 * 60 * 24)
      );

      // Apply penalty only if 15 days passed and not completed 10 games
      if (daysInCycle >= 15 && userSubmission.completedChallenges < 10) {
        const missingGames = 10 - userSubmission.completedChallenges;
        finalPoints -= missingGames * 10;
        finalPoints = Math.max(finalPoints, -29); // Minimum points protection
      }

      const newTier = calculateNewTier(user.tierRank, finalPoints);

      // Reset points and challenges for the new cycle
      const resetPoints = 0;
      const resetChallenges = 0;
      const resetTargetsLeft = 10;

      await Promise.all([
        User.updateOne(
          { _id: userId },
          {
            $set: {
              tierRank: newTier,
              totalPoints: resetPoints,
              targetsLeft: resetTargetsLeft,
            },
          },
          { session }
        ),
        UserSubmission.updateOne(
          { userId },
          {
            $set: {
              tierRank: newTier,
              totalPoints: resetPoints,
              completedChallenges: resetChallenges,
              lastChallengeDate: new Date(),
            },
          },
          { session }
        ),
      ]);

      // Assign the result to return after the transaction
      result = {
        status: true,
        message: "Tier updated and points reset for new cycle",
        previousTier: user.tierRank,
        newTier,
        pointsReset: true,
        resetValue: resetPoints,
        previousPoints: finalPoints,
      };
    });

    // Ensure result is returned
    if (!result) {
      throw new Error("Transaction failed: No result generated");
    }

    return result; // Return the result after the transaction
  } catch (error) {
    console.error("Tier update failed:", error);
    throw error;
  } finally {
    session.endSession();
  }
};

function calculateNewTier(currentTier, points) {
  const currentIndex = tierTable.findIndex((t) => t.name === currentTier);
  if (currentIndex === -1) return "NOVICE SEEKER";

  const currentTierData = tierTable[currentIndex];

  // 1. Check for demotion first
  if (currentTierData.down !== null && points <= currentTierData.down) {
    return tierTable[Math.max(0, currentIndex - 1)].name;
  }

  // 2. Check for promotion
  if (currentIndex < tierTable.length - 1 && points >= currentTierData.up) {
    return tierTable[currentIndex + 1].name;
  }

  // 3. Check retain range
  const [min, max] =
    currentTierData.retain.length === 2
      ? currentTierData.retain
      : [currentTierData.retain[0], currentTierData.retain[0]];

  if (points >= min && points <= max) {
    return currentTier;
  }

  // Default: no change
  return currentTier;
}
