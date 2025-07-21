import cron from "node-cron";

import { TMCTarget } from "../model/tmcTarget.model.js";
import { Notification } from "../model/notification.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";

// Run every minute
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const roundedNow = new Date(Math.floor(now.getTime() / 60000) * 60000);

  const outcomeTargets = await ARVTarget.find({
    outcomeTime: { $lte: roundedNow, $gt: new Date(roundedNow - 60000) },
  });

  for (const target of outcomeTargets) {
    await Notification.create({
      message: `ARV target with code "${target.code}" has reached its outcome time.`,
      targetCode: target.code,
    });
  }
});

export const emitNotification = async (io, { userId, message, targetCode }) => {
  try {
    const notification = await Notification.create({
      userId,
      message,
      targetCode,
    });

    if (userId) {
      io.to(`user_${userId}`).emit("notification", notification);
    }

    if (targetCode) {
      io.to(`game_${targetCode}`).emit("gameNotification", notification);
    }

    io.to("admin").emit("adminNotification", notification);

    return notification;
  } catch (error) {
    console.error("Error emitting notification:", error);
    throw error;
  }
};

export const emitGlobalNotification = async (io, { message, targetCode }) => {
  try {
    const notification = await Notification.create({
      message,
      targetCode,
    });

    io.emit("globalNotification", notification);

    if (targetCode) {
      io.to(`game_${targetCode}`).emit("gameNotification", notification);
    }

    return notification;
  } catch (error) {
    console.error("Error emitting global notification:", error);
    throw error;
  }
};
