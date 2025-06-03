import cron from "node-cron";

import { TMCTarget } from "../model/tmcTarget.model.js";
import { Notification } from "../model/notification.model.js";
import { ARVTarget } from "../model/arvTarget.model.js";

// Run every minute
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const roundedNow = new Date(Math.floor(now.getTime() / 60000) * 60000); // round to nearest minute

  const checkAndNotify = async (Model, type) => {
    const targets = await Model.find({
      $or: [
        { revealTime: { $lte: roundedNow, $gt: new Date(roundedNow - 60000) } },
        {
          outcomeTime: { $lte: roundedNow, $gt: new Date(roundedNow - 60000) },
        },
      ],
    });

    for (const target of targets) {
      await Notification.create({
        message: `${type} target with code "${target.code}" has a reveal/outcome time now.`,
        targetCode: target.code,
      });
    }
  };

  await checkAndNotify(ARVTarget, "ARV");
  await checkAndNotify(TMCTarget, "TMC");
});
