export class ContractTargetError extends Error {
  /**
   * @param {{
   *   feature: string;
   *   contractName: string;
   *   probedPaths: string[];
   *   expectedExports?: string[];
   *   reason?: string;
   * }} details
   */
  constructor({ feature, contractName, probedPaths, expectedExports = [], reason = '' }) {
    const probed = probedPaths.length ? probedPaths.join(', ') : '(none)';
    const msg =
      `[CONTRACT_TARGET_MISSING] Feature ${feature} target "${contractName}" not found or incomplete.` +
      (reason ? ` ${reason}` : '') +
      ` Probed: [${probed}]` +
      (expectedExports.length ? ` Expected exports: [${expectedExports.join(', ')}]` : '');
    super(msg);
    this.name = 'ContractTargetError';
    this.code = 'CONTRACT_TARGET_MISSING';
    this.feature = feature;
    this.contractName = contractName;
    this.probedPaths = probedPaths;
    this.expectedExports = expectedExports;
    this.reason = reason;
  }

  toJSON() {
    return {
      code: this.code,
      feature: this.feature,
      contractName: this.contractName,
      probedPaths: this.probedPaths,
      expectedExports: this.expectedExports,
      reason: this.reason,
      message: this.message,
    };
  }
}

/**
 * @param {unknown} err
 * @returns {err is ContractTargetError}
 */
export function isContractTargetError(err) {
  return Boolean(
    err &&
      typeof err === 'object' &&
      /** @type {any} */ (err).code === 'CONTRACT_TARGET_MISSING',
  );
}

/**
 * Extracts structured diagnostic details from an error (direct or wrapped by node:test).
 * @param {unknown} err
 */
export function extractErrorDiagnostic(err) {
  let cur = err;
  const visited = new Set();
  while (cur && typeof cur === 'object' && !visited.has(cur)) {
    visited.add(cur);
    if (/** @type {any} */ (cur).code === 'CONTRACT_TARGET_MISSING') {
      return {
        code: 'CONTRACT_TARGET_MISSING',
        feature: /** @type {any} */ (cur).feature,
        contractName: /** @type {any} */ (cur).contractName,
        probedPaths: /** @type {any} */ (cur).probedPaths,
        expectedExports: /** @type {any} */ (cur).expectedExports,
        message: /** @type {any} */ (cur).message,
      };
    }
    cur = /** @type {any} */ (cur).cause;
  }
  return {
    code: /** @type {any} */ (err)?.code || 'TEST_FAILURE',
    message: err instanceof Error ? err.message : String(err),
  };
}
