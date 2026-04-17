import { catalog } from "./catalog";
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

function supports(items: string[], target: string) {
  return items.includes(target);
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

function renderItemizedValue(value: ItemizedValue) {
  const payload: Record<string, unknown> = {};

  if (value.instances.length > 0) {
    payload.instances = value.instances;
  }

  if (value.attributes.length > 0) {
    payload.attributes = value.attributes;
  }

  return payload;
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

function scalarToYaml(value: unknown) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (value === null || value === undefined) {
    return '""';
  }

  return String(value);
}

function toYaml(value: unknown, indent = 0): string[] {
  const prefix = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}[]`];
    }

    return value.flatMap((item) => {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const nested = toYaml(item, indent + 2);
        return [`${prefix}-`, ...nested];
      }

      return [`${prefix}- ${scalarToYaml(item)}`];
    });
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return [`${prefix}{}`];
    }

    return entries.flatMap(([key, item]) => {
      if (Array.isArray(item) || (typeof item === "object" && item !== null)) {
        return [`${prefix}${key}:`, ...toYaml(item, indent + 2)];
      }

      return [`${prefix}${key}: ${scalarToYaml(item)}`];
    });
  }

  return [`${prefix}${scalarToYaml(value)}`];
}

function uniqueWarnings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
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

function ruleCount(selected: SelectedField[]) {
  return selected.reduce((count, item) => {
    return count + Object.values(item.settings).filter((value) => {
      if (typeof value === "string") {
        return value.trim() !== "";
      }

      return value !== undefined && value !== null;
    }).length;
  }, 0);
}

export function generatePolicy(payload: GenerateRequest): GenerateResponse {
  const fieldIndex = new Map<string, Field>(catalog.fields.map((field) => [field.id, field]));
  const defaults: Record<string, unknown> = {};
  const rules: Record<string, unknown> = {};
  const warnings: string[] = [];
  const sectionCounts = new Map<string, number>();

  payload.selected.forEach((selected) => {
    const field = fieldIndex.get(selected.fieldId);

    if (!field) {
      warnings.push(`Unknown field: ${selected.fieldId}`);
      return;
    }

    if (!supports(field.supportedWorkloads, payload.workloadType)) {
      warnings.push(`${field.label} is not supported for ${workloadLabel(payload.workloadType)}.`);
    }

    const placement = placementFor(field, payload.workloadType);

    if (isEmptyValue(selected.value)) {
      warnings.push(`${field.label} has no default value yet.`);
    } else {
      const renderedValue = isItemizedValue(selected.value)
        ? renderItemizedValue(selected.value)
        : selected.value;

      if (placement === "role") {
        scopesFor(payload.workloadType, selected.scope).forEach((scope) => {
          setNestedValue(defaults, `${scope}.${field.yamlPath}`, renderedValue);
        });
      } else {
        setNestedValue(defaults, field.yamlPath, renderedValue);
      }
    }

    if (selected.settings.required === true && isEmptyValue(selected.value)) {
      warnings.push(`${field.label} is marked required but has no default.`);
    }

    const activeRules = Object.fromEntries(
      Object.entries(selected.settings).filter(([, value]) => {
        if (typeof value === "string") {
          return value.trim() !== "";
        }

        return value !== undefined && value !== null;
      })
    );

    if (Object.keys(activeRules).length > 0) {
      const renderedRules =
        field.valueType === "itemized"
          ? { instances: activeRules }
          : activeRules;

      if (placement === "role") {
        scopesFor(payload.workloadType, selected.scope).forEach((scope) => {
          setNestedValue(rules, `${scope}.${field.yamlPath}`, renderedRules);
        });
      } else {
        setNestedValue(rules, field.yamlPath, renderedRules);
      }
    }

    sectionCounts.set(field.sectionId, (sectionCounts.get(field.sectionId) ?? 0) + 1);
  });

  const authorizedUsersSelected = payload.selected.some(
    (selected) =>
      selected.fieldId === "servingPortAuthorizedUsers" &&
      !isEmptyValue(selected.value)
  );

  const authorizedGroupsSelected = payload.selected.some(
    (selected) =>
      selected.fieldId === "servingPortAuthorizedGroups" &&
      !isEmptyValue(selected.value)
  );

  if (authorizedUsersSelected && authorizedGroupsSelected) {
    warnings.push("servingPort.authorizedUsers and servingPort.authorizedGroups are mutually exclusive.");
  }

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
    imposedAssets: payload.imposedAssets.length > 0 ? payload.imposedAssets : null
  };

  const yaml = toYaml(document).join("\n");

  return {
    workloadType: payload.workloadType,
    yaml,
    warnings: uniqueWarnings(warnings),
    summary: {
      selectedFieldCount: payload.selected.length,
      ruleCount: ruleCount(payload.selected),
      assetCount: payload.imposedAssets.length,
      humanSummary: `${workloadLabel(payload.workloadType)} policy with ${payload.selected.length} selected fields and ${payload.imposedAssets.length} imposed assets.`,
      sectionCounts: counts
    }
  };
}
