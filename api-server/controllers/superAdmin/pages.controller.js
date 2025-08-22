const pagesSchema = require("../../models/superAdmin/pages.model");
const pageActionSchema = require("../../models/superAdmin/pageAction.model");
const permissionSchema = require("../../models/superAdmin/permission.model");

exports.createPage = async (req, res) => {
  try {
    const { pageName, pageUrl } = req.body;
    const escapedName = pageName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const findPage = await pagesSchema.findOne({
      pageName: nameRegex,
    });
    if (findPage) {
      return res
        .status(203)
        .send({ message: "Page is already existing!", isSuccess: false });
    } else {
      const newPage = await pagesSchema({
        pageName,
        pageUrl,
      });
      newPage.save();
      return res.status(200).send({
        message: "Page created successfully.",
        newPage,
        isSuccess: true,
      });
    }
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.updatePage = async (req, res) => {
  const { pageName, pageUrl } = req.body;
  const pageId = req.params.pageId;
  try {
    const getPage = await pagesSchema.findById(pageId);
    if (!getPage) {
      return res.status(203).send({
        message: "Invalid page id!",
        isSuccess: false,
      });
    }
    const escapedName = pageName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nameRegex = new RegExp("^" + escapedName + "$", "i");
    const updatePage = await pagesSchema.findOne({
      _id: { $ne: pageId },
      pageName: nameRegex,
    });
    if (updatePage) {
      return res.status(203).send({
        message: "Page is already existing!",
        isSuccess: false,
      });
    }
    await pagesSchema
      .findByIdAndUpdate(pageId, { pageName, pageUrl }, { new: true })
      .then((page) => {
        if (!page) {
          return res.status(203).send({
            message: "Page not found!",
            isSuccess: false,
          });
        }
        return res.status(200).send({
          message: "Page updated successfully.",
          isSuccess: true,
          data: page,
        });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.listAllPage = async (req, res) => {
  try {
    const pageNo = req.body.pageNo ? req.body.pageNo : 1;
    const perPage = req.body.perPage ? req.body.perPage : 10;
    await pagesSchema
      .find()
      .skip(perPage * pageNo - perPage)
      .limit(perPage)
      .sort({ _id: -1 })
      .then(async (data) => {
        const totalRecords = await pagesSchema.count();
        return res.status(200).send({
          data,
          currentPageNo: pageNo,
          totalRecords: totalRecords,
          totalPages: Math.ceil(totalRecords / perPage),
          isSuccess: true,
          message: "Page listing successfully.",
        });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.deletePage = async (req, res) => {
  const pageId = req.params.pageId;
  try {
    await pagesSchema
      .findByIdAndDelete(pageId)
      .then((page) => {
        if (!page)
          return res
            .status(203)
            .send({ message: "Page not found!", isSuccess: false });
        return res
          .status(200)
          .send({ message: "Page deleted successfully.", isSuccess: true });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listAllPageWithoutPagination = async (req, res) => {
  try {
    await pagesSchema
      .find()
      .sort({ _id: -1 })
      .then(async (data) => {
        const totalRecords = await pagesSchema.count();
        return res.status(200).send({
          data,
          totalRecords: totalRecords,
          isSuccess: true,
          message: "Page listing successfully.",
        });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.getPageById = async (req, res) => {
  const { pageId, customerId } = req.body;
  try {
    await pageActionSchema
      .find({ pageId })
      .then(async (data) => {
        if (!data) {
          return res.status(203).send({
            isSuccess: false,
            message: "Page action not found.",
          });
        }
        const getCustomerPermission = await permissionSchema
          .findOne({
            customerId,
          })
          .populate("pages.pageId", { pageName: 1 })
          .populate("pages.allocatedActions.actionId", { actionType: 1 });
        let permissionData;
        if (getCustomerPermission) {
          permissionData = {
            pages: getCustomerPermission.pages.map((page) => ({
              pageId: page.pageId._id,
              pageName: page.pageId.pageName,
              allocatedOn: page.allocatedOn,
              allocatedActions: page.allocatedActions.map((action) => ({
                actionId: action.actionId._id,
                actionType: action.actionId.actionType,
                status: action.status,
              })),
            })),
          };
        } else {
          permissionData = { pages: [] };
        }
        let remainingActions;
        if (permissionData.pages.length > 0) {
          const assignedActions =
            permissionData.pages
              .find((page) => page.pageId == pageId)
              ?.allocatedActions.map((action) => action.actionId) || [];
          remainingActions = data.filter((action) => {
            return !assignedActions.some(
              (assignedAction) =>
                assignedAction.toString() == action._id.toString()
            );
          });
        } else {
          remainingActions = data;
        }
        return res.status(200).send({
          data: remainingActions,
          isSuccess: true,
          message: "Page action get successfully.",
        });
      })
      .catch((error) => {
        return res.status(203).send({
          error: error.message,
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.listRemainingPages = async (req, res) => {
  try {
    const customerId = req.body.customerId;
    const getCustomerPermission = await permissionSchema
      .findOne({
        customerId,
      })
      .populate("pages.pageId", { pageName: 1 })
      .populate("pages.allocatedActions.actionId", { actionType: 1 });
    let permissionData;
    if (getCustomerPermission) {
      permissionData = {
        pages: getCustomerPermission.pages.map((page) => ({
          pageId: page.pageId._id,
          pageName: page.pageId.pageName,
          allocatedOn: page.allocatedOn,
          allocatedActions: page.allocatedActions.map((action) => ({
            actionId: action.actionId._id,
            actionType: action.actionId.actionType,
            status: action.status,
          })),
        })),
      };
    } else {
      permissionData = { pages: [] };
    }
    const data = await pagesSchema.find();
    if (!data) {
      return res.status(203).send({
        isSuccess: false,
        message: "Page not found.",
      });
    }
    const filteredData = [];
    for (const item of data) {
      const pageActions = permissionData.pages.find(
        (page) => page.pageId.toString() == item._id.toString()
      );
      if (pageActions) {
        const pageActionTypes = await pageActionSchema
          .find({ pageId: item._id })
          .distinct("actionType");
        const hasUnassignedActionTypes = pageActionTypes.some(
          (actionType) =>
            !pageActions.allocatedActions.some(
              (action) => action.actionType == actionType
            )
        );
        if (hasUnassignedActionTypes) {
          filteredData.push(item);
        }
      } else {
        filteredData.push(item);
      }
    }
    return res.status(200).send({
      data: filteredData,
      isSuccess: true,
      message: "Page listing successfully.",
    });
  } catch (error) {
    return res.status(203).send({
      error: error.message,
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};
