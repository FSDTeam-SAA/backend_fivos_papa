import mongoose, { Schema } from "mongoose";
import { Notification } from "../model/notification.model.js";

const ARVTargetSchema = new Schema(
  {
    code: {
      type: String,
      unique: true,
    },
    eventName: {
      type: String,
    },
    eventDescription: {
      type: String,
    },
    revealTime: {
      type: Date,
    },
    outcomeTime: {
      type: Date,
    },
    bufferTime: {
      type: Date,
    },
    gameTime: {
      type: Date,
    },
    image1: {
      url: { type: String, required: true },
      description: { type: String, required: true },
    },
    image2: {
      url: { type: String, required: true },
      description: { type: String, required: true },
    },
    image3: {
      url: { type: String, required: true },
      description: { type: String, required: true },
    },
    controlImage: {
      type: String,
    },
    resultImage: {
      type: String,
      default: "",
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

ARVTargetSchema.post("findOneAndUpdate", async function (doc) {
  if (doc && doc.isCompleted) {
    await Notification.deleteMany({ targetCode: doc.code });
  }
});

export const ARVTarget = mongoose.model("ARVTarget", ARVTargetSchema);
