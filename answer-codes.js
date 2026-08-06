(function registerAnswerCodes(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EGAnswerCodes = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createAnswerCodes() {
  const consentCodes = Object.freeze(["data_use", "model_limitations", "non_medical_use"]);
  const universalCodes = new Map([
    ["是", "yes"],
    ["否", "no"],
    ["不確定", "unknown"],
    ["不清楚", "unknown"],
    ["不記得", "unknown"],
    ["以上皆無", "none"],
    ["不確定肝病種類", "unknown"]
  ]);

  function getOptionCode(question, option) {
    const optionIndex = question.options?.indexOf(option) ?? -1;
    if (optionIndex < 0) return null;
    if (question.id === "consent_acknowledgement") return consentCodes[optionIndex] || null;
    if (question.isSymptomGroup) {
      const definition = question.symptomDefinitions?.find(([label]) => label === option);
      if (definition) return definition[2];
    }
    if (option === question.noneOption) return "none";
    if (option === question.unknownOption) return "unknown";
    if (universalCodes.has(option)) return universalCodes.get(option);
    return `${question.id}.option_${String(optionIndex + 1).padStart(2, "0")}`;
  }

  return Object.freeze({ consentCodes, getOptionCode });
}));
