import mongoose, { Schema } from "mongoose";
import { Notification } from "./notification.model.js";

const TMCTargetSchema = new Schema(
  {
    code: {
      type: String,
      unique: true,
    },
    targetImage: {
      type: String,
    },
    controlImages: [
      {
        type: String,
      },
    ],
    revealTime: { type: Date },
    bufferTime: {
      type: Date,
    },
    gameTime: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
    isPartiallyActive: {
      type: Boolean,
      default: false,
    },
    isQueued: {
      type: Boolean,
      default: false,
    },
    isCompleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

TMCTargetSchema.post("findOneAndUpdate", async function (doc) {
  if (doc.isCompleted) {
    await Notification.deleteMany({ targetCode: doc.code });
  }
});
export const TMCTarget = mongoose.model("TMCTarget", TMCTargetSchema);
