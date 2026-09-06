const AppError = require("../utils/AppError");

/**
 * Generic Zod-schema validation middleware.
 * Usage: validate(schema, "body" | "query" | "params")
 */
function validate(schema, source = "body") {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return next(new AppError(message, 400));
    }
    req[source] = result.data;
    next();
  };
}

module.exports = validate;
