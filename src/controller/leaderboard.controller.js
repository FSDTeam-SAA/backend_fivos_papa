import { UserSubmission } from "../model/userSubmission.model.js";

const buildTypeLeaderboardPipeline = (type, scoreField) => [
  { $match: { userId: { $exists: true } } },
  {
    $project: {
      userId: 1,
      tierRank: 1,
      completedChallenges: { $ifNull: ["$completedChallenges", 0] },
      combinedSubmissions: {
        $concatArrays: [
          {
            $map: {
              input: { $ifNull: ["$participatedTMCTargets", []] },
              as: "target",
              in: {
                type: "TMC",
                points: "$$target.points",
                submissionTime: "$$target.submissionTime",
              },
            },
          },
          {
            $map: {
              input: { $ifNull: ["$participatedARVTargets", []] },
              as: "target",
              in: {
                type: "ARV",
                points: "$$target.points",
                submissionTime: "$$target.submissionTime",
              },
            },
          },
        ],
      },
    },
  },
  {
    $project: {
      userId: 1,
      tierRank: 1,
      sortedSubmissions: {
        $sortArray: {
          input: "$combinedSubmissions",
          sortBy: { submissionTime: -1 },
        },
      },
      currentCycleCount: {
        $max: [0, { $min: ["$completedChallenges", { $size: "$combinedSubmissions" }] }],
      },
    },
  },
  {
    $project: {
      userId: 1,
      tierRank: 1,
      currentCycleSubmissions: {
        $cond: [
          { $gt: ["$currentCycleCount", 0] },
          { $slice: ["$sortedSubmissions", 0, "$currentCycleCount"] },
          [],
        ],
      },
    },
  },
  {
    $project: {
      userId: 1,
      tierRank: 1,
      [scoreField]: {
        $max: [
          {
            $sum: {
              $map: {
                input: "$currentCycleSubmissions",
                as: "submission",
                in: {
                  $cond: [
                    { $eq: ["$$submission.type", type] },
                    { $ifNull: ["$$submission.points", 0] },
                    0,
                  ],
                },
              },
            },
          },
          0,
        ],
      },
    },
  },
  { $sort: { [scoreField]: -1 } },
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
    },
  },
  { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      [scoreField]: 1,
      tierRank: 1,
      user: {
        screenName: { $ifNull: ["$user.screenName", "Unknown"] },
        fullName: { $ifNull: ["$user.fullName", "Unknown"] },
      },
    },
  },
];

export const getTMCLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate(
      buildTypeLeaderboardPipeline("TMC", "totalTMCPoints"),
    );

    return res.status(200).json({
      status: true,
      message: "TMC Leaderboard fetched successfully",
      data: leaderboard,
    });
  } catch (error) {
    console.error("TMC Leaderboard error:", error);
    next(error);
  }
};

export const getARVLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate(
      buildTypeLeaderboardPipeline("ARV", "totalARVPoints"),
    );

    return res.status(200).json({
      status: true,
      message: "ARV Leaderboard fetched successfully",
      data: leaderboard,
    });
  } catch (error) {
    console.error("ARV Leaderboard error:", error);
    next(error);
  }
};

export const getTotalLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate([
      { $match: { userId: { $exists: true } } },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          totalPoints: { $max: [{ $ifNull: ["$totalPoints", 0] }, 0] },
        },
      },
      { $sort: { totalPoints: -1 } },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          totalPoints: 1,
          tierRank: 1,
          user: {
            screenName: { $ifNull: ["$user.screenName", "Unknown"] },
            fullName: { $ifNull: ["$user.fullName", "Unknown"] },
          },
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "Total Leaderboard fetched successfully",
      data: leaderboard,
    });
  } catch (error) {
    console.error("Total Leaderboard error:", error);
    next(error);
  }
};
