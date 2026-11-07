export function discountCents(subtotal, discount) {
  if (!Number.isSafeInteger(subtotal) || subtotal < 0) throw new Error('Le total dépasse la limite de la démo.');
  if (discount == null) return 0;
  const { type, value } = discount;
  if (!Number.isSafeInteger(value) || value < 0
      || (type === 'percent' ? value > 100 : type !== 'amount' || value > subtotal))
    throw new Error('Indiquez une remise comprise entre zéro et le total du panier.');
  return type === 'percent' ? Math.round(subtotal * (value / 100)) : value;
}
