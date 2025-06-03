import { Notification } from "../model/notification.model.js";

export const createNotification = async (req, res, next) => {
  const { userId } = req.params;
  const { message, targetCode } = req.body;

  try {
    const notification = await Notification.create({
      userId,
      message,
      targetCode,
    });

    return res.status(201).json({
      status: true,
      message: "Notification created successfully",
      data: notification,
    });
  } catch (error) {
    next(error);
  }
};

export const getNotifications = async (req, res, next) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [notifications, totalItems] = await Promise.all([
      await Notification.find({
        $or: [{ userId }, { userId: null }],
      })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      Notification.countDocuments({
        $or: [{ userId }, { userId: null }],
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limit);

    return res.status(200).json({
      status: true,
      message: "Notifications fetched successfully",
      data: notifications,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    next(error);
  }
};
