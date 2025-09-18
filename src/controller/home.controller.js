import { ARVTarget } from "../model/arvTarget.model.js";
import { TMCTarget } from "../model/tmcTarget.model.js";
import { User } from "../model/user.model.js";
import { UserSubmission } from "../model/userSubmission.model.js";

export const updateUserActivity = async (userId) => {
  if (userId) {
    try {
      await User.findByIdAndUpdate(userId, {
        lastActive: new Date(),
      });
    } catch (error) {
      console.error("Error updating user activity:", error);
    }
  }
};
export const getHomeCounts = async (req, res, next) => {
  try {
    const activeThreshold = 5 * 60 * 1000;
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

    const runningTMC = await TMCTarget.countDocuments({
      isActive: true,
      isPartiallyActive: true,
    });
    const runningARV = await ARVTarget.countDocuments({
      isActive: true,
      isPartiallyActive: true,
    });
    const totalParticipation = await UserSubmission.countDocuments({});

    updateUserActivity(req.user._id);

    const data = {
      activeUsers: activeUsers.length,
      runningEvents: runningARV + runningTMC,
      totalParticipation,
    };

    return res.status(200).json({
      success: true,
      message: "Home counts fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};
