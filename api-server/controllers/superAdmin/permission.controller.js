const permissionSchema = require("../../models/superAdmin/permission.model");
const customerSchema = require("../../models/customer.model");

exports.getAdminPermission = async (req, res) => {
  try {
    const customerId = req.customer._id;
    const getCustomerPermission = await permissionSchema
      .findOne({
        customerId,
      })
      .populate("pages.pageId", { pageName: 1 })
      .populate("pages.allocatedActions.actionId", { actionType: 1 });
    if (!getCustomerPermission) {
      return res.status(203).send({
        message: "Permission not assign to this customer!",
        isSuccess: false,
      });
    }
    const transformedData = {
      customerId: getCustomerPermission.customerId,
      _id: getCustomerPermission._id,
      pages: getCustomerPermission.pages.map((page) => ({
        pageId: page.pageId._id,
        pageName: page.pageId.pageName,
        allocatedActions: page.allocatedActions.map((action) => ({
          actionId: action.actionId._id,
          actionType: action.actionId.actionType,
          status: action.status,
        })),
      })),
    };
    const getCustomerPackage = await customerSchema
      .findById(customerId)
      .populate("packageId");
    return res.status(200).send({
      message: "Permission get successfully.",
      isSuccess: true,
      data: transformedData,
      campaignType: getCustomerPackage
        ? getCustomerPackage.packageId.campaignTypes
        : [],
    });
  } catch (error) {
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message,
    });
  }
};
