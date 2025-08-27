import mongoose, { Schema } from "mongoose";

const NotificationSchema = new Schema(
  {
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserProfile",
      default: null,
    },
    targetCode: {
      type: String,
    },
  },
  { timestamps: true }
);

export const Notification = mongoose.model("Notification", NotificationSchema);
