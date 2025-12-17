const REST_API_STATUSCODE = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  internalServerError: 500,
};

// 1 = Wishlist, 2 = Cart
const ITEM_TYPE = {
  WISHLIST: 1,
  CART: 2,
};

module.exports = {
  REST_API_STATUSCODE,
  ITEM_TYPE
};
