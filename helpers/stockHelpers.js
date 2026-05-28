const calculatePurchaseRate = ({
  ratePerGram,
  netWeight,
}) => {
  return parseFloat(ratePerGram || 0) * parseFloat(netWeight || 0);
};


module.exports ={
    calculatePurchaseRate
};