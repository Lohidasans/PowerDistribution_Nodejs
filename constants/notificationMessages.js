const websiteLoginOtp = (otp) =>
  `CHNIRA: Dear Customer, ${otp} is your OTP (One Time Password) to authenticate your login to Chaneira Website. Do not share it with anyone.

Thank You,
Team Chaneira Jewels`;

// ─── PUSH NOTIFICATION TEMPLATES ────────────────────────────────────────────
// Each push template returns { title, body } used by sendPushToSubscribers()
// ─────────────────────────────────────────────────────────────────────────────



const websiteNewCustomerGreeting = () =>
  `CHNIRA: Welcome to Chaneira Jewels!
Your account has been registered successfully.

Thank you.
Team Chaneira Jewels`;



const discountApprovalOtp = (branchName, otp, invoiceNo) =>
  `CHNIRA: Discount limit exceeded at ${branchName} Branch.
To Approve, ${otp} is your OTP for ${invoiceNo}.
(Valid for 5 mins)`;



const offerCreatedCollection = (discountPercentage, fromDate, toDate) =>
  `CHNIRA: Enjoy ${discountPercentage}% OFF on selective Collections!!!
Offer valid from ${fromDate} to ${toDate}.
Visit our store to avail the offer.

Thank You,
Team Chaneira Jewels`;



const offerCreatedCategory = (discountPercentage, categoryName, fromDate, toDate) =>
  `CHNIRA: Enjoy ${discountPercentage}% OFF on ${categoryName}.
Offer is valid from ${fromDate} to ${toDate}.
Visit our store to avail the offer.

Thank You,
Team Chaneira Jewels`;



const customerPurchase = () =>
  `CHNIRA: Thank you for your purchase at Chaneira Jewels!
We appreciate your feedback and look forward to serving you again.

Team Chaneira Jewels`;



const savingSchemeEnrollment = (schemeName) =>
  `CHNIRA: You have been successfully enrolled in the saving scheme (${schemeName}).
Your scheme is now active.

Thank you for choosing our saving scheme.
Team Chaneira Jewels`;



const schemeDueAmountReminder = (amount, schemeName) =>
  `CHNIRA: Reminder!
Rs.${amount} is due for your saving scheme (${schemeName}).

Team Chaneira Jewels`;



const schemeCompleted = (schemeName) =>
  `CHNIRA: Congratulations!
Your saving scheme (${schemeName}) has been completed successfully.

Thank you for choosing Chaneira Jewels.
Team Chaneira Jewels`;



const googleReview = (reviewLink) =>
  `CHNIRA: We're constantly improving, and your feedback helps!
Kindly leave us a Google review about your experience with us.
${reviewLink}

Thank you for your support!
Team Chaneira Jewels`;



const onlineOrderPlaced = (billAmount) =>
  `CHNIRA: Your online order has been placed successfully for Rs.${billAmount}.
We will notify you once the order is processed.

Thank you.
Team Chaneira Jewels`;



const orderDispatchedTracking = (deliveryDays = "5 to 7") =>
  `CHNIRA: Your order has been dispatched successfully.
Your order will be delivered within ${deliveryDays} days.

Thank you.
Team Chaneira Jewels`;



const orderDelivered = (orderNo) =>
  `CHNIRA: Your order ${orderNo} has been delivered successfully.
Thank you for shopping with Chaneira Jewels.

Team Chaneira Jewels`;



const newBranchOpening = (city, locationLink) =>
  `CHNIRA: We're now available at ${city} — bringing our finest collections even closer to you.
Visit us at our new location:
${locationLink}

We look forward to welcoming you!
Team Chaneira Jewels`;



const festiveSeason = (locationLink) =>
  `CHNIRA: Festive season is here! ✨
Discover our latest collections and exclusive festive deals in-store.

Hurry — limited stock!
Visit us at:
${locationLink}

Team Chaneira Jewels`;



// Customer login success
const push_customerLogin = () => ({
  title: 'Welcome back! 👋',
  body: 'You have successfully logged in to Chaneira Jewels.',
  url: '/dashboard',
});

// New customer registered
const push_newCustomerGreeting = () => ({
  title: 'Welcome to Chaneira Jewels! 🎉',
  body: 'Your account has been created. Explore our finest collections.',
  url: '/home',
});

// Admin/Staff login success
const push_adminLogin = (name) => ({
  title: `Welcome, ${name}! 🔐`,
  body: 'You have successfully logged in to the admin panel.',
  url: '/admin/dashboard',
});

// Discount approval required
const push_discountApproval = (branchName, invoiceNo) => ({
  title: 'Discount Approval Required ⚠️',
  body: `Discount limit exceeded at ${branchName} for invoice ${invoiceNo}. Approve now.`,
  url: '/admin/approvals',
});

// Offer created - collection
const push_offerCreatedCollection = (discountPercentage, fromDate, toDate) => ({
  title: `🎁 ${discountPercentage}% OFF Offer Live!`,
  body: `Enjoy ${discountPercentage}% off on selective collections. Valid from ${fromDate} to ${toDate}.`,
  url: '/offers',
});

// Offer created - category
const push_offerCreatedCategory = (discountPercentage, categoryName, fromDate, toDate) => ({
  title: `🎁 ${discountPercentage}% OFF on ${categoryName}!`,
  body: `Offer valid from ${fromDate} to ${toDate}. Visit our store to avail.`,
  url: '/offers',
});

// Customer purchase confirmation
const push_customerPurchase = () => ({
  title: 'Purchase Successful! 🛍️',
  body: 'Thank you for your purchase at Chaneira Jewels. We look forward to serving you again.',
  url: '/my-orders',
});

// Scheme enrollment
const push_savingSchemeEnrollment = (schemeName) => ({
  title: 'Scheme Enrolled ✅',
  body: `You have been enrolled in the saving scheme "${schemeName}". Your scheme is now active.`,
  url: '/my-schemes',
});

// Scheme due reminder
const push_schemeDueAmountReminder = (amount, schemeName) => ({
  title: 'Scheme Payment Reminder 🔔',
  body: `Rs.${amount} is due for your saving scheme "${schemeName}". Pay now to continue.`,
  url: '/my-schemes',
});

// Scheme completed
const push_schemeCompleted = (schemeName) => ({
  title: 'Scheme Completed 🎊',
  body: `Congratulations! Your saving scheme "${schemeName}" has been completed successfully.`,
  url: '/my-schemes',
});

// Online order placed
const push_onlineOrderPlaced = (billAmount) => ({
  title: 'Order Placed Successfully! 📦',
  body: `Your online order of Rs.${billAmount} has been placed. We will notify you once processed.`,
  url: '/my-orders',
});

// Order dispatched
const push_orderDispatched = (deliveryDays = '5 to 7') => ({
  title: 'Order Dispatched! 🚚',
  body: `Your order is on its way. Expected delivery in ${deliveryDays} days.`,
  url: '/my-orders',
});

// Order delivered
const push_orderDelivered = (orderNo) => ({
  title: 'Order Delivered! ✅',
  body: `Your order ${orderNo} has been delivered. Thank you for shopping with Chaneira Jewels!`,
  url: '/my-orders',
});

// New branch opening
const push_newBranchOpening = (city) => ({
  title: `Now in ${city}! 🏪`,
  body: `We have opened a new branch in ${city}. Visit us and explore our finest collections.`,
  url: '/branches',
});

// Festive season offer
const push_festiveSeason = () => ({
  title: 'Festive Season is Here! ✨',
  body: 'Discover our latest collections and exclusive festive deals. Hurry — limited stock!',
  url: '/offers',
});

module.exports = {
  websiteLoginOtp,
  websiteNewCustomerGreeting,
  discountApprovalOtp,
  offerCreatedCollection,
  offerCreatedCategory,
  customerPurchase,
  savingSchemeEnrollment,
  schemeDueAmountReminder,
  schemeCompleted,
  googleReview,
  onlineOrderPlaced,
  orderDispatchedTracking,
  orderDelivered,
  newBranchOpening,
  festiveSeason,
  // Push notification templates
  push_customerLogin,
  push_newCustomerGreeting,
  push_adminLogin,
  push_discountApproval,
  push_offerCreatedCollection,
  push_offerCreatedCategory,
  push_customerPurchase,
  push_savingSchemeEnrollment,
  push_schemeDueAmountReminder,
  push_schemeCompleted,
  push_onlineOrderPlaced,
  push_orderDispatched,
  push_orderDelivered,
  push_newBranchOpening,
  push_festiveSeason,
};