import { UserSubmission } from "../model/userSubmission.model.js";

// export const getTMCLeaderboard = async (_, res, next) => {
//     try {
//         const leaderboard = await UserSubmission.aggregate([
//             {
//                 $project: {
//                     userId: 1,
//                     totalTMCPoints: { $sum: "$participatedTMCTargets.points" },
//                     tierRank: 1
//                 }
//             },
//             { $sort: { totalTMCPoints: -1 } },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "userId",
//                     foreignField: "_id",
//                     as: "user"
//                 }
//             },
//             { $unwind: "$user" },
//             {
//                 $project: {
//                     totalTMCPoints: 1,
//                     tierRank: 1,
//                     user: {
//                         screenName: "$user.screenName",
//                         fullName: "$user.fullName"
//                     }
//                 }
//             }
//         ]);

//         return res.status(200).json({
//             status: true,
//             message: "TMC Leaderboard fetched successfully",
//             data: leaderboard
//         });
//     } catch (error) {
//         next(error);
//     }
// };

// export const getARVLeaderboard = async (_, res, next) => {
//     try {
//         const leaderboard = await UserSubmission.aggregate([
//             {
//                 $project: {
//                     userId: 1,
//                     totalARVPoints: { $sum: "$participatedARVTargets.points" },
//                     tierRank: 1
//                 }
//             },
//             { $sort: { totalARVPoints: -1 } },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "userId",
//                     foreignField: "_id",
//                     as: "user"
//                 }
//             },
//             { $unwind: "$user" },
//             {
//                 $project: {
//                     totalARVPoints: 1,
//                     tierRank: 1,
//                     user: {
//                         screenName: "$user.screenName",
//                         fullName: "$user.fullName"
//                     }
//                 }
//             }
//         ]);

//         return res.status(200).json({
//             status: true,
//             message: "ARV Leaderboard fetched successfully",
//             data: leaderboard
//         });
//     }

//     catch (error) {
//         next(error);
//     }
// };

// export const getTotalLeaderboard = async (_, res, next) => {
//     try {
//         const leaderboard = await UserSubmission.aggregate([
//             {
//                 $project: {
//                     userId: 1,
//                     totalPoints: {
//                         $add: [
//                             { $sum: "$participatedTMCTargets.points" },
//                             { $sum: "$participatedARVTargets.points" }
//                         ]
//                     },
//                     tierRank: 1
//                 }
//             },
//             { $sort: { totalPoints: -1 } },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "userId",
//                     foreignField: "_id",
//                     as: "user"
//                 }
//             },
//             { $unwind: "$user" },
//             {
//                 $project: {
//                     totalPoints: 1,
//                     tierRank: 1,
//                     user: {
//                         screenName: "$user.screenName",
//                         fullName: "$user.fullName"
//                     }
//                 }
//             }
//         ]);

//         return res.status(200).json({
//             status: true,
//             message: "Total Leaderboard fetched successfully",
//             data: leaderboard
//         });
//     }

//     catch (error) {
//         next(error);
//     }
// };
// export const getTMCLeaderboard = async (_, res, next) => {
//   try {
//     const leaderboard = await UserSubmission.aggregate([
//       { $match: { userId: { $exists: true } } },
//       {
//         $project: {
//           userId: 1,
//           tierRank: 1,
//           createdAt: 1, // Use createdAt as cycle start (reset on cycle refresh)
//           participatedTMCTargets: 1,
//         },
//       },
//       {
//         $project: {
//           userId: 1,
//           tierRank: 1,
//           totalTMCPoints: {
//             $sum: {
//               $map: {
//                 input: { $ifNull: ["$participatedTMCTargets", []] },
//                 as: "target",
//                 in: {
//                   $cond: [
//                     {
//                       $gte: ["$$target.submissionTime", "$createdAt"], // Filter since cycle start
//                     },
//                     { $ifNull: ["$$target.points", 0] },
//                     0,
//                   ],
//                 },
//               },
//             },
//           },
//         },
//       },
//       { $sort: { totalTMCPoints: -1 } },
//       {
//         $lookup: {
//           from: "users",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user",
//         },
//       },
//       { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           totalTMCPoints: 1,
//           tierRank: 1,
//           user: {
//             screenName: { $ifNull: ["$user.screenName", "Unknown"] },
//             fullName: { $ifNull: ["$user.fullName", "Unknown"] },
//           },
//         },
//       },
//     ]);

//     return res.status(200).json({
//       status: true,
//       message: "TMC Leaderboard fetched successfully",
//       data: leaderboard,
//     });
//   } catch (error) {
//     console.error("TMC Leaderboard error:", error);
//     next(error);
//   }
// };

// export const getARVLeaderboard = async (_, res, next) => {
//   try {
//     const leaderboard = await UserSubmission.aggregate([
//       { $match: { userId: { $exists: true } } },
//       {
//         $project: {
//           userId: 1,
//           tierRank: 1,
//           createdAt: 1,
//           participatedARVTargets: 1,
//         },
//       },
//       {
//         $project: {
//           userId: 1,
//           tierRank: 1,
//           totalARVPoints: {
//             $sum: {
//               $map: {
//                 input: { $ifNull: ["$participatedARVTargets", []] },
//                 as: "target",
//                 in: {
//                   $cond: [
//                     {
//                       $gte: ["$$target.submissionTime", "$createdAt"],
//                     },
//                     { $ifNull: ["$$target.points", 0] },
//                     0,
//                   ],
//                 },
//               },
//             },
//           },
//         },
//       },
//       { $sort: { totalARVPoints: -1 } },
//       {
//         $lookup: {
//           from: "users",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user",
//         },
//       },
//       { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           totalARVPoints: 1,
//           tierRank: 1,
//           user: {
//             screenName: { $ifNull: ["$user.screenName", "Unknown"] },
//             fullName: { $ifNull: ["$user.fullName", "Unknown"] },
//           },
//         },
//       },
//     ]);

//     return res.status(200).json({
//       status: true,
//       message: "ARV Leaderboard fetched successfully",
//       data: leaderboard,
//     });
//   } catch (error) {
//     console.error("ARV Leaderboard error:", error);
//     next(error);
//   }
// };

// export const getTotalLeaderboard = async (_, res, next) => {
//   try {
//     const leaderboard = await UserSubmission.aggregate([
//       { $match: { userId: { $exists: true } } },
//       {
//         $project: {
//           userId: 1,
//           tierRank: 1,
//           totalPoints: { $ifNull: ["$totalPoints", 0] }, // Cycle-based
//         },
//       },
//       { $sort: { totalPoints: -1 } },
//       {
//         $lookup: {
//           from: "users",
//           localField: "userId",
//           foreignField: "_id",
//           as: "user",
//         },
//       },
//       { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
//       {
//         $project: {
//           totalPoints: 1,
//           tierRank: 1,
//           user: {
//             screenName: { $ifNull: ["$user.screenName", "Unknown"] },
//             fullName: { $ifNull: ["$user.fullName", "Unknown"] },
//           },
//         },
//       },
//     ]);

//     return res.status(200).json({
//       status: true,
//       message: "Total Leaderboard fetched successfully",
//       data: leaderboard,
//     });
//   } catch (error) {
//     console.error("Total Leaderboard error:", error);
//     next(error);
//   }
// };

export const getTMCLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate([
      {
        $match: {
          userId: { $exists: true },
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          completedChallenges: 1,
          participatedTMCTargets: 1,
          participatedARVTargets: 1,
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          combinedSubmissions: {
            $concatArrays: [
              {
                $map: {
                  input: "$participatedTMCTargets",
                  as: "t",
                  in: {
                    type: "TMC",
                    points: "$$t.points",
                    submissionTime: "$$t.submissionTime",
                  },
                },
              },
              {
                $map: {
                  input: "$participatedARVTargets",
                  as: "a",
                  in: {
                    type: "ARV",
                    points: "$$a.points",
                    submissionTime: "$$a.submissionTime",
                  },
                },
              },
            ],
          },
          completedChallenges: 1,
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
          completedChallenges: 1,
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          recentSubmissions: {
            $slice: ["$sortedSubmissions", 0, "$completedChallenges"],
          },
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          totalTMCPoints: {
            $sum: {
              $map: {
                input: "$recentSubmissions",
                as: "sub",
                in: {
                  $cond: [{ $eq: ["$$sub.type", "TMC"] }, "$$sub.points", 0],
                },
              },
            },
          },
        },
      },
      { $sort: { totalTMCPoints: -1 } },
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
          totalTMCPoints: 1,
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
      message: "TMC Leaderboard fetched successfully",
      data: leaderboard,
    });
  } catch (error) {
    console.error("TMC Leaderboard error:", error);
    next(error);
  }
};

// Update to getARVLeaderboard
export const getARVLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate([
      {
        $match: {
          userId: { $exists: true },
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          completedChallenges: 1,
          participatedTMCTargets: 1,
          participatedARVTargets: 1,
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          combinedSubmissions: {
            $concatArrays: [
              {
                $map: {
                  input: "$participatedTMCTargets",
                  as: "t",
                  in: {
                    type: "TMC",
                    points: "$$t.points",
                    submissionTime: "$$t.submissionTime",
                  },
                },
              },
              {
                $map: {
                  input: "$participatedARVTargets",
                  as: "a",
                  in: {
                    type: "ARV",
                    points: "$$a.points",
                    submissionTime: "$$a.submissionTime",
                  },
                },
              },
            ],
          },
          completedChallenges: 1,
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
          completedChallenges: 1,
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          recentSubmissions: {
            $slice: ["$sortedSubmissions", 0, "$completedChallenges"],
          },
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          totalARVPoints: {
            $sum: {
              $map: {
                input: "$recentSubmissions",
                as: "sub",
                in: {
                  $cond: [{ $eq: ["$$sub.type", "ARV"] }, "$$sub.points", 0],
                },
              },
            },
          },
        },
      },
      { $sort: { totalARVPoints: -1 } },
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
          totalARVPoints: 1,
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
      message: "ARV Leaderboard fetched successfully",
      data: leaderboard,
    });
  } catch (error) {
    console.error("ARV Leaderboard error:", error);
    next(error);
  }
};

// Total Leaderboard remains the same, as it uses totalPoints, which is correct for current cycle
export const getTotalLeaderboard = async (_, res, next) => {
  try {
    const leaderboard = await UserSubmission.aggregate([
      {
        $match: {
          userId: { $exists: true },
        },
      },
      {
        $project: {
          userId: 1,
          tierRank: 1,
          totalPoints: { $ifNull: ["$totalPoints", 0] },
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
