const packagesSchema = require("../../models/superAdmin/packages.model");

exports.getAllPackages = async (req, res) => {
  try {
    await packagesSchema
      .find({}, { packageName: 1 })
      .sort({ _id: -1 })
      .then(async (data) => {
        return res.status(200).send({
          isSuccess: true,
          message: "Packages listing successfully.",
          data: data,
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

