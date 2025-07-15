import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

export const dbconfig = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI).then(() => {
      console.log("MongoDB connected");
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};
