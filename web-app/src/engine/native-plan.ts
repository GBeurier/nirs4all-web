/** Narrow a native plan to one native-enumerated variant without rounding u64 seeds. */
export function nativePlanForVariant(json: string, variantId: string): string {
  const protectedJson = json.replace(/("(?:seed|root_seed)"\s*:\s*)(\d+)(?=\s*[,}])/g, '$1"__n4a_u64__:$2"')
  const plan = JSON.parse(protectedJson)
  plan.variants = plan.variants.filter((variant: { variant_id: string }) => variant.variant_id === variantId)
  if (plan.variants.length !== 1) throw new Error(`Native variant not found: ${variantId}`)
  return JSON.stringify(plan).replace(/("(?:seed|root_seed)":)"__n4a_u64__:(\d+)"/g, '$1$2')
}
