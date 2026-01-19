import mongoose from "mongoose";
import { User } from "../model/user.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";

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

export const getNextUserTierInfo = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const currentPoints = user.totalPoints;
    const currentIndex = tierTable.findIndex(
      (tier) => tier.name === user.tierRank,
    );
    if (currentIndex === -1) {
      return res
        .status(400)
        .json({ status: false, message: "Invalid tierRank" });
    }

    const currentTier = tierTable[currentIndex];
    const prevTier = tierTable[currentIndex - 1];
    const nextTier = tierTable[currentIndex + 1];

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
          image: currentTier.image,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// export const updateUserTier = async (userId) => {
//   const session = await mongoose.startSession();
//   try {
//     let result = null;
//     await session.withTransaction(async () => {
//       const [user, userSubmission] = await Promise.all([
//         User.findById(userId).session(session),
//         UserSubmission.findOne({ userId }).session(session),
//       ]);

//       if (!user || !userSubmission) {
//         throw new Error("User data not found");
//       }

//       let finalPoints = userSubmission.totalPoints;
//       const daysInCycle = Math.floor(
//         (new Date() -
//           (userSubmission.lastChallengeDate || userSubmission.createdAt)) /
//           (1000 * 60 * 60 * 24)
//       );

//       // Apply penalty only if 15 days passed and not completed 10 games
//       if (daysInCycle >= 15 && userSubmission.completedChallenges < 10) {
//         const missingGames = 10 - userSubmission.completedChallenges;
//         finalPoints -= missingGames * 10;
//         finalPoints = Math.max(finalPoints, -29); // Minimum points protection
//       }

//       const newTier = calculateNewTier(user.tierRank, finalPoints);

//       // Reset points and challenges for the new cycle
//       const resetPoints = 0;
//       const resetChallenges = 0;
//       const resetTargetsLeft = 10;

//       await Promise.all([
//         User.updateOne(
//           { _id: userId },
//           {
//             $set: {
//               tierRank: newTier,
//               totalPoints: resetPoints,
//               targetsLeft: resetTargetsLeft,
//             },
//           },
//           { session }
//         ),
//         UserSubmission.updateOne(
//           { userId },
//           {
//             $set: {
//               tierRank: newTier,
//               totalPoints: resetPoints,
//               completedChallenges: resetChallenges,
//               lastChallengeDate: new Date(),
//             },
//           },
//           { session }
//         ),
//       ]);

//       // Assign the result to return after the transaction
//       result = {
//         status: true,
//         message: "Tier updated and points reset for new cycle",
//         previousTier: user.tierRank,
//         newTier,
//         pointsReset: true,
//         resetValue: resetPoints,
//         previousPoints: finalPoints,
//       };
//     });

//     // Ensure result is returned
//     if (!result) {
//       throw new Error("Transaction failed: No result generated");
//     }

//     return result; // Return the result after the transaction
//   } catch (error) {
//     console.error("Tier update failed:", error);
//     throw error;
//   } finally {
//     session.endSession();
//   }
// };

export const updateUserTier = async (userId) => {
  const session = await mongoose.startSession();
  try {
    let result = null;
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
          (1000 * 60 * 60 * 24),
      );

      // Apply penalty after 10 days inactivity (not 15)
      if (daysInCycle >= 10 && userSubmission.completedChallenges < 10) {
        const missingGames = 10 - userSubmission.completedChallenges;
        finalPoints -= missingGames * 10;
        finalPoints = Math.max(finalPoints, 0); // no negative points
      }

      const newTier = calculateNewTier(user.tierRank, finalPoints);

      // Reset cycle stats
      const resetPoints = 0;
      const resetChallenges = 0;
      const resetTargetsLeft = 10;

      await Promise.all([
        User.updateOne(
          { _id: userId },
          {
            $set: {
              tierRank: newTier,
              totalPoints: resetPoints, // reset active cycle points
              targetsLeft: resetTargetsLeft,
            },
          },
          { session },
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
          { session },
        ),
      ]);

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

    if (!result) {
      throw new Error("Transaction failed: No result generated");
    }

    return result;
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

// export const getProgressTracker = async (req, res, next) => {
//   try {
//     const { userId } = req.params;

//     const [userSubmission, user] = await Promise.all([
//       UserSubmission.findOne({ userId }),
//       User.findById(userId),
//     ]);

//     if (!userSubmission || !user) {
//       return res.status(404).json({
//         status: false,
//         message: "User data not found",
//       });
//     }

//     const completedChallenges = userSubmission.completedChallenges;
//     const currentScore = userSubmission.totalPoints;
//     const targetsLeft = 10 - completedChallenges;

//     // Combine and sort submissions
//     const combinedSubmissions = [
//       ...userSubmission.participatedTMCTargets.map((t) => ({
//         type: "TMC",
//         points: t.points,
//         submissionTime: t.submissionTime,
//       })),
//       ...userSubmission.participatedARVTargets.map((a) => ({
//         type: "ARV",
//         points: a.points,
//         submissionTime: a.submissionTime,
//       })),
//     ].sort((a, b) => b.submissionTime - a.submissionTime);

//     const recentSubmissions = combinedSubmissions.slice(0, completedChallenges);
//     const challengePoints = recentSubmissions.map((sub) => sub.points || 0);

//     // Current tier
//     const currentIndex = tierTable.findIndex(
//       (tier) => tier.name === user.tierRank
//     );
//     const currentTier = currentIndex >= 0 ? tierTable[currentIndex] : null;

//     // Next tier
//     const nextTier =
//       currentIndex >= 0 && currentIndex < tierTable.length - 1
//         ? tierTable[currentIndex + 1]
//         : null;

//     // Top tier (last element in table)
//     const topTier = tierTable[tierTable.length - 1];

//     const tierThresholds = currentTier
//       ? {
//           up: currentTier.up || null,
//           down: currentTier.down || null,
//           retainMin: currentTier.retain[0],
//           retainMax: currentTier.retain[currentTier.retain.length - 1],
//         }
//       : null;

//     const data = {
//       currentScore,
//       completedChallenges,
//       targetsLeft,
//       tierRank: user.tierRank,
//       nextTierPoint: user.nextTierPoint,
//       challengePoints,
//       tierThresholds,
//       tierImages: {
//         current: currentTier?.image || null,
//         next: nextTier?.image || null,
//         top: topTier?.image || null,
//       },
//       graphConfig: {
//         yMin: -100,
//         yMax: 275,
//         xMax: 10,
//       },
//     };

//     return res.status(200).json({
//       status: true,
//       message: "Progress tracker data fetched successfully",
//       data,
//     });
//   } catch (error) {
//     console.error("getProgressTracker error:", error);
//     next(error);
//   }
// };

export const getProgressTracker = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const [userSubmission, user] = await Promise.all([
      UserSubmission.findOne({ userId }),
      User.findById(userId),
    ]);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const completedChallenges = userSubmission?.completedChallenges || 0;
    const currentScore = userSubmission?.totalPoints || user.totalPoints || 0;
    const targetsLeft = 10 - completedChallenges;

    const combinedSubmissions = userSubmission
      ? [
          ...userSubmission.participatedTMCTargets.map((t) => ({
            type: "TMC",
            points: t.points,
            submissionTime: t.submissionTime,
          })),
          ...userSubmission.participatedARVTargets.map((a) => ({
            type: "ARV",
            points: a.points,
            submissionTime: a.submissionTime,
          })),
        ].sort((a, b) => b.submissionTime - a.submissionTime)
      : [];

    const recentSubmissions = combinedSubmissions.slice(0, completedChallenges);
    const challengePoints = recentSubmissions.map((sub) => sub.points || 0);

    const currentIndex = tierTable.findIndex(
      (tier) => tier.name === user.tierRank,
    );

    const currentTier =
      currentIndex >= 0 ? tierTable[currentIndex] : tierTable[0];
    const previousTier = currentIndex > 0 ? tierTable[currentIndex - 1] : null;
    const nextTier =
      currentIndex < tierTable.length - 1 ? tierTable[currentIndex + 1] : null;

    const tierThresholds = currentTier
      ? {
          up: currentTier.up || null,
          down: currentTier.down || null,
          retainMin: currentTier.retain[0],
          retainMax: currentTier.retain[currentTier.retain.length - 1],
        }
      : null;

    const data = {
      currentScore,
      completedChallenges,
      targetsLeft,
      tierRank: user.tierRank,
      nextTierPoint: user.nextTierPoint || currentTier.up || 0,
      challengePoints,
      tierThresholds,
      tierImages: {
        previous: previousTier
          ? { name: previousTier.name, image: previousTier.image }
          : null,
        current: {
          name: currentTier?.name || null,
          image: currentTier?.image || null,
        },
        next: nextTier ? { name: nextTier.name, image: nextTier.image } : null,
      },
      graphConfig: {
        yMin: -100,
        yMax: 275,
        xMax: 10,
      },
    };

    return res.status(200).json({
      status: true,
      message: "Progress tracker data fetched successfully",
      data,
    });
  } catch (error) {
    console.error("getProgressTracker error:", error);
    next(error);
  }
};
