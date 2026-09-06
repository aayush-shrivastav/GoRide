/**
 * Wraps an async controller/middleware so rejected promises are
 * forwarded to Express's centralized error handler instead of
 * crashing the process or requiring a try/catch in every controller.
 */
module.exports = function catchAsync(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
