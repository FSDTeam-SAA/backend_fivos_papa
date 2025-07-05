import mongoose, { Schema } from "mongoose";
import { Notification } from "../model/notification.model.js";

const TMCTargetSchema = new Schema(
  {
    code: { type: String, unique: true },

    targetImage: { type: String },
    controlImages: [{ type: String }],

    startTime: { type: Date },
    gameDuration: { type: Number },
    revealDuration: { type: Number },
    bufferDuration: { type: Number },

    isActive: { type: Boolean, default: false },
    isPartiallyActive: { type: Boolean, default: false },
    isQueued: { type: Boolean, default: false },
    isCompleted: { type: Boolean, default: false },

    status: {
      type: String,
      enum: [
        "inactive",
        "queued",
        "active",
        "revealed",
        "expired",
        "completed",
      ],
      default: "inactive",
    },
  },
  { timestamps: true }
);

TMCTargetSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && doc.isCompleted) {
    await Notification.deleteMany({ targetCode: doc.code });
  }
});

export const TMCTarget = mongoose.model("TMCTarget", TMCTargetSchema);
