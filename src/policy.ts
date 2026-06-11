import { catalog } from "./catalog";
import { parse as parseYaml, stringify } from "yaml";
import type {
  Field,
  GenerateRequest,
  GenerateResponse,
  ItemizedValue,
  Section,
  SelectedField
} from "./types";

const distributedTraining = "distributedTraining";
const distributedInference = "distributedInference";
const booleanKeys = new Set([
  "exclude",
  "existingPvc",
  "ephemeral",
  "readOnly",
  "readWriteMany",
  "readWriteOnce",
  "readOnlyMany",
  "userCredential"
]);
const numericKeys = new Set([
  "activationReplicas",
  "concurrencyHardLimit",
  "container",
  "external",
  "factor",
  "failureThreshold",
  "grpcPort",
  "initialDelaySeconds",
  "initialReplicas",
  "initializationTimeoutSeconds",
  "maxReplicas",
  "metricThreshold",
  "metricThresholdPercentage",
  "metricsPort",
  "minReplicas",
  "periodSeconds",
  "port",
  "quantity",
  "requestTimeoutSeconds",
  "runAsGid",
  "runAsUid",
  "scaleDownDelaySeconds",
  "scaleToZeroRetentionSeconds",
  "scaleWindowSeconds",
  "seconds",
  "sizeLimit",
  "successThreshold",
  "timeoutSeconds",
  "workers"
]);
const stringKeys = new Set([
  "accessKeySecret",
  "authorizationType",
  "branch",
  "bucket",
  "claimName",
  "configMap",
  "defaultMode",
  "description",
  "effect",
  "id",
  "key",
  "medium",
  "migProfile",
  "mountPath",
  "mountPropagation",
  "name",
  "operator",
  "passwordSecret",
  "path",
  "protocol",
  "repository",
  "resource",
  "revision",
  "secretKeyOfAccessKeyId",
  "secretKeyOfSecretKey",
  "secretKeyOfUser",
  "secret",
  "secretName",
  "server",
  "serviceType",
  "size",
  "storageClass",
  "subPath",
  "toolName",
  "toolType",
  "url",
  "username",
  "values",
  "volumeMode",
  "value"
]);
const keyAliases = new Map([
  ["activationreplicas", "activationReplicas"],
  ["claimname", "claimName"],
  ["concurrencyhardlimit", "concurrencyHardLimit"],
  ["emptydir", "emptyDirVolume"],
  ["emptydirvolume", "emptyDirVolume"],
  ["gpudevicerequest", "gpuDevicesRequest"],
  ["gpudevicesrequest", "gpuDevicesRequest"],
  ["initialreplicas", "initialReplicas"],
  ["maxreplicas", "maxReplicas"],
  ["metric-threshold", "metricThreshold"],
  ["metricthreshold", "metricThreshold"],
  ["metricthresholdpercentage", "metricThresholdPercentage"],
  ["minreplicas", "minReplicas"],
  ["mount", "mountPath"],
  ["mount-propagation", "mountPropagation"],
  ["mountpath", "mountPath"],
  ["nfsserver", "server"],
  ["readonly", "readOnly"],
  ["readwritemany", "readWriteMany"],
  ["readwriteonce", "readWriteOnce"],
  ["readonlymany", "readOnlyMany"],
  ["scaledowndelayseconds", "scaleDownDelaySeconds"],
  ["scaletozeroretentionseconds", "scaleToZeroRetentionSeconds"],
  ["scalewindowseconds", "scaleWindowSeconds"],
  ["secretkeyofuser", "secretKeyOfUser"],
  ["service-type", "serviceType"],
  ["storageclass", "storageClass"],
  ["terminateafterpreemption", "terminateAfterPreemtpion"],
  ["terminateafterpreemtpion", "terminateAfterPreemtpion"],
  ["tool-name", "toolName"],
  ["tool-type", "toolType"]
]);
const ruleAliases = new Map([
  ["attributerules", "attributeRules"],
  ["attribute-rules", "attributeRules"],
  ["attribute_rules", "attributeRules"],
  ["canadd", "canAdd"],
  ["can-add", "canAdd"],
  ["can_add", "canAdd"],
  ["canedit", "canEdit"],
  ["can-edit", "canEdit"],
  ["can_edit", "canEdit"],
  ["defaultfrom", "defaultFrom"],
  ["default-from", "defaultFrom"],
  ["default_from", "defaultFrom"],
  ["locked", "locked"],
  ["max", "max"],
  ["min", "min"],
  ["options", "options"],
  ["required", "required"],
  ["step", "step"]
]);

function normalizeKey(key: string) {
  return key
    .split(".")
    .map((part) => keyAliases.get(part.toLowerCase()) ?? part)
    .join(".");
}

function normalizeRuleId(ruleId: string) {
  const trimmed = ruleId.trim();
  return ruleAliases.get(trimmed.toLowerCase()) ?? trimmed;
}

function supports(items: string[], target: string) {
  return items.includes(target);
}

function selectedValueForField(selectedFields: SelectedField[], fieldId: string) {
  return selectedFields.find((selected) => selected.fieldId === fieldId)?.value;
}

function fieldMatchesDependencies(field: Field, selectedFields: SelectedField[]) {
  if (!field.dependsOn?.length) {
    return true;
  }

  return field.dependsOn.every((dependency) => {
    const selectedValue = selectedValueForField(selectedFields, dependency.fieldId);

    if (typeof selectedValue !== "string") {
      return false;
    }

    return dependency.values.includes(selectedValue);
  });
}

function dependencyWarning(field: Field) {
  const dependencies = field.dependsOn
    ?.map((dependency) => {
      const dependencyField = catalog.fields.find((item) => item.id === dependency.fieldId);
      const label = dependencyField?.label ?? dependency.fieldId;
      return `${label} ${dependency.values.join(" or ")}`;
    })
    .join(", ");

  return `${field.label} requires ${dependencies}.`;
}

function isEmptyValue(value: SelectedField["value"]) {
  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  if (typeof value === "object" && value !== null) {
    return value.instances.length === 0 && value.attributes.length === 0;
  }

  return value === undefined || value === null;
}

function isItemizedValue(value: SelectedField["value"]): value is ItemizedValue {
  return typeof value === "object" && value !== null && "instances" in value && "attributes" in value;
}

function parseScalar(value: string) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["'](.*)["']$/, "$1");

  if (unquoted === "true") {
    return true;
  }

  if (unquoted === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }

  return unquoted;
}

function parseKeyedScalar(key: string, value: string) {
  const keyParts = key.split(".");
  const leafKey = keyParts[keyParts.length - 1] ?? key;
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["'](.*)["']$/, "$1");

  if (stringKeys.has(leafKey)) {
    return unquoted;
  }

  if (booleanKeys.has(leafKey) && (unquoted === "true" || unquoted === "false")) {
    return unquoted === "true";
  }

  if (numericKeys.has(leafKey) && /^-?\d+(\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }

  return unquoted;
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNestedValue(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[part];
  }, source);
}

function looksLikeStructuredObject(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("-") || /^[\w.-]+:\s/m.test(trimmed);
}

function expandDottedKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(expandDottedKeys);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.entries(value).reduce<Record<string, unknown>>((expanded, [key, entryValue]) => {
    const normalizedKey = normalizeKey(key);
    const normalizedValue = expandDottedKeys(entryValue);

    if (normalizedKey.includes(".")) {
      setNestedValue(expanded, normalizedKey, normalizedValue);
      return expanded;
    }

    expanded[normalizedKey] = normalizedValue;
    return expanded;
  }, {});
}

function parseStructuredFieldValue(value: SelectedField["value"], field: Field) {
  if (Array.isArray(value) || typeof value !== "string" || !looksLikeStructuredObject(value)) {
    return null;
  }

  try {
    const parsed = expandDottedKeys(parseYaml(value));

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (!isRecord(parsed)) {
      return null;
    }

    const defaults = isRecord(parsed.defaults) ? parsed.defaults : null;
    const fromDefaults = defaults ? getNestedValue(defaults, field.yamlPath) : undefined;

    if (fromDefaults !== undefined) {
      return fromDefaults;
    }

    const fromFieldPath = getNestedValue(parsed, field.yamlPath);

    if (fromFieldPath !== undefined) {
      return fromFieldPath;
    }

    return parsed;
  } catch {
    return null;
  }
}

function parseStructuredObject(value: SelectedField["value"], field: Field) {
  const parsed = parseStructuredFieldValue(value, field);
  return isRecord(parsed) ? parsed : null;
}

function parseKeyValuePairs(value: string) {
  const parsed: Record<string, unknown> = {};
  const chunks = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  chunks.forEach((chunk) => {
    const separator = chunk.includes("=")
      ? "="
      : chunk.includes(":") && !/^[a-z][a-z0-9+.-]*:\/\//i.test(chunk)
        ? ":"
        : "";

    if (!separator) {
      return;
    }

    const [rawKey, ...rawValueParts] = chunk.split(separator);
    const key = normalizeKey(rawKey.trim());
    const rawValue = rawValueParts.join(separator).trim();

    if (key && rawValue) {
      setNestedValue(parsed, key, parseKeyedScalar(key, rawValue));
    }
  });

  return parsed;
}

function splitDelimitedValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [];
  }

  return value
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeNodeAffinityExpression(value: Record<string, unknown>) {
  const key = typeof value.key === "string" ? value.key.trim() : "";
  const operator = typeof value.operator === "string" ? value.operator.trim() : "";

  if (!key || !operator) {
    return null;
  }

  const expression: Record<string, unknown> = {
    key,
    operator
  };
  const values = splitDelimitedValues(value.values);

  if (values.length > 0) {
    expression.values = values;
  }

  return expression;
}

function normalizeNodeAffinityDefault(value: Record<string, unknown>) {
  if ("nodeSelectorTerms" in value) {
    return value;
  }

  const expression = normalizeNodeAffinityExpression(value);

  if (!expression) {
    return value;
  }

  return {
    nodeSelectorTerms: [
      {
        matchExpressions: [expression]
      }
    ]
  };
}

function normalizeNodeAffinityDefaultFromInput(value: SelectedField["value"]) {
  const structured = parseStructuredObject(value, {
    id: "nodeAffinityRequired",
    yamlPath: "nodeAffinityRequired"
  } as Field);

  if (structured) {
    return normalizeNodeAffinityDefault(structured);
  }

  const rawLines = Array.isArray(value) ? value.map(String) : String(value).split("\n");
  const expressions = rawLines
    .map((line) => parseKeyValuePairs(line))
    .map((parsed) => normalizeNodeAffinityExpression(parsed))
    .filter((expression): expression is Record<string, unknown> => expression !== null);

  if (expressions.length === 0) {
    return null;
  }

  return {
    nodeSelectorTerms: [
      {
        matchExpressions: expressions
      }
    ]
  };
}

function normalizeProbeDefault(value: Record<string, unknown>) {
  const normalized = { ...value };

  ["readiness", "liveness", "startup"].forEach((probeName) => {
    const rawProbe = normalized[probeName];

    if (typeof rawProbe !== "object" || rawProbe === null || Array.isArray(rawProbe)) {
      return;
    }

    const probe = { ...(rawProbe as Record<string, unknown>) };
    const rawHttpGet =
      typeof probe.httpGet === "object" && probe.httpGet !== null && !Array.isArray(probe.httpGet)
        ? { ...(probe.httpGet as Record<string, unknown>) }
        : {};
    const rawHandler =
      typeof probe.handler === "object" && probe.handler !== null && !Array.isArray(probe.handler)
        ? { ...(probe.handler as Record<string, unknown>) }
        : {};
    const handlerHttpGet =
      typeof rawHandler.httpGet === "object" &&
      rawHandler.httpGet !== null &&
      !Array.isArray(rawHandler.httpGet)
        ? { ...(rawHandler.httpGet as Record<string, unknown>) }
        : {};
    const httpGet = { ...handlerHttpGet, ...rawHttpGet };

    ["path", "port", "host", "scheme"].forEach((key) => {
      if (key in probe) {
        httpGet[key] = probe[key];
        delete probe[key];
      }
    });

    delete probe.httpGet;

    if (Object.keys(httpGet).length > 0) {
      rawHandler.httpGet = httpGet;
      probe.handler = rawHandler;
    }

    normalized[probeName] = probe;
  });

  return normalized;
}

function parseTolerationShortcut(value: string) {
  const match = value.trim().match(/^([^=:\s]+)=([^:]+):([^:]+)$/);

  if (!match) {
    return null;
  }

  const [, key, rawValue, effect] = match;

  return {
    key,
    operator: "Equal",
    value: rawValue.trim(),
    effect: effect.trim()
  };
}

function parseValidItemizedInstance(value: string, field: Field) {
  if (field.id === "tolerations") {
    const toleration = parseTolerationShortcut(value);

    if (toleration) {
      return toleration;
    }
  }

  const parsed = parseKeyValuePairs(value);

  if (Object.keys(parsed).length > 0) {
    normalizeItemizedInstance(field, parsed);

    const hasRequiredKeys = field.itemRequiredKeys?.every((key) => key in parsed) ?? true;
    const hasRequiredAnyKeys =
      field.itemRequiredAnyKeys === undefined ||
      field.itemRequiredAnyKeys.some((key) => key in parsed);

    if (!hasRequiredKeys) {
      return null;
    }

    if (!hasRequiredAnyKeys) {
      return null;
    }

    return parsed;
  }

  if (field.itemKey) {
    return { [field.itemKey]: value.trim() };
  }

  return null;
}

function normalizeItemizedInstance(field: Field, instance: Record<string, unknown>) {
  if (field.id === "ports") {
    const container = instance.container;

    if (
      typeof container === "object" &&
      container !== null &&
      !Array.isArray(container) &&
      "port" in container
    ) {
      const port = (container as Record<string, unknown>).port;
      instance.container =
        typeof port === "number" || (typeof port === "string" && /^-?\d+(\.\d+)?$/.test(port.trim()))
          ? Number(port)
          : port;
    } else if (typeof container === "string" && /^-?\d+(\.\d+)?$/.test(container.trim())) {
      instance.container = Number(container);
    }

    if ("toolType" in instance) {
      delete instance.serviceType;
    }
  }

  if (field.id === "storageSecretVolume" && "secretName" in instance && !("secret" in instance)) {
    instance.secret = instance.secretName;
    delete instance.secretName;
  }

  if (field.id === "storageEmptyDir" && "mountPath" in instance && !("path" in instance)) {
    instance.path = instance.mountPath;
    delete instance.mountPath;
  }

  return instance;
}

function parseItemizedAttributes(values: string[]) {
  return values.reduce<Record<string, unknown>>((attributes, value) => {
    return {
      ...attributes,
      ...parseKeyValuePairs(value)
    };
  }, {});
}

function normalizeItemizedStructuredAttributes(value: unknown) {
  if (Array.isArray(value)) {
    return value.reduce<Record<string, unknown>>((attributes, item) => {
      return isRecord(item) ? { ...attributes, ...item } : attributes;
    }, {});
  }

  return isRecord(value) ? value : {};
}

function itemizedSection(source: Record<string, unknown>, sectionName: "attributes" | "instances") {
  const match = Object.entries(source).find(([key]) => key.toLowerCase() === sectionName);
  return match?.[1];
}

function renderStructuredItemizedValue(field: Field, value: ItemizedValue) {
  const candidates = [
    ...value.instances.filter((item) => looksLikeStructuredObject(item)),
    ...value.attributes.filter((item) => looksLikeStructuredObject(item))
  ];

  for (const candidate of candidates) {
    const structured = parseStructuredObject(candidate, field);

    if (!structured) {
      continue;
    }

    const rawInstances = itemizedSection(structured, "instances");
    const rawAttributes = itemizedSection(structured, "attributes");
    const instances = Array.isArray(rawInstances)
      ? rawInstances.filter((instance): instance is Record<string, unknown> => isRecord(instance))
          .map((instance) => normalizeItemizedInstance(field, { ...instance }))
      : [];
    const attributes = normalizeItemizedStructuredAttributes(rawAttributes);
    const payload: Record<string, unknown> = {};

    if (instances.length > 0) {
      payload.instances = instances;
    }

    if (Object.keys(attributes).length > 0) {
      payload.attributes = attributes;
    }

    if (Object.keys(payload).length > 0) {
      return payload;
    }
  }

  return null;
}

function renderItemizedValue(field: Field, value: ItemizedValue) {
  const structured = renderStructuredItemizedValue(field, value);

  if (structured) {
    return structured;
  }

  const payload: Record<string, unknown> = {};

  if (value.instances.length > 0) {
    const instances = value.instances
      .map((instance) => parseValidItemizedInstance(instance, field))
      .filter((instance): instance is Record<string, unknown> => instance !== null);

    if (instances.length > 0) {
      payload.instances = instances;
    }
  }

  if (value.attributes.length > 0) {
    const attributes = parseItemizedAttributes(value.attributes);

    if (Object.keys(attributes).length > 0) {
      payload.attributes = attributes;
    }
  }

  return payload;
}

function normalizeObjectDefault(field: Field, workloadType: string, value: Record<string, unknown>) {
  if (field.id === "nodeAffinityRequired") {
    return normalizeNodeAffinityDefault(value);
  }

  if (field.id === "probes") {
    return normalizeProbeDefault(value);
  }

  if (workloadType === "nim" && field.id === "servingPort") {
    const normalized = { ...value };
    const container = normalized.container;

    if (
      typeof container === "object" &&
      container !== null &&
      !Array.isArray(container) &&
      "port" in container &&
      !("port" in normalized)
    ) {
      normalized.port = (container as Record<string, unknown>).port;
      delete normalized.container;
    }

    return normalized;
  }

  return value;
}

function objectArrayItems(value: SelectedField["value"]) {
  if (Array.isArray(value)) {
    return value.map(String);
  }

  const rawValue = String(value).trim();

  if (!rawValue) {
    return [];
  }

  if (rawValue.includes("\n")) {
    return rawValue
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (hasParsedPairs(rawValue)) {
    return [rawValue];
  }

  return splitList(rawValue);
}

function renderStructuredArrayDefault(field: Field, value: SelectedField["value"]) {
  const structured = parseStructuredFieldValue(value, field);
  return Array.isArray(structured) ? structured : null;
}

function renderStructuredObjectArrayDefault(field: Field, value: SelectedField["value"]) {
  const structured = parseStructuredFieldValue(value, field);

  if (Array.isArray(structured)) {
    const items = structured
      .map((item) => {
        if (isRecord(item)) {
          return item;
        }

        if (typeof item === "string" && item.trim()) {
          return { name: item.trim() };
        }

        return null;
      })
      .filter((item): item is Record<string, unknown> => item !== null);

    return items.length > 0 ? items : null;
  }

  return isRecord(structured) ? [structured] : null;
}

function renderObjectArrayDefault(field: Field, value: SelectedField["value"]) {
  const structured = renderStructuredObjectArrayDefault(field, value);

  if (structured) {
    return structured;
  }

  const items = objectArrayItems(value)
    .map((item) => {
      const parsed = parseKeyValuePairs(item);

      if (Object.keys(parsed).length > 0) {
        return parsed;
      }

      return { name: item.trim() };
    })
    .filter((item) => Object.keys(item).length > 0);

  return items.length > 0 ? items : null;
}

function renderScalarDefaultValue(field: Field, value: SelectedField["value"]) {
  if (typeof value !== "string") {
    return value;
  }

  const structured = parseStructuredFieldValue(value, field);

  if (
    structured !== null &&
    structured !== undefined &&
    !isRecord(structured) &&
    !Array.isArray(structured)
  ) {
    return structured;
  }

  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["'](.*)["']$/, "$1");

  if ((field.valueType === "integer" || field.valueType === "number") && /^-?\d+(\.\d+)?$/.test(unquoted)) {
    return Number(unquoted);
  }

  if (field.valueType === "boolean" && (unquoted === "true" || unquoted === "false")) {
    return unquoted === "true";
  }

  return unquoted;
}

function renderDefaultValue(field: Field, value: SelectedField["value"], workloadType: string) {
  if (isItemizedValue(value)) {
    return renderItemizedValue(field, value);
  }

  if (field.valueType === "array") {
    const structured = renderStructuredArrayDefault(field, value);

    if (structured) {
      return structured;
    }

    return Array.isArray(value) ? value : splitList(String(value));
  }

  if (field.valueType === "objectArray") {
    const rendered = renderObjectArrayDefault(field, value);

    if (field.id === "imagePullSecrets" && rendered) {
      return { instances: rendered };
    }

    return rendered;
  }

  if (field.valueType === "object") {
    if (field.id === "nodeAffinityRequired") {
      return normalizeNodeAffinityDefaultFromInput(value);
    }

    const structured = parseStructuredObject(value, field);

    if (structured) {
      return normalizeObjectDefault(field, workloadType, structured);
    }

    if (Array.isArray(value)) {
      const rendered = value.reduce<Record<string, unknown>>((payload, item) => {
        return {
          ...payload,
          ...parseKeyValuePairs(item)
        };
      }, {});

      return Object.keys(rendered).length > 0 ? normalizeObjectDefault(field, workloadType, rendered) : null;
    }

    const rendered = parseKeyValuePairs(String(value));
    return Object.keys(rendered).length > 0 ? normalizeObjectDefault(field, workloadType, rendered) : null;
  }

  return renderScalarDefaultValue(field, value);
}

function isRenderableDefault(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }

  return true;
}

function hasParsedPairs(value: string) {
  return Object.keys(parseKeyValuePairs(value)).length > 0;
}

function activeSettingEntries(settings: SelectedField["settings"]) {
  return Object.entries(settings)
    .map(([settingId, value]) => [normalizeRuleId(settingId), value] as const)
    .filter(([, value]) => {
      if (typeof value === "string") {
        return value.trim() !== "";
      }

      return value !== undefined && value !== null;
    });
}

function supportedSettingEntries(field: Field, settings: SelectedField["settings"]) {
  const supportedIds = new Set(field.settingsSchema?.map((setting) => setting.id) ?? []);
  return activeSettingEntries(settings).filter(([settingId]) => supportedIds.has(settingId));
}

function unsupportedSettingEntries(field: Field, settings: SelectedField["settings"]) {
  const supportedIds = new Set(field.settingsSchema?.map((setting) => setting.id) ?? []);
  return activeSettingEntries(settings).filter(([settingId]) => !supportedIds.has(settingId));
}

function numericSetting(settings: SelectedField["settings"], settingId: string) {
  const value = settings[settingId];

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

function stepExceedsMinMaxRange(field: Field, settings: SelectedField["settings"]) {
  if (field.valueType !== "integer" && field.valueType !== "number") {
    return false;
  }

  const step = numericSetting(settings, "step");
  const min = numericSetting(settings, "min");
  const max = numericSetting(settings, "max");

  return step !== null && min !== null && max !== null && step > max - min;
}

function inputWarningsForField(field: Field, selected: SelectedField) {
  const warnings: string[] = [];

  if (field.valueType === "object" && !isEmptyValue(selected.value)) {
    const rawValues = Array.isArray(selected.value) ? selected.value : [String(selected.value)];
    const hasUnparsedValue = rawValues.some((value) => value.trim() !== "" && !hasParsedPairs(value));

    if (hasUnparsedValue) {
      warnings.push(`${field.label} expects key=value entries, for example ${field.placeholder ?? `${field.yamlPath}.key=value`}.`);
    }
  }

  if (field.valueType === "itemized" && isItemizedValue(selected.value)) {
    const bareInstances = selected.value.instances.filter((instance) => !hasParsedPairs(instance));
    const bareAttributes = selected.value.attributes.filter((attribute) => !hasParsedPairs(attribute));

    if (bareInstances.length > 0 && !field.itemKey) {
      warnings.push(`${field.label} instances should use key=value entries.`);
    }

    if (field.itemRequiredKeys) {
      const missingRequiredKeys = selected.value.instances.some((instance) => {
        const parsed = parseKeyValuePairs(instance);
        return Object.keys(parsed).length > 0 && !field.itemRequiredKeys?.every((key) => key in parsed);
      });

      if (missingRequiredKeys) {
        warnings.push(`${field.label} instances should include ${field.itemRequiredKeys.join(" and ")}.`);
      }
    }

    if (field.itemRequiredAnyKeys) {
      const missingRequiredAnyKeys = selected.value.instances.some((instance) => {
        const parsed = parseKeyValuePairs(instance);
        return (
          Object.keys(parsed).length > 0 &&
          !field.itemRequiredAnyKeys?.some((key) => key in parsed)
        );
      });

      if (missingRequiredAnyKeys) {
        warnings.push(`${field.label} instances should include one of ${field.itemRequiredAnyKeys.join(", ")}.`);
      }
    }

    if (bareAttributes.length > 0) {
      warnings.push(`${field.label} attributes should use key=value entries.`);
    }
  }

  return warnings;
}

function isValidAttributeRuleLine(line: string) {
  const separatorIndex = line.search(/[=:]/);

  if (separatorIndex < 0) {
    return false;
  }

  const target = line.slice(0, separatorIndex).trim();
  const rawValue = line.slice(separatorIndex + 1).trim();
  const lastDotIndex = target.lastIndexOf(".");

  return rawValue !== "" && lastDotIndex > 0 && lastDotIndex < target.length - 1;
}

function settingWarningsForField(field: Field, selected: SelectedField) {
  const warnings: string[] = [];

  unsupportedSettingEntries(field, selected.settings).forEach(([settingId]) => {
    warnings.push(`${field.label} does not support the ${settingId} rule.`);
  });

  supportedSettingEntries(field, selected.settings).forEach(([settingId, value]) => {
    if (settingId === "defaultFrom" && typeof value === "string") {
      const structured = parseStructuredRuleValue(value, field, undefined, settingId);
      const structuredIsValid = isRecord(structured) && "field" in structured;
      const parsed = parseKeyValuePairs(value);

      if (!structuredIsValid && Object.keys(parsed).length > 0 && !("field" in parsed)) {
        warnings.push(`${field.label} defaultFrom should include field=...`);
      }
    }

    if (settingId === "attributeRules" && typeof value === "string") {
      if (parseStructuredItemizedRules(value, field)) {
        return;
      }

      const hasMalformedLine = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .some((line) => !isValidAttributeRuleLine(line));

      if (hasMalformedLine) {
        warnings.push(`${field.label} attributeRules should use attribute.rule=value entries.`);
      }
    }
  });

  if (stepExceedsMinMaxRange(field, selected.settings)) {
    warnings.push(`${field.label} step must not exceed the min/max range.`);
  }

  return warnings;
}

function parseOptionValue(value: string, field?: Field, key?: string) {
  const trimmed = value.trim();
  const unquoted = trimmed.replace(/^["'](.*)["']$/, "$1");
  const keyParts = key?.split(".") ?? [];
  const leafKey = keyParts[keyParts.length - 1] ?? "";

  if (leafKey && stringKeys.has(leafKey)) {
    return unquoted;
  }

  if (
    (field?.valueType === "integer" || field?.valueType === "number") &&
    /^-?\d+(\.\d+)?$/.test(unquoted)
  ) {
    return Number(unquoted);
  }

  if (field?.valueType === "boolean" && (unquoted === "true" || unquoted === "false")) {
    return unquoted === "true";
  }

  return unquoted;
}

function parseStructuredRuleValue(
  rawValue: string,
  field: Field,
  key: string | undefined,
  settingId: string
) {
  if (!looksLikeStructuredObject(rawValue)) {
    return null;
  }

  try {
    const parsed = expandDottedKeys(parseYaml(rawValue));

    if (Array.isArray(parsed)) {
      return settingId === "options" ? parsed : null;
    }

    if (!isRecord(parsed)) {
      return null;
    }

    const candidates = [
      isRecord(parsed.rules) ? getNestedValue(parsed.rules, field.yamlPath) : undefined,
      getNestedValue(parsed, field.yamlPath),
      key ? getNestedValue(parsed, key) : undefined,
      parsed
    ];

    for (const candidate of candidates) {
      if (isRecord(candidate) && settingId in candidate) {
        return candidate[settingId];
      }
    }

    return null;
  } catch {
    return null;
  }
}

function renderOptionsRule(value: string | number | boolean, field?: Field, key?: string) {
  const rawValue = String(value).trim();
  const structured = field ? parseStructuredRuleValue(rawValue, field, key, "options") : null;

  if (Array.isArray(structured)) {
    return structured
      .map((option) => {
        if (isRecord(option) && "value" in option) {
          return {
            value:
              typeof option.value === "string"
                ? parseOptionValue(option.value, field, key)
                : option.value
          };
        }

        if (typeof option === "string" || typeof option === "number" || typeof option === "boolean") {
          return {
            value: parseOptionValue(String(option), field, key)
          };
        }

        return null;
      })
      .filter((option): option is { value: unknown } => option !== null);
  }

  const optionItems =
    rawValue.includes("\n") || /\bvalue\s*[=:]/.test(rawValue)
      ? rawValue
          .split("\n")
          .map((option) => option.trim())
          .filter(Boolean)
      : splitList(rawValue);

  return optionItems.map((option) => {
    const parsed = parseKeyValuePairs(option);

    if (Object.keys(parsed).length > 0) {
      if ("value" in parsed) {
        return {
          value:
            typeof parsed.value === "string"
              ? parseOptionValue(parsed.value, field, key)
              : parsed.value
        };
      }
    }

    return {
      value: parseOptionValue(option, field, key)
    };
  });
}

function renderDefaultFromRule(value: string | number | boolean) {
  const rawValue = String(value).trim();
  const parsed = parseKeyValuePairs(rawValue);

  if (Object.keys(parsed).length > 0) {
    return parsed;
  }

  return { field: rawValue };
}

function renderScalarRule(settingId: string, value: string | number | boolean, field?: Field, key?: string) {
  const structured =
    typeof value === "string" && field
      ? parseStructuredRuleValue(value, field, key, settingId)
      : null;

  if (settingId === "options") {
    return renderOptionsRule(value, field, key);
  }

  if (settingId === "defaultFrom") {
    if (structured !== null && structured !== undefined) {
      return structured;
    }

    return renderDefaultFromRule(value);
  }

  if (field?.valueType === "quantity" && (settingId === "min" || settingId === "max")) {
    if (structured !== null && structured !== undefined) {
      return String(structured).trim().replace(/^["'](.*)["']$/, "$1");
    }

    return String(value).trim().replace(/^["'](.*)["']$/, "$1");
  }

  if (structured !== null && structured !== undefined) {
    return structured;
  }

  return typeof value === "string" ? parseScalar(value) : value;
}

function mergeRuleValue(target: Record<string, unknown>, key: string, value: unknown) {
  const current = target[key];

  if (Array.isArray(current) && Array.isArray(value)) {
    target[key] = [...current, ...value];
    return;
  }

  target[key] = value;
}

function getOrCreateNestedRecord(target: Record<string, unknown>, path: string) {
  const parts = path.split(".");
  let cursor = target;

  parts.forEach((part) => {
    const current = cursor[part];
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      cursor[part] = {};
    }

    cursor = cursor[part] as Record<string, unknown>;
  });

  return cursor;
}

function parseAttributeRules(value: string) {
  const attributes: Record<string, Record<string, unknown>> = {};

  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (!isValidAttributeRuleLine(line)) {
        return;
      }

      const separatorIndex = line.search(/[=:]/);
      const target = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      const lastDotIndex = target.lastIndexOf(".");
      const attributeName = normalizeKey(target.slice(0, lastDotIndex));
      const ruleId = normalizeRuleId(target.slice(lastDotIndex + 1));
      const renderedRule = renderScalarRule(ruleId, rawValue, undefined, attributeName);
      const attributeRules = getOrCreateNestedRecord(attributes, attributeName);

      mergeRuleValue(attributeRules, ruleId, renderedRule);
    });

  return attributes;
}

function parseStructuredItemizedRules(value: string, field: Field) {
  if (!looksLikeStructuredObject(value)) {
    return null;
  }

  try {
    const parsed = expandDottedKeys(parseYaml(value));

    if (!isRecord(parsed)) {
      return null;
    }

    const candidates = [
      isRecord(parsed.rules) ? getNestedValue(parsed.rules, field.yamlPath) : undefined,
      getNestedValue(parsed, field.yamlPath),
      parsed
    ];

    for (const candidate of candidates) {
      if (!isRecord(candidate)) {
        continue;
      }

      const rawInstances = itemizedSection(candidate, "instances");
      const rawAttributes = itemizedSection(candidate, "attributes");
      const rules: Record<string, unknown> = {};

      if (isRecord(rawInstances)) {
        rules.instances = rawInstances;
      }

      if (isRecord(rawAttributes)) {
        rules.attributes = rawAttributes;
      }

      if (Object.keys(rules).length > 0) {
        return rules;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function renderRulesForField(field: Field, settings: SelectedField["settings"]) {
  const activeRules = supportedSettingEntries(field, settings).filter(
    ([settingId]) => settingId !== "step" || !stepExceedsMinMaxRange(field, settings)
  );

  if (field.valueType !== "itemized") {
    return Object.fromEntries(
      activeRules.map(([settingId, value]) => [settingId, renderScalarRule(settingId, value, field)])
    );
  }

  const instances: Record<string, unknown> = {};
  const attributes: Record<string, Record<string, unknown>> = {};

  activeRules.forEach(([settingId, value]) => {
    if (typeof value === "string") {
      const structuredRules = parseStructuredItemizedRules(value, field);

      if (structuredRules) {
        const structuredInstances = isRecord(structuredRules.instances) ? structuredRules.instances : {};
        const structuredAttributes = isRecord(structuredRules.attributes) ? structuredRules.attributes : {};

        Object.assign(instances, structuredInstances);
        Object.entries(structuredAttributes).forEach(([attributeName, rules]) => {
          if (isRecord(rules)) {
            attributes[normalizeKey(attributeName)] = {
              ...(attributes[normalizeKey(attributeName)] ?? {}),
              ...rules
            };
          }
        });
        return;
      }
    }

    if (settingId === "locked") {
      if (typeof value !== "string") {
        return;
      }

      const locked = splitList(String(value));
      if (locked.length > 0) {
        instances.locked = locked;
      }
      return;
    }

    if (settingId === "attributeRules") {
      Object.entries(parseAttributeRules(String(value))).forEach(([attributeName, rules]) => {
        attributes[attributeName] = {
          ...(attributes[attributeName] ?? {}),
          ...rules
        };
      });
      return;
    }

    instances[settingId] = typeof value === "string" ? parseScalar(value) : value;
  });

  return {
    ...(Object.keys(instances).length > 0 ? { instances } : {}),
    ...(Object.keys(attributes).length > 0 ? { attributes } : {})
  };
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target;

  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }

    const current = cursor[part];
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      cursor[part] = {};
    }

    cursor = cursor[part] as Record<string, unknown>;
  });
}

function uniqueWarnings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function normalizeImposedAssets(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function workloadLabel(workloadType: string) {
  return catalog.workloadTypes.find((item) => item.id === workloadType)?.label ?? workloadType;
}

function placementFor(field: Field, workloadType: string) {
  return field.scopeByWorkload?.[workloadType] ?? "top-level";
}

function scopesFor(workloadType: string, scope?: string) {
  if (workloadType === distributedTraining) {
    if (scope === "master" || scope === "worker") {
      return [scope];
    }

    return ["master", "worker"];
  }

  if (workloadType === distributedInference) {
    if (scope === "leader" || scope === "worker") {
      return [scope];
    }

    return ["leader", "worker"];
  }

  return [];
}

function renderedRuleCountForField(field: Field, activeRules: Record<string, unknown>) {
  if (field.valueType !== "itemized") {
    return Object.keys(activeRules).length;
  }

  const instanceRules =
    typeof activeRules.instances === "object" &&
    activeRules.instances !== null &&
    !Array.isArray(activeRules.instances)
      ? Object.keys(activeRules.instances).length
      : 0;
  const attributeRules =
    typeof activeRules.attributes === "object" &&
    activeRules.attributes !== null &&
    !Array.isArray(activeRules.attributes)
      ? Object.values(activeRules.attributes).reduce((count, rules) => {
          return (
            count +
            (typeof rules === "object" && rules !== null && !Array.isArray(rules)
              ? Object.keys(rules).length
              : 0)
          );
        }, 0)
      : 0;

  return instanceRules + attributeRules;
}

function hasLockedImageDefault(defaults: Record<string, unknown>, rules: Record<string, unknown>): boolean {
  const image = typeof defaults.image === "string" ? defaults.image.trim() : "";
  const imageRules = isRecord(rules.image) ? rules.image : null;

  if (image && imageRules?.canEdit === false) {
    return true;
  }

  return Object.entries(defaults).some(([scope, scopedDefaults]) => {
    const scopedRules = rules[scope];
    return isRecord(scopedDefaults) && isRecord(scopedRules) && hasLockedImageDefault(scopedDefaults, scopedRules);
  });
}

function optionRuleValues(rule: unknown) {
  if (!isRecord(rule) || !Array.isArray(rule.options)) {
    return [];
  }

  return rule.options
    .map((option) => (isRecord(option) && typeof option.value === "string" ? option.value.trim() : ""))
    .filter(Boolean);
}

function hasSingleOptionRule(rule: unknown, expectedValue: string) {
  const values = optionRuleValues(rule);
  return values.length === 1 && values[0] === expectedValue;
}

function gpuFractionWarningsForCompute(compute: unknown, computeRules: unknown) {
  const warnings: string[] = [];

  if (!isRecord(compute)) {
    return warnings;
  }

  const gpuRequestType = typeof compute.gpuRequestType === "string" ? compute.gpuRequestType : "";
  const gpuRequestTypeRule = isRecord(computeRules) ? computeRules.gpuRequestType : undefined;
  const hasPortionDefault = compute.gpuPortionRequest !== undefined || compute.gpuPortionLimit !== undefined;
  const hasMemoryDefault = compute.gpuMemoryRequest !== undefined || compute.gpuMemoryLimit !== undefined;

  if (hasPortionDefault && (gpuRequestType !== "portion" || !hasSingleOptionRule(gpuRequestTypeRule, "portion"))) {
    warnings.push(
      "GPU portion defaults require GPU Request Type to default to portion with options limited to portion."
    );
  }

  if (hasMemoryDefault && (gpuRequestType !== "memory" || !hasSingleOptionRule(gpuRequestTypeRule, "memory"))) {
    warnings.push(
      "GPU memory defaults require GPU Request Type to default to memory with options limited to memory."
    );
  }

  return warnings;
}

function crossFieldWarnings(defaults: Record<string, unknown>, rules: Record<string, unknown>, workloadType: string) {
  const warnings: string[] = [];
  const autoscaling = defaults.autoscaling;

  if (hasLockedImageDefault(defaults, rules)) {
    warnings.push("Image canEdit=false can prevent templates with a different image from being selected.");
  }

  warnings.push(...gpuFractionWarningsForCompute(defaults.compute, rules.compute));

  Object.entries(defaults).forEach(([scope, scopedDefaults]) => {
    if (!isRecord(scopedDefaults)) {
      return;
    }

    const scopedRules = rules[scope];
    warnings.push(...gpuFractionWarningsForCompute(scopedDefaults.compute, isRecord(scopedRules) ? scopedRules.compute : undefined));
  });

  if (!isRecord(autoscaling)) {
    return warnings;
  }

  const metric = typeof autoscaling.metric === "string" ? autoscaling.metric.trim() : "";
  const hasMetricThreshold =
    autoscaling.metricThreshold !== undefined &&
    autoscaling.metricThreshold !== null &&
    String(autoscaling.metricThreshold).trim() !== "";

  if (metric && !hasMetricThreshold) {
    warnings.push("autoscaling.metricThreshold is mandatory when autoscaling.metric is specified.");
  }

  if (workloadType === "inference") {
    const minReplicas = typeof autoscaling.minReplicas === "number" ? autoscaling.minReplicas : null;
    const maxReplicas = typeof autoscaling.maxReplicas === "number" ? autoscaling.maxReplicas : null;
    const networkActivityOnly = minReplicas === 0 && maxReplicas === 1;

    if (
      minReplicas !== null &&
      maxReplicas !== null &&
      minReplicas < maxReplicas &&
      !networkActivityOnly &&
      !metric
    ) {
      warnings.push(
        "autoscaling.metric is mandatory when autoscaling.minReplicas is less than autoscaling.maxReplicas."
      );
    }
  }

  return warnings;
}

export function generatePolicy(payload: GenerateRequest): GenerateResponse {
  const fieldIndex = new Map<string, Field>(catalog.fields.map((field) => [field.id, field]));
  const imposedAssets = normalizeImposedAssets(payload.imposedAssets);
  const defaults: Record<string, unknown> = {};
  const rules: Record<string, unknown> = {};
  const warnings: string[] = [];
  const sectionCounts = new Map<string, number>();
  let renderedRuleCount = 0;

  payload.selected.forEach((selected) => {
    const field = fieldIndex.get(selected.fieldId);

    if (!field) {
      warnings.push(`Unknown field: ${selected.fieldId}`);
      return;
    }

    if (!supports(field.supportedWorkloads, payload.workloadType)) {
      warnings.push(`${field.label} is not supported for ${workloadLabel(payload.workloadType)}.`);
      return;
    }

    if (!fieldMatchesDependencies(field, payload.selected)) {
      warnings.push(dependencyWarning(field));
      return;
    }

    warnings.push(...inputWarningsForField(field, selected));
    warnings.push(...settingWarningsForField(field, selected));

    const placement = placementFor(field, payload.workloadType);
    const supportedEntries = supportedSettingEntries(field, selected.settings);
    let renderedField = false;

    if (isEmptyValue(selected.value)) {
      if (supportedEntries.length === 0) {
        warnings.push(`${field.label} has no default value yet.`);
      }
    } else {
      const renderedValue = renderDefaultValue(field, selected.value, payload.workloadType);

      if (isRenderableDefault(renderedValue)) {
        if (placement === "role") {
          scopesFor(payload.workloadType, selected.scope).forEach((scope) => {
            setNestedValue(defaults, `${scope}.${field.yamlPath}`, renderedValue);
          });
        } else {
          setNestedValue(defaults, field.yamlPath, renderedValue);
        }

        renderedField = true;
      }
    }

    if (
      supportedEntries.some(([settingId, value]) => settingId === "required" && value === true) &&
      isEmptyValue(selected.value)
    ) {
      warnings.push(`${field.label} is marked required but has no default.`);
    }

    const activeRules = renderRulesForField(field, selected.settings);
    const activeRuleCount = renderedRuleCountForField(field, activeRules);

    if (Object.keys(activeRules).length > 0) {
      if (placement === "role") {
        scopesFor(payload.workloadType, selected.scope).forEach((scope) => {
          setNestedValue(rules, `${scope}.${field.yamlPath}`, activeRules);
        });
      } else {
        setNestedValue(rules, field.yamlPath, activeRules);
      }

      renderedField = true;
      renderedRuleCount += activeRuleCount;
    }

    if (renderedField) {
      sectionCounts.set(field.sectionId, (sectionCounts.get(field.sectionId) ?? 0) + 1);
    }
  });

  const authorizedUsersSelected = payload.selected.some(
    (selected) => {
      const field = fieldIndex.get(selected.fieldId);
      return (
        selected.fieldId === "servingPortAuthorizedUsers" &&
        field !== undefined &&
        supports(field.supportedWorkloads, payload.workloadType) &&
        !isEmptyValue(selected.value)
      );
    }
  );

  const authorizedGroupsSelected = payload.selected.some(
    (selected) => {
      const field = fieldIndex.get(selected.fieldId);
      return (
        selected.fieldId === "servingPortAuthorizedGroups" &&
        field !== undefined &&
        supports(field.supportedWorkloads, payload.workloadType) &&
        !isEmptyValue(selected.value)
      );
    }
  );

  if (authorizedUsersSelected && authorizedGroupsSelected) {
    warnings.push("servingPort.authorizedUsers and servingPort.authorizedGroups are mutually exclusive.");
  }

  warnings.push(...crossFieldWarnings(defaults, rules, payload.workloadType));

  const counts = catalog.sections
    .filter((section) => sectionCounts.has(section.id))
    .map((section: Section) => ({
      sectionId: section.id,
      label: section.label,
      count: sectionCounts.get(section.id) ?? 0
    }));

  const document: Record<string, unknown> = {
    defaults: Object.keys(defaults).length > 0 ? defaults : null,
    rules: Object.keys(rules).length > 0 ? rules : null,
    imposedAssets: imposedAssets.length > 0 ? imposedAssets : null
  };
  const renderedFieldCount = Array.from(sectionCounts.values()).reduce((total, count) => total + count, 0);

  const yaml = stringify(document, { lineWidth: 0 }).trimEnd();

  return {
    workloadType: payload.workloadType,
    yaml,
    warnings: uniqueWarnings(warnings),
    summary: {
      selectedFieldCount: payload.selected.length,
      renderedFieldCount,
      ruleCount: renderedRuleCount,
      assetCount: imposedAssets.length,
      humanSummary: `${workloadLabel(payload.workloadType)} policy with ${renderedFieldCount} generated fields from ${payload.selected.length} selected fields and ${imposedAssets.length} imposed assets.`,
      sectionCounts: counts
    }
  };
}
