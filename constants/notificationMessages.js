const websiteLoginOtp = (otp) =>
  `CHNIRA: Dear Customer, ${otp} is your OTP (One Time Password) to authenticate your login to Chaneira Website. Do not share it with anyone.

Thank You,
Team Chaneira Jewels`;



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
};